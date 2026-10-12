// Contract of the managed-sessions bridge (`window.agentsOfficeDesktop.managed`): sessions that the
// app itself starts for the roster ("elenco") entries of a project. Sessions opened outside the app
// are never listed here (they stay read-only in the office).

import type { Appearance } from './desktopProfiles';
import type { TerminalErrorCode } from './desktopTerminal';
import type { Profession } from './model';

/** A running managed session: which terminal tab runs which roster entry. */
export interface ManagedSessionInfo {
  terminalId: string;
  /** Project path. */
  cwd: string;
  /** Roster entry id (profile id or inline agent id). */
  entryId: string;
  /** Name shown on the avatar and on the tab. */
  name: string;
  /** Explicit look of the avatar; null falls back to the hash-based look. */
  appearance: Appearance | null;
  /** Visual base when there is no explicit appearance (inline agents). */
  profession: Profession | null;
  startedAt: string;
  /** Original task of an agent created by an orchestrator: shown on the tab, never re-sent. */
  task?: string;
}

/** Why an entry has no running session. */
export interface ManagedSessionFailure {
  cwd: string;
  entryId: string;
  name: string;
  code: TerminalErrorCode | 'unknown-entry';
  message: string;
}

export type ManagedStartResult =
  | { ok: true; terminalId: string; alreadyRunning: boolean }
  | { ok: false; failure: ManagedSessionFailure };

/** What the automatic reopening did when the app started. */
export interface ReopenReport {
  /** ISO time the reopening finished. */
  finishedAt: string;
  started: Array<{ cwd: string; entryId: string; terminalId: string }>;
  failed: ManagedSessionFailure[];
}

export interface ManagedChange {
  sessions: ManagedSessionInfo[];
  /** Last start error of each entry without a running session. */
  failures: ManagedSessionFailure[];
}

export interface ManagedBridge {
  /** Starts the session of a roster entry (always without `--resume`). Idempotent. */
  start(cwd: string, entryId: string): Promise<ManagedStartResult>;
  /** Ends the session of a roster entry; resolves when it is gone. */
  stop(cwd: string, entryId: string): Promise<void>;
  list(): Promise<ManagedChange>;
  /** Result of the automatic reopening at startup; null while it has not finished. */
  reopenReport(): Promise<ReopenReport | null>;
  /** Fires whenever a managed session starts, ends or fails. Returns the unsubscribe function. */
  onChange(listener: (change: ManagedChange) => void): () => void;
  /** Fires once, when the automatic reopening finishes. */
  onReopen(listener: (report: ReopenReport) => void): () => void;
}
