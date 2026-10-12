import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  isProfileNameTaken,
  PROFILE_INSTRUCTIONS_MAX,
  type Profession,
  ProfessionSchema,
  ProfileNameSchema,
  type ProjectRoster,
  rosterEntryId,
  SPAWN_TASK_MAX,
  type SpawnAuditEvent,
} from '@agents-office/shared';
import { backupCorrupt, writeJsonAtomic } from '../profileLibrary';
import type { BusSession, BusTool, BusToolResult } from './server';

/** Role whose sessions get `spawn_agent` and `dismiss_agent`. */
export const ORCHESTRATOR_ROLE = 'orquestrador';
/** Agents created by one orchestrator that may exist at once (v1: a constant). */
export const SPAWN_LIMIT = 2;

export type SpawnErrorCode =
  | 'not-orchestrator'
  | 'invalid-arguments'
  | 'duplicate-name'
  | 'limit-reached'
  | 'denied'
  | 'session-failed'
  | 'not-found'
  | 'not-owner';

export interface SpawnRequest {
  name: string;
  profession: Profession;
  instructions: string;
  task?: string;
}

/** Decision of the user about a creation (spec 073 plugs the approval card in here). */
export type SpawnDecision =
  | { approved: true; request?: Partial<SpawnRequest> }
  | { approved: false; reason?: string };

export type { SpawnAuditEvent };

export interface SpawnAgentOptions {
  roster: {
    get(cwd: string): ProjectRoster;
    addInline(
      cwd: string,
      input: SpawnRequest & { createdBy: string | null },
    ): { roster: ProjectRoster; entryId: string };
    remove(cwd: string, entryId: string): ProjectRoster;
    connect(cwd: string, a: string, b: string): ProjectRoster;
  };
  /** Display name of every roster entry (library profiles resolved). */
  names(cwd: string): Array<{ entryId: string; name: string }>;
  sessions: {
    start(
      cwd: string,
      entryId: string,
      firstTask?: string,
    ): Promise<{ ok: true } | { ok: false; failure: { message: string } }>;
    stop(cwd: string, entryId: string): Promise<void>;
  };
  /** Asks the user before a creation; absent means every creation is allowed. */
  approve?: (ctx: {
    session: BusSession;
    orchestratorName: string;
    request: SpawnRequest;
  }) => Promise<SpawnDecision>;
  /** Where the audit log survives restarts; absent keeps it in memory only. */
  auditStorage?: SpawnAuditStorage;
  limit?: number;
  now?: () => Date;
}

/** Persistence of the audit log (spec 074). */
export interface SpawnAuditStorage {
  load(): SpawnAuditEvent[];
  save(events: readonly SpawnAuditEvent[]): void;
}

/** Audit events kept (oldest dropped first). */
export const SPAWN_AUDIT_MAX = 500;

/** Audit log in one JSON file; unreadable files are moved aside and the log starts empty. */
export function fileAuditStorage(path: string, now: () => number = Date.now): SpawnAuditStorage {
  return {
    load() {
      let text: string;
      try {
        text = readFileSync(path, 'utf8');
      } catch {
        return [];
      }
      try {
        const raw: unknown = JSON.parse(text);
        if (!Array.isArray(raw)) throw new Error('not an array');
        return raw.filter(isAuditEvent);
      } catch {
        backupCorrupt(path, now());
        return [];
      }
    },
    save(events) {
      mkdirSync(dirname(path), { recursive: true });
      writeJsonAtomic(path, events);
    },
  };
}

function isAuditEvent(value: unknown): value is SpawnAuditEvent {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    (e.type === 'criado' || e.type === 'encerrado') &&
    ['cwd', 'orchestratorId', 'agentId', 'agentName', 'at'].every((k) => typeof e[k] === 'string')
  );
}

function hasControlChars(text: string): boolean {
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

function fail(code: SpawnErrorCode, message: string, extra: object = {}): BusToolResult {
  return { text: JSON.stringify({ error: code, message, ...extra }), isError: true };
}

/** Creates and dismisses agents on behalf of orchestrator sessions. */
export class SpawnAgents {
  private readonly audit: SpawnAuditEvent[];
  private readonly listeners = new Set<(event: SpawnAuditEvent) => void>();

  constructor(private readonly options: SpawnAgentOptions) {
    this.audit = options.auditStorage?.load() ?? [];
  }

  get limit(): number {
    return this.options.limit ?? SPAWN_LIMIT;
  }

  /** Creation/dismissal log of the project (oldest first). */
  history(cwd: string): SpawnAuditEvent[] {
    return this.audit.filter((e) => e.cwd === cwd).map((e) => ({ ...e }));
  }

  onEvent(listener: (event: SpawnAuditEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Logs the removal of a created agent by the user (the Elenco panel). */
  recordRemovedByUser(cwd: string, entry: { id: string; name: string; createdBy: string | null }) {
    if (!entry.createdBy) return;
    this.record({
      type: 'encerrado',
      cwd,
      orchestratorId: entry.createdBy,
      orchestratorName: this.nameOf(cwd, entry.createdBy),
      agentId: entry.id,
      agentName: entry.name,
      by: 'usuario',
    });
  }

  private nameOf(cwd: string, entryId: string): string | undefined {
    return this.options.names(cwd).find((n) => n.entryId === entryId)?.name;
  }

  private record(event: Omit<SpawnAuditEvent, 'at'>): void {
    const full = { ...event, at: (this.options.now?.() ?? new Date()).toISOString() };
    this.audit.push(full);
    if (this.audit.length > SPAWN_AUDIT_MAX)
      this.audit.splice(0, this.audit.length - SPAWN_AUDIT_MAX);
    try {
      this.options.auditStorage?.save(this.audit);
    } catch {
      // the log is best effort: a full disk must not break the tool
    }
    for (const l of this.listeners) {
      try {
        l(full);
      } catch {
        // a failing listener must not break the tool
      }
    }
  }

  /** Entries created by the orchestrator that are still in the roster. */
  createdBy(cwd: string, orchestratorId: string) {
    return this.options.roster
      .get(cwd)
      .entries.filter((e) => e.kind === 'inline' && e.createdBy === orchestratorId);
  }

  private caller(session: BusSession): { id: string; name: string } | BusToolResult {
    if (session.role !== ORCHESTRATOR_ROLE || !session.entryId) {
      return fail('not-orchestrator', 'Only orchestrator agents can create or dismiss agents.');
    }
    const name =
      this.options.names(session.cwd).find((n) => n.entryId === session.entryId)?.name ??
      session.entryId;
    return { id: session.entryId, name };
  }

  private parse(args: Record<string, unknown>): SpawnRequest | BusToolResult {
    const name = ProfileNameSchema.safeParse(args.name);
    if (!name.success || hasControlChars(name.data)) {
      return fail('invalid-arguments', '"name" must be 1-40 characters on a single line.');
    }
    const profession = ProfessionSchema.safeParse(args.profession);
    if (!profession.success) {
      return fail(
        'invalid-arguments',
        `"profession" must be one of: ${ProfessionSchema.options.join(', ')}.`,
      );
    }
    const instructions = typeof args.instructions === 'string' ? args.instructions.trim() : '';
    if (!instructions || instructions.length > PROFILE_INSTRUCTIONS_MAX) {
      return fail(
        'invalid-arguments',
        `"instructions" must have 1-${PROFILE_INSTRUCTIONS_MAX} characters.`,
      );
    }
    let task: string | undefined;
    if (args.task !== undefined) {
      if (typeof args.task !== 'string' || args.task.length > SPAWN_TASK_MAX) {
        return fail('invalid-arguments', `"task" must be a string up to ${SPAWN_TASK_MAX} chars.`);
      }
      task = args.task.trim() || undefined;
    }
    return {
      name: name.data,
      profession: profession.data,
      instructions,
      ...(task ? { task } : {}),
    };
  }

  /** Why a creation cannot happen now (name taken, limit reached), or null. */
  private blocker(cwd: string, orchestratorId: string, name: string): BusToolResult | null {
    const mine = this.createdBy(cwd, orchestratorId);
    if (mine.length >= this.limit) {
      return fail(
        'limit-reached',
        `You already have ${mine.length} created agents (limit ${this.limit}). Dismiss one with dismiss_agent first.`,
        {
          limit: this.limit,
          active: mine.map((e) => (e.kind === 'inline' ? e.name : rosterEntryId(e))),
        },
      );
    }
    const taken = isProfileNameTaken(
      name,
      this.options.names(cwd).map((n) => n.name),
    );
    if (taken) return fail('duplicate-name', `An agent named "${name}" already exists here.`);
    return null;
  }

  async spawn(session: BusSession, args: Record<string, unknown>): Promise<BusToolResult> {
    const me = this.caller(session);
    if ('text' in me) return me;
    const parsed = this.parse(args);
    if ('text' in parsed) return parsed;
    let request: SpawnRequest = parsed;
    const early = this.blocker(session.cwd, me.id, request.name);
    if (early) return early;

    if (this.options.approve) {
      const decision = await this.options.approve({
        session,
        orchestratorName: me.name,
        request,
      });
      if (!decision.approved) {
        return fail('denied', decision.reason ?? 'The user denied the creation of this agent.');
      }
      if (decision.request) {
        const edited = this.parse({ ...request, ...decision.request });
        if ('text' in edited) return edited;
        request = edited;
      }
    }
    // Check and add run without awaiting in between, so parallel calls cannot pass the limit.
    const late = this.blocker(session.cwd, me.id, request.name);
    if (late) return late;
    const { entryId } = this.options.roster.addInline(session.cwd, {
      ...request,
      createdBy: me.id,
    });
    try {
      this.options.roster.connect(session.cwd, me.id, entryId);
    } catch (error) {
      this.options.roster.remove(session.cwd, entryId);
      return fail('session-failed', error instanceof Error ? error.message : String(error));
    }
    const started = await this.options.sessions.start(session.cwd, entryId, request.task);
    if (!started.ok) {
      this.options.roster.remove(session.cwd, entryId);
      return fail('session-failed', started.failure.message);
    }
    this.record({
      type: 'criado',
      cwd: session.cwd,
      orchestratorId: me.id,
      orchestratorName: me.name,
      agentId: entryId,
      agentName: request.name,
    });
    return {
      text: JSON.stringify({
        ok: true,
        name: request.name,
        connected: true,
        note: 'The agent is running and connected to you. Use send_message to talk to it.',
      }),
    };
  }

  async dismiss(session: BusSession, args: Record<string, unknown>): Promise<BusToolResult> {
    const me = this.caller(session);
    if ('text' in me) return me;
    const name = typeof args.name === 'string' ? args.name.trim().toLowerCase() : '';
    if (!name) return fail('invalid-arguments', '"name" must be a non-empty string.');
    const entry = this.options.roster.get(session.cwd).entries.find(
      (e) =>
        this.options
          .names(session.cwd)
          .find((n) => n.entryId === rosterEntryId(e))
          ?.name.trim()
          .toLowerCase() === name,
    );
    if (!entry) return fail('not-found', `No agent named "${args.name}" in this project.`);
    if (entry.kind !== 'inline' || entry.createdBy !== me.id) {
      return fail('not-owner', 'You can only dismiss agents that you created.');
    }
    const agentId = rosterEntryId(entry);
    await this.options.sessions.stop(session.cwd, agentId);
    this.options.roster.remove(session.cwd, agentId);
    this.record({
      type: 'encerrado',
      cwd: session.cwd,
      orchestratorId: me.id,
      orchestratorName: me.name,
      agentId,
      agentName: entry.name,
    });
    return { text: JSON.stringify({ ok: true, dismissed: entry.name }) };
  }
}

/** `spawn_agent` and `dismiss_agent`, exposed to orchestrator sessions only. */
export function spawnTools(spawn: SpawnAgents): BusTool[] {
  return [
    {
      name: 'spawn_agent',
      roles: [ORCHESTRATOR_ROLE],
      description: `Creates a new agent for this project with custom instructions, already connected to you, with its own terminal. You can have at most ${SPAWN_LIMIT} created agents at once. The user may be asked to approve.`,
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Unique display name (max 40 characters).' },
          profession: {
            type: 'string',
            enum: [...ProfessionSchema.options],
            description: 'Visual base of the avatar.',
          },
          instructions: { type: 'string', description: 'System instructions of the new agent.' },
          task: {
            type: 'string',
            description: 'Optional first task; given only when the agent is created.',
          },
        },
        required: ['name', 'profession', 'instructions'],
      },
      handler: (session, args) => spawn.spawn(session, args),
    },
    {
      name: 'dismiss_agent',
      roles: [ORCHESTRATOR_ROLE],
      description:
        'Ends the session of an agent you created and removes it from the project, freeing a slot.',
      inputSchema: {
        type: 'object',
        properties: { name: { type: 'string', description: 'Name of the agent to dismiss.' } },
        required: ['name'],
      },
      handler: (session, args) => spawn.dismiss(session, args),
    },
  ];
}
