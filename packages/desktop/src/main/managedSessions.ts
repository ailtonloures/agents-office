import {
  type AgentProfile,
  type ManagedChange,
  type ManagedSessionFailure,
  type ManagedSessionInfo,
  type ManagedStartResult,
  type Profession,
  type ProjectRoster,
  type ReopenReport,
  type RosterEntry,
  rosterEntryId,
  type TerminalErrorCode,
  type TerminalExitEvent,
} from '@agents-office/shared';
import { buildSessionPrompt } from './agentBus/sessionPrompt';
import { type StartOptions, toStartError } from './sessionManager';

/** The slice of `SessionManager` this service uses (lets tests inject a fake). */
export interface ManagedSessionHost {
  start(options: StartOptions): Promise<{ id: string }>;
  kill(id: string): Promise<void>;
  onExit(listener: (event: TerminalExitEvent) => void): () => void;
}

export interface ManagedSessionsOptions {
  host: ManagedSessionHost;
  library: { get(id: string): AgentProfile | undefined };
  roster: {
    get(cwd: string): ProjectRoster;
    projectCwds(): string[];
    setReopen(cwd: string, entryId: string, reopen: boolean): void;
  };
  /** Simultaneous session limit (the same one the session manager enforces). */
  maxSessions?: () => number;
  /** Number of sessions alive right now (managed or not); used to stop reopening at the limit. */
  liveCount?: () => number;
  /** When set, an unexpected pty exit ends the session in the office right away (spec 095). */
  sessionEnd?: SessionEndDeps;
  now?: () => Date;
}

/** The synthetic `SessionEnd` the desktop posts to the daemon when a terminal dies unasked. */
export interface SyntheticSessionEnd {
  hook_event_name: 'SessionEnd';
  session_id: string;
  cwd: string;
  reason: string;
  terminalId: string;
}

/** Lets the service end a session in the office without importing `fetch` or the daemon model. */
export interface SessionEndDeps {
  /** Live Claude Code session id bound to a terminal tab, or null when none is known. */
  sessionIdOfTerminal(terminalId: string): string | null;
  /** Posts the event to the daemon hook endpoint. May reject: the service swallows it. */
  post(event: SyntheticSessionEnd): Promise<void>;
}

interface Running {
  info: ManagedSessionInfo;
}

const keyOf = (cwd: string, entryId: string): string => `${cwd}\u0000${entryId}`;

/**
 * Starts and ends the `claude` session of each roster entry, remembers which terminal runs which
 * entry, and reopens the roster when the app starts. Sessions opened any other way (the project
 * picker, a shell) are not tracked here: they stay read-only in the office. A managed session is
 * always started from scratch, never with `--resume`.
 */
export class ManagedSessions {
  private readonly running = new Map<string, Running>();
  private readonly byTerminal = new Map<string, string>();
  private readonly starting = new Map<string, Promise<ManagedStartResult>>();
  private readonly failures = new Map<string, ManagedSessionFailure>();
  private readonly listeners = new Set<(change: ManagedChange) => void>();
  private readonly reopenListeners = new Set<(report: ReopenReport) => void>();
  private report: ReopenReport | null = null;
  private readonly requestedStops = new Set<string>();
  private shuttingDown = false;

  constructor(private readonly options: ManagedSessionsOptions) {
    options.host.onExit(({ id }) => this.handleExit(id));
  }

  /** Starts the session of a roster entry; a running entry is returned as is. */
  start(cwd: string, entryId: string, firstTask?: string): Promise<ManagedStartResult> {
    const key = keyOf(cwd, entryId);
    const existing = this.running.get(key);
    if (existing) {
      return Promise.resolve({
        ok: true,
        terminalId: existing.info.terminalId,
        alreadyRunning: true,
      });
    }
    const pending = this.starting.get(key);
    if (pending) return pending;
    const promise = this.doStart(cwd, entryId, firstTask).finally(() => this.starting.delete(key));
    this.starting.set(key, promise);
    return promise;
  }

  private async doStart(
    cwd: string,
    entryId: string,
    firstTask?: string,
  ): Promise<ManagedStartResult> {
    const key = keyOf(cwd, entryId);
    const entry = this.options.roster
      .get(cwd)
      .entries.find((candidate) => rosterEntryId(candidate) === entryId);
    if (!entry) {
      return this.fail(cwd, entryId, entryId, 'unknown-entry', 'This agent is not in the roster.');
    }
    const resolved = this.resolve(entry);
    if (!resolved) {
      return this.fail(
        cwd,
        entryId,
        entryId,
        'unknown-entry',
        'The profile of this agent no longer exists in the library.',
      );
    }
    const roster = this.options.roster.get(cwd);
    const creator = entry.createdBy
      ? roster.entries.find((e) => rosterEntryId(e) === entry.createdBy)
      : undefined;
    const createdBy = creator ? this.nameOf(creator) : undefined;
    try {
      const { id } = await this.options.host.start({
        cwd,
        instructions: buildSessionPrompt({
          name: resolved.name,
          profession: resolved.profession ?? undefined,
          instructions: resolved.instructions,
          notes: entry.notes,
          ...(createdBy ? { createdBy } : {}),
          ...(firstTask ? { task: firstTask } : {}),
        }),
        ...(resolved.model ? { model: resolved.model } : {}),
        ...(resolved.permissionMode ? { permissionMode: resolved.permissionMode } : {}),
        profileId: entryId,
        projectId: cwd,
        role: resolved.role,
      });
      const info: ManagedSessionInfo = {
        terminalId: id,
        cwd,
        entryId,
        name: resolved.name,
        appearance: resolved.appearance,
        profession: resolved.profession,
        startedAt: (this.options.now?.() ?? new Date()).toISOString(),
        ...(entry.kind === 'inline' && entry.task ? { task: entry.task } : {}),
      };
      this.running.set(key, { info });
      this.byTerminal.set(id, key);
      this.options.roster.setReopen(cwd, entryId, true);
      this.failures.delete(key);
      this.emit();
      return { ok: true, terminalId: id, alreadyRunning: false };
    } catch (error) {
      const { code, message } = toStartError(error);
      return this.fail(cwd, entryId, resolved.name, code, message);
    }
  }

  private nameOf(entry: RosterEntry): string | undefined {
    return entry.kind === 'inline' ? entry.name : this.options.library.get(entry.profileId)?.name;
  }

  private resolve(entry: RosterEntry) {
    if (entry.kind === 'inline') {
      return {
        name: entry.name,
        profession: entry.profession as Profession | null,
        instructions: entry.instructions,
        appearance: null,
        model: undefined,
        permissionMode: undefined,
        role: 'padrao' as string,
      };
    }
    const profile = this.options.library.get(entry.profileId);
    if (!profile) return undefined;
    return {
      name: profile.name,
      profession: null as Profession | null,
      instructions: profile.instructions,
      appearance: profile.appearance,
      model: profile.model,
      permissionMode: profile.permissionMode,
      role: profile.role as string,
    };
  }

  private fail(
    cwd: string,
    entryId: string,
    name: string,
    code: ManagedSessionFailure['code'],
    message: string,
  ): ManagedStartResult {
    const failure: ManagedSessionFailure = { cwd, entryId, name, code, message };
    this.failures.set(keyOf(cwd, entryId), failure);
    this.emit();
    return { ok: false, failure };
  }

  /** Ends the session of a roster entry (no-op when it is not running). */
  async stop(cwd: string, entryId: string): Promise<void> {
    const key = keyOf(cwd, entryId);
    this.failures.delete(key);
    const running = this.running.get(key);
    if (!running) {
      this.emit();
      return;
    }
    this.requestedStops.add(running.info.terminalId);
    await this.options.host.kill(running.info.terminalId);
  }

  private handleExit(terminalId: string): void {
    const key = this.byTerminal.get(terminalId);
    if (key === undefined) return; // not a managed session
    this.byTerminal.delete(terminalId);
    const info = this.running.get(key)?.info;
    this.running.delete(key);
    const requested = this.requestedStops.delete(terminalId);
    if (!requested && !this.shuttingDown && info) this.endSessionInOffice(info);
    if (!this.shuttingDown) {
      // Ended on purpose (tab closed, stop, /exit): do not bring it back on the next launch.
      const [cwd = '', entryId = ''] = key.split('\u0000');
      this.options.roster.setReopen(cwd, entryId, false);
    }
    this.emit();
  }

  /**
   * The pty died without a `SessionEnd` from Claude (killed, crashed, closed): tell the daemon so
   * the character leaves now instead of after the 15 minute expiry. A session that already ended
   * (clean `/exit`) is no longer bound in the model, so nothing is posted. Never throws.
   */
  private endSessionInOffice(info: ManagedSessionInfo): void {
    const deps = this.options.sessionEnd;
    if (!deps) return;
    try {
      const sessionId = deps.sessionIdOfTerminal(info.terminalId);
      if (!sessionId) return;
      deps
        .post({
          hook_event_name: 'SessionEnd',
          session_id: sessionId,
          cwd: info.cwd,
          reason: 'terminal-exited',
          terminalId: info.terminalId,
        })
        .catch(() => {});
    } catch {
      // Network or lookup failure: the 15 minute expiry still applies.
    }
  }

  /** The app is quitting: the exits that follow keep their entries marked to reopen. */
  beginShutdown(): void {
    this.shuttingDown = true;
  }

  /** Terminal id -> managed session (null for any terminal this service did not start). */
  sessionOfTerminal(terminalId: string): ManagedSessionInfo | null {
    const key = this.byTerminal.get(terminalId);
    return key === undefined ? null : (this.running.get(key)?.info ?? null);
  }

  list(): ManagedChange {
    return {
      sessions: [...this.running.values()].map((r) => ({ ...r.info })),
      failures: [...this.failures.values()].map((f) => ({ ...f })),
    };
  }

  /**
   * Opens, in order, the entries of every project with auto-reopen on. Stops trying (and reports
   * the rest as `session-limit`) once the simultaneous session limit is reached; a failure of one
   * entry never blocks the next. Runs once, at startup.
   */
  async reopenAll(): Promise<ReopenReport> {
    const started: ReopenReport['started'] = [];
    const failed: ManagedSessionFailure[] = [];
    const limit = this.options.maxSessions?.() ?? Number.POSITIVE_INFINITY;
    let limitReached = false;
    for (const cwd of this.options.roster.projectCwds()) {
      const roster = this.options.roster.get(cwd);
      if (!roster.autoReopen) continue;
      for (const entry of roster.entries) {
        if (!entry.reopen) continue;
        const entryId = rosterEntryId(entry);
        if (!limitReached) {
          const live = this.options.liveCount?.() ?? this.running.size;
          if (live >= limit) limitReached = true;
        }
        if (limitReached) {
          failed.push(
            this.limitFailure(cwd, entryId, entry, `The limit of ${limit} sessions was reached.`),
          );
          continue;
        }
        const result = await this.start(cwd, entryId);
        if (result.ok) {
          if (!result.alreadyRunning) started.push({ cwd, entryId, terminalId: result.terminalId });
        } else {
          failed.push(result.failure);
          if (result.failure.code === 'session-limit') limitReached = true;
        }
      }
    }
    const report: ReopenReport = {
      finishedAt: (this.options.now?.() ?? new Date()).toISOString(),
      started,
      failed,
    };
    this.report = report;
    for (const listener of this.reopenListeners) safe(() => listener(report));
    return report;
  }

  private limitFailure(
    cwd: string,
    entryId: string,
    entry: RosterEntry,
    message: string,
  ): ManagedSessionFailure {
    const name =
      entry.kind === 'inline' ? entry.name : (this.options.library.get(entryId)?.name ?? entryId);
    const failure: ManagedSessionFailure = {
      cwd,
      entryId,
      name,
      code: 'session-limit' satisfies TerminalErrorCode,
      message,
    };
    this.failures.set(keyOf(cwd, entryId), failure);
    this.emit();
    return failure;
  }

  reopenReport(): ReopenReport | null {
    return this.report;
  }

  onChange(listener: (change: ManagedChange) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onReopen(listener: (report: ReopenReport) => void): () => void {
    this.reopenListeners.add(listener);
    return () => this.reopenListeners.delete(listener);
  }

  private emit(): void {
    const change = this.list();
    for (const listener of this.listeners) safe(() => listener(change));
  }
}

function safe(fn: () => void): void {
  try {
    fn();
  } catch {
    // A failing listener must not break the others.
  }
}
