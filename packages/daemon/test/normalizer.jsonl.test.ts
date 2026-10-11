import { type OfficeEvent, type OfficeEventOf, parseOfficeEvent } from '@agents-office/shared';
import { describe, expect, it } from 'vitest';
import { createNormalizer } from '../src/normalizer';
import { loadFixture, normalizeFixture } from './helpers/fixtures';

function ofType<T extends OfficeEvent['type']>(events: OfficeEvent[], type: T): OfficeEventOf<T>[] {
  return events.filter((event): event is OfficeEventOf<T> => event.type === type);
}

/** Compact one-line view of an event, used for the reviewed snapshots. */
function describeEvent(event: OfficeEvent): string {
  const { type, ts, source, ...rest } = event;
  const fields = Object.entries(rest)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(' ');
  return `${ts} ${source} ${type} ${fields}`;
}

const FIXTURES = ['parallel-subagents', 'nested-subagent', 'tool-error'] as const;

describe('normalizer: JSONL fixtures', () => {
  it.each(FIXTURES)('%s produces the reviewed event sequence', (name) => {
    const events = normalizeFixture(name);
    expect(events.map(describeEvent)).toMatchSnapshot();
  });

  it.each(FIXTURES)('%s only emits events valid against the shared contract', (name) => {
    for (const event of normalizeFixture(name)) {
      expect(parseOfficeEvent(event).success, describeEvent(event)).toBe(true);
    }
  });

  it.each(FIXTURES)('%s skips nothing and stays stable on a full re-read', (name) => {
    const { inputs } = loadFixture(name);
    const normalizer = createNormalizer();
    const first = inputs.flatMap((input) => normalizer.ingest(input));
    const second = inputs.flatMap((input) => normalizer.ingest(input));
    expect(first.length).toBeGreaterThan(0);
    expect(second).toEqual([]);
    expect(normalizer.stats.skipped).toBe(0);
  });

  it.each(FIXTURES)('%s keeps event timestamps from the source lines', (name) => {
    const events = normalizeFixture(name);
    const day = name === 'parallel-subagents' ? '14' : name === 'nested-subagent' ? '15' : '16';
    for (const event of events) expect(event.ts.startsWith(`2026-10-10T${day}:00:`)).toBe(true);
  });

  describe('parallel-subagents', () => {
    const { info } = loadFixture('parallel-subagents');
    const events = normalizeFixture('parallel-subagents');

    it('starts the session from its first line with a cwd', () => {
      const [first] = events;
      expect(first).toEqual({
        type: 'session.started',
        sessionId: info.sessionId,
        projectId: '-anon-projects-demo-app',
        cwd: '/anon/projects/demo-app',
        ts: '2026-10-10T14:00:00.000Z',
        source: 'jsonl',
      });
      expect(ofType(events, 'session.started')).toHaveLength(1);
    });

    it('spawns the 3 agents linked to the lead through the Agent tool_use', () => {
      const spawned = ofType(events, 'agent.spawned');
      expect(spawned.map((event) => [event.agentId, event.agentType, event.description])).toEqual([
        ['a1f0000000000000a', 'Explore', 'Map the auth module'],
        ['a2f0000000000000b', 'Explore', 'Map the billing module'],
        ['a3f0000000000000c', 'general-purpose', 'Map the search module'],
      ]);
      for (const event of spawned) {
        expect(event.sessionId).toBe(info.sessionId);
        expect(event.spawnDepth).toBe(1);
        expect(event.parentAgentId).toBeUndefined();
      }
      const agentTools = ofType(events, 'tool.started').filter((event) => event.tool === 'Agent');
      expect(agentTools.map((event) => event.actorId)).toEqual([
        info.sessionId,
        info.sessionId,
        info.sessionId,
      ]);
    });

    it('infers agent.finished from the tool_result of each Agent tool_use, in completion order', () => {
      expect(ofType(events, 'agent.finished')).toEqual([
        {
          type: 'agent.finished',
          agentId: 'a2f0000000000000b',
          ts: '2026-10-10T14:00:26.000Z',
          source: 'jsonl',
        },
        {
          type: 'agent.finished',
          agentId: 'a1f0000000000000a',
          ts: '2026-10-10T14:00:31.000Z',
          source: 'jsonl',
        },
        {
          type: 'agent.finished',
          agentId: 'a3f0000000000000c',
          ts: '2026-10-10T14:00:40.000Z',
          source: 'jsonl',
        },
      ]);
    });

    it('attributes subagent tool calls to the agent with short summaries', () => {
      const agentTools = ofType(events, 'tool.started').filter((event) => event.tool !== 'Agent');
      expect(agentTools.map((event) => [event.actorId, event.tool, event.summary])).toEqual([
        ['a1f0000000000000a', 'Grep', 'createSession in src/auth'],
        ['a2f0000000000000b', 'Glob', 'src/billing/**/*.test.ts'],
        ['a3f0000000000000c', 'Bash', 'ls src/search'],
        ['a1f0000000000000a', 'Read', 'src/auth/session.ts'],
        ['a2f0000000000000b', 'Read', 'src/billing/invoice.ts'],
        ['a3f0000000000000c', 'Read', 'src/search/index.ts'],
      ]);
      const finished = ofType(events, 'tool.finished');
      expect(finished.every((event) => event.ok)).toBe(true);
      expect(finished).toHaveLength(ofType(events, 'tool.started').length);
    });

    it('reports usage once per API message, as increments', () => {
      const lead = ofType(events, 'usage').filter((event) => event.actorId === info.sessionId);
      // msg 1 spans 4 lines (thinking + 3 tool_use): input once, output grows 12 -> 420.
      expect(lead.map((event) => [event.inputTokens, event.outputTokens])).toEqual([
        [16203, 12],
        [0, 100],
        [0, 308],
        [17102, 240],
      ]);
    });

    it('turns the user prompt into actor.thinking with a prompt summary', () => {
      const [thinking] = ofType(events, 'actor.thinking');
      expect(thinking).toMatchObject({
        actorId: info.sessionId,
        lastPromptSummary:
          'Map the auth, billing and search modules and report how each one is tested',
      });
    });
  });

  describe('nested-subagent', () => {
    const { info } = loadFixture('nested-subagent');
    const events = normalizeFixture('nested-subagent');
    const outer = 'a4f0000000000000d';
    const inner = 'a5f0000000000000e';

    it('links the nested agent to its parent agent with spawnDepth 2', () => {
      expect(ofType(events, 'agent.spawned')).toEqual([
        {
          type: 'agent.spawned',
          agentId: outer,
          sessionId: info.sessionId,
          agentType: 'general-purpose',
          description: 'Review payment flow',
          spawnDepth: 1,
          ts: '2026-10-10T15:00:02.000Z',
          source: 'jsonl',
        },
        {
          type: 'agent.spawned',
          agentId: inner,
          sessionId: info.sessionId,
          parentAgentId: outer,
          agentType: 'Explore',
          description: 'Find payment tests',
          spawnDepth: 2,
          ts: '2026-10-10T15:00:05.500Z',
          source: 'jsonl',
        },
      ]);
      const spawnInner = ofType(events, 'tool.started').find(
        (event) => event.toolUseId === 'toolu_01NEST00000000000000INNER',
      );
      expect(spawnInner?.actorId).toBe(outer);
    });

    it('does not end the async agent on its launch result, only on the task-notification', () => {
      const launch = ofType(events, 'tool.finished').find(
        (event) => event.toolUseId === 'toolu_01NEST00000000000000OUTER',
      );
      expect(launch).toMatchObject({ ok: true, ts: '2026-10-10T15:00:02.300Z' });
      expect(ofType(events, 'agent.finished')).toEqual([
        { type: 'agent.finished', agentId: inner, ts: '2026-10-10T15:00:12.400Z', source: 'jsonl' },
        { type: 'agent.finished', agentId: outer, ts: '2026-10-10T15:00:20.300Z', source: 'jsonl' },
      ]);
    });
  });

  describe('tool-error', () => {
    const { info } = loadFixture('tool-error');
    const events = normalizeFixture('tool-error');

    it('reports the failing tool_result as ok=false and the next one as ok=true', () => {
      expect(
        ofType(events, 'tool.finished').map((event) => [event.toolUseId, event.ok, event.actorId]),
      ).toEqual([
        ['toolu_01ERR0000000000000000BASH', false, info.sessionId],
        ['toolu_01ERR0000000000000000EDIT', true, info.sessionId],
      ]);
    });

    it('truncates the Bash command at 60 chars and relativizes file paths', () => {
      expect(ofType(events, 'tool.started').map((event) => event.summary)).toEqual([
        'pnpm --filter @demo/app run build --mode production --sourc…',
        'src/app/main.ts',
      ]);
      const [bash] = ofType(events, 'tool.started');
      expect(bash?.summary).toHaveLength(60);
    });

    it('emits no agent events', () => {
      expect(ofType(events, 'agent.spawned')).toEqual([]);
      expect(ofType(events, 'agent.finished')).toEqual([]);
    });
  });
});

describe('normalizer: JSONL correlation edge cases', () => {
  const sessionId = '5e551017-0009-4000-8000-000000000009';
  const projectSlug = '-anon-projects-demo-app';
  const cwd = '/anon/projects/demo-app';

  function line(record: Record<string, unknown>): string {
    return JSON.stringify({ cwd, sessionId, isSidechain: false, ...record });
  }

  function agentToolUse(uuid: string, ts: string, toolUseId: string) {
    return line({
      type: 'assistant',
      uuid,
      timestamp: ts,
      message: {
        id: `msg_${uuid}`,
        role: 'assistant',
        content: [
          { type: 'tool_use', id: toolUseId, name: 'Agent', input: { description: 'Do X' } },
        ],
      },
    });
  }

  function toolResult(uuid: string, ts: string, toolUseId: string, agentId: string) {
    return line({
      type: 'user',
      uuid,
      timestamp: ts,
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUseId }] },
      toolUseResult: { status: 'completed', agentId },
    });
  }

  it('derives parentAgentId from the toolUseId when the meta does not carry it', () => {
    const normalizer = createNormalizer();
    const events = [
      normalizer.ingest({
        kind: 'agent-line',
        sessionId,
        agentId: 'outer',
        line: agentToolUse('u1', '2026-10-10T10:00:01.000Z', 'toolu_inner'),
      }),
      normalizer.ingest({
        kind: 'agent-meta',
        sessionId,
        agentId: 'inner',
        meta: { agentType: 'Explore', description: 'Nested', toolUseId: 'toolu_inner' },
      }),
    ].flat();
    expect(ofType(events, 'agent.spawned')).toEqual([
      expect.objectContaining({ agentId: 'inner', parentAgentId: 'outer', spawnDepth: 2 }),
    ]);
  });

  it('holds a finish seen before the meta and emits it right after the spawn', () => {
    const normalizer = createNormalizer();
    const ingest = (input: Parameters<typeof normalizer.ingest>[0]) => normalizer.ingest(input);
    ingest({
      kind: 'session-line',
      sessionId,
      projectSlug,
      line: agentToolUse('u1', '2026-10-10T10:00:01.000Z', 'toolu_a'),
    });
    const early = ingest({
      kind: 'session-line',
      sessionId,
      projectSlug,
      line: toolResult('u2', '2026-10-10T10:00:09.000Z', 'toolu_a', 'agent-a'),
    });
    expect(ofType(early, 'agent.finished')).toEqual([]);
    const late = ingest({
      kind: 'agent-meta',
      sessionId,
      agentId: 'agent-a',
      meta: { agentType: 'Explore', description: 'Do X', toolUseId: 'toolu_a', spawnDepth: 1 },
    });
    expect(late.map((event) => [event.type, event.ts])).toEqual([
      ['agent.spawned', '2026-10-10T10:00:01.000Z'],
      ['agent.finished', '2026-10-10T10:00:09.000Z'],
    ]);
  });

  it('waits for a timestamp before spawning from a meta read ahead of every transcript', () => {
    const normalizer = createNormalizer();
    const meta = normalizer.ingest({
      kind: 'agent-meta',
      sessionId,
      agentId: 'agent-b',
      meta: { agentType: 'Plan', description: 'Plan it', toolUseId: 'toolu_b', spawnDepth: 1 },
    });
    expect(meta).toEqual([]);
    const first = normalizer.ingest({
      kind: 'agent-line',
      sessionId,
      agentId: 'agent-b',
      line: line({
        type: 'user',
        uuid: 'b1',
        isSidechain: true,
        timestamp: '2026-10-10T10:05:00.000Z',
        message: { role: 'user', content: 'Placeholder prompt.' },
      }),
    });
    expect(first).toEqual([
      expect.objectContaining({
        type: 'agent.spawned',
        agentId: 'agent-b',
        ts: '2026-10-10T10:05:00.000Z',
      }),
    ]);
  });

  it('uses observedAt for a meta when nothing else dates it', () => {
    const normalizer = createNormalizer();
    const events = normalizer.ingest({
      kind: 'agent-meta',
      sessionId,
      agentId: 'agent-c',
      meta: { agentType: 'Explore', description: 'X', toolUseId: 'toolu_c' },
      observedAt: '2026-10-10T10:07:00.000Z',
    });
    expect(events).toEqual([
      expect.objectContaining({ type: 'agent.spawned', ts: '2026-10-10T10:07:00.000Z' }),
    ]);
  });

  it('ignores task-notifications of background shell tasks', () => {
    const normalizer = createNormalizer();
    normalizer.ingest({
      kind: 'session-line',
      sessionId,
      projectSlug,
      line: line({
        type: 'assistant',
        uuid: 'sh1',
        timestamp: '2026-10-10T10:00:01.000Z',
        message: {
          id: 'msg_sh1',
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'toolu_sh', name: 'Bash', input: { command: 'sleep 9' } },
          ],
        },
      }),
    });
    const events = normalizer.ingest({
      kind: 'session-line',
      sessionId,
      projectSlug,
      line: JSON.stringify({
        type: 'queue-operation',
        operation: 'enqueue',
        timestamp: '2026-10-10T10:00:10.000Z',
        sessionId,
        content:
          '<task-notification>\n<task-id>bxyz</task-id>\n<tool-use-id>toolu_sh</tool-use-id>\n<status>completed</status>\n</task-notification>',
      }),
    });
    expect(events).toEqual([]);
  });
});
