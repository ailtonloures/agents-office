import { execFileSync, spawn } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type Browser,
  chromium,
  type ElectronApplication,
  _electron as electron,
  expect,
  type Page,
  test,
} from '@playwright/test';
import { freePort } from '../support/daemon';
import { createFeeder, loadFixture } from '../support/feeder';
import { characters } from '../support/office';

// Drives the real Electron app: the packaged build (`pnpm --filter @agents-office/desktop dist`,
// Linux unpacked output) when it exists, otherwise the development build. Force one with
// AGENTS_OFFICE_E2E_APP=dev|packaged. It needs a display: run under `xvfb-run -a` on CI.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DESKTOP = join(ROOT, 'packages', 'desktop');
const PACKAGED = join(DESKTOP, 'release', 'linux-unpacked', 'agents-office');
const mode =
  process.env.AGENTS_OFFICE_E2E_APP ??
  (process.platform === 'linux' && existsSync(PACKAGED) ? 'packaged' : 'dev');

// No setuid sandbox helper in unpacked builds; on Wayland hosts Electron can crash at startup
// (Vulkan), so X11 is requested explicitly.
const FLAGS = ['--no-sandbox', ...(process.platform === 'linux' ? ['--ozone-platform=x11'] : [])];

const FIXTURE = 'parallel-subagents';

interface Box {
  port: number;
  url: string;
  userData: string;
  projectsDir: string;
  home: string;
  env: Record<string, string>;
}

async function sandbox(): Promise<Box> {
  const port = await freePort();
  const userData = mkdtempSync(join(tmpdir(), 'ao-e2e-ud-'));
  const projectsDir = mkdtempSync(join(tmpdir(), 'ao-e2e-projects-'));
  const home = mkdtempSync(join(tmpdir(), 'ao-e2e-home-'));
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !key.startsWith('CLAUDE') && key !== 'ELECTRON_RUN_AS_NODE') {
      env[key] = value;
    }
  }
  Object.assign(env, {
    HOME: home,
    AGENTS_OFFICE_PORT: String(port),
    AGENTS_OFFICE_PROJECTS_DIR: projectsDir,
    AGENTS_OFFICE_USER_DATA: userData,
    AGENTS_OFFICE_SETTINGS_PATH: join(home, 'settings.json'),
  });
  return { port, url: `http://127.0.0.1:${port}/`, userData, projectsDir, home, env };
}

interface QuitDialogCall {
  message: string;
  detail: string;
  buttons: string[];
}

/**
 * Starts the app. The exit confirmation (a native dialog while sessions run) is replaced by a stub
 * that records what it was asked and answers "Encerrar tudo" (1) unless a test sets `response`;
 * otherwise `app.close()` in every test's cleanup would wait for a human.
 */
async function launch(box: Box): Promise<ElectronApplication> {
  const app = await (async () => {
    if (mode === 'packaged') {
      return electron.launch({ executablePath: PACKAGED, args: FLAGS, env: box.env });
    }
    const electronBin = createRequire(join(DESKTOP, 'package.json'))('electron') as string;
    return electron.launch({
      executablePath: electronBin,
      args: [DESKTOP, ...FLAGS],
      cwd: DESKTOP,
      env: box.env,
    });
  })();
  await app.evaluate(({ dialog }) => {
    const state = { calls: [] as unknown[], response: 1 };
    (globalThis as { __quitDialog?: typeof state }).__quitDialog = state;
    dialog.showMessageBox = (async (...args: unknown[]) => {
      const options = args.find((a) => typeof a === 'object' && a !== null && 'buttons' in a) as {
        message: string;
        detail: string;
        buttons: string[];
      };
      state.calls.push({
        message: options.message,
        detail: options.detail,
        buttons: options.buttons,
      });
      return { response: state.response, checkboxChecked: false };
    }) as never;
  });
  return app;
}

/** The interactive quit (what the tray's "Sair" does): the application menu's "Sair" entry. */
const chooseSair = (app: ElectronApplication) =>
  app.evaluate(({ Menu }) => {
    Menu.getApplicationMenu()?.getMenuItemById('quit')?.click();
  });

/**
 * Starts the app as a plain process and drives its window over the DevTools protocol. Unlike
 * `electron.launch`, killing it leaves nothing dangling in the Playwright worker.
 */
async function spawnDriven(
  box: Box,
): Promise<{ proc: ReturnType<typeof spawn>; browser: Browser; page: Page }> {
  const debugPort = await freePort();
  const command =
    mode === 'packaged'
      ? { bin: PACKAGED, args: [] as string[], cwd: undefined }
      : {
          bin: createRequire(join(DESKTOP, 'package.json'))('electron') as string,
          args: [DESKTOP],
          cwd: DESKTOP,
        };
  const proc = spawn(
    command.bin,
    [...command.args, ...FLAGS, `--remote-debugging-port=${debugPort}`],
    { env: box.env, cwd: command.cwd, stdio: 'ignore' },
  );
  const endpoint = `http://127.0.0.1:${debugPort}`;
  await until(async () => {
    try {
      return (await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(1000) })).ok;
    } catch {
      return false;
    }
  }, 'DevTools endpoint');
  const browser = await chromium.connectOverCDP(endpoint);
  const context = browser.contexts()[0];
  if (!context) throw new Error('no browser context');
  const page = context.pages()[0] ?? (await context.waitForEvent('page'));
  return { proc, browser, page };
}

/** SIGKILLs every leftover process started with this sandbox's user-data dir (Linux). */
function killOrphans(box: Box): void {
  let out = '';
  try {
    out = execFileSync('pgrep', ['-f', '--', `--user-data-dir=${box.userData}`], {
      encoding: 'utf8',
    });
  } catch {
    return; // pgrep exits 1 when nothing matches
  }
  for (const line of out.split('\n')) {
    const pid = Number(line);
    if (!pid) continue;
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // already gone
    }
  }
}

const quitDialog = (app: ElectronApplication) =>
  app.evaluate(
    () => (globalThis as { __quitDialog?: { calls: unknown[] } }).__quitDialog?.calls ?? [],
  ) as Promise<QuitDialogCall[]>;
const answerQuitDialog = (app: ElectronApplication, response: number) =>
  app.evaluate((_electron, value) => {
    const state = (globalThis as { __quitDialog?: { response: number } }).__quitDialog;
    if (state) state.response = value;
  }, response);

/** True while the process exists and is not a zombie (Linux reads /proc; elsewhere signal 0). */
function isAlive(pid: number): boolean {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    return stat.slice(stat.lastIndexOf(')') + 2, stat.lastIndexOf(')') + 3) !== 'Z';
  } catch {
    if (existsSync('/proc/self/stat')) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * A fake `claude` for the lifecycle tests: reports its arguments, fires the real hooks (unless the
 * folder is named nohook*), leaves behind a child that ignores SIGHUP (its pid goes to
 * `children.txt`) and echoes input; the line `bye` makes it exit.
 */
function writeLifecycleClaude(box: Box): { path: string; childFile: string } {
  const hookBin = join(ROOT, 'packages', 'cli', 'bin', 'agents-office.mjs');
  const hook = `"${process.execPath}" "${hookBin}" hook`;
  const childFile = join(box.home, 'children.txt');
  const path = join(box.home, 'claude');
  writeFileSync(
    path,
    [
      '#!/bin/sh',
      'SID="app-$AGENTS_OFFICE_TERMINAL_ID"',
      'echo "ARGS $*"',
      'case "$(basename "$PWD")" in nohook*) ;; *)',
      `  printf '{"hook_event_name":"SessionStart","session_id":"%s","cwd":"%s","source":"startup"}' "$SID" "$PWD" | ${hook}`,
      `  printf '{"hook_event_name":"UserPromptSubmit","session_id":"%s","cwd":"%s","prompt":"hello"}' "$SID" "$PWD" | ${hook}`,
      ';; esac',
      `(trap '' HUP; exec sleep 300) & echo $! >> "${childFile}"`,
      'echo "READY $SID"',
      'while :; do',
      '  if read line; then',
      '    case "$line" in bye) echo BYE; exit 3;; *) echo "ECHO $line";; esac',
      '  else sleep 0.2; fi',
      'done',
    ].join('\n'),
  );
  chmodSync(path, 0o755);
  return { path, childFile };
}

const readPids = (file: string): number[] =>
  existsSync(file)
    ? readFileSync(file, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => Number(line))
    : [];

interface TerminalApi {
  setConfig(p: object): Promise<unknown>;
  start(o: object): Promise<{ ok: boolean; id: string }>;
  list(): Promise<{ id: string; pid: number }[]>;
  write(id: string, data: string): Promise<void>;
}

function dispose(box: Box): void {
  for (const dir of [box.userData, box.projectsDir, box.home]) {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function healthy(port: number): Promise<boolean> {
  try {
    return (await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) }))
      .ok;
  } catch {
    return false;
  }
}

async function until(check: () => Promise<boolean> | boolean, what: string, ms = 30_000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`timed out waiting for ${what}`);
}

function daemonPids(port: number): number[] {
  const out = execFileSync('ss', ['-ltnpH', `sport = :${port}`], { encoding: 'utf8' });
  return [...out.matchAll(/pid=(\d+)/g)].map((match) => Number(match[1]));
}

const windowState = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => {
    const [win] = BrowserWindow.getAllWindows();
    return win ? { visible: win.isVisible(), url: win.webContents.getURL() } : null;
  });

test.describe(`desktop app (${mode})`, () => {
  test('permission flow: fixture, character, notification, terminal answer closes it', async () => {
    const box = await sandbox();
    const app = await launch(box);
    try {
      // Record the system notifications the main process raises (no desktop session needed).
      await app.evaluate(({ Notification }) => {
        const shown: { title: string; body: string }[] = [];
        const closed: string[] = [];
        (globalThis as { __notes?: typeof shown }).__notes = shown;
        (globalThis as { __closed?: string[] }).__closed = closed;
        Notification.isSupported = () => true;
        Notification.prototype.show = function show(this: { title: string; body: string }) {
          shown.push({ title: this.title, body: this.body });
        };
        Notification.prototype.close = function close(this: { body: string }) {
          closed.push(this.body);
        };
      });
      await until(async () => (await windowState(app))?.url === box.url, 'office URL');
      const page = await app.firstWindow();
      await page.waitForFunction(() => window.__office?.connected === true);

      const { info } = loadFixture(FIXTURE);
      createFeeder(box.projectsDir, FIXTURE).next(4);
      await expect
        .poll(async () => (await characters(page)).filter((c) => c.role === 'lead').length)
        .toBe(1);

      // A request that arrives while the window is hidden (the app lives in the tray) notifies.
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
      await until(async () => (await windowState(app))?.visible === false, 'hidden window');

      const answer = fetch(`${box.url}hook`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          hook_event_name: 'PermissionRequest',
          session_id: info.sessionId,
          transcript_path: `${box.projectsDir}/${info.projectSlug}/${info.sessionId}.jsonl`,
          cwd: '/anon/projects/demo-app',
          permission_mode: 'default',
          tool_name: 'Bash',
          tool_input: { command: 'pnpm test', description: 'Run the tests' },
        }),
      });

      await expect
        .poll(() =>
          app.evaluate(
            () =>
              (globalThis as { __notes?: { body: string }[] }).__notes?.map((n) => n.body) ?? [],
          ),
        )
        .toEqual([expect.stringContaining('pnpm test')]);
      // The notification says the answer goes in the terminal and is still open.
      const notes = await app.evaluate(
        () => (globalThis as { __notes?: { body: string }[] }).__notes ?? [],
      );
      expect(notes[0]?.body).toContain('Responda no terminal');
      expect(await app.evaluate(() => (globalThis as { __closed?: string[] }).__closed)).toEqual(
        [],
      );

      // The hook returns at once (notify-only) and opening the window shows the pending request.
      expect((await answer).status).toBe(204);
      await app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        win?.show();
        win?.focus();
      });
      await expect
        .poll(() => page.evaluate(() => window.__office?.permissions.queue.length))
        .toBe(1);
      // Answering in the terminal (the tool ran) clears it.
      await fetch(`${box.url}hook`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          hook_event_name: 'PostToolUse',
          session_id: info.sessionId,
          transcript_path: `${box.projectsDir}/${info.projectSlug}/${info.sessionId}.jsonl`,
          cwd: '/anon/projects/demo-app',
          permission_mode: 'default',
          tool_name: 'Bash',
          tool_input: { command: 'pnpm test', description: 'Run the tests' },
          tool_use_id: 'toolu_x',
          tool_response: { stdout: 'ok' },
        }),
      });
      await expect
        .poll(() => page.evaluate(() => window.__office?.permissions.queue.length))
        .toBe(0);
      // ... and the system notification of that request is closed (not left orphaned).
      await expect
        .poll(() => app.evaluate(() => (globalThis as { __closed?: string[] }).__closed ?? []))
        .toEqual([expect.stringContaining('pnpm test')]);
    } finally {
      await app.close().catch(() => {});
      dispose(box);
    }
  });

  test('closing the window keeps the daemon, Quit ends the process', async () => {
    const box = await sandbox();
    const app = await launch(box);
    const proc = app.process();
    try {
      await until(() => healthy(box.port), 'embedded daemon');
      await until(async () => (await windowState(app))?.url === box.url, 'office URL');
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
      await until(async () => (await windowState(app))?.visible === false, 'hidden window');
      expect(proc.exitCode).toBeNull();
      expect(await healthy(box.port)).toBe(true);

      const exited = new Promise<void>((resolve) => proc.once('exit', () => resolve()));
      await chooseSair(app);
      await exited;
      await until(async () => !(await healthy(box.port)), 'daemon stopped');
      expect(daemonPids(box.port)).toEqual([]);
    } finally {
      await app.close().catch(() => {});
      dispose(box);
    }
  });

  test('the window reconnects after the daemon restarts', async () => {
    const box = await sandbox();
    const app = await launch(box);
    try {
      await until(async () => (await windowState(app))?.url === box.url, 'office URL');
      const page = await app.firstWindow();
      await page.waitForFunction(() => window.__office?.connected === true);

      const [pid] = daemonPids(box.port);
      expect(pid).toBeDefined();
      process.kill(pid as number, 'SIGKILL');
      await page.waitForFunction(() => window.__office?.connected === false);
      await until(
        async () => (await healthy(box.port)) && !daemonPids(box.port).includes(pid as number),
        'restarted daemon',
      );
      await page.waitForFunction(() => window.__office?.connected === true, undefined, {
        timeout: 30_000,
      });
    } finally {
      await app.close().catch(() => {});
      dispose(box);
    }
  });

  test('the hook command works through the bundled runtime (ELECTRON_RUN_AS_NODE)', async () => {
    test.skip(mode !== 'packaged', 'needs the packaged app');
    const box = await sandbox();
    const app = await launch(box);
    try {
      await until(() => healthy(box.port), 'embedded daemon');
      const entry = join(dirname(PACKAGED), 'resources', 'daemon', 'bin', 'agents-office.mjs');
      execFileSync(PACKAGED, [entry, 'hook'], {
        input: JSON.stringify({ hook_event_name: 'Stop', session_id: 's-pkg' }),
        env: { ...box.env, ELECTRON_RUN_AS_NODE: '1' },
        timeout: 15_000,
      });
      const health = (await (await fetch(`${box.url}health`)).json()) as { hooksSeenAt?: unknown };
      expect(health.hooksSeenAt).toBeTruthy();
    } finally {
      await app.close().catch(() => {});
      dispose(box);
    }
  });
  test('terminal bridge: a pty with a fake claude starts, echoes, resizes and is killed', async () => {
    const box = await sandbox();
    // The fake claude replaces the real one through the saved manual path.
    const fake = join(box.home, 'claude');
    writeFileSync(
      fake,
      [
        '#!/bin/sh',
        'echo "READY $AGENTS_OFFICE_TERMINAL_ID child=[$CLAUDE_CODE_CHILD_SESSION] $PWD"',
        'trap \'echo "SIZE $(stty size)"\' WINCH',
        // The terminal panel adopts the session and fits it (WINCH interrupts `read`): keep looping.
        'while :; do read line && echo "GOT $line"; done',
      ].join('\n'),
    );
    chmodSync(fake, 0o755);
    const app = await launch(box);
    try {
      await until(async () => (await windowState(app))?.url === box.url, 'office URL');
      const page = await app.firstWindow();
      await page.waitForFunction(() => window.__office?.connected === true);

      const outcome = await page.evaluate(async (fakePath) => {
        const terminal = (
          window as unknown as {
            agentsOfficeDesktop: {
              terminal: {
                setConfig(p: object): Promise<unknown>;
                start(o: object): Promise<{ ok: boolean; id?: string; code?: string }>;
                write(id: string, d: string): Promise<void>;
                resize(id: string, c: number, r: number): Promise<void>;
                kill(id: string): Promise<void>;
                list(): Promise<{ id: string }[]>;
                buffer(id: string): Promise<string | null>;
                onData(l: (e: { id: string; data: string }) => void): () => void;
                onExit(l: (e: { id: string }) => void): () => void;
              };
            };
          }
        ).agentsOfficeDesktop.terminal;
        const waitFor = async (check: () => boolean) => {
          for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 100));
        };
        const missing = await terminal.start({ cwd: '/definitely/not/here' });
        const saved = await terminal.setConfig({ claudePath: fakePath });
        const started = await terminal.start({ cwd: '/tmp', cols: 90, rows: 25 });
        let output = '';
        let exited = false;
        terminal.onData((e) => {
          if (e.id === started.id) output += e.data;
        });
        terminal.onExit((e) => {
          if (e.id === started.id) exited = true;
        });
        await waitFor(() => output.includes('READY'));
        await terminal.write(started.id as string, 'ping\r');
        await waitFor(() => output.includes('GOT ping'));
        await terminal.resize(started.id as string, 111, 37);
        await waitFor(() => output.includes('SIZE 37 111'));
        const buffered = await terminal.buffer(started.id as string);
        const listed = (await terminal.list()).map((s) => s.id);
        await terminal.kill(started.id as string);
        await waitFor(() => exited);
        return {
          missing,
          saved,
          started,
          output,
          buffered,
          listed,
          exited,
          after: await terminal.list(),
        };
      }, fake);

      expect(outcome.missing).toMatchObject({ ok: false, code: 'invalid-cwd' });
      expect(outcome.started.ok).toBe(true);
      expect(outcome.output).toContain(`READY ${outcome.started.id} child=[] /tmp`);
      expect(outcome.output).toContain('GOT ping');
      expect(outcome.output).toContain('SIZE 37 111');
      expect(outcome.buffered).toContain('GOT ping');
      expect(outcome.listed).toEqual([outcome.started.id]);
      expect(outcome.exited).toBe(true);
      expect(outcome.after).toEqual([]);
    } finally {
      await app.close().catch(() => {});
      dispose(box);
    }
  });
  test('terminal panel: tab, output, keyboard, resize, collapse, reload history, exit, close', async () => {
    const box = await sandbox();
    const fake = join(box.home, 'claude');
    writeFileSync(
      fake,
      [
        '#!/bin/sh',
        'echo "READY $AGENTS_OFFICE_TERMINAL_ID"',
        'while read line; do',
        '  [ "$line" = quit ] && exit 3',
        '  [ "$line" = size ] && echo "SIZE $(stty size)"',
        '  echo "GOT $line"',
        'done',
        'sleep 30',
      ].join('\n'),
    );
    chmodSync(fake, 0o755);
    const cwd = join(box.home, 'demo-app');
    mkdirSync(cwd);
    const app = await launch(box);
    try {
      await until(async () => (await windowState(app))?.url === box.url, 'office URL');
      const page = await app.firstWindow();
      await page.waitForFunction(() => window.__office?.connected === true);
      expect(await page.locator('[data-testid="terminal-panel"]').isVisible()).toBe(false);

      type Snap =
        NonNullable<Window['__terminalPanel']> extends infer P
          ? Omit<P, 'text' | 'paste'> & { text: string }
          : never;
      const snap = (): Promise<Snap | null> =>
        page.evaluate(() => {
          const p = window.__terminalPanel;
          if (!p) return null;
          return {
            tabs: p.tabs,
            activeId: p.activeId,
            collapsed: p.collapsed,
            height: p.height,
            occupied: p.occupied,
            focus: p.focus,
            keyboard: p.keyboard,
            cols: p.cols,
            rows: p.rows,
            text: p.text(),
          };
        });
      const panel = async <T>(read: (p: Snap) => T): Promise<T | undefined> => {
        const state = await snap();
        return state ? read(state) : undefined;
      };
      const text = async () => (await panel((p) => p.text)) ?? '';
      const startSession = (dir: string) =>
        page.evaluate(
          async ({ dir: d, fakePath }) => {
            const t = (
              window as unknown as {
                agentsOfficeDesktop: {
                  terminal: {
                    setConfig(p: object): Promise<unknown>;
                    start(o: object): Promise<{ ok: boolean; id: string }>;
                  };
                };
              }
            ).agentsOfficeDesktop.terminal;
            await t.setConfig({ claudePath: fakePath });
            return t.start({ cwd: d, cols: 80, rows: 24 });
          },
          { dir, fakePath: fake },
        );

      const started = await startSession(cwd);
      expect(started.ok).toBe(true);
      await expect
        .poll(async () => (await panel((p) => p.tabs[0]?.title)) ?? '')
        .toBe('demo-app · ativa');
      await expect.poll(text).toContain(`READY ${started.id}`);
      // The office keeps a whole zoom and sits above the panel.
      const geometry = () =>
        page.evaluate(() => {
          const canvas = document.querySelector('canvas') as HTMLCanvasElement;
          const rect = canvas.getBoundingClientRect();
          const panelRect = document.getElementById('ao-terminal')?.getBoundingClientRect();
          return {
            zoom: rect.width / canvas.width,
            bottom: rect.bottom,
            panelTop: panelRect?.top ?? window.innerHeight,
            panelHeight: panelRect?.height ?? 0,
          };
        });
      const open = await geometry();
      expect(Number.isInteger(open.zoom)).toBe(true);
      expect(open.bottom).toBeLessThanOrEqual(open.panelTop + 1);
      expect(open.panelHeight).toBeGreaterThan(100);

      // The new session has the keyboard: keys reach the terminal, not the player.
      expect(await panel((p) => p.keyboard)).toBe('terminal');
      const before = await page.evaluate(() => ({ ...window.__office?.player }));
      await page.keyboard.type('wasd', { delay: 30 });
      await page.keyboard.press('Enter');
      await expect.poll(text).toContain('GOT wasd');
      expect(await page.evaluate(() => ({ ...window.__office?.player }))).toEqual(before);

      // Resize by dragging the top edge: the pty follows.
      const handle = (await page.locator('[data-testid="terminal-resizer"]').boundingBox()) as {
        x: number;
        y: number;
        width: number;
        height: number;
      };
      const startRows = (await panel((p) => p.rows)) as number;
      await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
      await page.mouse.down();
      await page.mouse.move(handle.x + handle.width / 2, handle.y - 90, { steps: 6 });
      await page.mouse.up();
      await expect
        .poll(async () => (await panel((p) => p.rows)) as number)
        .toBeGreaterThan(startRows);
      await new Promise((resolve) => setTimeout(resolve, 400)); // the last fit settles
      const size = (await panel((p) => `${p.rows} ${p.cols}`)) as string;
      await page.keyboard.type('size');
      await page.keyboard.press('Enter');
      await expect.poll(text).toContain(`SIZE ${size}`);
      expect((await geometry()).panelHeight).toBeGreaterThan(open.panelHeight + 60);
      expect(Number.isInteger((await geometry()).zoom)).toBe(true);

      // Collapse and expand with Ctrl+`.
      await page.keyboard.press('Control+`');
      await expect.poll(() => panel((p) => p.collapsed)).toBe(true);
      expect(await panel((p) => p.keyboard)).toBe('player');
      expect((await geometry()).panelHeight).toBeLessThan(40);
      await page.keyboard.press('Control+`');
      await expect.poll(() => panel((p) => p.collapsed)).toBe(false);
      await expect.poll(() => panel((p) => p.keyboard)).toBe('terminal');

      // Clicking the office gives the keyboard back to the player.
      await page.mouse.click(40, 40);
      await expect.poll(() => panel((p) => p.keyboard)).toBe('player');

      // Reload the window: the history comes back before the live flow.
      await page.reload();
      await page.waitForFunction(() => window.__terminalPanel?.tabs.length === 1);
      await expect.poll(text).toContain('GOT wasd');
      expect(await text()).toContain(`READY ${started.id}`);
      await page.locator('[data-testid^="terminal-view-"]').click();
      await page.keyboard.type('after', { delay: 20 });
      await page.keyboard.press('Enter');
      await expect.poll(text).toContain('GOT after');
      expect((await text()).match(/GOT wasd/g)).toHaveLength(1); // the history is not written twice

      // The process ends: notice, restart opens a fresh tab, ending it closes with no prompt.
      await page.keyboard.type('quit');
      await page.keyboard.press('Enter');
      await expect(page.locator('[data-testid="terminal-ended"]')).toContainText(
        'Processo terminou (código 3)',
      );
      expect(await panel((p) => p.tabs[0]?.title)).toBe('demo-app · encerrada');
      await page.locator('[data-testid="terminal-restart"]').click();
      await expect
        .poll(async () => (await panel((p) => p.tabs.map((t) => t.state))) ?? [])
        .toEqual(['running']);
      await expect.poll(text).toContain('READY');

      // Closing a live session asks first.
      const id = (await panel((p) => p.tabs[0]?.id)) as string;
      await page.locator(`[data-testid="terminal-close-${id}"]`).click();
      await expect(page.locator('[data-testid="terminal-confirm"]')).toBeVisible();
      await page.locator('[data-testid="terminal-confirm-no"]').click();
      expect(await panel((p) => p.tabs.length)).toBe(1);
      await page.locator(`[data-testid="terminal-close-${id}"]`).click();
      await page.locator('[data-testid="terminal-confirm-yes"]').click();
      await expect.poll(() => panel((p) => p.tabs.length)).toBe(0);
      await expect(page.locator('[data-testid="terminal-panel"]')).toBeHidden();
      await expect
        .poll(() =>
          page.evaluate(() =>
            (
              window as unknown as {
                agentsOfficeDesktop: { terminal: { list(): Promise<unknown[]> } };
              }
            ).agentsOfficeDesktop.terminal
              .list()
              .then((l) => l.length),
          ),
        )
        .toBe(0);
      expect((await geometry()).panelHeight).toBe(0);
    } finally {
      await app.close().catch(() => {});
      dispose(box);
    }
  });
  test('terminal panel: a permission request does not take the keyboard from the terminal', async () => {
    const box = await sandbox();
    const fake = join(box.home, 'claude');
    writeFileSync(fake, '#!/bin/sh\necho READY\nsleep 30\n');
    chmodSync(fake, 0o755);
    const app = await launch(box);
    try {
      await until(async () => (await windowState(app))?.url === box.url, 'office URL');
      const page = await app.firstWindow();
      await page.waitForFunction(() => window.__office?.connected === true);
      const { info } = loadFixture(FIXTURE);
      createFeeder(box.projectsDir, FIXTURE).next(4);
      await expect
        .poll(async () => (await characters(page)).filter((c) => c.role === 'lead').length)
        .toBe(1);

      await page.evaluate(async (fakePath) => {
        const t = (
          window as unknown as {
            agentsOfficeDesktop: {
              terminal: {
                setConfig(p: object): Promise<unknown>;
                start(o: object): Promise<unknown>;
              };
            };
          }
        ).agentsOfficeDesktop.terminal;
        await t.setConfig({ claudePath: fakePath });
        await t.start({ cwd: '/tmp' });
      }, fake);
      await expect
        .poll(() => page.evaluate(() => window.__terminalPanel?.keyboard))
        .toBe('terminal');

      const answer = fetch(`${box.url}hook`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          hook_event_name: 'PermissionRequest',
          session_id: info.sessionId,
          transcript_path: `${box.projectsDir}/${info.projectSlug}/${info.sessionId}.jsonl`,
          cwd: '/anon/projects/demo-app',
          permission_mode: 'default',
          tool_name: 'Bash',
          tool_input: { command: 'pnpm test' },
        }),
      });
      expect((await answer).status).toBe(204);
      await expect
        .poll(() => page.evaluate(() => window.__office?.permissions.queue.length))
        .toBe(1);
      expect(await page.evaluate(() => window.__terminalPanel?.keyboard)).toBe('terminal');
      // Clicking elsewhere in the office does hand the keyboard back to the player.
      await page.mouse.click(10, 10);
      await expect.poll(() => page.evaluate(() => window.__terminalPanel?.keyboard)).toBe('player');
    } finally {
      await app.close().catch(() => {});
      dispose(box);
    }
  });

  test('project picker: catalog, search, favorite, new folder, launch options, persistence', async () => {
    const box = await sandbox();
    const fake = join(box.home, 'claude');
    writeFileSync(fake, ['#!/bin/sh', 'echo "ARGS $*"', 'sleep 30'].join('\n'));
    chmodSync(fake, 0o755);
    const alpha = join(box.home, 'alpha-app');
    const beta = join(box.home, 'beta-app');
    const fresh = join(box.home, 'fresh-folder');
    for (const dir of [alpha, beta, fresh]) mkdirSync(dir);
    // History in the (temporary) projects folder; beta has one session; alpha and fresh have none.
    const slug = (cwd: string) => cwd.replace(/[^A-Za-z0-9]/g, '-');
    mkdirSync(join(box.projectsDir, slug(beta)), { recursive: true });
    writeFileSync(
      join(box.projectsDir, slug(beta), 'sess-one.jsonl'),
      `${JSON.stringify({ type: 'user', cwd: beta, message: { role: 'user', content: 'fix the login bug' } })}\n`,
    );
    let app = await launch(box);
    try {
      await until(async () => (await windowState(app))?.url === box.url, 'office URL');
      let page = await app.firstWindow();
      await page.waitForFunction(() => window.__office?.connected === true);
      await app.evaluate(({ dialog }, folder) => {
        dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [folder] })) as never;
      }, fresh);
      await page.evaluate(
        (fakePath) =>
          (
            window as unknown as {
              agentsOfficeDesktop: { terminal: { setConfig(p: object): Promise<unknown> } };
            }
          ).agentsOfficeDesktop.terminal.setConfig({ claudePath: fakePath }),
        fake,
      );

      const names = () => page.locator('[data-testid^="picker-row-"] .name').allTextContents();
      await page.getByTestId('picker-open').click();
      await expect(page.getByTestId('project-picker')).toBeVisible();
      // Only the history project exists so far; the office keyboard is released for typing.
      await expect.poll(names).toEqual(['beta-app']);
      await expect(page.getByTestId('picker-mode-note')).toContainText('cartões no escritório');

      // "Novo projeto…" opens the system picker (stubbed) and selects the folder.
      await page.getByTestId('picker-new').click();
      await expect.poll(names).toEqual(['fresh-folder', 'beta-app']);
      await expect(page.getByTestId('picker-selected')).toHaveText(fresh);
      // A project without history cannot continue or resume.
      await expect(page.getByTestId('picker-launch-continue')).toBeDisabled();
      await expect(page.getByTestId('picker-launch-resume')).toBeDisabled();

      // Incremental search.
      await page.getByTestId('picker-search').fill('bet');
      await expect.poll(names).toEqual(['beta-app']);
      await page.getByTestId('picker-search').fill('');
      await expect.poll(names).toEqual(['fresh-folder', 'beta-app']);

      // Favorite beta: it moves to the top.
      await page.getByTestId('picker-row-beta-app').getByTestId('picker-star').click();
      await expect.poll(names).toEqual(['beta-app', 'fresh-folder']);

      // Continue the last session of beta in plan mode.
      await page.getByTestId('picker-row-beta-app').click();
      await page.getByTestId('picker-launch-continue').check();
      await page.getByTestId('picker-mode').selectOption('plan');
      await expect(page.getByTestId('picker-mode-note')).toContainText('planejamento');
      await page.getByTestId('picker-start').click();
      await expect(page.getByTestId('project-picker')).toHaveCount(0);
      await expect
        .poll(() => page.evaluate(() => window.__terminalPanel?.text() ?? ''))
        .toContain('ARGS --permission-mode plan --continue');

      // Resume a chosen session with auto mode (labelled as not producing cards).
      await page.getByTestId('picker-open').click();
      await page.getByTestId('picker-row-beta-app').click();
      await page.getByTestId('picker-launch-resume').check();
      await expect(page.getByTestId('picker-resume-select')).toContainText('fix the login bug');
      await page.getByTestId('picker-mode').selectOption('auto');
      await expect(page.getByTestId('picker-mode-note')).toContainText('Não gera cartões');
      await page.getByTestId('picker-start').click();
      await expect.poll(() => page.evaluate(() => window.__terminalPanel?.tabs.length)).toBe(2);
      await expect
        .poll(() => page.evaluate(() => window.__terminalPanel?.text() ?? ''))
        .toContain('ARGS --permission-mode auto --resume sess-one');

      // Favorites and recents survive a restart.
      await app.close();
      app = await launch(box);
      await until(async () => (await windowState(app))?.url === box.url, 'office URL again');
      page = await app.firstWindow();
      await page.waitForFunction(() => window.__office?.connected === true);
      await page.getByTestId('picker-open').click();
      await expect.poll(names).toEqual(['beta-app', 'fresh-folder']);
      await expect(
        page.getByTestId('picker-row-beta-app').getByTestId('picker-star'),
      ).toHaveAttribute('aria-pressed', 'true');
    } finally {
      await app.close().catch(() => {});
      dispose(box);
    }
  });

  test('tab <-> session binding: app sessions open their terminal from the dialog, external ones do not; the door opens the picker', async () => {
    const box = await sandbox();
    const hookBin = join(ROOT, 'packages', 'cli', 'bin', 'agents-office.mjs');
    // The fake claude does what Claude Code does at startup: it fires hooks through the real
    // `agents-office hook` command, which adds AGENTS_OFFICE_TERMINAL_ID from its environment.
    const hook = `"${process.execPath}" "${hookBin}" hook`;
    const fake = join(box.home, 'claude');
    writeFileSync(
      fake,
      [
        '#!/bin/sh',
        'SID="app-$AGENTS_OFFICE_TERMINAL_ID"',
        'echo "READY $SID"',
        `printf '{"hook_event_name":"SessionStart","session_id":"%s","cwd":"%s","source":"startup"}' "$SID" "$PWD" | ${hook}`,
        `printf '{"hook_event_name":"UserPromptSubmit","session_id":"%s","cwd":"%s","prompt":"hello"}' "$SID" "$PWD" | ${hook}`,
        'echo "HOOKED $SID"',
        'sleep 60',
      ].join('\n'),
    );
    chmodSync(fake, 0o755);
    const alpha = join(box.home, 'alpha-app');
    const beta = join(box.home, 'beta-app');
    mkdirSync(alpha);
    mkdirSync(beta);
    const app = await launch(box);
    try {
      await until(async () => (await windowState(app))?.url === box.url, 'office URL');
      const page = await app.firstWindow();
      await page.waitForFunction(() => window.__office?.connected === true);

      // An external session (no terminal): the transcript fixture.
      const { info } = loadFixture(FIXTURE);
      createFeeder(box.projectsDir, FIXTURE).next(4);
      await expect
        .poll(async () => (await characters(page)).filter((c) => c.role === 'lead').length)
        .toBe(1);

      const start = (dir: string) =>
        page.evaluate(
          async ({ dir: d, fakePath }) => {
            const t = (
              window as unknown as {
                agentsOfficeDesktop: {
                  terminal: {
                    setConfig(p: object): Promise<unknown>;
                    start(o: object): Promise<{ ok: boolean; id: string }>;
                  };
                };
              }
            ).agentsOfficeDesktop.terminal;
            await t.setConfig({ claudePath: fakePath });
            return (await t.start({ cwd: d })).id;
          },
          { dir, fakePath: fake },
        );
      const alphaTab = await start(alpha);
      const betaTab = await start(beta);

      type BoundSession = { id: string; terminalId?: string; projectId: string };
      const sessions = () =>
        page.evaluate(() => Object.values(window.__office?.model.sessions ?? {}) as BoundSession[]);
      // Both app sessions show up in the office already bound to their tab.
      await expect
        .poll(async () =>
          (await sessions())
            .filter((x) => x.terminalId !== undefined)
            .map((x) => x.terminalId)
            .sort(),
        )
        .toEqual([alphaTab, betaTab].sort());
      const alphaSession = `app-${alphaTab}`;
      expect((await sessions()).find((x) => x.id === info.sessionId)?.terminalId).toBeUndefined();

      // Should have: the tab title follows the session state.
      await expect
        .poll(() =>
          page.evaluate(
            (id) => window.__terminalPanel?.tabs.find((t) => t.id === id)?.title ?? '',
            alphaTab,
          ),
        )
        .toBe('alpha-app · ativa · pensando');

      const handKeyboardToOffice = async () => {
        await page.mouse.click(10, 10);
        await expect
          .poll(() => page.evaluate(() => window.__terminalPanel?.keyboard))
          .toBe('player');
      };
      const talkTo = async (id: string) => {
        await expect
          .poll(
            async () => {
              await page.evaluate(
                (target) => window.__office?.actions?.approachCharacter(target),
                id,
              );
              await page.keyboard.press('Enter');
              return page.evaluate(() => window.__office?.dialog.targetId);
            },
            { timeout: 30_000, intervals: [200] },
          )
          .toBe(id);
      };
      const dialogText = () =>
        page.evaluate(() => (window.__office?.dialog.pages ?? []).flat().join('\n'));

      // External session: the dialog never offers "Abrir terminal".
      await handKeyboardToOffice();
      await talkTo(info.sessionId);
      expect(await dialogText()).not.toContain('Abrir terminal');
      await page.keyboard.press('t');
      expect(await page.evaluate(() => window.__terminalPanel?.activeId)).toBe(betaTab);
      await page.keyboard.press('Escape');
      await expect.poll(() => page.evaluate(() => window.__office?.dialog.open)).toBe(false);

      // App session: "Abrir terminal" focuses its own tab (the other one is active now).
      await talkTo(alphaSession);
      expect(await dialogText()).toContain('[T] Abrir terminal');
      await page.keyboard.press('t');
      await expect.poll(() => page.evaluate(() => window.__terminalPanel?.activeId)).toBe(alphaTab);
      await expect
        .poll(() => page.evaluate(() => window.__terminalPanel?.keyboard))
        .toBe('terminal');
      await expect.poll(() => page.evaluate(() => window.__office?.dialog.open)).toBe(false);

      // The room door starts a session already on that room's project.
      await handKeyboardToOffice();
      const roomId = (await sessions()).find((x) => x.id === alphaSession)?.projectId;
      expect(roomId).toBeTruthy();
      await expect
        .poll(
          async () => {
            await page.evaluate((r) => window.__office?.actions?.approachDoor(r), roomId ?? '');
            await page.keyboard.press('Enter');
            return page.getByTestId('project-picker').count();
          },
          { timeout: 30_000, intervals: [200] },
        )
        .toBe(1);
      await expect(page.getByTestId('picker-selected')).toHaveText(alpha);
    } finally {
      await app.close().catch(() => {});
      dispose(box);
    }
  });
  test('open in VS Code: picker, terminal tab and dialog run the (fake) code with exactly the folder', async () => {
    const box = await sandbox();
    const hookBin = join(ROOT, 'packages', 'cli', 'bin', 'agents-office.mjs');
    const hook = `"${process.execPath}" "${hookBin}" hook`;
    const fakeClaude = join(box.home, 'claude');
    writeFileSync(
      fakeClaude,
      [
        '#!/bin/sh',
        'SID="app-$AGENTS_OFFICE_TERMINAL_ID"',
        `printf '{"hook_event_name":"SessionStart","session_id":"%s","cwd":"%s","source":"startup"}' "$SID" "$PWD" | ${hook}`,
        `printf '{"hook_event_name":"UserPromptSubmit","session_id":"%s","cwd":"%s","prompt":"hello"}' "$SID" "$PWD" | ${hook}`,
        'echo "HOOKED $SID"',
        'sleep 60',
      ].join('\n'),
    );
    chmodSync(fakeClaude, 0o755);
    // A fake `code` that records its arguments (NUL separated). A real VS Code is never launched.
    const record = join(box.home, 'code-args.bin');
    const fakeCode = join(box.home, 'code');
    writeFileSync(fakeCode, `#!/bin/sh\nprintf '%s\\0' "$@" >> "${record}"\n`);
    chmodSync(fakeCode, 0o755);
    const dir = join(box.home, "my proj $HOME 'q' (é) ; & #1");
    mkdirSync(dir);
    const recorded = () =>
      existsSync(record) ? readFileSync(record, 'utf8').split('\0').slice(0, -1) : [];
    const app = await launch(box);
    try {
      await until(async () => (await windowState(app))?.url === box.url, 'office URL');
      const page = await app.firstWindow();
      await page.waitForFunction(() => window.__office?.connected === true);
      await app.evaluate(({ dialog }, folder) => {
        dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [folder] })) as never;
      }, dir);
      const saved = await page.evaluate(
        async ({ code, claude }) => {
          const d = (
            window as unknown as {
              agentsOfficeDesktop: {
                external: { setEditorPath(p: string): Promise<{ ok: boolean }> };
                terminal: { setConfig(p: object): Promise<unknown> };
              };
            }
          ).agentsOfficeDesktop;
          await d.terminal.setConfig({ claudePath: claude });
          return d.external.setEditorPath(code);
        },
        { code: fakeCode, claude: fakeClaude },
      );
      expect(saved.ok).toBe(true);

      // 1. Project picker: select the folder, click the button.
      await page.getByTestId('picker-open').click();
      await page.getByTestId('picker-new').click();
      await expect(page.getByTestId('picker-selected')).toHaveText(dir);
      await page.getByTestId('picker-vscode').click();
      await expect.poll(recorded).toEqual([dir]);
      await page.getByTestId('picker-cancel').click();

      // 2. Terminal tab bar: the active tab's folder.
      await page.evaluate(
        async (cwd) =>
          (
            window as unknown as {
              agentsOfficeDesktop: { terminal: { start(o: object): Promise<unknown> } };
            }
          ).agentsOfficeDesktop.terminal.start({ cwd }),
        dir,
      );
      await expect.poll(() => page.evaluate(() => window.__terminalPanel?.tabs.length)).toBe(1);
      await page.getByTestId('terminal-vscode').click();
      await expect.poll(recorded).toEqual([dir, dir]);

      // 3. The Tech Lead dialog of the session bound to that tab: key V.
      await page.mouse.click(10, 10);
      // The toolbar button keeps focus after its click: Enter would press it again.
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      const sessionId = await page.evaluate(() => window.__terminalPanel?.activeId ?? '');
      await expect
        .poll(
          async () => {
            await page.evaluate(
              (target) => window.__office?.actions?.approachCharacter(target),
              `app-${sessionId}`,
            );
            await page.keyboard.press('Enter');
            return page.evaluate(() => window.__office?.dialog.targetId);
          },
          { timeout: 30_000, intervals: [200] },
        )
        .toBe(`app-${sessionId}`);
      expect(
        await page.evaluate(() => (window.__office?.dialog.pages ?? []).flat().join('\n')),
      ).toContain('[V] Abrir no VS Code');
      // A real key stays down a few ms; an instant down+up inside one frame makes Phaser emit it twice.
      await page.keyboard.press('v', { delay: 80 });
      await expect.poll(recorded).toEqual([dir, dir, dir]);
      await expect.poll(() => page.evaluate(() => window.__office?.dialog.open)).toBe(false);
    } finally {
      await app.close().catch(() => {});
      dispose(box);
    }
  });

  test('open in VS Code: a missing editor shows a clear toast and does not break the app', async () => {
    const box = await sandbox();
    const dir = join(box.home, 'some-project');
    mkdirSync(dir);
    // A saved path that is no longer executable makes discovery fail without ever probing the
    // host's real installation (this machine has VS Code in /snap/bin).
    writeFileSync(
      join(box.userData, 'editor.json'),
      JSON.stringify({ vscodePath: join(box.home, 'gone', 'code') }),
    );
    const app = await launch(box);
    try {
      await until(async () => (await windowState(app))?.url === box.url, 'office URL');
      const page = await app.firstWindow();
      await page.waitForFunction(() => window.__office?.connected === true);
      await app.evaluate(({ dialog }, folder) => {
        dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [folder] })) as never;
      }, dir);
      await page.getByTestId('picker-open').click();
      await page.getByTestId('picker-new').click();
      await expect(page.getByTestId('picker-selected')).toHaveText(dir);
      await page.getByTestId('picker-vscode').click();
      await expect(page.getByTestId('toast')).toContainText('saved VS Code path');
      // Still usable: the picker is open and the window answers.
      await expect(page.getByTestId('project-picker')).toBeVisible();
    } finally {
      await app.close().catch(() => {});
      dispose(box);
    }
  });
  test('full flow: picker -> terminal -> bound Tech Lead -> permission card -> VS Code', async () => {
    const box = await sandbox();
    const claude = writeLifecycleClaude(box);
    const record = join(box.home, 'code-args.bin');
    const fakeCode = join(box.home, 'code');
    writeFileSync(fakeCode, `#!/bin/sh\nprintf '%s\\0' "$@" >> "${record}"\n`);
    chmodSync(fakeCode, 0o755);
    const dir = join(box.home, 'flow-project');
    mkdirSync(dir);
    const recorded = () =>
      existsSync(record) ? readFileSync(record, 'utf8').split('\0').slice(0, -1) : [];
    const app = await launch(box);
    try {
      await until(async () => (await windowState(app))?.url === box.url, 'office URL');
      const page = await app.firstWindow();
      await page.waitForFunction(() => window.__office?.connected === true);
      await app.evaluate(({ dialog }, folder) => {
        dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [folder] })) as never;
      }, dir);
      await page.evaluate(
        async ({ code, path }) => {
          const d = (
            window as unknown as {
              agentsOfficeDesktop: {
                external: { setEditorPath(p: string): Promise<unknown> };
                terminal: TerminalApi;
              };
            }
          ).agentsOfficeDesktop;
          await d.terminal.setConfig({ claudePath: path });
          await d.external.setEditorPath(code);
        },
        { code: fakeCode, path: claude.path },
      );

      // 1. Start a session from the project picker.
      await page.getByTestId('picker-open').click();
      await page.getByTestId('picker-new').click();
      await expect(page.getByTestId('picker-selected')).toHaveText(dir);
      await page.getByTestId('picker-start').click();
      await expect(page.getByTestId('project-picker')).toHaveCount(0);

      // 2. The tab shows the output of the (fake) claude.
      await expect.poll(() => page.evaluate(() => window.__terminalPanel?.tabs.length)).toBe(1);
      const tab = await page.evaluate(() => window.__terminalPanel?.activeId ?? '');
      await expect
        .poll(() => page.evaluate(() => window.__terminalPanel?.text() ?? ''))
        .toContain(`READY app-${tab}`);

      // 3. The Tech Lead of that session appears bound to the tab.
      const sessionId = `app-${tab}`;
      await expect
        .poll(() =>
          page.evaluate(
            (id) =>
              (
                window.__office?.model.sessions as
                  | Record<string, { terminalId?: string }>
                  | undefined
              )?.[id]?.terminalId,
            sessionId,
          ),
        )
        .toBe(tab);
      await expect
        .poll(() => page.evaluate(() => window.__terminalPanel?.tabs[0]?.title ?? ''))
        .toContain('flow-project · ativa');

      // 4. A permission request of that session is pending in the office; the hook returns at once.
      const answer = fetch(`${box.url}hook`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          hook_event_name: 'PermissionRequest',
          session_id: sessionId,
          cwd: dir,
          permission_mode: 'default',
          tool_name: 'Bash',
          tool_input: { command: 'pnpm test' },
        }),
      });
      expect((await answer).status).toBe(204);
      await expect
        .poll(() => page.evaluate(() => window.__office?.permissions.queue.length))
        .toBe(1);

      // 5. The VS Code button of the tab calls the (fake) `code` with exactly the folder.
      await page.getByTestId('terminal-vscode').click();
      await expect.poll(recorded).toEqual([dir]);
    } finally {
      await app.close().catch(() => {});
      dispose(box);
    }
  });

  test('closing the window keeps ptys and buffers; Sair lists the live sessions and leaves no orphans', async () => {
    const box = await sandbox();
    const claude = writeLifecycleClaude(box);
    const dirs = ['alpha-app', 'beta-app', 'gamma-app'].map((name) => join(box.home, name));
    for (const dir of dirs) mkdirSync(dir);
    const app = await launch(box);
    const proc = app.process();
    try {
      await until(async () => (await windowState(app))?.url === box.url, 'office URL');
      const page = await app.firstWindow();
      await page.waitForFunction(() => window.__office?.connected === true);
      const ids = await page.evaluate(
        async ({ path, folders }) => {
          const t = (window as unknown as { agentsOfficeDesktop: { terminal: TerminalApi } })
            .agentsOfficeDesktop.terminal;
          await t.setConfig({ claudePath: path });
          const started: string[] = [];
          for (const cwd of folders) started.push((await t.start({ cwd })).id);
          return started;
        },
        { path: claude.path, folders: dirs },
      );
      const [alpha, beta, gamma] = ids as [string, string, string];
      await expect.poll(() => page.evaluate(() => window.__terminalPanel?.tabs.length)).toBe(3);
      await expect.poll(() => readPids(claude.childFile).length).toBe(3);
      const send = (id: string, data: string) =>
        page.evaluate(
          ([target, text]) =>
            (
              window as unknown as { agentsOfficeDesktop: { terminal: TerminalApi } }
            ).agentsOfficeDesktop.terminal.write(target as string, text as string),
          [id, data],
        );
      const buffer = (id: string) =>
        page.evaluate(
          (target) =>
            (
              window as unknown as {
                agentsOfficeDesktop: { terminal: { buffer(i: string): Promise<string | null> } };
              }
            ).agentsOfficeDesktop.terminal.buffer(target),
          id,
        );
      await send(alpha, 'before-hide\r');
      await expect.poll(() => buffer(alpha)).toContain('ECHO before-hide');

      // Close the window: it only hides. The process of beta ends while it is hidden.
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
      await until(async () => (await windowState(app))?.visible === false, 'hidden window');
      await send(beta, 'bye\r');
      await expect
        .poll(() => page.evaluate(() => window.__terminalPanel?.tabs.map((t) => t.state)))
        .toEqual(['running', 'exited', 'running']);
      await send(alpha, 'while-hidden\r');
      await expect.poll(() => buffer(alpha)).toContain('ECHO while-hidden');

      // Reopen: tabs and buffers are intact, beta shows as ended.
      await app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        win?.show();
        win?.focus();
      });
      await until(async () => (await windowState(app))?.visible === true, 'visible window');
      const tabs = await page.evaluate(() => window.__terminalPanel?.tabs ?? []);
      expect(tabs.map((t) => t.id)).toEqual([alpha, beta, gamma]);
      expect(tabs.map((t) => t.state)).toEqual(['running', 'exited', 'running']);
      expect(tabs[1]?.title).toContain('encerrada');
      await page.locator('.ao-term-tab').nth(0).click();
      expect(await page.evaluate(() => window.__terminalPanel?.activeId)).toBe(alpha);
      await expect
        .poll(() => page.evaluate(() => window.__terminalPanel?.text() ?? ''))
        .toContain('ECHO while-hidden');
      expect(await page.evaluate(() => window.__terminalPanel?.text() ?? '')).toContain(
        'ECHO before-hide',
      );

      // A reloaded window re-adopts the live sessions with their buffer.
      await page.reload();
      await page.waitForFunction(() => window.__office?.connected === true);
      await expect
        .poll(() => page.evaluate(() => window.__terminalPanel?.tabs.map((t) => t.id)))
        .toEqual([alpha, gamma]);
      await expect
        .poll(() => page.evaluate(() => window.__terminalPanel?.text() ?? ''))
        .toContain('ECHO while-hidden');

      const ptyPids = await page.evaluate(() =>
        (
          window as unknown as { agentsOfficeDesktop: { terminal: TerminalApi } }
        ).agentsOfficeDesktop.terminal
          .list()
          .then((list) => list.map((s) => s.pid)),
      );
      expect(ptyPids).toHaveLength(2);
      const children = readPids(claude.childFile);
      for (const pid of ptyPids) expect(isAlive(pid), `pid ${pid}`).toBe(true);
      // The leftovers of the session that ended by itself are cleaned up with it; the other two stay.
      expect(children.filter(isAlive)).toHaveLength(2);

      // Sair -> Cancelar: nothing is killed, the window is still usable.
      await answerQuitDialog(app, 0);
      await chooseSair(app);
      await expect.poll(async () => (await quitDialog(app)).length).toBe(1);
      const asked = (await quitDialog(app))[0] as QuitDialogCall;
      expect(asked.buttons).toEqual(['Cancelar', 'Encerrar tudo']);
      expect(asked.message).toContain('2 sessões');
      expect(asked.detail).toContain('alpha-app - ativa há');
      expect(asked.detail).toContain('gamma-app - ativa há');
      expect(asked.detail).not.toContain('beta-app');
      await page.waitForTimeout(500);
      expect(proc.exitCode).toBeNull();
      expect(ptyPids.every(isAlive)).toBe(true);
      expect(await healthy(box.port)).toBe(true);
      // Closing the window still only hides it after a cancelled quit.
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
      await until(async () => (await windowState(app))?.visible === false, 'hidden again');
      expect(proc.exitCode).toBeNull();

      // Sair -> Encerrar tudo: every pty, its children and the daemon are gone.
      await answerQuitDialog(app, 1);
      const exited = new Promise<void>((resolve) => proc.once('exit', () => resolve()));
      await chooseSair(app);
      await exited;
      await until(
        () => [...ptyPids, ...children].every((pid) => !isAlive(pid)),
        'no orphans',
        15_000,
      );
      await until(async () => !(await healthy(box.port)), 'daemon stopped');
      expect(daemonPids(box.port)).toEqual([]);
      // A deliberate exit leaves nothing to resume.
      const stored = JSON.parse(readFileSync(join(box.userData, 'sessions.json'), 'utf8'));
      expect(stored.active).toEqual([]);
    } finally {
      await app.close().catch(() => {});
      dispose(box);
    }
  });

  test('SIGTERM ends the sessions cleanly without asking and keeps them recoverable', async () => {
    const box = await sandbox();
    const claude = writeLifecycleClaude(box);
    const dir = join(box.home, 'nohook-app');
    mkdirSync(dir);
    const app = await launch(box);
    const proc = app.process();
    try {
      await until(async () => (await windowState(app))?.url === box.url, 'office URL');
      const page = await app.firstWindow();
      await page.waitForFunction(() => window.__office?.connected === true);
      // A dialog would be answered "Cancelar": the app must not ask at all.
      await answerQuitDialog(app, 0);
      await page.evaluate(
        async ({ path, cwd }) => {
          const t = (window as unknown as { agentsOfficeDesktop: { terminal: TerminalApi } })
            .agentsOfficeDesktop.terminal;
          await t.setConfig({ claudePath: path });
          await t.start({ cwd });
        },
        { path: claude.path, cwd: dir },
      );
      await expect.poll(() => readPids(claude.childFile).length).toBe(1);
      const children = readPids(claude.childFile);
      const exited = new Promise<void>((resolve) => proc.once('exit', () => resolve()));
      proc.kill('SIGTERM');
      await exited;
      await until(() => children.every((pid) => !isAlive(pid)), 'no orphans', 15_000);
      await until(async () => !(await healthy(box.port)), 'daemon stopped');
      const stored = JSON.parse(readFileSync(join(box.userData, 'sessions.json'), 'utf8'));
      expect(stored.active).toHaveLength(1);
    } finally {
      await app.close().catch(() => {});
      dispose(box);
    }
  });

  test('crash (kill -9) and reopen: lost sessions are offered and resume with --resume or --continue', async () => {
    const box = await sandbox();
    const claude = writeLifecycleClaude(box);
    const known = join(box.home, 'known-app');
    const unknown = join(box.home, 'nohook-app');
    mkdirSync(known);
    mkdirSync(unknown);
    // The first run is a plain process driven over CDP: a Playwright-launched Electron that is
    // SIGKILLed leaves its handle dangling and the worker teardown hangs.
    const victim = await spawnDriven(box);
    let app: ElectronApplication | undefined;
    try {
      await until(() => victim.page.url() === box.url, 'office URL');
      await victim.page.waitForFunction(() => window.__office?.connected === true);
      const first = await victim.page.evaluate(
        async ({ path, cwd, other }) => {
          const t = (window as unknown as { agentsOfficeDesktop: { terminal: TerminalApi } })
            .agentsOfficeDesktop.terminal;
          await t.setConfig({ claudePath: path });
          const a = await t.start({ cwd, permissionMode: 'plan' });
          await t.start({ cwd: other });
          return a.id;
        },
        { path: claude.path, cwd: known, other: unknown },
      );
      // The office learns which Claude session runs in the first tab and the app records it.
      const registryFile = join(box.userData, 'sessions.json');
      await expect
        .poll(() =>
          existsSync(registryFile)
            ? (
                JSON.parse(readFileSync(registryFile, 'utf8')) as {
                  active: { id: string; claudeSessionId?: string }[];
                }
              ).active.find((e) => e.id === first)?.claudeSessionId
            : undefined,
        )
        .toBe(`app-${first}`);
      expect(JSON.parse(readFileSync(registryFile, 'utf8')).active).toHaveLength(2);

      // kill -9: no cleanup of any kind (the helpers it leaves behind die with the "machine").
      const crashed = new Promise<void>((resolve) => victim.proc.once('exit', () => resolve()));
      victim.proc.kill('SIGKILL');
      await crashed;
      await victim.browser.close().catch(() => {});
      killOrphans(box);

      const second = await launch(box);
      app = second;
      await until(async () => (await windowState(second))?.url === box.url, 'office URL again');
      let page = await second.firstWindow();
      await page.waitForFunction(() => window.__office?.connected === true);
      await expect(page.getByTestId('lost-sessions')).toBeVisible();
      await expect(page.getByTestId('lost-row')).toHaveCount(2);
      await expect(page.getByTestId('lost-row').nth(0)).toContainText('known-app');
      await expect(page.getByTestId('lost-row').nth(0)).toContainText('retoma a sessão anterior');
      await expect(page.getByTestId('lost-row').nth(1)).toContainText('retoma a última conversa');
      // Nothing runs yet.
      expect(await page.evaluate(() => window.__terminalPanel?.tabs.length)).toBe(0);

      // Resume the first: `--resume <session id>` and the permission mode it had.
      await page.getByTestId('lost-row').nth(0).getByTestId('lost-resume').click();
      await expect.poll(() => page.evaluate(() => window.__terminalPanel?.tabs.length)).toBe(1);
      await expect
        .poll(() => page.evaluate(() => window.__terminalPanel?.text() ?? ''))
        .toContain(`ARGS --permission-mode plan --resume app-${first}`);
      await expect(page.getByTestId('lost-row')).toHaveCount(1);
      // The other one has no known id: `--continue`.
      await page.getByTestId('lost-resume').click();
      await expect.poll(() => page.evaluate(() => window.__terminalPanel?.tabs.length)).toBe(2);
      await expect
        .poll(() => page.evaluate(() => window.__terminalPanel?.text() ?? ''))
        .toContain('ARGS --continue');
      await expect(page.getByTestId('lost-sessions')).toBeHidden();

      // Resumed offers are gone for good: a deliberate exit (Sair -> Encerrar tudo) and another start
      // offer nothing.
      const sairExit = new Promise<void>((resolve) =>
        second.process().once('exit', () => resolve()),
      );
      await chooseSair(second);
      await sairExit;
      const third = await launch(box);
      app = third;
      await until(async () => (await windowState(third))?.url === box.url, 'office URL third');
      page = await third.firstWindow();
      await page.waitForFunction(() => window.__office?.connected === true);
      await expect(page.getByTestId('lost-sessions')).toBeHidden();
    } finally {
      victim.proc.kill('SIGKILL');
      await app?.close().catch(() => {});
      for (const pid of daemonPids(box.port)) {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          // already gone
        }
      }
      dispose(box);
    }
  });
});
