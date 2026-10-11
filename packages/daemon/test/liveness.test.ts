import { createEmptyModel, type OfficeEvent, type OfficeModel } from '@agents-office/shared';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LIVENESS_CONFIG, reduce, tick } from '../src/model';

const T0 = Date.parse('2026-10-10T12:00:00.000Z');
const MIN = 60_000;
const iso = (ms: number) => new Date(ms).toISOString();

function office(): OfficeModel {
  const events: OfficeEvent[] = [
    {
      type: 'session.started',
      sessionId: 's1',
      projectId: 'p1',
      cwd: '/home/u/app',
      ts: iso(T0),
      source: 'hook',
    },
    {
      type: 'agent.spawned',
      agentId: 'a1',
      sessionId: 's1',
      agentType: 'Explore',
      description: 'd',
      spawnDepth: 1,
      ts: iso(T0),
      source: 'jsonl',
    },
    { type: 'actor.thinking', actorId: 's1', ts: iso(T0), source: 'hook' },
    { type: 'actor.thinking', actorId: 'a1', ts: iso(T0), source: 'hook' },
  ];
  return events.reduce((m, e) => reduce(m, e), createEmptyModel());
}

describe('liveness', () => {
  it('has the PRD defaults', () => {
    expect(DEFAULT_LIVENESS_CONFIG).toEqual({
      idleAfterMs: 2 * MIN,
      expireAfterMs: 15 * MIN,
      initialWindowMs: 15 * MIN,
    });
  });

  it('emits nothing while activity is recent', () => {
    expect(tick(office(), T0 + MIN)).toEqual([]);
  });

  it('after 2 minutes, session and agents go idle (source clock, injected time)', () => {
    const events = tick(office(), T0 + 2 * MIN);
    expect(events).toEqual([
      { type: 'actor.idle', actorId: 's1', ts: iso(T0 + 2 * MIN), source: 'clock' },
      { type: 'actor.idle', actorId: 'a1', ts: iso(T0 + 2 * MIN), source: 'clock' },
    ]);
  });

  it('does not repeat idle for actors already idle, and clock events are not activity', () => {
    let model = office();
    for (const e of tick(model, T0 + 2 * MIN)) model = reduce(model, e);
    expect(model.sessions.s1?.status).toBe('idle');
    expect(model.agents.a1?.status).toBe('idle');
    expect(tick(model, T0 + 3 * MIN)).toEqual([]);
  });

  it('after 15 minutes the session expires and the project disappears', () => {
    let model = office();
    const events = tick(model, T0 + 15 * MIN);
    expect(events).toEqual([
      {
        type: 'session.ended',
        sessionId: 's1',
        reason: 'expired',
        ts: iso(T0 + 15 * MIN),
        source: 'clock',
      },
    ]);
    for (const e of events) model = reduce(model, e);
    expect(model).toEqual(createEmptyModel());
  });

  it('subagent activity keeps the parent session alive', () => {
    let model = office();
    model = reduce(model, {
      type: 'actor.thinking',
      actorId: 'a1',
      ts: iso(T0 + 14 * MIN),
      source: 'jsonl',
    });
    const events = tick(model, T0 + 16 * MIN);
    expect(events.map((e) => e.type)).toEqual(['actor.idle', 'actor.idle']);
  });

  it('honours a custom config', () => {
    const events = tick(office(), T0 + 10_000, { idleAfterMs: 5_000, expireAfterMs: 60_000 });
    expect(events.map((e) => e.type)).toEqual(['actor.idle', 'actor.idle']);
  });
});
