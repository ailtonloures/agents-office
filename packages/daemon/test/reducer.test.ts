import {
  createEmptyModel,
  type OfficeEvent,
  type OfficeModel,
  OfficeModelSchema,
} from '@agents-office/shared';
import { describe, expect, it } from 'vitest';
import { createProfessionsConfig, reduce } from '../src/model';
import { normalizeFixture } from './helpers/fixtures';

const T0 = '2026-10-10T12:00:00.000Z';
const at = (seconds: number) => new Date(Date.parse(T0) + seconds * 1000).toISOString();

function apply(events: OfficeEvent[], from: OfficeModel = createEmptyModel()): OfficeModel {
  return events.reduce((model, event) => reduce(model, event), from);
}

function fixtureModel(name: string, drop: (e: OfficeEvent) => boolean = () => false): OfficeModel {
  return apply(normalizeFixture(name).filter((e) => !drop(e)));
}

const started: OfficeEvent = {
  type: 'session.started',
  sessionId: 's1',
  projectId: '-home-u-my-app',
  cwd: '/home/u/my-app',
  ts: T0,
  source: 'hook',
};

const spawned = (agentId: string, agentType = 'Explore', ts = at(1)): OfficeEvent => ({
  type: 'agent.spawned',
  agentId,
  sessionId: 's1',
  agentType,
  description: `desc ${agentId}`,
  spawnDepth: 1,
  ts,
  source: 'jsonl',
});

const toolStarted = (actorId: string, n: number, tool = 'Edit', summary = 'Edit src/app.ts') =>
  ({
    type: 'tool.started',
    actorId,
    toolUseId: `tu${n}`,
    tool,
    summary,
    ts: at(10 + n),
    source: 'jsonl',
  }) satisfies OfficeEvent;

describe('reducer: terminal binding', () => {
  const bound: OfficeEvent = {
    type: 'session.bound',
    sessionId: 's1',
    terminalId: 'term-1',
    ts: at(1),
    source: 'hook',
  };

  it('sets terminalId on the session', () => {
    const model = apply([started, bound]);
    expect(model.sessions.s1?.terminalId).toBe('term-1');
    expect(OfficeModelSchema.safeParse(model).success).toBe(true);
  });

  it('binding before session.started survives the start', () => {
    const model = apply([bound, started]);
    expect(model.sessions.s1?.terminalId).toBe('term-1');
    expect(model.sessions.s1?.projectId).toBe('-home-u-my-app');
  });

  it('sessions without a binding have no terminalId', () => {
    expect(apply([started]).sessions.s1?.terminalId).toBeUndefined();
  });

  it('later events keep the binding', () => {
    const model = apply([started, bound, spawned('a1'), toolStarted('s1', 1)]);
    expect(model.sessions.s1?.terminalId).toBe('term-1');
  });
});

describe('reducer: fixtures', () => {
  it('parallel-subagents: three agents under one session', () => {
    const model = fixtureModel('parallel-subagents');
    expect(OfficeModelSchema.safeParse(model).success).toBe(true);
    const [session] = Object.values(model.sessions);
    expect(Object.keys(model.projects)).toHaveLength(1);
    expect(Object.values(model.projects)[0]?.name).toBe('demo-app');
    expect(Object.values(model.projects)[0]?.sessionIds).toEqual([session?.id]);
    expect(session?.profession).toBe('tech-lead');
    expect(session?.agentIds).toHaveLength(3);
    expect(Object.keys(model.agents)).toHaveLength(3);
    const agents = session?.agentIds.map((id) => model.agents[id]) ?? [];
    expect(agents.every((a) => a?.sessionId === session?.id)).toBe(true);
    expect(agents.map((a) => a?.status)).toEqual(['finished', 'finished', 'finished']);
    expect(model.hallOfFame.map((a) => a.id)).toEqual([
      'a2f0000000000000b',
      'a1f0000000000000a',
      'a3f0000000000000c',
    ]);
    expect(
      agents.every((a) => (a?.usage.inputTokens ?? 0) + (a?.usage.outputTokens ?? 0) > 0),
    ).toBe(true);
    expect(agents.every((a) => (a?.recentSteps.length ?? 0) <= 5)).toBe(true);
  });

  it('nested-subagent: links the child to its parent agent', () => {
    const model = fixtureModel('nested-subagent');
    const parent = model.agents.a4f0000000000000d;
    const child = model.agents.a5f0000000000000e;
    expect(Object.keys(model.agents)).toHaveLength(2);
    expect(child?.parentAgentId).toBe(parent?.id);
    expect(child?.spawnDepth).toBe(2);
    expect(parent?.status).toBe('finished');
    expect(child?.status).toBe('finished');
    expect(Object.values(model.sessions)[0]?.agentIds).toEqual([parent?.id, child?.id]);
  });

  it('tool-error: records the failed step and ends thinking', () => {
    const model = fixtureModel('tool-error');
    const [session] = Object.values(model.sessions);
    expect(Object.keys(model.agents)).toHaveLength(0);
    expect(session?.recentSteps.map((s) => s.ok)).toEqual([false, true]);
    expect(session?.status).toBe('thinking');
    expect(session?.currentTool).toBeUndefined();
  });

  it('is deterministic: the same sequence twice yields deep-equal models', () => {
    for (const name of ['parallel-subagents', 'nested-subagent', 'tool-error']) {
      const events = normalizeFixture(name);
      expect(apply(events)).toEqual(apply(events));
    }
  });

  it('tolerates the hook-before-JSONL order (agent events before the spawn)', () => {
    const events = normalizeFixture('parallel-subagents');
    const reordered = [
      ...events.filter((e) => e.type !== 'session.started'),
      ...events.filter((e) => e.type === 'session.started'),
    ];
    const model = apply(reordered);
    expect(Object.keys(model.agents)).toHaveLength(3);
    expect(Object.keys(model.projects)).toEqual(['-anon-projects-demo-app']);
    expect(Object.keys(model.sessions)).toHaveLength(1);
  });
});

describe('reducer: events', () => {
  it('does not mutate its input and creates the project on demand', () => {
    const before = createEmptyModel();
    const after = reduce(before, started);
    expect(before).toEqual(createEmptyModel());
    expect(after.projects['-home-u-my-app']).toMatchObject({
      name: 'my-app',
      cwd: '/home/u/my-app',
      sessionIds: ['s1'],
      lastActivityTs: T0,
    });
    expect(after.sessions.s1?.profession).toBe('tech-lead');
  });

  it('spawns agents with status spawning and the resolved profession', () => {
    const model = apply([started, spawned('a1', 'Plan'), spawned('a2', 'code-reviewer')]);
    expect(model.agents.a1).toMatchObject({ status: 'spawning', profession: 'architect' });
    expect(model.agents.a2?.profession).toBe('qa');
    expect(model.sessions.s1?.agentIds).toEqual(['a1', 'a2']);
    expect(model.projects['-home-u-my-app']?.lastActivityTs).toBe(at(1));
  });

  it('uses the professions config passed in', () => {
    const professions = createProfessionsConfig({ exact: { Explore: 'support' } });
    const model = [started, spawned('a1')].reduce(
      (m, e) => reduce(m, e, { professions }),
      createEmptyModel(),
    );
    expect(model.agents.a1?.profession).toBe('support');
  });

  it('tool.started works, keeps the 5 latest steps; tool.finished flips the status', () => {
    let model = apply([started, spawned('a1')]);
    for (let n = 1; n <= 7; n++) model = reduce(model, toolStarted('a1', n));
    const agent = model.agents.a1;
    expect(agent?.status).toBe('working');
    expect(agent?.currentTool).toBe('Edit');
    expect(agent?.recentSteps.map((s) => s.toolUseId)).toEqual(['tu3', 'tu4', 'tu5', 'tu6', 'tu7']);
    expect(agent?.recentSteps[4]?.summary).toBe('Edit src/app.ts');

    const ok = reduce(model, {
      type: 'tool.finished',
      actorId: 'a1',
      toolUseId: 'tu7',
      ok: true,
      ts: at(30),
      source: 'jsonl',
    });
    expect(ok.agents.a1).toMatchObject({ status: 'thinking' });
    expect(ok.agents.a1?.currentTool).toBeUndefined();
    expect(ok.agents.a1?.recentSteps.at(-1)?.ok).toBe(true);

    const failed = reduce(model, {
      type: 'tool.finished',
      actorId: 'a1',
      toolUseId: 'tu7',
      ok: false,
      ts: at(30),
      source: 'jsonl',
    });
    expect(failed.agents.a1?.status).toBe('error');
  });

  it('maps waiting / idle / thinking and stores the prompt summary on sessions', () => {
    let model = apply([started, spawned('a1')]);
    const status = (type: 'actor.waiting' | 'actor.idle' | 'actor.thinking', actorId: string) => {
      model = reduce(model, { type, actorId, ts: at(20), source: 'hook' });
    };
    status('actor.waiting', 'a1');
    expect(model.agents.a1?.status).toBe('waiting');
    status('actor.idle', 'a1');
    expect(model.agents.a1?.status).toBe('idle');
    status('actor.thinking', 's1');
    expect(model.sessions.s1?.status).toBe('thinking');
    model = reduce(model, {
      type: 'actor.thinking',
      actorId: 's1',
      lastPromptSummary: 'fix the bug',
      ts: at(21),
      source: 'hook',
    });
    expect(model.sessions.s1?.lastPromptSummary).toBe('fix the bug');
  });

  it('accumulates usage', () => {
    const usage = (n: number): OfficeEvent => ({
      type: 'usage',
      actorId: 'a1',
      inputTokens: n,
      outputTokens: n * 2,
      ts: at(n),
      source: 'jsonl',
    });
    const model = apply([started, spawned('a1'), usage(1), usage(2)]);
    expect(model.agents.a1?.usage).toEqual({ inputTokens: 3, outputTokens: 6 });
  });

  it('agent.finished sets finishedTs, feeds the hall of fame (last 20) and blocks resurrection', () => {
    let model = apply([started]);
    for (let n = 0; n < 25; n++) {
      model = apply(
        [
          spawned(`a${n}`),
          { type: 'agent.finished', agentId: `a${n}`, ts: at(100 + n), source: 'jsonl' },
        ],
        model,
      );
    }
    expect(model.hallOfFame).toHaveLength(20);
    expect(model.hallOfFame[0]?.id).toBe('a5');
    expect(model.hallOfFame.at(-1)?.id).toBe('a24');
    expect(model.agents.a24).toMatchObject({ status: 'finished', finishedTs: at(124) });
    const late = reduce(model, toolStarted('a24', 1));
    expect(late.agents.a24?.status).toBe('finished');
  });

  it('session.ended removes the session, its agents, and a project left empty', () => {
    const other: OfficeEvent = { ...started, sessionId: 's2' };
    let model = apply([started, other, spawned('a1')]);
    const end = (sessionId: string): OfficeEvent => ({
      type: 'session.ended',
      sessionId,
      reason: 'hook',
      ts: at(50),
      source: 'hook',
    });
    model = reduce(model, end('s1'));
    expect(model.sessions.s1).toBeUndefined();
    expect(model.agents.a1).toBeUndefined();
    expect(model.projects['-home-u-my-app']?.sessionIds).toEqual(['s2']);
    model = reduce(model, end('s2'));
    expect(model.projects).toEqual({});
    expect(reduce(model, end('s2'))).toEqual(model);
  });

  it('creates placeholders for unknown actors and enriches them later', () => {
    let model = reduce(createEmptyModel(), toolStarted('ghost', 1));
    expect(model.agents.ghost).toMatchObject({ status: 'working', agentType: '' });
    model = apply([started, spawned('ghost', 'Plan')], model);
    expect(model.agents.ghost).toMatchObject({
      status: 'working',
      agentType: 'Plan',
      profession: 'architect',
      sessionId: 's1',
    });
    expect(model.sessions.s1?.agentIds).toEqual(['ghost']);
    expect(model.sessions.unknown).toBeUndefined();
    expect(model.projects.unknown).toBeUndefined();
  });

  it('agent.updated enriches an agent', () => {
    const model = apply([
      started,
      spawned('a1', 'general-purpose'),
      {
        type: 'agent.updated',
        agentId: 'a1',
        description: 'real description',
        spawnDepth: 2,
        parentAgentId: 'a0',
        ts: at(5),
        source: 'jsonl',
      },
    ]);
    expect(model.agents.a1).toMatchObject({
      description: 'real description',
      spawnDepth: 2,
      parentAgentId: 'a0',
      profession: 'developer',
    });
  });
});

describe('reducer: hall of fame project name', () => {
  const finished = (agentId: string): OfficeEvent => ({
    type: 'agent.finished',
    agentId,
    ts: at(20),
    source: 'jsonl',
  });

  it('records the project name on finish and keeps it after the session ends', () => {
    let model = apply([started, spawned('a1'), finished('a1')]);
    expect(model.hallOfFame[0]?.projectName).toBe('my-app');
    expect(OfficeModelSchema.safeParse(model).success).toBe(true);
    model = apply(
      [{ type: 'session.ended', sessionId: 's1', reason: 'hook', ts: at(30), source: 'hook' }],
      model,
    );
    expect(model.agents).toEqual({});
    expect(model.hallOfFame[0]?.projectName).toBe('my-app');
  });
});

describe('reducer: replacing an idle sub-agent on equivalent spawn', () => {
  const twin = (agentId: string, ts: string, sessionId = 's1'): OfficeEvent => ({
    ...spawned(agentId, 'Explore', ts),
    sessionId,
    description: 'same task',
  });
  const idle = (actorId: string, ts: string): OfficeEvent => ({
    type: 'actor.idle',
    actorId,
    ts,
    source: 'clock',
  });

  it('finishes the idle equivalent predecessor, with one hall-of-fame entry', () => {
    const model = apply([started, twin('old', at(1)), idle('old', at(5)), twin('new', at(20))]);
    expect(model.agents.old).toMatchObject({ status: 'finished', finishedTs: at(20) });
    expect(model.agents.new?.status).toBe('spawning');
    expect(model.hallOfFame.map((a) => a.id)).toEqual(['old']);
    expect(model.hallOfFame[0]?.projectName).toBe('my-app');
  });

  it('does not revive the replaced agent on late events', () => {
    const model = apply([
      started,
      twin('old', at(1)),
      idle('old', at(5)),
      twin('new', at(20)),
      toolStarted('old', 1),
    ]);
    expect(model.agents.old?.status).toBe('finished');
  });

  it('never replaces a working, thinking or waiting agent', () => {
    const working = apply([
      started,
      twin('old', at(1)),
      toolStarted('old', 1),
      twin('new', at(20)),
    ]);
    expect(working.agents.old?.status).toBe('working');
    const thinking = apply([
      started,
      twin('old', at(1)),
      { type: 'actor.thinking', actorId: 'old', ts: at(5), source: 'jsonl' },
      twin('new', at(20)),
    ]);
    expect(thinking.agents.old?.status).toBe('thinking');
    const waiting = apply([
      started,
      twin('old', at(1)),
      { type: 'actor.waiting', actorId: 'old', ts: at(5), source: 'hook' },
      twin('new', at(20)),
    ]);
    expect(waiting.agents.old?.status).toBe('waiting');
    expect(working.hallOfFame).toHaveLength(0);
  });

  it('keeps parallel twins that are both working', () => {
    const model = apply([
      started,
      twin('a', at(1)),
      toolStarted('a', 1),
      twin('b', at(2)),
      toolStarted('b', 2),
    ]);
    expect(model.agents.a?.status).toBe('working');
    expect(model.agents.b?.status).toBe('working');
  });

  it('does not cross sessions, nor replace a different type, description or parent', () => {
    const other: OfficeEvent = { ...started, sessionId: 's2' };
    const crossed = apply([
      started,
      other,
      twin('old', at(1)),
      idle('old', at(5)),
      twin('new', at(20), 's2'),
    ]);
    expect(crossed.agents.old?.status).toBe('idle');

    const base = [started, twin('old', at(1)), idle('old', at(5))];
    const differentType = apply([...base, { ...twin('new', at(20)), agentType: 'Plan' }]);
    const differentDesc = apply([...base, { ...twin('new', at(20)), description: 'other' }]);
    const differentParent = apply([...base, { ...twin('new', at(20)), parentAgentId: 'p' }]);
    for (const model of [differentType, differentDesc, differentParent]) {
      expect(model.agents.old?.status).toBe('idle');
    }
  });

  it('does not touch the parent session, and a re-spawn with the same id keeps today behavior', () => {
    const model = apply([started, twin('old', at(1)), idle('old', at(5)), twin('new', at(20))]);
    expect(model.sessions.s1?.status).not.toBe('finished');
    expect(model.sessions.s1?.agentIds).toEqual(['old', 'new']);

    const same = apply([started, twin('a', at(1)), idle('a', at(5)), twin('a', at(20))]);
    expect(same.agents.a?.status).toBe('idle');
    expect(same.hallOfFame).toHaveLength(0);
  });
});
