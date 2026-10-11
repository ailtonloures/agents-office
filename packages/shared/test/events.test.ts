import { describe, expect, it } from 'vitest';
import { OFFICE_EVENT_TYPES, type OfficeEvent, OfficeEventSchema, parseOfficeEvent } from '../src';

const ts = '2026-10-10T12:00:00.000Z';

const validEvents: Record<OfficeEvent['type'], Record<string, unknown>> = {
  'session.started': {
    type: 'session.started',
    sessionId: 's1',
    projectId: '-home-user-proj',
    cwd: '/home/user/proj',
    ts,
    source: 'jsonl',
  },
  'session.bound': {
    type: 'session.bound',
    sessionId: 's1',
    terminalId: 'term-1',
    ts,
    source: 'hook',
  },
  'agent.spawned': {
    type: 'agent.spawned',
    agentId: 'a1',
    sessionId: 's1',
    parentAgentId: 'a0',
    agentType: 'Explore',
    description: 'Find the config loader',
    spawnDepth: 2,
    ts,
    source: 'hook',
  },
  'agent.updated': {
    type: 'agent.updated',
    agentId: 'a1',
    description: 'Find the config loader',
    spawnDepth: 2,
    ts,
    source: 'jsonl',
  },
  'tool.started': {
    type: 'tool.started',
    actorId: 'a1',
    toolUseId: 'toolu_1',
    tool: 'Edit',
    summary: 'src/app.ts',
    ts,
    source: 'jsonl',
  },
  'tool.finished': {
    type: 'tool.finished',
    actorId: 'a1',
    toolUseId: 'toolu_1',
    ok: false,
    ts,
    source: 'hook',
  },
  'actor.thinking': {
    type: 'actor.thinking',
    actorId: 's1',
    lastPromptSummary: 'fix the tests',
    ts,
    source: 'hook',
  },
  'actor.waiting': { type: 'actor.waiting', actorId: 's1', ts, source: 'hook' },
  'actor.idle': { type: 'actor.idle', actorId: 's1', ts, source: 'clock' },
  'agent.finished': { type: 'agent.finished', agentId: 'a1', ts, source: 'jsonl' },
  'session.ended': {
    type: 'session.ended',
    sessionId: 's1',
    reason: 'expired',
    ts,
    source: 'clock',
  },
  usage: {
    type: 'usage',
    actorId: 'a1',
    inputTokens: 1200,
    outputTokens: 340,
    ts,
    source: 'jsonl',
  },
};

describe('OfficeEventSchema', () => {
  it('covers every event type', () => {
    expect(Object.keys(validEvents).sort()).toEqual([...OFFICE_EVENT_TYPES].sort());
  });

  it.each(OFFICE_EVENT_TYPES)('parses a valid %s event', (type) => {
    const input = validEvents[type];
    const result = parseOfficeEvent(input);
    expect(result.success).toBe(true);
    expect(result.data).toEqual(input);
    expect(result.data?.type).toBe(type);
  });

  it.each(OFFICE_EVENT_TYPES)('rejects a %s event without ts', (type) => {
    const { ts: _omitted, ...withoutTs } = validEvents[type];
    expect(parseOfficeEvent(withoutTs).success).toBe(false);
  });

  it('rejects a ts that is not an ISO timestamp', () => {
    const result = parseOfficeEvent({ ...validEvents['actor.idle'], ts: 'yesterday' });
    expect(result.success).toBe(false);
  });

  it('accepts ISO timestamps with a timezone offset', () => {
    const result = parseOfficeEvent({
      ...validEvents['actor.idle'],
      ts: '2026-10-10T09:00:00-03:00',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown source', () => {
    const result = parseOfficeEvent({ ...validEvents['actor.idle'], source: 'telepathy' });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown event type', () => {
    const result = parseOfficeEvent({
      type: 'agent.teleported',
      agentId: 'a1',
      ts,
      source: 'jsonl',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an event missing a required field of its variant', () => {
    const { toolUseId: _omitted, ...withoutToolUseId } = validEvents['tool.started'];
    expect(parseOfficeEvent(withoutToolUseId).success).toBe(false);
  });

  it('rejects an invalid session.ended reason', () => {
    const result = parseOfficeEvent({ ...validEvents['session.ended'], reason: 'crashed' });
    expect(result.success).toBe(false);
  });

  it('makes parentAgentId optional on agent.spawned', () => {
    const { parentAgentId: _omitted, ...topLevel } = validEvents['agent.spawned'];
    expect(parseOfficeEvent(topLevel).success).toBe(true);
  });

  it('tolerates and preserves unknown fields (passthrough)', () => {
    const input = { ...validEvents['tool.started'], futureField: { nested: true }, extra: 42 };
    const parsed = OfficeEventSchema.parse(input);
    expect(parsed).toMatchObject({ futureField: { nested: true }, extra: 42 });
  });

  it('never throws on garbage input', () => {
    for (const garbage of [null, undefined, 42, 'event', [], {}]) {
      expect(parseOfficeEvent(garbage).success).toBe(false);
    }
  });
});
