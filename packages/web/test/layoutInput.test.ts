import { createEmptyModel, type OfficeEvent, reduce } from '@agents-office/shared';
import { describe, expect, it } from 'vitest';
import { LayoutInputBuilder } from '../src/world/layoutInput';

const ts = '2026-01-01T00:00:00.000Z';
const source = 'jsonl' as const;

function model(...events: OfficeEvent[]) {
  return events.reduce((m, e) => reduce(m, e), createEmptyModel());
}

const started = (sessionId: string, projectId: string): OfficeEvent => ({
  type: 'session.started',
  ts,
  source,
  sessionId,
  projectId,
  cwd: `/work/${projectId}`,
});
const spawned = (sessionId: string, agentId: string): OfficeEvent => ({
  type: 'agent.spawned',
  ts,
  source,
  sessionId,
  agentId,
  agentType: 'general-purpose',
  description: 'd',
  spawnDepth: 1,
});

describe('LayoutInputBuilder', () => {
  it('describes projects, sessions and active agent counts', () => {
    const m = model(started('s1', 'p1'), spawned('s1', 'a1'), spawned('s1', 'a2'));
    const input = new LayoutInputBuilder().build(m);
    expect(input).toEqual([
      { id: 'p1', name: 'p1', firstSeen: 0, sessions: [{ id: 's1', agentCount: 2 }] },
    ]);
  });

  it('keeps first-seen ordering stable', () => {
    const builder = new LayoutInputBuilder();
    builder.build(model(started('s1', 'p1')));
    const input = builder.build(model(started('s1', 'p1'), started('s2', 'p2')));
    expect(input.find((p) => p.id === 'p1')?.firstSeen).toBe(0);
    expect(input.find((p) => p.id === 'p2')?.firstSeen).toBe(1);
  });

  it('drops an ended session unless it is retained (characters still walking out)', () => {
    const builder = new LayoutInputBuilder();
    const live = model(started('s1', 'p1'), spawned('s1', 'a1'));
    builder.build(live);
    const ended = reduce(live, {
      type: 'session.ended',
      ts,
      source,
      sessionId: 's1',
      reason: 'hook',
    });
    const ghost = builder.build(ended, new Set(['s1']));
    expect(ghost).toEqual([
      { id: 'p1', name: 'p1', firstSeen: 0, sessions: [{ id: 's1', agentCount: 1 }] },
    ]);
    // Still retained on later calls, and gone once released.
    expect(builder.build(ended, new Set(['s1']))).toHaveLength(1);
    expect(builder.build(ended, new Set())).toEqual([]);
    expect(builder.build(ended, new Set(['s1']))).toEqual([]);
  });

  it('keeps the order of the sessions of a project when one of them is a ghost', () => {
    const builder = new LayoutInputBuilder();
    const m = model(started('s1', 'p1'), started('s2', 'p1'), started('s3', 'p1'));
    builder.build(m);
    const after = reduce(m, { type: 'session.ended', ts, source, sessionId: 's2', reason: 'hook' });
    const input = builder.build(after, new Set(['s2']));
    expect(input[0]?.sessions.map((s) => s.id)).toEqual(['s1', 's2', 's3']);
  });

  describe('desk count of finished agents', () => {
    const finish = (m: ReturnType<typeof model>, agentId: string) =>
      reduce(m, { type: 'agent.finished', ts, source, sessionId: 's1', agentId } as OfficeEvent);
    const count = (input: ReturnType<LayoutInputBuilder['build']>) =>
      input[0]?.sessions[0]?.agentCount;
    const base = () => model(started('s1', 'p1'), spawned('s1', 'a1'), spawned('s1', 'a2'));

    it('does not count a finished agent that already left', () => {
      const m = finish(base(), 'a1');
      expect(m.agents.a1?.status).toBe('finished');
      expect(count(new LayoutInputBuilder().build(m))).toBe(1);
    });

    it('counts a finished agent while its character is retained', () => {
      const m = finish(base(), 'a1');
      expect(count(new LayoutInputBuilder().build(m, new Set(), new Set(['a1'])))).toBe(2);
    });

    it('keeps the last count for a ghost session', () => {
      const builder = new LayoutInputBuilder();
      const m = base();
      builder.build(m);
      const ended = reduce(m, {
        type: 'session.ended',
        ts,
        source,
        sessionId: 's1',
        reason: 'hook',
      });
      expect(count(builder.build(ended, new Set(['s1'])))).toBe(2);
    });

    it('drops the count once the retained agent is released', () => {
      const builder = new LayoutInputBuilder();
      const m = finish(base(), 'a1');
      expect(count(builder.build(m, new Set(), new Set(['a1'])))).toBe(2);
      expect(count(builder.build(m, new Set(), new Set()))).toBe(1);
    });
  });
});
