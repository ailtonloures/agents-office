import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { networkInterfaces, tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createEmptyModel,
  isLive,
  type OfficeEvent,
  type OfficeModel,
  parseServerMessage,
  type ServerMessage,
} from '@agents-office/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { reduce } from '../src/model';
import { createDaemon, type Daemon } from '../src/server';
import { FIXTURES_DIR, loadFixture } from './helpers/fixtures';

let projectsDir: string;
let daemon: Daemon | undefined;
let sockets: WebSocket[];
let nowMs: number;

beforeEach(() => {
  projectsDir = mkdtempSync(join(tmpdir(), 'agents-office-e2e-'));
  sockets = [];
  daemon = undefined;
});

afterEach(async () => {
  for (const socket of sockets) socket.terminate();
  await daemon?.stop();
  rmSync(projectsDir, { recursive: true, force: true });
});

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  what: string,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await predicate())) {
    if (Date.now() > deadline) throw new Error(`timeout waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function startDaemon(): Promise<{ port: number }> {
  daemon = createDaemon({
    port: 0,
    projectsDir,
    clock: { now: () => nowMs },
    tickIntervalMs: 20,
    usePolling: true,
  });
  const { port } = await daemon.start();
  return { port };
}

interface Client {
  messages: ServerMessage[];
  events(): OfficeEvent[];
}

async function connect(port: number): Promise<Client> {
  const messages: ServerMessage[] = [];
  const socket = new WebSocket(`ws://127.0.0.1:${port}/stream`);
  sockets.push(socket);
  socket.on('message', (data) => {
    const parsed = parseServerMessage(JSON.parse(data.toString()));
    if (!parsed.success) throw new Error(`invalid server message: ${parsed.error.message}`);
    messages.push(parsed.data);
  });
  await new Promise<void>((resolve, reject) => {
    socket.once('open', () => resolve());
    socket.once('error', reject);
  });
  await waitFor(() => messages.length > 0, 'snapshot');
  return {
    messages,
    events: () => messages.flatMap((message) => (message.kind === 'event' ? [message.event] : [])),
  };
}

function snapshotOf(client: Client): OfficeModel {
  const first = client.messages[0];
  if (first?.kind !== 'snapshot') throw new Error('first message is not a snapshot');
  return first.model;
}

/** Copies a fixture's transcripts under the temporary projects dir, as Claude Code lays them out. */
function installFixture(name: string): void {
  const { info } = loadFixture(name);
  const slugDir = join(projectsDir, info.projectSlug);
  mkdirSync(slugDir, { recursive: true });
  const source = join(FIXTURES_DIR, name);
  // Sub-agent transcripts and metas first, the parent session last: it carries the `Agent` calls.
  // Fixtures without sub-agents have no such directory (git does not keep empty ones).
  const subagentsDir = join(source, info.sessionId);
  if (existsSync(subagentsDir)) {
    cpSync(subagentsDir, join(slugDir, info.sessionId), { recursive: true });
  }
  cpSync(join(source, `${info.sessionId}.jsonl`), join(slugDir, `${info.sessionId}.jsonl`));
}

function lastTimestampMs(name: string): number {
  const { inputs } = loadFixture(name);
  let max = 0;
  for (const input of inputs) {
    if (input.kind !== 'session-line' && input.kind !== 'agent-line') continue;
    const ts = (JSON.parse(input.line) as { timestamp?: string }).timestamp;
    if (ts !== undefined) max = Math.max(max, Date.parse(ts));
  }
  return max;
}

async function getJson(port: number, path: string): Promise<Record<string, unknown>> {
  const response = await fetch(`http://127.0.0.1:${port}${path}`);
  return (await response.json()) as Record<string, unknown>;
}

/**
 * Waits until the client has received no new event for a while. The watcher can still be
 * delivering the subagent files after the first assertions are satisfied, so tests that compare
 * the whole stream or advance the clock must let it go quiet first.
 */
async function settle(client: { events(): unknown[] }): Promise<void> {
  let seen = -1;
  let stableSince = Date.now();
  await waitFor(() => {
    const count = client.events().length;
    if (count !== seen) {
      seen = count;
      stableSince = Date.now();
    }
    return Date.now() - stableSince >= 400;
  }, 'event stream to settle');
}

describe('daemon e2e (Seam 1)', () => {
  it('streams an empty snapshot, then the parallel-subagents events in order, and serves /health', async () => {
    nowMs = lastTimestampMs('parallel-subagents');
    const { port } = await startDaemon();
    const client = await connect(port);
    expect(snapshotOf(client)).toEqual(createEmptyModel());
    expect(await getJson(port, '/health')).toMatchObject({ ok: true, sessions: 0, agents: 0 });

    installFixture('parallel-subagents');
    await waitFor(
      () => client.events().filter((e) => e.type === 'agent.finished').length === 3,
      '3 agent.finished events',
    );
    await settle(client);

    const events = client.events();
    expect(events[0]?.type).toBe('session.started');
    expect(events.filter((e) => e.type === 'session.started')).toHaveLength(1);
    const spawned = events.filter((e) => e.type === 'agent.spawned');
    expect(spawned).toHaveLength(3);
    for (const spawn of spawned) {
      const agentId = (spawn as { agentId: string }).agentId;
      const spawnIndex = events.indexOf(spawn);
      const finishIndex = events.findIndex(
        (e) => e.type === 'agent.finished' && e.agentId === agentId,
      );
      expect(finishIndex).toBeGreaterThan(spawnIndex);
    }

    // The daemon's model is exactly the fold of the events it broadcast.
    const folded = events.reduce((model, event) => reduce(model, event), createEmptyModel());
    expect(daemon?.getModel()).toEqual(folded);

    const health = await getJson(port, '/health');
    const model = daemon?.getModel();
    expect(health.sessions).toBe(Object.values(model?.sessions ?? {}).filter(isLive).length);
    expect(health.agents).toBe(Object.values(model?.agents ?? {}).filter(isLive).length);
    expect(health.sessions).toBe(1);
    // The three subagents finished: they stay in the model but are no longer counted.
    expect(Object.keys(model?.agents ?? {})).toHaveLength(3);
    expect(health.agents).toBe(0);

    // A late client gets the current state as its snapshot.
    const late = await connect(port);
    expect(Object.keys(snapshotOf(late).sessions)).toHaveLength(1);
  });

  it('a PreToolUse hook and the JSONL line of the same tool_use_id yield one tool.started', async () => {
    const { info } = loadFixture('tool-error');
    const bashToolUseId = 'toolu_01ERR0000000000000000BASH';
    nowMs = lastTimestampMs('tool-error');
    const { port } = await startDaemon();
    const client = await connect(port);

    const response = await fetch(`http://127.0.0.1:${port}/hook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        hook_event_name: 'PreToolUse',
        session_id: info.sessionId,
        transcript_path: `/anon/.claude/projects/${info.projectSlug}/${info.sessionId}.jsonl`,
        cwd: '/anon/projects/demo-app',
        tool_name: 'Bash',
        tool_input: { command: 'pnpm --filter @demo/app run build --mode production' },
        tool_use_id: bashToolUseId,
      }),
    });
    expect(response.status).toBe(204);
    await waitFor(
      () => client.events().some((e) => e.type === 'tool.started'),
      'tool.started from the hook',
    );
    expect(await getJson(port, '/health')).toHaveProperty('hooksSeenAt');

    installFixture('tool-error');
    await waitFor(
      () => client.events().some((e) => e.type === 'tool.finished'),
      'tool.finished from the JSONL',
    );
    const forBash = client
      .events()
      .filter(
        (e) => 'toolUseId' in e && e.toolUseId === bashToolUseId && e.type === 'tool.started',
      );
    expect(forBash).toHaveLength(1);
    expect(forBash[0]?.source).toBe('hook');
  });

  it('orphan hooks open no room, and an expired session is reborn when it resumes', async () => {
    nowMs = Date.parse('2026-10-10T12:00:00.000Z');
    const { port } = await startDaemon();
    const client = await connect(port);
    const hook = (body: Record<string, unknown>) =>
      fetch(`http://127.0.0.1:${port}/hook`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    const real = { session_id: 'real-1', cwd: '/work/agent-office' };

    await hook({ ...real, hook_event_name: 'SessionStart' });
    await waitFor(() => client.events().some((e) => e.type === 'session.started'), 'real session');

    // A stray hook of an unknown session without cwd: no room, no phantom in the counts.
    await hook({ hook_event_name: 'Stop', session_id: 'ghost-1' });
    await hook({ hook_event_name: 'SessionStart', session_id: 'ghost-2' });
    await settle(client);
    expect(await getJson(port, '/health')).toMatchObject({ sessions: 1 });
    expect(client.events().filter((e) => e.type === 'session.started')).toHaveLength(1);

    // Silence expires the session (15 min); a resume brings its room back.
    nowMs += 15 * 60 * 1000;
    await waitFor(
      () => client.events().some((e) => e.type === 'session.ended' && e.reason === 'expired'),
      'session.ended{expired}',
    );
    await waitFor(async () => (await getJson(port, '/health')).sessions === 0, 'empty office');
    await hook({ ...real, hook_event_name: 'UserPromptSubmit', prompt: 'back' });
    await waitFor(
      () => client.events().filter((e) => e.type === 'session.started').length === 2,
      'session.started after the resume',
    );
    expect(await getJson(port, '/health')).toMatchObject({ sessions: 1 });
    const fresh = await connect(port);
    expect(Object.keys(snapshotOf(fresh).projects)).toEqual(['-work-agent-office']);
  });

  it('rejects an invalid hook payload with 400', async () => {
    nowMs = Date.now();
    const { port } = await startDaemon();
    const response = await fetch(`http://127.0.0.1:${port}/hook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nope: true }),
    });
    expect(response.status).toBe(400);
  });

  it('expires the session after 15 minutes of silence and a new client sees an empty office', async () => {
    nowMs = lastTimestampMs('parallel-subagents');
    const { port } = await startDaemon();
    const client = await connect(port);
    installFixture('parallel-subagents');
    await waitFor(
      () => client.events().filter((e) => e.type === 'agent.finished').length === 3,
      '3 agent.finished events',
    );
    expect(await getJson(port, '/health')).toMatchObject({ sessions: 1 });

    await settle(client);

    nowMs += 15 * 60 * 1000;
    await waitFor(
      () => client.events().some((e) => e.type === 'session.ended' && e.reason === 'expired'),
      'session.ended{expired}',
    );
    // A late transcript line may recreate the session; the next liveness tick expires it again.
    await waitFor(async () => {
      const health = await getJson(port, '/health');
      return health.sessions === 0 && health.agents === 0;
    }, 'health to report an empty office');

    const fresh = await connect(port);
    const snapshot = snapshotOf(fresh);
    expect(snapshot.sessions).toEqual({});
    expect(snapshot.agents).toEqual({});
    expect(snapshot.projects).toEqual({});
  }, 20_000);
});

describe('daemon network exposure', () => {
  it('listens only on 127.0.0.1', async () => {
    nowMs = Date.now();
    await startDaemon();
    expect(daemon?.address?.host).toBe('127.0.0.1');
    // Not reachable through any other local address (a LAN IP, when the machine has one).
    const external = Object.values(networkInterfaces())
      .flat()
      .find((iface) => iface?.family === 'IPv4' && !iface.internal);
    if (external) {
      await expect(
        fetch(`http://${external.address}:${daemon?.address?.port}/health`),
      ).rejects.toThrow();
    }
  });

  it('refuses a non-loopback host unless unsafeHost is set', async () => {
    expect(() => createDaemon({ port: 0, host: '0.0.0.0', projectsDir })).toThrow(/loopback/);
    expect(() =>
      createDaemon({ port: 0, host: '0.0.0.0', unsafeHost: true, projectsDir }),
    ).not.toThrow();
  });
});
