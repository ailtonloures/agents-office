import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The published package's bin when it is built, otherwise the development bin (tsx). */
function binPath(): string {
  const packaged = join(ROOT, 'packages', 'cli');
  if (existsSync(join(packaged, 'dist', 'cli.mjs')))
    return join(packaged, 'bin', 'agents-office.mjs');
  return join(ROOT, 'packages', 'daemon', 'bin', 'agents-office.mjs');
}

export async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });
}

async function waitForHealth(
  port: number,
  child: ChildProcess,
  output: () => string,
): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`daemon exited early:\n${output()}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`daemon did not become healthy:\n${output()}`);
}

export interface RunningDaemon {
  port: number;
  url: string;
  projectsDir: string;
  /** Stops the daemon (SIGTERM, then SIGKILL) and waits for the process to exit. */
  stop(): Promise<void>;
  /** Starts it again on the same port and projects dir after a `stop()`. */
  restart(): Promise<void>;
  /** Stops it and removes the temporary projects dir. */
  dispose(): Promise<void>;
}

/** Spawns the real daemon CLI on a random port against a fresh temporary projects dir. */
export async function startDaemon(): Promise<RunningDaemon> {
  const projectsDir = mkdtempSync(join(tmpdir(), 'agents-office-e2e-'));
  const port = await freePort();
  let child: ChildProcess | undefined;

  const launch = async (): Promise<void> => {
    let log = '';
    const proc = spawn(
      process.execPath,
      [binPath(), 'start', '--no-open', '--port', String(port), '--projects-dir', projectsDir],
      { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, AGENTS_OFFICE_PORT: undefined } },
    );
    proc.stdout?.on('data', (chunk) => {
      log += String(chunk);
    });
    proc.stderr?.on('data', (chunk) => {
      log += String(chunk);
    });
    child = proc;
    await waitForHealth(port, proc, () => log);
  };

  const stop = async (): Promise<void> => {
    const proc = child;
    child = undefined;
    if (!proc || proc.exitCode !== null) return;
    const exited = new Promise<void>((resolve) => proc.once('exit', () => resolve()));
    proc.kill('SIGTERM');
    const timer = setTimeout(() => proc.kill('SIGKILL'), 5000);
    await exited;
    clearTimeout(timer);
  };

  await launch();
  return {
    port,
    url: `http://127.0.0.1:${port}`,
    projectsDir,
    stop,
    restart: launch,
    async dispose() {
      await stop();
      rmSync(projectsDir, { recursive: true, force: true });
    },
  };
}
