import type { OfficeEvent } from './events';
import type {
  ActorStatus,
  Agent,
  HallOfFameEntry,
  OfficeModel,
  Project,
  Session,
  Step,
} from './model';
import {
  DEFAULT_PROFESSIONS,
  type ProfessionsConfig,
  resolveProfession,
  SESSION_PROFESSION,
} from './professions';

export const RECENT_STEPS_LIMIT = 5;
export const HALL_OF_FAME_SIZE = 20;

/** Placeholder ids for actors whose session is not known yet (hook before JSONL). */
const UNKNOWN_PROJECT_ID = 'unknown';
const UNKNOWN_SESSION_ID = 'unknown';

export interface ReduceOptions {
  /** Loaded elsewhere (professions.json); defaults to the built-in table. */
  professions?: ProfessionsConfig;
}

/** The fields every actor event may change; `currentTool` absent means no tool running. */
type Common = Pick<Agent, 'status' | 'currentTool' | 'recentSteps' | 'usage'>;

type Actor = { kind: 'session'; value: Session } | { kind: 'agent'; value: Agent };

/**
 * Applies one event to the model. Pure and immutable: the input model is never mutated and no
 * clock is read, so the same event sequence always yields the same model (replay-safe).
 * Events for actors not seen yet create placeholders that later events enrich.
 */
export function reduce(
  model: OfficeModel,
  event: OfficeEvent,
  options: ReduceOptions = {},
): OfficeModel {
  const professions = options.professions ?? DEFAULT_PROFESSIONS;
  const next: OfficeModel = {
    projects: { ...model.projects },
    sessions: { ...model.sessions },
    agents: { ...model.agents },
    hallOfFame: model.hallOfFame,
  };

  switch (event.type) {
    case 'session.started':
      return sessionStarted(next, event);

    case 'session.bound': {
      const session = ensureSession(next, event.sessionId, event.ts);
      if (session.terminalId !== event.terminalId) {
        next.sessions[session.id] = { ...session, terminalId: event.terminalId };
      }
      return next;
    }

    case 'agent.spawned': {
      ensureSession(next, event.sessionId, event.ts);
      const existing = next.agents[event.agentId];
      const agent: Agent = {
        ...(existing ?? placeholderAgent(event.agentId, event.sessionId, event.ts)),
        sessionId: event.sessionId,
        agentType: event.agentType,
        description: event.description,
        spawnDepth: event.spawnDepth,
        profession: resolveProfession(event.agentType, professions),
        ...(event.parentAgentId !== undefined ? { parentAgentId: event.parentAgentId } : {}),
      };
      if (existing && existing.sessionId !== event.sessionId) detachAgent(next, existing);
      putAgent(next, agent, event);
      return next;
    }

    case 'agent.updated': {
      const agent = ensureAgent(next, event.agentId, undefined, event.ts);
      const agentType = event.agentType ?? agent.agentType;
      putAgent(
        next,
        {
          ...agent,
          agentType,
          description: event.description ?? agent.description,
          spawnDepth: event.spawnDepth ?? agent.spawnDepth,
          profession:
            event.agentType !== undefined
              ? resolveProfession(event.agentType, professions)
              : agent.profession,
          ...(event.parentAgentId !== undefined ? { parentAgentId: event.parentAgentId } : {}),
        },
        event,
      );
      return next;
    }

    case 'tool.started':
      return updateActor(next, event.actorId, event, (actor) => {
        const step: Step = {
          toolUseId: event.toolUseId,
          tool: event.tool,
          summary: event.summary,
          ts: event.ts,
        };
        const steps = actor.recentSteps.filter((s) => s.toolUseId !== step.toolUseId);
        return {
          ...actor,
          status: 'working',
          currentTool: event.tool,
          recentSteps: [...steps, step].slice(-RECENT_STEPS_LIMIT),
        };
      });

    case 'tool.finished':
      return updateActor(next, event.actorId, event, (actor) => {
        const { currentTool: _running, ...rest } = actor;
        return {
          ...rest,
          status: event.ok ? 'thinking' : 'error',
          recentSteps: actor.recentSteps.map((s) =>
            s.toolUseId === event.toolUseId ? { ...s, ok: event.ok } : s,
          ),
        };
      });

    case 'actor.thinking':
      return updateActor(
        next,
        event.actorId,
        event,
        (actor) => {
          const { currentTool: _running, ...rest } = actor;
          return { ...rest, status: 'thinking' };
        },
        event.lastPromptSummary,
      );

    case 'actor.waiting':
    case 'actor.idle':
      return updateActor(next, event.actorId, event, (actor) => {
        const { currentTool: _running, ...rest } = actor;
        return { ...rest, status: event.type === 'actor.waiting' ? 'waiting' : 'idle' };
      });

    case 'usage':
      return updateActor(
        next,
        event.actorId,
        event,
        (actor) => ({
          ...actor,
          usage: {
            inputTokens: actor.usage.inputTokens + event.inputTokens,
            outputTokens: actor.usage.outputTokens + event.outputTokens,
          },
        }),
        undefined,
        true,
      );

    case 'agent.finished': {
      const agent = ensureAgent(next, event.agentId, undefined, event.ts);
      const { currentTool: _running, ...rest } = agent;
      const finished: Agent = { ...rest, status: 'finished', finishedTs: event.ts };
      putAgent(next, finished, event);
      const stored = next.agents[event.agentId] ?? finished;
      const projectId = next.sessions[stored.sessionId]?.projectId;
      const projectName = projectId ? next.projects[projectId]?.name : undefined;
      const entry: HallOfFameEntry =
        projectName === undefined ? stored : { ...stored, projectName };
      next.hallOfFame = [...next.hallOfFame.filter((a) => a.id !== stored.id), entry].slice(
        -HALL_OF_FAME_SIZE,
      );
      return next;
    }

    case 'session.ended':
      return sessionEnded(next, event.sessionId);
  }
}

function sessionStarted(
  model: OfficeModel,
  event: Extract<OfficeEvent, { type: 'session.started' }>,
): OfficeModel {
  const existing = model.sessions[event.sessionId];
  const project: Project = model.projects[event.projectId] ?? {
    id: event.projectId,
    name: projectName(event.cwd, event.projectId),
    cwd: event.cwd,
    sessionIds: [],
    lastActivityTs: event.ts,
  };
  // A project created from a placeholder (or an earlier session of a cwd-less hook) gets its
  // real name once the cwd is known.
  model.projects[project.id] = {
    ...project,
    ...(project.cwd === '' && event.cwd !== ''
      ? { cwd: event.cwd, name: projectName(event.cwd, project.id) }
      : {}),
    sessionIds: project.sessionIds.includes(event.sessionId)
      ? project.sessionIds
      : [...project.sessionIds, event.sessionId],
  };

  const stray = adoptStrays(model, event.sessionId);
  if (existing && existing.projectId !== event.projectId) detachSession(model, existing);
  const base = existing ?? {
    ...placeholderSession(event.sessionId, event.projectId, event.ts),
    status: 'idle',
  };
  model.sessions[event.sessionId] = {
    ...base,
    ...stray.session,
    projectId: event.projectId,
    agentIds: [...new Set([...base.agentIds, ...stray.agentIds])],
  };
  touch(model, event.sessionId, event);
  return model;
}

/**
 * Reconciles what arrived before `session.started`: events addressed to the session id were
 * recorded as a placeholder agent (folded back into the session), and actors of unknown
 * ownership sit in the "unknown" placeholder session (moved to the real one).
 */
function adoptStrays(
  model: OfficeModel,
  sessionId: string,
): { session: Partial<Session>; agentIds: string[] } {
  let session: Partial<Session> = {};
  const agentIds: string[] = [];
  const asAgent = model.agents[sessionId];
  if (asAgent) {
    const { currentTool } = asAgent;
    session = {
      status: asAgent.status === 'spawning' ? 'thinking' : asAgent.status,
      recentSteps: asAgent.recentSteps,
      usage: asAgent.usage,
      ...(asAgent.lastActivityTs !== undefined ? { lastActivityTs: asAgent.lastActivityTs } : {}),
      ...(currentTool !== undefined ? { currentTool } : {}),
    };
    delete model.agents[sessionId];
    const owner = model.sessions[asAgent.sessionId];
    if (owner) {
      model.sessions[owner.id] = {
        ...owner,
        agentIds: owner.agentIds.filter((id) => id !== sessionId),
      };
    }
  }
  const unknown = sessionId === UNKNOWN_SESSION_ID ? undefined : model.sessions[UNKNOWN_SESSION_ID];
  if (unknown) {
    for (const id of unknown.agentIds) {
      const agent = model.agents[id];
      if (agent) model.agents[id] = { ...agent, sessionId };
      agentIds.push(id);
    }
    detachSession(model, unknown);
    delete model.sessions[UNKNOWN_SESSION_ID];
  }
  return { session, agentIds };
}

function sessionEnded(model: OfficeModel, sessionId: string): OfficeModel {
  const session = model.sessions[sessionId];
  if (!session) return model;
  for (const agent of Object.values(model.agents)) {
    if (agent.sessionId === sessionId) delete model.agents[agent.id];
  }
  delete model.sessions[sessionId];
  const project = model.projects[session.projectId];
  if (project) {
    const sessionIds = project.sessionIds.filter((id) => id !== sessionId);
    if (sessionIds.length === 0) delete model.projects[project.id];
    else model.projects[project.id] = { ...project, sessionIds };
  }
  return model;
}

/** Applies `change` to the session or agent addressed by `actorId`, creating a placeholder. */
function updateActor(
  model: OfficeModel,
  actorId: string,
  event: OfficeEvent,
  change: (actor: Common) => Common,
  lastPromptSummary?: string,
  allowSettled = false,
): OfficeModel {
  const actor = resolveActor(model, actorId, event.ts);
  // A finished agent is never resurrected by late events (only its usage still accrues).
  if (actor.kind === 'agent' && actor.value.status === 'finished' && !allowSettled) return model;
  if (actor.kind === 'session') {
    model.sessions[actorId] = {
      ...applyChange(actor.value, change),
      ...(lastPromptSummary !== undefined ? { lastPromptSummary } : {}),
    };
  } else {
    putAgent(model, applyChange(actor.value, change), event);
    return syncHallOfFame(model, actorId);
  }
  touch(model, actorId, event);
  return model;
}

function applyChange<T extends Common>(actor: T, change: (actor: Common) => Common): T {
  const { currentTool: _running, ...base } = actor;
  const { status, currentTool, recentSteps, usage } = actor;
  const changed = change({ status, currentTool, recentSteps, usage });
  if (changed.currentTool === undefined) delete changed.currentTool;
  return { ...base, ...changed } as T;
}

/** Keeps the hall-of-fame snapshot of a finished agent in step with late usage. */
function syncHallOfFame(model: OfficeModel, agentId: string): OfficeModel {
  const agent = model.agents[agentId];
  if (agent?.status === 'finished' && model.hallOfFame.some((a) => a.id === agentId)) {
    model.hallOfFame = model.hallOfFame.map((a) =>
      a.id === agentId ? { ...agent, ...(a.projectName ? { projectName: a.projectName } : {}) } : a,
    );
  }
  return model;
}

function resolveActor(model: OfficeModel, actorId: string, ts: string): Actor {
  const agent = model.agents[actorId];
  if (agent) return { kind: 'agent', value: agent };
  const session = model.sessions[actorId];
  if (session) return { kind: 'session', value: session };
  return { kind: 'agent', value: ensureAgent(model, actorId, undefined, ts) };
}

function ensureAgent(
  model: OfficeModel,
  agentId: string,
  sessionId: string | undefined,
  ts: string,
): Agent {
  const existing = model.agents[agentId];
  if (existing) return existing;
  // Unknown owner: attach to the only known session, else to the "unknown" placeholder one.
  const sessionIds = Object.keys(model.sessions);
  const owner = sessionId ?? (sessionIds.length === 1 ? sessionIds[0] : UNKNOWN_SESSION_ID);
  const resolvedOwner = owner ?? UNKNOWN_SESSION_ID;
  ensureSession(model, resolvedOwner, ts);
  const agent = placeholderAgent(agentId, resolvedOwner, ts);
  model.agents[agentId] = agent;
  const session = model.sessions[resolvedOwner];
  if (session && !session.agentIds.includes(agentId)) {
    model.sessions[resolvedOwner] = { ...session, agentIds: [...session.agentIds, agentId] };
  }
  return agent;
}

function ensureSession(model: OfficeModel, sessionId: string, ts: string): Session {
  const existing = model.sessions[sessionId];
  if (existing) return existing;
  const projectId = UNKNOWN_PROJECT_ID;
  const project: Project = model.projects[projectId] ?? {
    id: projectId,
    name: projectId,
    cwd: '',
    sessionIds: [],
    lastActivityTs: ts,
  };
  model.projects[projectId] = { ...project, sessionIds: [...project.sessionIds, sessionId] };
  const session = placeholderSession(sessionId, projectId, ts);
  model.sessions[sessionId] = session;
  return session;
}

/** Stores an agent (linking it to its session) and records the activity of `event`. */
function putAgent(model: OfficeModel, agent: Agent, event: OfficeEvent): void {
  model.agents[agent.id] = agent;
  const session = ensureSession(model, agent.sessionId, event.ts);
  if (!session.agentIds.includes(agent.id)) {
    model.sessions[session.id] = { ...session, agentIds: [...session.agentIds, agent.id] };
  }
  touch(model, agent.id, event);
}

function detachAgent(model: OfficeModel, agent: Agent): void {
  const session = model.sessions[agent.sessionId];
  if (session) {
    model.sessions[session.id] = {
      ...session,
      agentIds: session.agentIds.filter((id) => id !== agent.id),
    };
  }
}

/** Moves a placeholder session out of its previous project, dropping the project if empty. */
function detachSession(model: OfficeModel, session: Session): void {
  const project = model.projects[session.projectId];
  if (!project) return;
  const sessionIds = project.sessionIds.filter((id) => id !== session.id);
  if (sessionIds.length === 0) delete model.projects[project.id];
  else model.projects[project.id] = { ...project, sessionIds };
}

/** Records activity on the actor and its project. Clock events are not activity. */
function touch(model: OfficeModel, actorId: string, event: OfficeEvent): void {
  if (event.source === 'clock') return;
  const agent = model.agents[actorId];
  const sessionId = agent ? agent.sessionId : actorId;
  if (agent)
    model.agents[actorId] = { ...agent, lastActivityTs: later(agent.lastActivityTs, event.ts) };
  const session = model.sessions[sessionId];
  if (!session) return;
  if (!agent) {
    model.sessions[sessionId] = {
      ...session,
      lastActivityTs: later(session.lastActivityTs, event.ts),
    };
  }
  const project = model.projects[session.projectId];
  if (project) {
    model.projects[project.id] = {
      ...project,
      lastActivityTs: later(project.lastActivityTs, event.ts),
    };
  }
}

function later(current: string | undefined, ts: string): string {
  return current !== undefined && Date.parse(current) > Date.parse(ts) ? current : ts;
}

function projectName(cwd: string, fallback: string): string {
  const trimmed = cwd.replace(/\\/g, '/').replace(/\/+$/, '');
  return trimmed.slice(trimmed.lastIndexOf('/') + 1) || fallback;
}

const NO_USAGE = { inputTokens: 0, outputTokens: 0 };

function placeholderSession(id: string, projectId: string, ts: string): Session {
  const status: ActorStatus = 'thinking';
  return {
    id,
    projectId,
    profession: SESSION_PROFESSION,
    status,
    recentSteps: [],
    usage: NO_USAGE,
    agentIds: [],
    lastActivityTs: ts,
  };
}

function placeholderAgent(id: string, sessionId: string, ts: string): Agent {
  return {
    id,
    sessionId,
    agentType: '',
    description: '',
    spawnDepth: 1,
    profession: DEFAULT_PROFESSIONS.fallback,
    status: 'spawning',
    recentSteps: [],
    usage: NO_USAGE,
    startedTs: ts,
    lastActivityTs: ts,
  };
}
