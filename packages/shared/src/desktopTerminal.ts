// Contract of the terminal bridge that the desktop shell exposes to the web app
// (`window.agentsOfficeDesktop.terminal`). Plain types: the bridge is local IPC. The terminal bytes
// never travel through the daemon.

export const TERMINAL_PERMISSION_MODES = [
  'default',
  'acceptEdits',
  'plan',
  'dontAsk',
  'auto',
  'bypassPermissions',
] as const;
export type TerminalPermissionMode = (typeof TERMINAL_PERMISSION_MODES)[number];

export interface TerminalStartOptions {
  /** Absolute directory where `claude` runs (must exist). */
  cwd: string;
  /** Claude Code session id to resume (`claude --resume <id>`). */
  resume?: string;
  /** `claude --continue`: the most recent session of the folder. Ignored when `resume` is set. */
  continueLast?: boolean;
  permissionMode?: TerminalPermissionMode;
  cols?: number;
  rows?: number;
}

export interface TerminalSessionInfo {
  id: string;
  cwd: string;
  pid: number;
  startedAt: string;
  cols: number;
  rows: number;
  permissionMode?: TerminalPermissionMode;
}

export type TerminalErrorCode =
  | 'claude-not-found'
  | 'invalid-cwd'
  | 'invalid-request'
  | 'session-limit'
  | 'spawn-failed';

export type TerminalStartResult =
  | { ok: true; id: string }
  | { ok: false; code: TerminalErrorCode; message: string };

export interface TerminalDataEvent {
  id: string;
  data: string;
}

export interface TerminalExitEvent {
  id: string;
  exitCode: number;
  signal: number | null;
}

export interface TerminalConfig {
  /** Manual path of the `claude` binary saved by the user, or null for automatic resolution. */
  claudePath: string | null;
  maxSessions: number;
}

export type TerminalConfigResult =
  | { ok: true; config: TerminalConfig }
  | { ok: false; message: string };

/** A tab that existed when the app died (crash, kill, shutdown) and lost its process. */
export interface LostTerminalSession {
  /** The terminal id the tab had. */
  id: string;
  cwd: string;
  startedAt: string;
  permissionMode?: TerminalPermissionMode;
  /** Claude Code session id when the office had bound it to the tab; otherwise `--continue` is used. */
  claudeSessionId?: string;
}

export interface TerminalBridge {
  start(options: TerminalStartOptions): Promise<TerminalStartResult>;
  write(id: string, data: string): Promise<void>;
  resize(id: string, cols: number, rows: number): Promise<void>;
  kill(id: string): Promise<void>;
  list(): Promise<TerminalSessionInfo[]>;
  /** Recent output (about the last 5,000 lines) for reconnecting a view; null when the id is unknown. */
  buffer(id: string): Promise<string | null>;
  getConfig(): Promise<TerminalConfig>;
  /** Saves the manual `claude` path (null clears it) and/or the simultaneous session limit. */
  setConfig(patch: {
    claudePath?: string | null;
    maxSessions?: number;
  }): Promise<TerminalConfigResult>;
  /** Sessions left over by an app that did not exit cleanly, still waiting to be resumed or dismissed. */
  lostSessions(): Promise<LostTerminalSession[]>;
  /** Forgets a lost session (after resuming it, or when the user declines). */
  dismissLost(id: string): Promise<void>;
  /** Tells the app which Claude Code session runs in a tab, so a later resume can use `--resume <id>`. */
  noteSession(id: string, claudeSessionId: string): Promise<void>;
  /** Returns the unsubscribe function. */
  onData(listener: (event: TerminalDataEvent) => void): () => void;
  onExit(listener: (event: TerminalExitEvent) => void): () => void;
}
