import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, isAbsolute, join } from 'node:path';
import type { OpenInVSCodeErrorCode } from '@agents-office/shared';

const MAC_APP = '/Applications/Visual Studio Code.app';
const MAC_APP_CLI = `${MAC_APP}/Contents/Resources/app/bin/code`;

/** `code` was not found: the message tells the user how to fix it. */
export class VSCodeNotFound extends Error {
  readonly code = 'vscode-not-found';
  constructor(
    readonly searched: string[],
    manualPath?: string,
  ) {
    super(
      manualPath
        ? `The saved VS Code path "${manualPath}" is not an executable file. Fix it in the app settings or clear it to search automatically.`
        : 'VS Code (the "code" command) was not found. Install VS Code (https://code.visualstudio.com) and, in it, run "Shell Command: Install \'code\' command in PATH", or set the full path of the executable in the app settings.',
    );
    this.name = 'VSCodeNotFound';
  }
}

/** A failure that is not "not found": invalid folder or the command failed to run. */
export class OpenerError extends Error {
  constructor(
    readonly code: Exclude<OpenInVSCodeErrorCode, 'vscode-not-found'>,
    message: string,
  ) {
    super(message);
    this.name = 'OpenerError';
  }
}

export interface OpenerDeps {
  env: Record<string, string | undefined>;
  platform: NodeJS.Platform;
  homedir: string;
  /** True for an executable regular file. */
  isExecutable(path: string): boolean;
  isDirectory(path: string): boolean;
  /** PATH of the user's login shell (where `code` usually is), if it can be read. */
  loginPath(): Promise<string | undefined>;
  /** Runs `file` with `args` (no shell); rejects when the command fails to start or exits non-zero. */
  run(file: string, args: string[]): Promise<void>;
}

/** What to execute: always a file plus an argument array, never a command line. */
export interface Launch {
  file: string;
  args: string[];
  source: 'manual' | 'login-shell' | 'process-path' | 'fallback' | 'open-app';
}

/** Absolute paths where `code` lives when it is not in the PATH. */
export function fallbackPaths(home: string, platform: NodeJS.Platform): string[] {
  if (platform === 'darwin') {
    return [MAC_APP_CLI, join(home, MAC_APP_CLI), '/opt/homebrew/bin/code', '/usr/local/bin/code'];
  }
  if (platform === 'linux') {
    return [
      '/usr/bin/code',
      '/snap/bin/code',
      '/usr/local/bin/code',
      '/var/lib/flatpak/exports/bin/com.visualstudio.code',
      join(home, '.local', 'share', 'flatpak', 'exports', 'bin', 'com.visualstudio.code'),
    ];
  }
  return [];
}

function findIn(deps: OpenerDeps, pathValue: string): string | undefined {
  const names = deps.platform === 'win32' ? ['code.cmd', 'code.exe'] : ['code'];
  for (const dir of pathValue.split(delimiter)) {
    if (!dir) continue;
    for (const name of names) {
      const candidate = join(dir, name);
      if (deps.isExecutable(candidate)) return candidate;
    }
  }
  return undefined;
}

/**
 * Where is VS Code? Order: the saved manual path (exclusive), `code` in the login shell PATH, in
 * the process PATH, the usual install locations, and on macOS `open -a "Visual Studio Code"`.
 * Throws {@link VSCodeNotFound}. The folder is appended as a single argument.
 */
export async function discoverVSCode(
  deps: OpenerDeps,
  dir: string,
  manualPath?: string | null,
): Promise<Launch> {
  const manual = manualPath?.trim() || undefined;
  if (manual) {
    if (!deps.isExecutable(manual)) throw new VSCodeNotFound([manual], manual);
    return { file: manual, args: [dir], source: 'manual' };
  }
  const searched: string[] = [];
  const login = await deps.loginPath();
  if (login) {
    const found = findIn(deps, login);
    if (found) return { file: found, args: [dir], source: 'login-shell' };
    searched.push('login shell PATH');
  }
  const base = deps.env.PATH;
  if (base) {
    const found = findIn(deps, base);
    if (found) return { file: found, args: [dir], source: 'process-path' };
    searched.push('process PATH');
  }
  for (const candidate of fallbackPaths(deps.homedir, deps.platform)) {
    if (deps.isExecutable(candidate)) return { file: candidate, args: [dir], source: 'fallback' };
    searched.push(candidate);
  }
  if (deps.platform === 'darwin' && deps.isDirectory(MAC_APP)) {
    return { file: 'open', args: ['-a', 'Visual Studio Code', dir], source: 'open-app' };
  }
  throw new VSCodeNotFound(searched);
}

/** The folder must be an absolute path to an existing directory (no NUL bytes). */
export function validateDir(deps: Pick<OpenerDeps, 'isDirectory'>, dir: unknown): string {
  if (typeof dir !== 'string' || dir === '' || dir.includes('\0') || !isAbsolute(dir)) {
    throw new OpenerError('invalid-dir', 'Invalid folder: an absolute path is required.');
  }
  if (!deps.isDirectory(dir)) {
    throw new OpenerError('invalid-dir', `The folder "${dir}" does not exist.`);
  }
  return dir;
}

/** Opens `dir` in VS Code. Throws {@link VSCodeNotFound} or {@link OpenerError}. */
export async function openInVSCode(
  deps: OpenerDeps,
  dir: string,
  manualPath?: string | null,
): Promise<Launch> {
  const valid = validateDir(deps, dir);
  const launch = await discoverVSCode(deps, valid, manualPath);
  try {
    await deps.run(launch.file, launch.args);
  } catch (error) {
    throw new OpenerError(
      'spawn-failed',
      `Could not run VS Code (${launch.file}): ${(error as Error).message}`,
    );
  }
  return launch;
}

export function realIsDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Runs the command without a shell. `code` normally returns right away after handing the folder to
 * the running VS Code; if it is still running after `waitMs` it is left alone (detached).
 */
export function realRun(file: string, args: string[], waitMs = 8000): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { stdio: 'ignore', detached: true, windowsHide: true });
    const timer = setTimeout(() => {
      child.unref();
      resolve();
    }, waitMs);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`exited with ${code ?? signal}`));
    });
  });
}

/** Manual `code` path saved in the app data folder. */
export class EditorPathStore {
  private value: string | null;

  constructor(private readonly path: string) {
    this.value = EditorPathStore.load(path);
  }

  private static load(path: string): string | null {
    try {
      const raw = JSON.parse(readFileSync(path, 'utf8')) as { vscodePath?: unknown };
      return typeof raw.vscodePath === 'string' && raw.vscodePath !== '' ? raw.vscodePath : null;
    } catch {
      return null;
    }
  }

  get(): string | null {
    return this.value;
  }

  set(value: string | null): void {
    this.value = value;
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, `${JSON.stringify({ vscodePath: value }, null, 2)}\n`);
    renameSync(tmp, this.path);
  }
}
