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
 * Events for actors not seen yet create placeholder agents that later events enrich, but only
 * inside a session that already exists: events of an unknown session leave the model unchanged.
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
      const session = next.sessions[event.sessionId];
      if (!session) return model;
      if (session.terminalId !== event.terminalId) {
        next.sessions[session.id] = { ...session, terminalId: event.terminalId };
      }
      return next;
    }

    case 'agent.spawned': {
      if (!next.sessions[event.sessionId]) return model;
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
      // A brand-new id may be the recreation of a sub-agent that died without SubagentStop: its
      // idle, equivalent predecessor leaves the office as if it had finished normally.
      if (!existing) {
        const predecessor = findIdlePredecessor(next, agent);
        if (predecessor) finishAgent(next, predecessor, event.ts, event);
      }
      putAgent(next, agent, event);
      return next;
    }

    case 'agent.updated': {
      const agent = ensureAgent(next, event.agentId, event.ts);
      if (!agent) return model;
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
      const agent = ensureAgent(next, event.agentId, event.ts);
      if (!agent) return model;
      finishAgent(next, agent, event.ts, event);
      return next;
    }

    case 'session.ended':
      return sessionEnded(next, event.sessionId);
  }
}

/** Marks the agent `finished` and records it in the Hall of Fame (shared by finish and replace). */
function finishAgent(model: OfficeModel, agent: Agent, ts: string, event: OfficeEvent): void {
  const { currentTool: _running, ...rest } = agent;
  const finished: Agent = { ...rest, status: 'finished', finishedTs: ts };
  putAgent(model, finished, event);
  const stored = model.agents[agent.id] ?? finished;
  const projectId = model.sessions[stored.sessionId]?.projectId;
  const projectName = projectId ? model.projects[projectId]?.name : undefined;
  const entry: HallOfFameEntry = projectName === undefined ? stored : { ...stored, projectName };
  model.hallOfFame = [...model.hallOfFame.filter((a) => a.id !== stored.id), entry].slice(
    -HALL_OF_FAME_SIZE,
  );
}

/**
 * The idle agent of the same session that `agent` equivalently replaces (same type, description
 * and parent). Working / thinking / waiting twins are never candidates.
 */
function findIdlePredecessor(model: OfficeModel, agent: Agent): Agent | undefined {
  return Object.values(model.agents).find(
    (other) =>
      other.id !== agent.id &&
      other.sessionId === agent.sessionId &&
      other.status === 'idle' &&
      other.agentType === agent.agentType &&
      other.description === agent.description &&
      other.parentAgentId === agent.parentAgentId,
  );
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
  // A project without a cwd gets its real name once a session reports it.
  model.projects[project.id] = {
    ...project,
    ...(project.cwd === '' && event.cwd !== ''
      ? { cwd: event.cwd, name: projectName(event.cwd, project.id) }
      : {}),
    sessionIds: project.sessionIds.includes(event.sessionId)
      ? project.sessionIds
      : [...project.sessionIds, event.sessionId],
  };

  const stray = foldStrayAgent(model, event.sessionId);
  if (existing && existing.projectId !== event.projectId) detachSession(model, existing);
  const base = existing ?? {
    ...placeholderSession(event.sessionId, event.projectId, event.ts),
    status: 'idle',
  };
  model.sessions[event.sessionId] = {
    ...base,
    ...stray,
    projectId: event.projectId,
  };
  touch(model, event.sessionId, event);
  return model;
}

/**
 * Reconciles what arrived before `session.started`: events addressed to the session id were
 * recorded as a placeholder agent of the only known session, and are folded back into the new one.
 */
function foldStrayAgent(model: OfficeModel, sessionId: string): Partial<Session> {
  const asAgent = model.agents[sessionId];
  if (!asAgent) return {};
  const { currentTool } = asAgent;
  const session: Partial<Session> = {
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
  return session;
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

/**
 * Applies `change` to the session or agent addressed by `actorId`, creating a placeholder agent
 * when exactly one session exists. With no owner to attach to, the event is dropped.
 */
function updateActor(
  model: OfficeModel,
  actorId: string,
  event: OfficeEvent,
  change: (actor: Common) => Common,
  lastPromptSummary?: string,
  allowSettled = false,
): OfficeModel {
  const actor = resolveActor(model, actorId, event.ts);
  if (!actor) return model;
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

function resolveActor(model: OfficeModel, actorId: string, ts: string): Actor | undefined {
  const agent = model.agents[actorId];
  if (agent) return { kind: 'agent', value: agent };
  const session = model.sessions[actorId];
  if (session) return { kind: 'session', value: session };
  const created = ensureAgent(model, actorId, ts);
  return created ? { kind: 'agent', value: created } : undefined;
}

/**
 * The agent `agentId`; an unknown one becomes a placeholder of the only existing session, since a
 * session cannot be guessed otherwise. Without exactly one session nothing is created.
 */
function ensureAgent(model: OfficeModel, agentId: string, ts: string): Agent | undefined {
  const existing = model.agents[agentId];
  if (existing) return existing;
  const sessionIds = Object.keys(model.sessions);
  const owner = sessionIds.length === 1 ? sessionIds[0] : undefined;
  const session = owner === undefined ? undefined : model.sessions[owner];
  if (!session) return undefined;
  const agent = placeholderAgent(agentId, session.id, ts);
  model.agents[agentId] = agent;
  model.sessions[session.id] = { ...session, agentIds: [...session.agentIds, agentId] };
  return agent;
}

/** Stores an agent (linking it to its session) and records the activity of `event`. */
function putAgent(model: OfficeModel, agent: Agent, event: OfficeEvent): void {
  model.agents[agent.id] = agent;
  const session = model.sessions[agent.sessionId];
  if (session && !session.agentIds.includes(agent.id)) {
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
