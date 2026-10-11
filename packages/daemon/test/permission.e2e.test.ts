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
  decide(id: string, decision: Record<string, unknown>): void;
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
  return {
    socket,
    messages,
    ofKind: (kind) => messages.filter((m) => m.kind === kind),
    decide: (id, decision) =>
      socket.send(JSON.stringify({ kind: 'permission.decide', id, decision })),
  };
}

function post(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
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

describe('permission broker over HTTP + WebSocket (Seam 1)', () => {
  it('allow: UI receives the request, decides, and the hook gets the allow JSON', async () => {
    const ui = await connect('ui');
    const response = post('/hook/permission', mainRequest());
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

    ui.decide('perm-1', { behavior: 'allow' });
    const answered = await response;
    expect(answered.status).toBe(200);
    expect(await answered.json()).toEqual({
      hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } },
    });
    await waitFor(() => ui.ofKind('permission.resolved').length === 1, 'permission.resolved');
    expect(ui.ofKind('permission.resolved')[0]).toMatchObject({ id: 'perm-1', by: 'ui' });
    expect((await health()).pendingPermissions).toBe(0);
  });

  it('deny: the message reaches the hook output', async () => {
    const ui = await connect('ui');
    const response = post('/hook/permission', mainRequest());
    await waitFor(() => ui.ofKind('permission.requested').length === 1, 'request');
    ui.decide('perm-1', { behavior: 'deny', message: 'Not now' });
    const answered = await response;
    expect(answered.status).toBe(200);
    expect(await answered.json()).toEqual({
      hookSpecificOutput: {
        hookEventName: 'PermissionRequest',
        decision: { behavior: 'deny', message: 'Not now' },
      },
    });
  });

  it('defer answers 204 and resolves the card as ui', async () => {
    const ui = await connect('ui');
    const response = post('/hook/permission', mainRequest());
    await waitFor(() => ui.ofKind('permission.requested').length === 1, 'request');
    ui.decide('perm-1', { behavior: 'defer' });
    expect((await response).status).toBe(204);
    await waitFor(() => ui.ofKind('permission.resolved').length === 1, 'resolved');
  });

  it('a request answered in the terminal (PostToolUse, no tool_use_id on the request) is removed and gets 204', async () => {
    const ui = await connect('ui');
    const response = post('/hook/permission', subagentRequest());
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
    expect((await response).status).toBe(204);
    await waitFor(() => ui.ofKind('permission.resolved').length === 1, 'resolved');
    expect(ui.ofKind('permission.resolved')[0]).toMatchObject({ id: 'perm-1', by: 'terminal' });
    expect((await health()).pendingPermissions).toBe(0);
  });

  it.each(['Stop', 'UserPromptSubmit', 'SessionEnd'])(
    'falls back to %s of the session to clear the request',
    async (event) => {
      const ui = await connect('ui');
      const response = post('/hook/permission', mainRequest());
      await waitFor(() => ui.ofKind('permission.requested').length === 1, 'request');
      await post('/hook', { hook_event_name: event, session_id: 'another-session' });
      expect((await health()).pendingPermissions).toBe(1);
      await post('/hook', { hook_event_name: event, session_id: mainRequest().session_id });
      expect((await response).status).toBe(204);
      expect(ui.ofKind('permission.resolved')[0]).toMatchObject({ by: 'terminal' });
    },
  );

  it('SubagentStop clears the subagent request only', async () => {
    const ui = await connect('ui');
    const sub = post('/hook/permission', subagentRequest());
    await waitFor(() => ui.ofKind('permission.requested').length === 1, 'sub request');
    const main = post('/hook/permission', mainRequest());
    await waitFor(() => ui.ofKind('permission.requested').length === 2, 'main request');
    await post('/hook', {
      hook_event_name: 'SubagentStop',
      session_id: mainRequest().session_id,
      agent_id: 'a35a2e5df361b1221',
    });
    expect((await sub).status).toBe(204);
    expect((await health()).pendingPermissions).toBe(1);
    ui.decide('perm-2', { behavior: 'allow' });
    expect((await main).status).toBe(200);
  });

  it('resolves two simultaneous requests out of order', async () => {
    const ui = await connect('ui');
    const first = post('/hook/permission', mainRequest());
    await waitFor(() => ui.ofKind('permission.requested').length === 1, 'first');
    const second = post('/hook/permission', subagentRequest());
    await waitFor(() => ui.ofKind('permission.requested').length === 2, 'second');
    expect((await health()).pendingPermissions).toBe(2);

    ui.decide('perm-2', { behavior: 'deny', message: 'second' });
    const secondAnswer = (await (await second).json()) as {
      hookSpecificOutput: { decision: unknown };
    };
    expect(secondAnswer.hookSpecificOutput.decision).toEqual({
      behavior: 'deny',
      message: 'second',
    });
    expect((await health()).pendingPermissions).toBe(1);
    ui.decide('perm-1', { behavior: 'allow' });
    expect(
      ((await (await first).json()) as { hookSpecificOutput: { decision: unknown } })
        .hookSpecificOutput.decision,
    ).toEqual({
      behavior: 'allow',
    });
  });

  it('a late UI gets the pending requests in permission.snapshot', async () => {
    const ui = await connect('ui');
    const response = post('/hook/permission', mainRequest());
    await waitFor(() => ui.ofKind('permission.requested').length === 1, 'request');
    const late = await connect('ui');
    expect(late.ofKind('permission.snapshot')[0]).toMatchObject({ pending: [{ id: 'perm-1' }] });
    ui.decide('perm-1', { behavior: 'allow' });
    await response;
  });

  it('releases (204) every pending request when the last UI disconnects', async () => {
    const ui = await connect('ui');
    const other = await connect('ui');
    const response = post('/hook/permission', mainRequest());
    await waitFor(() => ui.ofKind('permission.requested').length === 1, 'request');
    ui.socket.close();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect((await health()).pendingPermissions).toBe(1); // another UI is still there
    other.socket.close();
    expect((await response).status).toBe(204);
    expect((await health()).pendingPermissions).toBe(0);
  });

  it('answers 204 immediately when no UI is connected', async () => {
    const plain = await connect(); // a client without the ui role does not count
    const response = await post('/hook/permission', mainRequest());
    expect(response.status).toBe(204);
    expect(plain.ofKind('permission.requested')).toHaveLength(0);
    expect((await health()).pendingPermissions).toBe(0);
  });

  it('removes the pending request when the hook connection aborts', async () => {
    const ui = await connect('ui');
    const controller = new AbortController();
    const response = post('/hook/permission', mainRequest(), controller.signal).catch(
      () => undefined,
    );
    await waitFor(() => ui.ofKind('permission.requested').length === 1, 'request');
    controller.abort();
    await response;
    await waitFor(() => ui.ofKind('permission.resolved').length === 1, 'resolved');
    expect(ui.ofKind('permission.resolved')[0]).toMatchObject({ id: 'perm-1', by: 'hook-gone' });
    expect((await health()).pendingPermissions).toBe(0);
  });

  it('ignores decisions sent by a client without the ui role', async () => {
    const ui = await connect('ui');
    const plain = await connect();
    const response = post('/hook/permission', mainRequest());
    await waitFor(() => ui.ofKind('permission.requested').length === 1, 'request');
    plain.decide('perm-1', { behavior: 'allow' });
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect((await health()).pendingPermissions).toBe(1);
    expect(plain.ofKind('permission.requested')).toHaveLength(0);
    ui.decide('perm-1', { behavior: 'deny' });
    expect((await (await response).json()) as unknown).toMatchObject({
      hookSpecificOutput: { decision: { behavior: 'deny' } },
    });
  });

  it('the regular POST /hook never decides a request', async () => {
    const ui = await connect('ui');
    const response = post('/hook/permission', mainRequest());
    await waitFor(() => ui.ofKind('permission.requested').length === 1, 'request');
    // Posting the PermissionRequest itself, or decision-looking payloads, creates/decides nothing.
    const posted = await post('/hook', {
      ...mainRequest(),
      decision: { behavior: 'allow' },
      hookSpecificOutput: { decision: { behavior: 'allow' } },
    });
    expect(posted.status).toBe(204);
    await post('/hook', { hook_event_name: 'Notification', session_id: mainRequest().session_id });
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect((await health()).pendingPermissions).toBe(1);
    expect(ui.ofKind('permission.requested')).toHaveLength(1);
    ui.decide('perm-1', { behavior: 'allow' });
    expect((await response).status).toBe(200);
  });

  it('rejects an invalid payload with 400', async () => {
    expect((await post('/hook/permission', { nope: true })).status).toBe(400);
  });

  it('releases pending hook connections on stop', async () => {
    const ui = await connect('ui');
    const response = post('/hook/permission', mainRequest());
    await waitFor(() => ui.ofKind('permission.requested').length === 1, 'request');
    await daemon?.stop();
    expect((await response).status).toBe(204);
  });
});

describe('PermissionBroker (unit)', () => {
  const messages: ServerMessage[] = [];
  let ui = true;
  const broker = () =>
    createPermissionBroker({
      now: () => Date.parse('2026-10-10T12:00:00.000Z'),
      generateId: () => 'id-1',
      hasUi: () => ui,
      emit: (m) => messages.push(m),
    });
  beforeEach(() => {
    messages.length = 0;
    ui = true;
  });

  it('uses the injected clock and id, and summarizes the input instead of exposing it', async () => {
    const b = broker();
    const outcome = b.request({
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
    expect(b.decide('nope', { behavior: 'allow' })).toBe(false);
    expect(b.decide('id-1', { behavior: 'allow' })).toBe(true);
    await expect(outcome).resolves.toEqual({ behavior: 'allow' });
    expect(b.pendingCount).toBe(0);
  });

  it('matches tool_input regardless of key order and releaseAll releases everything', async () => {
    const b = broker();
    const outcome = b.request({
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
    await expect(outcome).resolves.toBe('release');
    const again = b.request({
      hook_event_name: 'PermissionRequest',
      session_id: 's1',
      tool_name: 'Read',
    });
    b.releaseAll();
    await expect(again).resolves.toBe('release');
    expect(messages.filter((m) => m.kind === 'permission.resolved')).toHaveLength(2);
  });

  it('releases right away without UI and when already aborted', async () => {
    const b = broker();
    ui = false;
    await expect(
      b.request({ hook_event_name: 'PermissionRequest', session_id: 's1', tool_name: 'Bash' }),
    ).resolves.toBe('release');
    ui = true;
    const aborted = AbortSignal.abort();
    await expect(
      b.request(
        { hook_event_name: 'PermissionRequest', session_id: 's1', tool_name: 'Bash' },
        aborted,
      ),
    ).resolves.toBe('release');
    expect(messages).toHaveLength(0);
  });
});
