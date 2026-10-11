import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PermissionRequest, ServerMessage } from '@agents-office/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createDaemon, type Daemon } from '../src/server';
import { createPermissionBroker } from '../src/server/permissionBroker';

const SPIKE_FIXTURES = join(
  __dirname,
  '..',
  '..',
  '..',
  '.claude',
  'learnings',
  'spike-scripts',
  'fixtures',
);
function fixture(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(SPIKE_FIXTURES, name), 'utf8')) as Record<string, unknown>;
}

let projectsDir: string;
let daemon: Daemon | undefined;
let sockets: WebSocket[];
let port: number;
let nextId: number;

beforeEach(async () => {
  projectsDir = mkdtempSync(join(tmpdir(), 'agents-office-perm-'));
  sockets = [];
  nextId = 0;
  daemon = createDaemon({
    port: 0,
    projectsDir,
    clock: { now: () => Date.parse('2026-10-10T12:00:00.000Z') },
    generateId: () => `perm-${++nextId}`,
    tickIntervalMs: 60_000,
    usePolling: true,
    log: () => {},
  });
  ({ port } = await daemon.start());
});

afterEach(async () => {
  for (const socket of sockets) socket.terminate();
  await daemon?.stop();
  rmSync(projectsDir, { recursive: true, force: true });
});

async function waitFor(predicate: () => boolean, what: string, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`timeout waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

interface Client {
  socket: WebSocket;
  messages: Record<string, unknown>[];
  ofKind(kind: string): Record<string, unknown>[];
}

async function connect(role?: 'ui'): Promise<Client> {
  const messages: Record<string, unknown>[] = [];
  const socket = new WebSocket(`ws://127.0.0.1:${port}/stream${role ? `?role=${role}` : ''}`);
  sockets.push(socket);
  socket.on('message', (data) => messages.push(JSON.parse(data.toString())));
  await new Promise<void>((resolve, reject) => {
    socket.once('open', () => resolve());
    socket.once('error', reject);
  });
  await waitFor(() => messages.length > 0, 'snapshot');
  if (role)
    await waitFor(() => messages.some((m) => m.kind === 'permission.snapshot'), 'perm snapshot');
  return { socket, messages, ofKind: (kind) => messages.filter((m) => m.kind === kind) };
}

function post(path: string, body: unknown): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function health(): Promise<Record<string, unknown>> {
  return (await (await fetch(`http://127.0.0.1:${port}/health`)).json()) as Record<string, unknown>;
}

const mainRequest = () => fixture('permission-request.main.json');
const subagentRequest = () => fixture('permission-request.subagent.json');

function postToolUseFor(request: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    ...request,
    hook_event_name: 'PostToolUse',
    tool_use_id: 'toolu_x',
    tool_response: {},
    ...extra,
  };
}

describe('permission tracker over HTTP + WebSocket (notify-only)', () => {
  it('POST /hook with PermissionRequest answers 204 at once and emits permission.requested', async () => {
    const ui = await connect('ui');
    const started = Date.now();
    const response = await post('/hook', mainRequest());
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(Date.now() - started).toBeLessThan(1000);

    await waitFor(() => ui.ofKind('permission.requested').length === 1, 'permission.requested');
    const request = ui.ofKind('permission.requested')[0]?.request as PermissionRequest;
    expect(request).toMatchObject({
      id: 'perm-1',
      sessionId: mainRequest().session_id,
      actorId: mainRequest().session_id,
      tool: 'Bash',
    });
    expect(request.agentType).toBeUndefined();
    expect(request.projectId).toBe('-tmp-spike-proj');
    expect((await health()).pendingPermissions).toBe(1);
  });

  it('tracks the request even when no UI is connected, and only role=ui clients get messages', async () => {
    const plain = await connect();
    expect((await post('/hook', mainRequest())).status).toBe(204);
    expect((await health()).pendingPermissions).toBe(1);
    const ui = await connect('ui');
    expect(ui.ofKind('permission.snapshot')[0]).toMatchObject({ pending: [{ id: 'perm-1' }] });
    expect(plain.ofKind('permission.requested')).toHaveLength(0);
    expect(plain.ofKind('permission.snapshot')).toHaveLength(0);
  });

  it('a PermissionRequest does not enter the office model', async () => {
    await post('/hook', mainRequest());
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(Object.keys(daemon?.getModel().agents ?? {})).toHaveLength(0);
  });

  it('the legacy POST /hook/permission also answers 204 at once (old hooks never block)', async () => {
    const ui = await connect('ui');
    const response = await post('/hook/permission', mainRequest());
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    await waitFor(() => ui.ofKind('permission.requested').length === 1, 'request');
    expect((await post('/hook/permission', { nope: true })).status).toBe(400);
  });

  it('a request answered in the terminal (PostToolUse, no tool_use_id on the request) is resolved', async () => {
    const ui = await connect('ui');
    await post('/hook', subagentRequest());
    await waitFor(() => ui.ofKind('permission.requested').length === 1, 'request');
    const request = ui.ofKind('permission.requested')[0]?.request as PermissionRequest;
    expect(request.actorId).toBe('a35a2e5df361b1221');
    expect(request.agentType).toBe('general-purpose');

    // Same tool, different input: not this request.
    await post('/hook', postToolUseFor(subagentRequest(), { tool_input: { command: 'other' } }));
    // Same input but from the main session actor (no agent_id): not this request either.
    const { agent_id: _a, agent_type: _t, ...mainActor } = subagentRequest();
    await post('/hook', postToolUseFor(mainActor));
    expect((await health()).pendingPermissions).toBe(1);

    expect((await post('/hook', postToolUseFor(subagentRequest()))).status).toBe(204);
    await waitFor(() => ui.ofKind('permission.resolved').length === 1, 'resolved');
    expect(ui.ofKind('permission.resolved')[0]).toEqual({
      kind: 'permission.resolved',
      id: 'perm-1',
    });
    expect((await health()).pendingPermissions).toBe(0);
  });

  it.each(['PostToolUseFailure', 'PermissionDenied'])(
    '%s of the same tool and input resolves the request',
    async (event) => {
      const ui = await connect('ui');
      await post('/hook', mainRequest());
      await waitFor(() => ui.ofKind('permission.requested').length === 1, 'request');
      await post('/hook', { ...mainRequest(), hook_event_name: event, tool_use_id: 'toolu_x' });
      await waitFor(() => ui.ofKind('permission.resolved').length === 1, 'resolved');
    },
  );

  it.each(['Stop', 'UserPromptSubmit', 'SessionEnd'])(
    '%s of the session resolves the request',
    async (event) => {
      const ui = await connect('ui');
      await post('/hook', mainRequest());
      await waitFor(() => ui.ofKind('permission.requested').length === 1, 'request');
      await post('/hook', { hook_event_name: event, session_id: 'another-session' });
      expect((await health()).pendingPermissions).toBe(1);
      await post('/hook', { hook_event_name: event, session_id: mainRequest().session_id });
      await waitFor(() => ui.ofKind('permission.resolved').length === 1, 'resolved');
      expect((await health()).pendingPermissions).toBe(0);
    },
  );

  it('SubagentStop resolves the subagent request only', async () => {
    const ui = await connect('ui');
    await post('/hook', subagentRequest());
    await waitFor(() => ui.ofKind('permission.requested').length === 1, 'sub request');
    await post('/hook', mainRequest());
    await waitFor(() => ui.ofKind('permission.requested').length === 2, 'main request');
    await post('/hook', {
      hook_event_name: 'SubagentStop',
      session_id: mainRequest().session_id,
      agent_id: 'a35a2e5df361b1221',
    });
    await waitFor(() => ui.ofKind('permission.resolved').length === 1, 'resolved');
    expect(ui.ofKind('permission.resolved')[0]).toMatchObject({ id: 'perm-1' });
    expect((await health()).pendingPermissions).toBe(1);
  });

  it('keeps two simultaneous requests independent and resolves them out of order', async () => {
    const ui = await connect('ui');
    await post('/hook', mainRequest());
    await post('/hook', subagentRequest());
    await waitFor(() => ui.ofKind('permission.requested').length === 2, 'both');
    expect((await health()).pendingPermissions).toBe(2);
    await post('/hook', postToolUseFor(subagentRequest()));
    await waitFor(() => ui.ofKind('permission.resolved').length === 1, 'second resolved');
    expect(ui.ofKind('permission.resolved')[0]).toMatchObject({ id: 'perm-2' });
    expect((await health()).pendingPermissions).toBe(1);
  });

  it('a late UI gets the pending requests in permission.snapshot, and none once resolved', async () => {
    const ui = await connect('ui');
    await post('/hook', mainRequest());
    await waitFor(() => ui.ofKind('permission.requested').length === 1, 'request');
    const late = await connect('ui');
    expect(late.ofKind('permission.snapshot')[0]).toMatchObject({ pending: [{ id: 'perm-1' }] });
    await post('/hook', { hook_event_name: 'Stop', session_id: mainRequest().session_id });
    await waitFor(() => late.ofKind('permission.resolved').length === 1, 'resolved');
    const later = await connect('ui');
    expect(later.ofKind('permission.snapshot')[0]).toMatchObject({ pending: [] });
  });

  it('keeps pending requests when the last UI disconnects', async () => {
    const ui = await connect('ui');
    await post('/hook', mainRequest());
    await waitFor(() => ui.ofKind('permission.requested').length === 1, 'request');
    ui.socket.close();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect((await health()).pendingPermissions).toBe(1);
  });

  it('ignores decision messages from any client', async () => {
    const ui = await connect('ui');
    const plain = await connect();
    await post('/hook', mainRequest());
    await waitFor(() => ui.ofKind('permission.requested').length === 1, 'request');
    for (const client of [ui, plain]) {
      client.socket.send(
        JSON.stringify({
          kind: 'permission.decide',
          id: 'perm-1',
          decision: { behavior: 'allow' },
        }),
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect((await health()).pendingPermissions).toBe(1);
    expect(ui.ofKind('permission.resolved')).toHaveLength(0);
    expect(ui.socket.readyState).toBe(WebSocket.OPEN);
  });

  it('rejects an invalid payload with 400', async () => {
    expect((await post('/hook', { nope: true })).status).toBe(400);
  });
});

describe('PermissionBroker (unit)', () => {
  const messages: ServerMessage[] = [];
  const broker = () =>
    createPermissionBroker({
      now: () => Date.parse('2026-10-10T12:00:00.000Z'),
      generateId: () => 'id-1',
      emit: (m) => messages.push(m),
    });
  beforeEach(() => {
    messages.length = 0;
  });

  it('uses the injected clock and id, and summarizes the input instead of exposing it', () => {
    const b = broker();
    b.track({
      hook_event_name: 'PermissionRequest',
      session_id: 's1',
      tool_name: 'Bash',
      tool_input: { command: 'echo secret-token' },
    });
    expect(b.snapshot()).toEqual([
      {
        id: 'id-1',
        sessionId: 's1',
        actorId: 's1',
        tool: 'Bash',
        inputSummary: 'echo secret-token',
        ts: '2026-10-10T12:00:00.000Z',
      },
    ]);
    expect(messages).toEqual([{ kind: 'permission.requested', request: b.snapshot()[0] }]);
    expect(b.pendingCount).toBe(1);
  });

  it('ignores a request without tool name', () => {
    const b = broker();
    expect(b.track({ hook_event_name: 'PermissionRequest', session_id: 's1' })).toBeUndefined();
    expect(b.pendingCount).toBe(0);
    expect(messages).toHaveLength(0);
  });

  it('matches tool_input regardless of key order', () => {
    const b = broker();
    b.track({
      hook_event_name: 'PermissionRequest',
      session_id: 's1',
      tool_name: 'Edit',
      tool_input: { a: 1, b: { c: 2, d: 3 } },
    });
    expect(
      b.resolveExternally({
        hook_event_name: 'PostToolUse',
        session_id: 's1',
        tool_name: 'Edit',
        tool_input: { b: { d: 3, c: 2 }, a: 1 },
      }),
    ).toBe(1);
    expect(messages.at(-1)).toEqual({ kind: 'permission.resolved', id: 'id-1' });
    expect(b.pendingCount).toBe(0);
  });
});
