import type { ActorStatus, OfficeEvent, OfficeModel } from '@agents-office/shared';

export interface LivenessConfig {
  /** Silence after which an actor becomes idle (default 2 min). */
  idleAfterMs: number;
  /** Silence after which a session expires (default 15 min). */
  expireAfterMs: number;
  /** Window of past activity the watcher loads on startup (default 15 min; used by spec 004). */
  initialWindowMs: number;
}

export const DEFAULT_LIVENESS_CONFIG: LivenessConfig = {
  idleAfterMs: 120_000,
  expireAfterMs: 900_000,
  initialWindowMs: 900_000,
};

/** Statuses that never turn idle again. */
const SETTLED: ReadonlySet<ActorStatus> = new Set(['idle', 'finished', 'ended']);

/**
 * Derives the time-based events for `now` (epoch ms, injected: this module never reads the
 * clock). Sessions silent for `expireAfterMs` end with `reason: 'expired'`; other actors silent
 * for `idleAfterMs` go idle. A session's silence also counts the activity of its subagents.
 */
export function tick(
  model: OfficeModel,
  now: number,
  config: Partial<LivenessConfig> = {},
): OfficeEvent[] {
  const { idleAfterMs, expireAfterMs } = { ...DEFAULT_LIVENESS_CONFIG, ...config };
  const ts = new Date(now).toISOString();
  const events: OfficeEvent[] = [];

  for (const session of Object.values(model.sessions)) {
    const agents = session.agentIds.flatMap((id) => model.agents[id] ?? []);
    const sessionLast = lastActivity(session.lastActivityTs);
    const lastOfAll = Math.max(sessionLast, ...agents.map((a) => lastActivity(a.lastActivityTs)));

    if (now - lastOfAll >= expireAfterMs) {
      events.push({
        type: 'session.ended',
        sessionId: session.id,
        reason: 'expired',
        ts,
        source: 'clock',
      });
      continue;
    }
    if (!SETTLED.has(session.status) && now - lastOfAll >= idleAfterMs) {
      events.push({ type: 'actor.idle', actorId: session.id, ts, source: 'clock' });
    }
    for (const agent of agents) {
      if (SETTLED.has(agent.status)) continue;
      if (now - lastActivity(agent.lastActivityTs) >= idleAfterMs) {
        events.push({ type: 'actor.idle', actorId: agent.id, ts, source: 'clock' });
      }
    }
  }
  return events;
}

function lastActivity(ts: string | undefined): number {
  return ts === undefined ? Number.NEGATIVE_INFINITY : Date.parse(ts);
}
