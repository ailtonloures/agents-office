import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type ElectronApplication, _electron as electron, expect, test } from '@playwright/test';

const DESKTOP = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = join(DESKTOP, '..', '..');
const CLI_BIN = join(REPO, 'packages', 'cli', 'bin', 'agents-office.mjs');
const ELECTRON_BIN = join(DESKTOP, 'node_modules', '.bin', 'electron');

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });
}

async function healthy(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(1000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function until(check: () => Promise<boolean> | boolean, what: string, ms = 20_000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`timed out waiting for ${what}`);
}

interface Sandbox {
  port: number;
  userData: string;
  projectsDir: string;
  vars: Record<string, string>;
}

/** A free port, a temporary profile and projects dir, and the variables that point the app at them. */
async function sandbox(): Promise<Sandbox> {
  const port = await freePort();
  const userData = mkdtempSync(join(tmpdir(), 'ao-desktop-ud-'));
  const projectsDir = mkdtempSync(join(tmpdir(), 'ao-desktop-projects-'));
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    // Do not leak a Claude Code session into the app, nor Node-mode flags into Electron.
    if (value !== undefined && !key.startsWith('CLAUDE') && key !== 'ELECTRON_RUN_AS_NODE') {
      vars[key] = value;
    }
  }
  Object.assign(vars, {
    AGENTS_OFFICE_PORT: String(port),
    AGENTS_OFFICE_PROJECTS_DIR: projectsDir,
    AGENTS_OFFICE_USER_DATA: userData,
  });
  return { port, userData, projectsDir, vars };
}

// Chromium's sandbox needs a setuid helper that a dev install does not have. On Wayland hosts the
// GPU process can crash with Vulkan (SIGSEGV at startup), so the tests ask for X11 (XWayland).
const FLAGS = ['--no-sandbox', ...(process.platform === 'linux' ? ['--ozone-platform=x11'] : [])];

function launch(box: Sandbox): Promise<ElectronApplication> {
  return electron.launch({ args: [DESKTOP, ...FLAGS], cwd: DESKTOP, env: box.vars });
}

function cleanup(box: Sandbox): void {
  rmSync(box.userData, { recursive: true, force: true });
  rmSync(box.projectsDir, { recursive: true, force: true });
}

/** Pids listening on the port (a utility process has no useful command line to grep). */
function daemonPids(port: number): number[] {
  const out = execFileSync('ss', ['-ltnpH', `sport = :${port}`], { encoding: 'utf8' });
  return [...out.matchAll(/pid=(\d+)/g)].map((match) => Number(match[1]));
}

const windowState = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => {
    const [win] = BrowserWindow.getAllWindows();
    return win ? { visible: win.isVisible(), url: win.webContents.getURL() } : null;
  });

const officeUrl = (box: Sandbox) => `http://127.0.0.1:${box.port}/`;

test('opens the office, keeps the daemon on window close, quits everything on quit', async () => {
  const box = await sandbox();
  const app = await launch(box);
  const proc = app.process();
  try {
    await until(() => healthy(box.port), 'embedded daemon');
    await until(async () => (await windowState(app))?.url === officeUrl(box), 'office URL');

    const page = await app.firstWindow();
    await expect(page.locator('canvas')).toBeVisible();
    const exposed = await page.evaluate(
      () =>
        (window as unknown as { agentsOfficeDesktop?: { desktop: boolean } }).agentsOfficeDesktop
          ?.desktop,
    );
    expect(exposed).toBe(true);
    // The hook route of the real daemon answers (existing hooks keep working on the same port).
    const hook = await fetch(`${officeUrl(box)}hook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hook_event_name: 'Stop', session_id: 's1' }),
    });
    expect(hook.status).toBe(204);

    // Closing the window hides it; the app and the daemon stay.
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
    await until(async () => (await windowState(app))?.visible === false, 'hidden window');
    expect(proc.exitCode).toBeNull();
    expect(await healthy(box.port)).toBe(true);

    // A second launch with the same profile exits and brings the window back.
    const second = spawn(ELECTRON_BIN, [DESKTOP, ...FLAGS], {
      env: box.vars,
      stdio: 'ignore',
    });
    const secondExit = await new Promise<number | null>((resolve) => second.once('exit', resolve));
    expect(secondExit).toBe(0);
    await until(async () => (await windowState(app))?.visible === true, 'window shown again');

    // "Sair" (same path as the tray item: app.quit()) ends the app and the daemon.
    const exited = new Promise<void>((resolve) => proc.once('exit', () => resolve()));
    await app.evaluate(({ app: electronApp }) => electronApp.quit());
    await exited;
    await until(async () => !(await healthy(box.port)), 'daemon stopped');
    expect(daemonPids(box.port)).toEqual([]);
  } finally {
    await app.close().catch(() => {});
    cleanup(box);
  }
});

test('restarts the daemon when it crashes', async () => {
  const box = await sandbox();
  const app = await launch(box);
  try {
    await until(() => healthy(box.port), 'embedded daemon');
    const [pid] = daemonPids(box.port);
    expect(pid).toBeDefined();
    process.kill(pid as number, 'SIGKILL');
    await until(async () => !daemonPids(box.port).includes(pid as number), 'old daemon gone');
    await until(() => healthy(box.port), 'restarted daemon');
    expect(daemonPids(box.port)).not.toContain(pid);
  } finally {
    await app.close().catch(() => {});
    cleanup(box);
  }
});

test('connects to an existing agents-office daemon instead of starting another', async () => {
  const box = await sandbox();
  const external: ChildProcess = spawn(
    process.execPath,
    [CLI_BIN, 'start', '--no-open', '--port', String(box.port), '--projects-dir', box.projectsDir],
    { stdio: 'ignore' },
  );
  let app: ElectronApplication | undefined;
  try {
    await until(() => healthy(box.port), 'external daemon');
    app = await launch(box);
    const running = app;
    await until(async () => (await windowState(running))?.url === officeUrl(box), 'office URL');
    // Only the external daemon runs; the app started none.
    expect(daemonPids(box.port)).toEqual([external.pid]);
    const exited = new Promise<void>((resolve) => running.process().once('exit', () => resolve()));
    await running.evaluate(({ app: electronApp }) => electronApp.quit());
    await exited;
    // Quitting the app leaves a daemon it did not start alone.
    expect(await healthy(box.port)).toBe(true);
  } finally {
    await app?.close().catch(() => {});
    external.kill('SIGTERM');
    cleanup(box);
  }
});

test('shows a clear error when another program holds the port', async () => {
  const box = await sandbox();
  const blocker = createHttpServer((_req, res) => res.end('hello'));
  await new Promise<void>((resolve) => blocker.listen(box.port, '127.0.0.1', resolve));
  const app = await launch(box);
  try {
    const page = await app.firstWindow();
    await expect(page.locator('h1')).toContainText('ocupada');
    // Only the blocker (this test process) listens: the app started no daemon.
    expect(daemonPids(box.port)).toEqual([process.pid]);
  } finally {
    await app.close().catch(() => {});
    await new Promise<void>((resolve) => blocker.close(() => resolve()));
    cleanup(box);
  }
});

test('installs and removes the hooks from the UI, in a temporary settings file', async () => {
  const box = await sandbox();
  const home = mkdtempSync(join(tmpdir(), 'ao-desktop-home-'));
  const settings = join(home, 'settings.json');
  const original = '{\n  "model": "x"\n}\n';
  writeFileSync(settings, original);
  box.vars.HOME = home;
  box.vars.AGENTS_OFFICE_SETTINGS_PATH = settings;
  const app = await launch(box);
  try {
    await until(async () => (await windowState(app))?.url === officeUrl(box), 'office URL');
    const page = await app.firstWindow();
    const byId = (id: string) => page.locator(`[data-testid="${id}"]`);

    // First run: nothing installed -> dismissible notice.
    await expect(byId('hooks-banner')).toBeVisible();
    await byId('hooks-banner-open').click();
    await expect(byId('hooks-summary')).toHaveText('Nenhum hook instalado');
    await expect(byId('hooks-seen')).toHaveText('Nenhum hook recebido ainda');

    // The diff is shown before anything is written.
    await byId('hooks-install').click();
    await expect(byId('hooks-diff')).toContainText('PermissionRequest');
    expect(readFileSync(settings, 'utf8')).toBe(original);
    await byId('hooks-confirm').click();
    await expect(byId('hooks-summary')).toContainText('Todos os');
    await expect(byId('hook-PermissionRequest')).toContainText('[x]');

    const installed = JSON.parse(readFileSync(settings, 'utf8')) as {
      hooks: { Stop: { hooks: { command: string }[] }[] };
    };
    const command = installed.hooks.Stop[0]?.hooks[0]?.command ?? '';
    expect(command).toContain('ELECTRON_RUN_AS_NODE=1');
    expect(existsSync(`${settings}.agents-office.bak`)).toBe(true);

    // The written command really works: running it feeds the daemon (hooksSeenAt).
    execFileSync('sh', ['-c', command], {
      input: JSON.stringify({ hook_event_name: 'Stop', session_id: 's-e2e' }),
      env: { ...box.vars, AGENTS_OFFICE_PORT: String(box.port) },
      timeout: 15_000,
    });
    await byId('hooks-close').click();
    await byId('hooks-open').click();
    await expect(byId('hooks-seen')).toContainText('Último hook recebido');

    // Uninstall restores the original bytes (re-serialised as the CLI would).
    await byId('hooks-uninstall').click();
    await byId('hooks-confirm').click();
    await expect(byId('hooks-summary')).toHaveText('Nenhum hook instalado');
    expect(readFileSync(settings, 'utf8')).toBe(original);
  } finally {
    await app.close().catch(() => {});
    cleanup(box);
    rmSync(home, { recursive: true, force: true });
  }
});
