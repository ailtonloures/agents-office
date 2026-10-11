import { KNOWN_HOOK_EVENTS, type OfficeEvent, parseOfficeEvent } from '@agents-office/shared';
import { describe, expect, it } from 'vitest';
import { createNormalizer, type NormalizerInput } from '../src/normalizer';
import { loadFixture, loadHookPayload } from './helpers/fixtures';

const SESSION = '5e551017-0004-4000-8000-00000000000d';
const AGENT = 'a6f0000000000000f';
const RECEIVED_AT = '2026-10-10T17:00:00.000Z';

function hook(event: string, overrides: Record<string, unknown> = {}, receivedAt = RECEIVED_AT) {
  return {
    kind: 'hook' as const,
    payload: { ...loadHookPayload(event), ...overrides },
    receivedAt,
  };
}

/** Events a hook produces on a normalizer that already knows the session. */
function eventsOf(event: string, overrides: Record<string, unknown> = {}): OfficeEvent[] {
  const normalizer = createNormalizer();
  normalizer.ingest(hook('SessionStart', {}, '2026-10-10T16:59:00.000Z'));
  return normalizer.ingest(hook(event, overrides));
}

describe('normalizer: hooks', () => {
  it('has a payload fixture for every known hook event', () => {
    for (const event of KNOWN_HOOK_EVENTS) {
      expect(loadHookPayload(event).hook_event_name).toBe(event);
    }
  });

  it('SessionStart -> session.started (projectId from the transcript dir)', () => {
    const normalizer = createNormalizer();
    expect(normalizer.ingest(hook('SessionStart'))).toEqual([
      {
        type: 'session.started',
        sessionId: SESSION,
        projectId: '-anon-projects-demo-app',
        cwd: '/anon/projects/demo-app',
        ts: RECEIVED_AT,
        source: 'hook',
      },
    ]);
  });

  it('SessionEnd -> session.ended with reason hook', () => {
    expect(eventsOf('SessionEnd')).toEqual([
      {
        type: 'session.ended',
        sessionId: SESSION,
        reason: 'hook',
        ts: RECEIVED_AT,
        source: 'hook',
      },
    ]);
  });

  it('SubagentStart -> agent.spawned', () => {
    expect(eventsOf('SubagentStart')).toEqual([
      {
        type: 'agent.spawned',
        agentId: AGENT,
        sessionId: SESSION,
        agentType: 'Explore',
        description: '',
        spawnDepth: 1,
        ts: RECEIVED_AT,
        source: 'hook',
      },
    ]);
  });

  it('SubagentStop -> agent.finished', () => {
    expect(eventsOf('SubagentStop')).toEqual([
      { type: 'agent.finished', agentId: AGENT, ts: RECEIVED_AT, source: 'hook' },
    ]);
  });

  it('PreToolUse -> tool.started with a relative path summary', () => {
    expect(eventsOf('PreToolUse')).toEqual([
      {
        type: 'tool.started',
        actorId: SESSION,
        toolUseId: 'toolu_01HOOK000000000000000EDIT',
        tool: 'Edit',
        summary: 'src/payments/checkout.ts',
        ts: RECEIVED_AT,
        source: 'hook',
      },
    ]);
  });

  it('PostToolUse -> tool.finished', () => {
    expect(eventsOf('PostToolUse')).toEqual([
      {
        type: 'tool.finished',
        actorId: SESSION,
        toolUseId: 'toolu_01HOOK000000000000000EDIT',
        ok: true,
        ts: RECEIVED_AT,
        source: 'hook',
      },
    ]);
  });

  it('PostToolUse with an error response -> tool.finished ok=false', () => {
    const [event] = eventsOf('PostToolUse', { tool_response: { is_error: true } });
    expect(event).toMatchObject({ type: 'tool.finished', ok: false });
  });

  it('tool hooks fired inside a subagent are attributed to the agent', () => {
    const [event] = eventsOf('PreToolUse', { agent_id: AGENT, agent_type: 'Explore' });
    expect(event).toMatchObject({ type: 'tool.started', actorId: AGENT });
  });

  it('Notification -> actor.waiting', () => {
    expect(eventsOf('Notification')).toEqual([
      { type: 'actor.waiting', actorId: SESSION, ts: RECEIVED_AT, source: 'hook' },
    ]);
  });

  it('Stop -> actor.idle', () => {
    expect(eventsOf('Stop')).toEqual([
      { type: 'actor.idle', actorId: SESSION, ts: RECEIVED_AT, source: 'hook' },
    ]);
  });

  it('UserPromptSubmit -> actor.thinking with a truncated prompt summary', () => {
    const [event] = eventsOf('UserPromptSubmit');
    expect(event).toEqual({
      type: 'actor.thinking',
      actorId: SESSION,
      lastPromptSummary:
        'Refactor the checkout service so that the payment provider can be swapped witho…',
      ts: RECEIVED_AT,
      source: 'hook',
    });
    expect((event as { lastPromptSummary: string }).lastPromptSummary).toHaveLength(80);
  });

  it('starts an unknown session from any hook that carries its cwd', () => {
    const normalizer = createNormalizer();
    const events = normalizer.ingest(hook('PreToolUse'));
    expect(events.map((event) => event.type)).toEqual(['session.started', 'tool.started']);
  });

  it('ignores unknown hook events and skips invalid payloads without throwing', () => {
    const normalizer = createNormalizer();
    expect(normalizer.ingest(hook('Stop', { hook_event_name: 'PreCompact' }))).toEqual([]);
    expect(
      normalizer.ingest({ kind: 'hook', payload: { foo: 1 }, receivedAt: RECEIVED_AT }),
    ).toEqual([]);
    expect(normalizer.ingest({ kind: 'hook', payload: 'nope', receivedAt: RECEIVED_AT })).toEqual(
      [],
    );
    expect(normalizer.ingest(hook('Stop', {}, 'not a date'))).toEqual([]);
    expect(normalizer.stats).toMatchObject({ ignored: 1, skipped: 3 });
  });

  it('every hook event yields events valid against the shared contract', () => {
    for (const name of KNOWN_HOOK_EVENTS) {
      for (const event of eventsOf(name)) {
        expect(parseOfficeEvent(event).success, `${name} -> ${event.type}`).toBe(true);
      }
    }
  });
});

describe('normalizer: hook + JSONL dedup', () => {
  const { info, inputs } = loadFixture('tool-error');
  const bashToolUseId = 'toolu_01ERR0000000000000000BASH';
  const sessionHook = (event: string, extra: Record<string, unknown>, receivedAt: string) => ({
    kind: 'hook' as const,
    payload: {
      hook_event_name: event,
      session_id: info.sessionId,
      transcript_path: `/anon/.claude/projects/${info.projectSlug}/${info.sessionId}.jsonl`,
      cwd: '/anon/projects/demo-app',
      ...extra,
    },
    receivedAt,
  });
  const preBash = sessionHook(
    'PreToolUse',
    {
      tool_name: 'Bash',
      tool_input: { command: 'pnpm --filter @demo/app run build --mode production' },
      tool_use_id: bashToolUseId,
    },
    '2026-10-10T16:00:02.410Z',
  );
  const postBash = sessionHook(
    'PostToolUse',
    { tool_name: 'Bash', tool_use_id: bashToolUseId, tool_response: { is_error: true } },
    '2026-10-10T16:00:09.010Z',
  );

  function run(stream: NormalizerInput[]): OfficeEvent[] {
    const normalizer = createNormalizer();
    return stream.flatMap((input) => normalizer.ingest(input));
  }

  function forBash(events: OfficeEvent[]) {
    return events.filter(
      (event) =>
        'toolUseId' in event && (event as { toolUseId: string }).toolUseId === bashToolUseId,
    );
  }

  it('hook first, JSONL second: a single tool.started/finished, from the hook', () => {
    const toolUseLine = inputs.findIndex(
      (input) => input.kind === 'session-line' && input.line.includes(`"id":"${bashToolUseId}"`),
    );
    const resultLine = inputs.findIndex(
      (input) =>
        input.kind === 'session-line' && input.line.includes(`"tool_use_id":"${bashToolUseId}"`),
    );
    const stream = [
      ...inputs.slice(0, toolUseLine),
      preBash,
      ...inputs.slice(toolUseLine, resultLine),
      postBash,
      ...inputs.slice(resultLine),
    ];
    const events = forBash(run(stream));
    expect(events.map((event) => [event.type, event.source])).toEqual([
      ['tool.started', 'hook'],
      ['tool.finished', 'hook'],
    ]);
  });

  it('JSONL first, hook second: a single tool.started/finished, from the JSONL', () => {
    const events = forBash(run([...inputs, preBash, postBash]));
    expect(events.map((event) => [event.type, event.source])).toEqual([
      ['tool.started', 'jsonl'],
      ['tool.finished', 'jsonl'],
    ]);
  });

  it('SessionStart hook + first JSONL line: a single session.started', () => {
    const events = run([sessionHook('SessionStart', {}, '2026-10-10T15:59:59.000Z'), ...inputs]);
    expect(events.filter((event) => event.type === 'session.started')).toEqual([
      expect.objectContaining({ sessionId: info.sessionId, source: 'hook' }),
    ]);
  });

  it('terminalId in a hook -> one session.bound after session.started (hook before JSONL)', () => {
    const events = run([
      sessionHook('SessionStart', { terminalId: 'term-1' }, '2026-10-10T15:59:59.000Z'),
      sessionHook('UserPromptSubmit', { terminalId: 'term-1' }, '2026-10-10T16:00:00.000Z'),
      ...inputs,
    ]);
    expect(events.map((event) => event.type).slice(0, 2)).toEqual([
      'session.started',
      'session.bound',
    ]);
    expect(events.filter((event) => event.type === 'session.bound')).toEqual([
      expect.objectContaining({ sessionId: info.sessionId, terminalId: 'term-1', source: 'hook' }),
    ]);
  });

  it('terminalId arriving after the JSONL started the session still binds it', () => {
    const events = run([
      ...inputs,
      sessionHook('Stop', { terminalId: 'term-2' }, '2026-10-10T16:30:00.000Z'),
    ]);
    const types = events.map((event) => event.type);
    expect(types.indexOf('session.bound')).toBeGreaterThan(types.indexOf('session.started'));
    expect(events.filter((event) => event.type === 'session.bound')).toEqual([
      expect.objectContaining({ sessionId: info.sessionId, terminalId: 'term-2' }),
    ]);
  });

  it('without terminalId (external session) no session.bound is emitted', () => {
    const events = run([sessionHook('SessionStart', {}, '2026-10-10T15:59:59.000Z'), ...inputs]);
    expect(events.some((event) => event.type === 'session.bound')).toBe(false);
  });

  it('SubagentStart hook before the meta: one agent.spawned, enriched by agent.updated', () => {
    const { info: nested, inputs: nestedInputs } = loadFixture('nested-subagent');
    const subagentStart = {
      kind: 'hook' as const,
      payload: {
        hook_event_name: 'SubagentStart',
        session_id: nested.sessionId,
        cwd: '/anon/projects/demo-app',
        agent_id: 'a5f0000000000000e',
        agent_type: 'Explore',
      },
      receivedAt: '2026-10-10T15:00:05.600Z',
    };
    const subagentStop = {
      ...subagentStart,
      payload: { ...subagentStart.payload, hook_event_name: 'SubagentStop' },
      receivedAt: '2026-10-10T15:00:12.390Z',
    };
    const metaIndex = nestedInputs.findIndex(
      (input) => input.kind === 'agent-meta' && input.agentId === 'a5f0000000000000e',
    );
    const resultIndex = nestedInputs.findIndex(
      (input) =>
        input.kind === 'agent-line' &&
        input.line.includes('"tool_use_id":"toolu_01NEST00000000000000INNER"'),
    );
    const stream = [
      ...nestedInputs.slice(0, metaIndex),
      subagentStart,
      ...nestedInputs.slice(metaIndex, resultIndex),
      subagentStop,
      ...nestedInputs.slice(resultIndex),
    ];
    const events = run(stream).filter(
      (event) => 'agentId' in event && event.agentId === 'a5f0000000000000e',
    );
    expect(events).toEqual([
      {
        type: 'agent.spawned',
        agentId: 'a5f0000000000000e',
        sessionId: nested.sessionId,
        agentType: 'Explore',
        description: '',
        spawnDepth: 1,
        ts: '2026-10-10T15:00:05.600Z',
        source: 'hook',
      },
      {
        type: 'agent.updated',
        agentId: 'a5f0000000000000e',
        parentAgentId: 'a4f0000000000000d',
        agentType: 'Explore',
        description: 'Find payment tests',
        spawnDepth: 2,
        ts: '2026-10-10T15:00:05.500Z',
        source: 'jsonl',
      },
      {
        type: 'agent.finished',
        agentId: 'a5f0000000000000e',
        ts: '2026-10-10T15:00:12.390Z',
        source: 'hook',
      },
    ]);
  });
});
