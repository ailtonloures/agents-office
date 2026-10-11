import { describe, expect, it } from 'vitest';
import {
  type ActorStatus,
  type Agent,
  createEmptyModel,
  isLive,
  liveActors,
  OfficeModelSchema,
  ProfessionSchema,
  type Session,
} from '../src';

describe('isLive', () => {
  it('is true for working, waiting and idle actors', () => {
    for (const status of ['working', 'waiting', 'idle']) expect(isLive({ status })).toBe(true);
  });

  it('is false for finished and ended actors', () => {
    for (const status of ['finished', 'ended']) expect(isLive({ status })).toBe(false);
  });
});

describe('model', () => {
  it('creates an empty model that satisfies the schema', () => {
    const model = createEmptyModel();
    expect(model.hallOfFame).toEqual([]);
    expect(OfficeModelSchema.safeParse(model).success).toBe(true);
  });

  it('knows the tech-lead and developer professions', () => {
    expect(ProfessionSchema.options).toEqual([
      'tech-lead',
      'analyst',
      'architect',
      'developer',
      'qa',
      'support',
    ]);
  });
});

describe('liveActors', () => {
  const usage = { inputTokens: 0, outputTokens: 0 };
  const ts = '2026-10-10T12:00:00.000Z';
  const session = (id: string, projectId: string, status: ActorStatus = 'working') =>
    ({
      id,
      projectId,
      profession: 'tech-lead',
      status,
      recentSteps: [],
      usage,
      agentIds: [],
    }) satisfies Session;
  const agent = (id: string, sessionId: string, status: ActorStatus = 'working') =>
    ({
      id,
      sessionId,
      agentType: 'Explore',
      description: '',
      spawnDepth: 1,
      profession: 'analyst',
      status,
      recentSteps: [],
      usage,
      startedTs: ts,
    }) satisfies Agent;

  it('counts only live sessions of projects with a cwd, and the live agents of those', () => {
    const model = createEmptyModel();
    model.projects.real = {
      id: 'real',
      name: 'real',
      cwd: '/real',
      sessionIds: ['s1'],
      lastActivityTs: ts,
    };
    model.projects.empty = {
      id: 'empty',
      name: 'empty',
      cwd: '',
      sessionIds: ['s2'],
      lastActivityTs: ts,
    };
    model.sessions.s1 = session('s1', 'real');
    model.sessions.s2 = session('s2', 'empty');
    model.sessions.s3 = session('s3', 'gone');
    model.sessions.s4 = session('s4', 'real', 'ended');
    model.agents.a1 = agent('a1', 's1');
    model.agents.a2 = agent('a2', 's1', 'finished');
    model.agents.a3 = agent('a3', 's2');
    model.agents.a4 = agent('a4', 's3');
    const live = liveActors(model);
    expect(live.sessions.map((s) => s.id)).toEqual(['s1']);
    expect(live.agents.map((a) => a.id)).toEqual(['a1']);
  });
});
