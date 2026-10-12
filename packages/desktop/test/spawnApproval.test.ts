import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SpawnApprovalRequest } from '@agents-office/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BusSession } from '../src/main/agentBus/server';
import { SpawnAgents } from '../src/main/agentBus/spawnAgent';
import { SpawnApprovals } from '../src/main/agentBus/spawnApproval';
import { RosterStore } from '../src/main/rosterStore';
import { SPAWN_APPROVAL_CHANNELS } from '../src/main/spawnApprovalChannels';
import { registerSpawnApprovalIpc } from '../src/main/spawnApprovalIpc';
import { createSpawnApprovalBridge } from '../src/preload/spawnApprovalBridge';

const CWD = '/p';
const GOOD = { name: 'Migrator', profession: 'developer', instructions: 'Migrate the module.' };
const orch = (entryId = 'boss', cwd = CWD): BusSession => ({
  sessionId: `s-${entryId}`,
  entryId,
  cwd,
  role: 'orquestrador',
});

describe('spawn approval flow', () => {
  let root: string;
  let roster: RosterStore;
  let pushed: SpawnApprovalRequest[];
  let resolved: string[];
  let notices: string[];
  let dismissed: string[];
  let started: string[];
  let n: number;
  let approvals: SpawnApprovals;
  let spawn: SpawnAgents;

  const makeApprovals = (timeoutMs?: number) =>
    new SpawnApprovals({
      path: join(root, 'grants.json'),
      pushRequest: (r) => pushed.push(r),
      pushResolved: (id) => resolved.push(id),
      notify: (r) => notices.push(r.id),
      dismissNotice: (id) => dismissed.push(id),
      newId: () => `req${++n}`,
      timeoutMs,
    });
  const makeSpawn = (a: SpawnApprovals) =>
    new SpawnAgents({
      roster,
      names: (cwd) =>
        roster
          .get(cwd)
          .entries.map((e) =>
            e.kind === 'inline'
              ? { entryId: e.id, name: e.name }
              : { entryId: e.profileId, name: e.profileId },
          ),
      sessions: {
        start: async (_c, entryId) => {
          started.push(entryId);
          return { ok: true };
        },
        stop: async () => {},
      },
      approve: a.approve,
    });

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ao-spawnapp-'));
    n = 0;
    roster = new RosterStore(join(root, 'r.json'), Date.now, () => `id${++n}`);
    roster.addProfile(CWD, 'boss');
    roster.addProfile('/other', 'boss');
    pushed = [];
    resolved = [];
    notices = [];
    dismissed = [];
    started = [];
    n = 0;
    approvals = makeApprovals();
    spawn = makeSpawn(approvals);
  });
  afterEach(() => {
    vi.useRealTimers();
    rmSync(root, { recursive: true, force: true });
  });

  const inlineCount = (cwd = CWD) =>
    roster.get(cwd).entries.filter((e) => e.kind === 'inline').length;

  it('asks first, creates nothing while waiting, and creates after approval', async () => {
    const call = spawn.spawn(orch(), GOOD);
    await Promise.resolve();
    expect(pushed).toHaveLength(1);
    expect(pushed[0]).toMatchObject({
      id: 'req1',
      cwd: CWD,
      orchestratorId: 'boss',
      name: 'Migrator',
      profession: 'developer',
      instructions: 'Migrate the module.',
    });
    expect(notices).toEqual(['req1']);
    expect(inlineCount()).toBe(0);
    expect(approvals.respond({ id: 'req1', approved: true })).toBe(true);
    const res = await call;
    expect(res.isError).toBeUndefined();
    expect(inlineCount()).toBe(1);
    expect(started).toHaveLength(1);
    expect(resolved).toEqual(['req1']);
    expect(dismissed).toEqual(['req1']);
    expect(approvals.pending()).toEqual([]);
  });

  it('denial returns an error to the tool and creates no agent', async () => {
    const call = spawn.spawn(orch(), GOOD);
    await Promise.resolve();
    approvals.respond({ id: 'req1', approved: false, allowAlways: true });
    const res = await call;
    expect(res.isError).toBe(true);
    expect(JSON.parse(res.text).error).toBe('denied');
    expect(inlineCount()).toBe(0);
    expect(started).toEqual([]);
    expect(approvals.isAllowed(CWD, 'boss')).toBe(false);
  });

  it('creates the agent with the edited instructions', async () => {
    const call = spawn.spawn(orch(), GOOD);
    await Promise.resolve();
    approvals.respond({ id: 'req1', approved: true, instructions: 'Only touch the API.' });
    await call;
    const created = roster.get(CWD).entries.find((e) => e.kind === 'inline');
    expect(created).toMatchObject({ name: 'Migrator', instructions: 'Only touch the API.' });
  });

  it('"allow without asking" skips the card for the same orchestrator and project only', async () => {
    const first = spawn.spawn(orch(), GOOD);
    await Promise.resolve();
    approvals.respond({ id: 'req1', approved: true, allowAlways: true });
    await first;
    expect(approvals.isAllowed(CWD, 'boss')).toBe(true);

    const again = await spawn.spawn(orch(), { ...GOOD, name: 'Second' });
    expect(again.isError).toBeUndefined();
    expect(pushed).toHaveLength(1);
    expect(inlineCount()).toBe(2);

    // another project and another orchestrator still ask
    const otherProject = spawn.spawn(orch('boss', '/other'), GOOD);
    await Promise.resolve();
    expect(pushed).toHaveLength(2);
    expect(approvals.isAllowed('/other', 'boss')).toBe(false);
    roster.addProfile(CWD, 'peer');
    const otherOrch = spawn.spawn(orch('peer'), { ...GOOD, name: 'Third' });
    await Promise.resolve();
    expect(pushed).toHaveLength(3);
    approvals.denyAll('test');
    await Promise.all([otherProject, otherOrch]);
  });

  it('persists the grant across restarts and revoke removes it', () => {
    void approvals.approve({ session: orch(), orchestratorName: 'Boss', request: GOOD as never });
    approvals.respond({ id: 'req1', approved: true, allowAlways: true });
    expect(makeApprovals().isAllowed(CWD, 'boss')).toBe(true);
    expect(makeApprovals().isAllowed('/other', 'boss')).toBe(false);
    approvals.revoke(CWD, 'boss');
    expect(makeApprovals().isAllowed(CWD, 'boss')).toBe(false);
  });

  it('a corrupt grants file fails closed (asks)', () => {
    writeFileSync(join(root, 'grants.json'), '{not json');
    expect(makeApprovals().isAllowed(CWD, 'boss')).toBe(false);
  });

  it('denies when the user does not answer in time', async () => {
    vi.useFakeTimers();
    approvals = makeApprovals(1000);
    spawn = makeSpawn(approvals);
    const call = spawn.spawn(orch(), GOOD);
    await vi.advanceTimersByTimeAsync(1001);
    const res = await call;
    expect(JSON.parse(res.text).error).toBe('denied');
    expect(resolved).toEqual(['req1']);
    expect(inlineCount()).toBe(0);
  });

  it('denies pending requests when the app closes and ignores unknown ids', async () => {
    const call = spawn.spawn(orch(), GOOD);
    await Promise.resolve();
    approvals.denyAll('closing');
    expect(JSON.parse((await call).text)).toMatchObject({ error: 'denied', message: 'closing' });
    expect(approvals.respond({ id: 'req1', approved: true })).toBe(false);
  });

  it('denies a session without an entry id', async () => {
    const decision = await approvals.approve({
      session: { ...orch(), entryId: null },
      orchestratorName: 'x',
      request: GOOD as never,
    });
    expect(decision.approved).toBe(false);
  });

  it('IPC: checks the sender and validates the response', async () => {
    const handlers = new Map<string, (e: { trusted: boolean }, ...a: unknown[]) => unknown>();
    registerSpawnApprovalIpc<{ trusted: boolean }>({
      ipcMain: { handle: (c, l) => handlers.set(c, l as never) },
      approvals,
      trusted: (e) => {
        if (!e.trusted) throw new Error('untrusted');
      },
    });
    const call = spawn.spawn(orch(), GOOD);
    await Promise.resolve();
    const invoke = async (channel: string, ...args: unknown[]) =>
      handlers.get(channel)?.({ trusted: true }, ...args);
    const bridge = createSpawnApprovalBridge(invoke, () => () => {});
    expect(await bridge.pending()).toHaveLength(1);
    const respond = handlers.get(SPAWN_APPROVAL_CHANNELS.respond);
    expect(() => respond?.({ trusted: false }, {})).toThrow('untrusted');
    expect(() => respond?.({ trusted: true }, { id: 'req1' })).toThrow();
    expect(() =>
      respond?.({ trusted: true }, { id: 'req1', approved: true, instructions: '   ' }),
    ).toThrow();
    expect(approvals.pending()).toHaveLength(1);
    expect(await bridge.respond({ id: 'req1', approved: false })).toBe(true);
    expect((await call).isError).toBe(true);
  });
});
