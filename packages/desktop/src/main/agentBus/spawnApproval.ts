import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { SpawnApprovalRequest, SpawnApprovalResponse } from '@agents-office/shared';
import type { BusSession } from './server';
import type { SpawnDecision, SpawnRequest } from './spawnAgent';

/** How long a creation waits for the user before it is denied (fail closed). */
export const SPAWN_APPROVAL_TIMEOUT_MS = 5 * 60 * 1000;

export interface SpawnApprovalDeps {
  /** JSON file with the "allow without asking" grants. */
  path: string;
  /** Pushes the card to the window; the card is also served by `pending()` on (re)load. */
  pushRequest(request: SpawnApprovalRequest): void;
  /** Tells the window a request left the queue. */
  pushResolved(id: string): void;
  /** System notification so the user notices the card (click should show the window). */
  notify(request: SpawnApprovalRequest): void;
  dismissNotice(id: string): void;
  newId?: () => string;
  now?: () => Date;
  timeoutMs?: number;
}

interface Waiting {
  request: SpawnApprovalRequest;
  resolve(decision: SpawnDecision): void;
  timer: ReturnType<typeof setTimeout>;
}

const grantKey = (cwd: string, orchestratorId: string): string =>
  JSON.stringify([cwd, orchestratorId]);

/**
 * Approval flow of `spawn_agent`: a creation by an orchestrator waits for the user's card unless
 * that orchestrator+project pair was granted "allow without asking". Anything that is not an
 * explicit approval (denial, timeout, shutdown) denies.
 */
export class SpawnApprovals {
  private readonly grants: Set<string>;
  private readonly waiting = new Map<string, Waiting>();
  private counter = 0;

  constructor(private readonly deps: SpawnApprovalDeps) {
    this.grants = SpawnApprovals.load(deps.path);
  }

  private static load(path: string): Set<string> {
    try {
      const raw = JSON.parse(readFileSync(path, 'utf8')) as { allowed?: unknown };
      if (!Array.isArray(raw.allowed)) return new Set();
      const keys = raw.allowed.flatMap((item) => {
        const pair = item as { cwd?: unknown; orchestratorId?: unknown };
        return typeof pair?.cwd === 'string' && typeof pair?.orchestratorId === 'string'
          ? [grantKey(pair.cwd, pair.orchestratorId)]
          : [];
      });
      return new Set(keys);
    } catch {
      return new Set(); // missing or corrupt: ask again
    }
  }

  private save(): void {
    const allowed = [...this.grants].map((key) => {
      const [cwd, orchestratorId] = JSON.parse(key) as [string, string];
      return { cwd, orchestratorId };
    });
    try {
      mkdirSync(dirname(this.deps.path), { recursive: true });
      const tmp = `${this.deps.path}.tmp`;
      writeFileSync(tmp, `${JSON.stringify({ allowed }, null, 2)}\n`);
      renameSync(tmp, this.deps.path);
    } catch {
      // The grant still holds until the app closes; the next run just asks again.
    }
  }

  /** Whether creations by this orchestrator in this project skip the card. */
  isAllowed(cwd: string, orchestratorId: string): boolean {
    return this.grants.has(grantKey(cwd, orchestratorId));
  }

  /** Withdraws the grant, so the next creation asks again. */
  revoke(cwd: string, orchestratorId: string): void {
    if (this.grants.delete(grantKey(cwd, orchestratorId))) this.save();
  }

  pending(): SpawnApprovalRequest[] {
    return [...this.waiting.values()].map((w) => ({ ...w.request }));
  }

  /** The `approve` hook of `SpawnAgents`. */
  approve = async (ctx: {
    session: BusSession;
    orchestratorName: string;
    request: SpawnRequest;
  }): Promise<SpawnDecision> => {
    const orchestratorId = ctx.session.entryId;
    if (!orchestratorId) return { approved: false, reason: 'Unknown orchestrator.' };
    if (this.isAllowed(ctx.session.cwd, orchestratorId)) return { approved: true };
    const id = this.deps.newId?.() ?? `spawn-${Date.now().toString(36)}-${++this.counter}`;
    const request: SpawnApprovalRequest = {
      id,
      cwd: ctx.session.cwd,
      orchestratorId,
      orchestratorName: ctx.orchestratorName,
      name: ctx.request.name,
      profession: ctx.request.profession,
      instructions: ctx.request.instructions,
      ...(ctx.request.task ? { task: ctx.request.task } : {}),
      createdAt: (this.deps.now?.() ?? new Date()).toISOString(),
    };
    return new Promise<SpawnDecision>((resolve) => {
      const timer = setTimeout(
        () => this.settle(id, { approved: false, reason: 'The user did not answer in time.' }),
        this.deps.timeoutMs ?? SPAWN_APPROVAL_TIMEOUT_MS,
      );
      timer.unref?.();
      this.waiting.set(id, { request, resolve, timer });
      try {
        this.deps.pushRequest({ ...request });
        this.deps.notify({ ...request });
      } catch {
        // The card is also served by pending(); a failing push must not leave the call hanging.
      }
    });
  };

  /** Applies the user's answer; false when the request is not pending anymore. */
  respond(response: SpawnApprovalResponse): boolean {
    const waiting = this.waiting.get(response.id);
    if (!waiting) return false;
    if (!response.approved) {
      this.settle(response.id, { approved: false });
      return true;
    }
    if (response.allowAlways) {
      this.grants.add(grantKey(waiting.request.cwd, waiting.request.orchestratorId));
      this.save();
    }
    const edited =
      response.instructions && response.instructions !== waiting.request.instructions
        ? { instructions: response.instructions }
        : undefined;
    this.settle(response.id, { approved: true, ...(edited ? { request: edited } : {}) });
    return true;
  }

  /** Denies everything still waiting (app shutdown). */
  denyAll(reason: string): void {
    for (const id of [...this.waiting.keys()]) this.settle(id, { approved: false, reason });
  }

  private settle(id: string, decision: SpawnDecision): void {
    const waiting = this.waiting.get(id);
    if (!waiting) return;
    this.waiting.delete(id);
    clearTimeout(waiting.timer);
    this.deps.dismissNotice(id);
    try {
      this.deps.pushResolved(id);
    } catch {
      // window gone
    }
    waiting.resolve(decision);
  }
}
