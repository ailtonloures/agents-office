import { randomUUID } from 'node:crypto';
import { statSync } from 'node:fs';
import type {
  TerminalDataEvent,
  TerminalErrorCode,
  TerminalExitEvent,
  TerminalPermissionMode,
  TerminalSessionInfo,
} from '@agents-office/shared';
import { buildMcpConfig } from './agentBus/server';
import { ClaudeNotFound } from './binaries';
import { RingBuffer, type RingBufferLimits } from './ringBuffer';

/** The slice of `node-pty`'s IPty the manager uses (lets unit tests inject a fake). */
export interface PtyLike {
  readonly pid: number;
  onData(listener: (data: string) => void): void;
  onExit(listener: (event: { exitCode: number; signal?: number }) => void): void;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
}

export interface PtySpawnOptions {
  cwd: string;
  env: Record<string, string>;
  cols: number;
  rows: number;
}

export type PtyFactory = (file: string, args: string[], options: PtySpawnOptions) => PtyLike;

export interface StartOptions {
  cwd: string;
  resume?: string;
  continueLast?: boolean;
  permissionMode?: TerminalPermissionMode;
  /** Replaces the `claude` binary (tests use a fake). Never reachable from the renderer. */
  command?: string;
  /** Extra arguments, only with `command`. */
  args?: string[];
  cols?: number;
  rows?: number;
  /** Text appended to the system prompt (`--append-system-prompt`); adds to CLAUDE.md. */
  instructions?: string;
  /** Model alias or id (`--model`). */
  model?: string;
  /** Library profile / roster entry id of the agent; exported as AGENTS_OFFICE_PROFILE_ID. */
  profileId?: string;
  /** Project id (its path); exported as AGENTS_OFFICE_PROJECT_ID. */
  projectId?: string;
  /** Role used to pick the Agent Bus tools. Default 'padrao'. */
  role?: string;
}

export class SessionError extends Error {
  constructor(
    readonly code: TerminalErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SessionError';
  }
}

export interface SessionManagerOptions {
  spawn: PtyFactory;
  /** Finds `claude` and the login-shell PATH. Not called when `command` is given. */
  resolveClaude(): Promise<{ path: string; pathEnv: string }>;
  /** The environment the pty starts from (the app's `process.env`). */
  baseEnv?: Record<string, string | undefined>;
  maxSessions?: () => number;
  /** Time between SIGHUP and SIGKILL. */
  killGraceMs?: number;
  bufferLimits?: RingBufferLimits;
  isDirectory?: (path: string) => boolean;
  /**
   * Signals the whole process group of a pty (`process.kill(-pid, signal)`). The pty child is the
   * session leader, so its children (hooks, MCP servers, shells) share the group. Opt-in because
   * it signals real pids: tests with fake ptys must not set it.
   */
  killGroup?: (pid: number, signal: 'SIGHUP' | 'SIGKILL') => void;
  /**
   * Agent Bus hooks: `issue` returns the MCP credentials for the new session (null = no bus),
   * `revoke` is called when the session ends.
   */
  agentBus?: {
    issue(session: {
      sessionId: string;
      entryId: string | null;
      cwd: string;
      role: string;
    }): { url: string; token: string } | null;
    revoke(sessionId: string): void;
  };
  newId?: () => string;
  now?: () => Date;
}

const KEEP_CLAUDE_VARS = /^CLAUDE_CODE_(USE_|SKIP_)/;
const SESSION_MARKERS = /^(CLAUDECODE$|CLAUDE_CODE_|CLAUDE_EFFORT$|CLAUDE_PID$)/;

/**
 * Environment for the pty. If the app was itself started from a Claude Code session, it inherits
 * markers (`CLAUDE_CODE_CHILD_SESSION`...) that make the child claude stop saving its transcript
 * (the session would never show in the office). The user's own choices (`CLAUDE_CODE_USE_*`,
 * `CLAUDE_CODE_SKIP_*`, e.g. Bedrock) stay.
 */
export function cleanClaudeEnv(env: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue;
    if (SESSION_MARKERS.test(key) && !KEEP_CLAUDE_VARS.test(key)) continue;
    out[key] = value;
  }
  return out;
}

interface Session {
  info: TerminalSessionInfo;
  pty: PtyLike;
  buffer: RingBuffer;
  exited: boolean;
  killTimer?: ReturnType<typeof setTimeout>;
  killing?: Promise<void>;
  waiters: Array<() => void>;
}

export class SessionManager {
  private readonly sessions = new Map<string, Session>();
  private readonly dataListeners = new Set<(event: TerminalDataEvent) => void>();
  private readonly exitListeners = new Set<(event: TerminalExitEvent) => void>();
  private readonly startListeners = new Set<(info: TerminalSessionInfo) => void>();

  constructor(private readonly options: SessionManagerOptions) {}

  async start(start: StartOptions): Promise<{ id: string }> {
    const isDirectory = this.options.isDirectory ?? defaultIsDirectory;
    if (!start.cwd || !isDirectory(start.cwd)) {
      throw new SessionError('invalid-cwd', `"${start.cwd}" does not exist or is not a directory.`);
    }
    const limit = this.options.maxSessions?.() ?? Number.POSITIVE_INFINITY;
    if (this.sessions.size >= limit) {
      throw new SessionError(
        'session-limit',
        `The limit of ${limit} simultaneous terminal sessions was reached. Close one first.`,
      );
    }

    const env = cleanClaudeEnv(this.options.baseEnv ?? process.env);
    let file: string;
    let args: string[];
    if (start.command) {
      file = start.command;
      args = start.args ?? [];
    } else {
      const claude = await this.options.resolveClaude();
      file = claude.path;
      args = [];
      env.PATH = claude.pathEnv;
    }
    const id = this.options.newId?.() ?? `term-${randomUUID()}`;
    if (!start.command) {
      if (start.instructions) args.push('--append-system-prompt', start.instructions);
      if (start.model) args.push('--model', start.model);
      const credentials = this.options.agentBus?.issue({
        sessionId: id,
        entryId: start.profileId ?? null,
        cwd: start.cwd,
        role: start.role ?? 'padrao',
      });
      if (credentials) args.push('--mcp-config', buildMcpConfig(credentials));
      if (start.permissionMode) args.push('--permission-mode', start.permissionMode);
      if (start.resume) args.push('--resume', start.resume);
      else if (start.continueLast) args.push('--continue');
    }
    // Re-checked after the await: other starts may have happened meanwhile.
    if (this.sessions.size >= limit) {
      this.options.agentBus?.revoke(id);
      throw new SessionError(
        'session-limit',
        `The limit of ${limit} simultaneous sessions was reached.`,
      );
    }

    env.AGENTS_OFFICE_TERMINAL_ID = id;
    if (start.profileId) env.AGENTS_OFFICE_PROFILE_ID = start.profileId;
    if (start.projectId) env.AGENTS_OFFICE_PROJECT_ID = start.projectId;
    env.TERM = env.TERM && env.TERM !== 'dumb' ? env.TERM : 'xterm-256color';
    const cols = start.cols ?? 80;
    const rows = start.rows ?? 24;

    let pty: PtyLike;
    try {
      pty = this.options.spawn(file, args, { cwd: start.cwd, env, cols, rows });
    } catch (error) {
      this.options.agentBus?.revoke(id);
      throw new SessionError(
        'spawn-failed',
        `Could not start "${file}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const session: Session = {
      info: {
        id,
        cwd: start.cwd,
        pid: pty.pid,
        startedAt: (this.options.now?.() ?? new Date()).toISOString(),
        cols,
        rows,
        ...(start.permissionMode ? { permissionMode: start.permissionMode } : {}),
      },
      pty,
      buffer: new RingBuffer(this.options.bufferLimits),
      exited: false,
      waiters: [],
    };
    this.sessions.set(id, session);
    pty.onData((data) => {
      session.buffer.append(data);
      for (const listener of this.dataListeners) safe(() => listener({ id, data }));
    });
    pty.onExit(({ exitCode, signal }) => {
      session.exited = true;
      if (session.killTimer) clearTimeout(session.killTimer);
      this.sessions.delete(id);
      safe(() => this.options.agentBus?.revoke(id));
      // The leader is gone: whatever is left in its group (a child ignoring SIGHUP) must not outlive
      // the session, whether the user ended it or the process exited by itself.
      safe(() => this.options.killGroup?.(session.info.pid, 'SIGKILL'));
      for (const resolve of session.waiters) resolve();
      session.waiters = [];
      const event = { id, exitCode, signal: signal ? signal : null };
      for (const listener of this.exitListeners) safe(() => listener(event));
    });
    for (const listener of this.startListeners) safe(() => listener({ ...session.info }));
    return { id };
  }

  write(id: string, data: string): void {
    const session = this.sessions.get(id);
    if (session && !session.exited) session.pty.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    const session = this.sessions.get(id);
    if (!session || session.exited) return;
    session.pty.resize(cols, rows);
    session.info.cols = cols;
    session.info.rows = rows;
  }

  /** SIGHUP first; a process that ignores it is killed with SIGKILL after the grace period. */
  kill(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (!session || session.exited) return Promise.resolve();
    if (session.killing) return session.killing;
    session.killing = new Promise<void>((resolve) => {
      session.waiters.push(resolve);
      safe(() => session.pty.kill('SIGHUP'));
      safe(() => this.options.killGroup?.(session.info.pid, 'SIGHUP'));
      session.killTimer = setTimeout(() => {
        safe(() => session.pty.kill('SIGKILL'));
        safe(() => this.options.killGroup?.(session.info.pid, 'SIGKILL'));
      }, this.options.killGraceMs ?? 5000);
    });
    return session.killing;
  }

  killAll(): Promise<void> {
    return Promise.all([...this.sessions.keys()].map((id) => this.kill(id))).then(() => undefined);
  }

  list(): TerminalSessionInfo[] {
    return [...this.sessions.values()].map((s) => ({ ...s.info }));
  }

  /** Recent output of a running session, for reconnecting a view; null when unknown. */
  getBuffer(id: string): string | null {
    return this.sessions.get(id)?.buffer.toString() ?? null;
  }

  /** Called after a session started (the app keeps a light registry of them for crash recovery). */
  onStart(listener: (info: TerminalSessionInfo) => void): () => void {
    this.startListeners.add(listener);
    return () => this.startListeners.delete(listener);
  }

  onData(listener: (event: TerminalDataEvent) => void): () => void {
    this.dataListeners.add(listener);
    return () => this.dataListeners.delete(listener);
  }

  onExit(listener: (event: TerminalExitEvent) => void): () => void {
    this.exitListeners.add(listener);
    return () => this.exitListeners.delete(listener);
  }
}

function defaultIsDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function safe(fn: () => void): void {
  try {
    fn();
  } catch {
    // A failing listener or an already dead pty must not break the others.
  }
}

/** Maps any error from `start` to the typed result the renderer gets. */
export function toStartError(error: unknown): { code: TerminalErrorCode; message: string } {
  if (error instanceof ClaudeNotFound) return { code: 'claude-not-found', message: error.message };
  if (error instanceof SessionError) return { code: error.code, message: error.message };
  return { code: 'spawn-failed', message: error instanceof Error ? error.message : String(error) };
}
