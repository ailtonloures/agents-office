import { execFile } from 'node:child_process';
import { accessSync, constants, statSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';

const MARK_START = '__AO_S__';
const MARK_END = '__AO_E__';

/** Typed error with guidance for the user, shown by the terminal UI. */
export class ClaudeNotFound extends Error {
  readonly code = 'claude-not-found';
  constructor(
    readonly searched: string[],
    manualPath?: string,
  ) {
    super(
      manualPath
        ? `The saved path "${manualPath}" is not an executable file. Fix it in the app settings or clear it to search automatically.`
        : 'Claude Code (the "claude" command) was not found. Install it (https://docs.claude.com/en/docs/claude-code) or set its full path in the app settings, then try again.',
    );
    this.name = 'ClaudeNotFound';
  }
}

export interface BinaryDeps {
  env: Record<string, string | undefined>;
  platform: NodeJS.Platform;
  homedir: string;
  /** True for an executable regular file. */
  isExecutable(path: string): boolean;
  /** Runs `shell` with `args` (stdin closed) and resolves with stdout; rejects on error/timeout. */
  runShell(shell: string, args: string[], timeoutMs: number): Promise<string>;
  timeoutMs?: number;
}

export function realIsExecutable(path: string): boolean {
  try {
    if (!statSync(path).isFile()) return false;
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function realRunShell(shell: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      shell,
      args,
      { timeout: timeoutMs, maxBuffer: 1024 * 1024, windowsHide: true },
      (error, stdout) => (error ? reject(error) : resolve(stdout)),
    );
    child.stdin?.end();
  });
}

/** Takes the PATH between the markers, ignoring whatever the rc files print around it. */
export function extractMarkedPath(output: string): string | undefined {
  const start = output.lastIndexOf(MARK_START);
  if (start < 0) return undefined;
  const end = output.indexOf(MARK_END, start + MARK_START.length);
  if (end < 0) return undefined;
  const value = output.slice(start + MARK_START.length, end).trim();
  return value === '' ? undefined : value;
}

export function commonClaudeDirs(home: string, platform: NodeJS.Platform): string[] {
  const dirs = [
    join(home, '.local', 'bin'),
    join(home, '.claude', 'local'),
    '/usr/local/bin',
    join(home, '.bun', 'bin'),
    join(home, '.npm-global', 'bin'),
  ];
  if (platform === 'darwin') dirs.push('/opt/homebrew/bin');
  return dirs;
}

export interface ResolvedClaude {
  path: string;
  /** PATH to give the pty: the `claude` needs it to run `node`, hooks and MCP servers. */
  pathEnv: string;
  source: 'manual' | 'login-shell' | 'process-path' | 'common-dir';
}

export class BinaryResolver {
  private loginPath: Promise<string | undefined> | undefined;
  private cached: ResolvedClaude | undefined;

  constructor(private readonly deps: BinaryDeps) {}

  /** Forgets the cache (after the user changes the manual path or installs claude). */
  invalidate(): void {
    this.loginPath = undefined;
    this.cached = undefined;
  }

  /**
   * PATH of an interactive login shell. `-lc` alone does not find tools whose PATH is set in
   * `.zshrc`, so the shell is interactive (`-ilc`). Cached only when it worked.
   */
  resolveLoginPath(): Promise<string | undefined> {
    if (this.deps.platform === 'win32') return Promise.resolve(undefined);
    this.loginPath ??= this.readLoginPath().then((value) => {
      if (value === undefined) this.loginPath = undefined;
      return value;
    });
    return this.loginPath;
  }

  private async readLoginPath(): Promise<string | undefined> {
    const shell = this.deps.env.SHELL || '/bin/sh';
    try {
      const out = await this.deps.runShell(
        shell,
        ['-ilc', `printf "${MARK_START}%s${MARK_END}" "$PATH"`],
        this.deps.timeoutMs ?? 5000,
      );
      return extractMarkedPath(out);
    } catch {
      return undefined;
    }
  }

  private findIn(pathValue: string): string | undefined {
    const names = this.deps.platform === 'win32' ? ['claude.exe', 'claude.cmd'] : ['claude'];
    for (const dir of pathValue.split(delimiter)) {
      if (!dir) continue;
      for (const name of names) {
        const candidate = join(dir, name);
        if (this.deps.isExecutable(candidate)) return candidate;
      }
    }
    return undefined;
  }

  async resolveClaude(manualPath?: string | null): Promise<ResolvedClaude> {
    const manual = manualPath?.trim() || undefined;
    if (this.cached && this.cached.source !== 'manual' && !manual) {
      if (this.deps.isExecutable(this.cached.path)) return this.cached;
      this.cached = undefined;
    }
    const base = this.deps.env.PATH ?? '';
    const login = await this.resolveLoginPath();
    const merged = login ?? base;

    const make = (path: string, source: ResolvedClaude['source']): ResolvedClaude => {
      const dir = dirname(path);
      const parts = merged.split(delimiter);
      const pathEnv = parts.includes(dir) ? merged : [...parts, dir].join(delimiter);
      return { path, pathEnv, source };
    };

    if (manual) {
      if (!this.deps.isExecutable(manual)) throw new ClaudeNotFound([manual], manual);
      return make(manual, 'manual');
    }

    const searched: string[] = [];
    let found: ResolvedClaude | undefined;
    if (login) {
      const path = this.findIn(login);
      if (path) found = make(path, 'login-shell');
      searched.push('login shell PATH');
    }
    if (!found && base) {
      const path = this.findIn(base);
      if (path) found = make(path, 'process-path');
      searched.push('process PATH');
    }
    if (!found) {
      const dirs = commonClaudeDirs(this.deps.homedir, this.deps.platform);
      const path = this.findIn(dirs.join(delimiter));
      if (path) found = make(path, 'common-dir');
      searched.push(...dirs);
    }
    if (!found) throw new ClaudeNotFound(searched);
    this.cached = found;
    return found;
  }
}
