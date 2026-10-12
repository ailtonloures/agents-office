import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AgentBus, type BusSession } from '../src/main/agentBus/server';
import { SPAWN_LIMIT, SpawnAgents, spawnTools } from '../src/main/agentBus/spawnAgent';
import { RosterStore } from '../src/main/rosterStore';

const CWD = '/p';
const GOOD = { name: 'Migrator', profession: 'developer', instructions: 'Migrate the module.' };

describe('spawn_agent / dismiss_agent', () => {
  let root: string;
  let roster: RosterStore;
  let started: Array<{ entryId: string; task?: string }>;
  let stopped: string[];
  let startFails: string | null;
  let n: number;

  const build = (approve?: ConstructorParameters<typeof SpawnAgents>[0]['approve']) => {
    const spawn = new SpawnAgents({
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
        start: async (_c, entryId, task) => {
          if (startFails) return { ok: false, failure: { message: startFails } };
          started.push({ entryId, task });
          return { ok: true };
        },
        stop: async (_c, entryId) => {
          stopped.push(entryId);
        },
      },
      approve,
    });
    return spawn;
  };
  const orch = (entryId = 'boss', role = 'orquestrador'): BusSession => ({
    sessionId: `s-${entryId}`,
    entryId,
    cwd: CWD,
    role,
  });

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ao-spawn-'));
    n = 0;
    roster = new RosterStore(join(root, 'r.json'), Date.now, () => `id${++n}`);
    roster.addProfile(CWD, 'boss');
    roster.addProfile(CWD, 'other');
    started = [];
    stopped = [];
    startFails = null;
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('exposes the tools to orchestrators only', () => {
    const bus = new AgentBus({ roster });
    for (const t of spawnTools(build())) bus.registerTool(t);
    const names = (role: string) => bus.toolsFor(role).map((t) => t.name);
    expect(names('orquestrador')).toEqual(
      expect.arrayContaining(['spawn_agent', 'dismiss_agent', 'save_notes']),
    );
    expect(names('padrao')).not.toContain('spawn_agent');
    expect(names('padrao')).not.toContain('dismiss_agent');
  });

  it('refuses a non-orchestrator caller even if the tool is invoked directly', async () => {
    const res = await build().spawn(orch('boss', 'padrao'), GOOD);
    expect(res.isError).toBe(true);
    expect(JSON.parse(res.text).error).toBe('not-orchestrator');
    expect(roster.get(CWD).entries).toHaveLength(2);
  });

  it('creates an inline agent connected to its creator and starts it with the task', async () => {
    const res = await build().spawn(orch(), { ...GOOD, task: 'Start with the API.' });
    expect(res.isError).toBeUndefined();
    const after = roster.get(CWD);
    const created = after.entries.find((e) => e.kind === 'inline');
    expect(created).toMatchObject({
      name: 'Migrator',
      profession: 'developer',
      createdBy: 'boss',
      task: 'Start with the API.',
      connections: ['boss'],
    });
    expect(roster.canTalk(CWD, 'boss', 'id1'.replace(/^/, 'agent-'))).toBe(true);
    expect(roster.canTalk(CWD, 'other', 'agent-id1')).toBe(false);
    expect(started).toEqual([{ entryId: 'agent-id1', task: 'Start with the API.' }]);
  });

  it('refuses the third creation with a structured error', async () => {
    const spawn = build();
    expect(SPAWN_LIMIT).toBe(2);
    await spawn.spawn(orch(), { ...GOOD, name: 'A' });
    await spawn.spawn(orch(), { ...GOOD, name: 'B' });
    const third = await spawn.spawn(orch(), { ...GOOD, name: 'C' });
    expect(third.isError).toBe(true);
    const body = JSON.parse(third.text);
    expect(body).toMatchObject({ error: 'limit-reached', limit: 2, active: ['A', 'B'] });
    expect(roster.get(CWD).entries).toHaveLength(4);
  });

  it('does not exceed the limit with parallel calls', async () => {
    const spawn = build();
    const results = await Promise.all(
      ['A', 'B', 'C'].map((name) => spawn.spawn(orch(), { ...GOOD, name })),
    );
    expect(results.filter((r) => r.isError)).toHaveLength(1);
  });

  it('refuses duplicate names (case-insensitive) and bad arguments', async () => {
    const spawn = build();
    await spawn.spawn(orch(), GOOD);
    const dup = await spawn.spawn(orch('other', 'orquestrador'), { ...GOOD, name: 'migrator' });
    expect(JSON.parse(dup.text).error).toBe('duplicate-name');
    for (const bad of [
      { ...GOOD, name: '' },
      { ...GOOD, name: 'a\nb' },
      { ...GOOD, profession: 'wizard' },
      { ...GOOD, instructions: '  ' },
      { ...GOOD, task: 5 },
    ]) {
      const res = await spawn.spawn(orch(), bad);
      expect(JSON.parse(res.text).error).toBe('invalid-arguments');
    }
  });

  it('rolls the roster back when the session cannot start', async () => {
    startFails = 'limit of sessions';
    const res = await build().spawn(orch(), GOOD);
    expect(JSON.parse(res.text)).toMatchObject({ error: 'session-failed' });
    expect(roster.get(CWD).entries).toHaveLength(2);
  });

  it('honors the approval hook: denial and edits', async () => {
    const denied = await build(async () => ({ approved: false })).spawn(orch(), GOOD);
    expect(JSON.parse(denied.text).error).toBe('denied');
    expect(roster.get(CWD).entries).toHaveLength(2);

    const edited = build(async () => ({ approved: true, request: { instructions: 'Edited.' } }));
    await edited.spawn(orch(), GOOD);
    expect(roster.get(CWD).entries.find((e) => e.kind === 'inline')).toMatchObject({
      instructions: 'Edited.',
    });
  });

  it('dismisses only agents created by the caller, freeing a slot', async () => {
    const spawn = build();
    await spawn.spawn(orch(), { ...GOOD, name: 'A' });
    await spawn.spawn(orch(), { ...GOOD, name: 'B' });

    const foreign = await spawn.dismiss(orch('other'), { name: 'A' });
    expect(JSON.parse(foreign.text).error).toBe('not-owner');
    const library = await spawn.dismiss(orch(), { name: 'other' });
    expect(JSON.parse(library.text).error).toBe('not-owner');
    expect(JSON.parse((await spawn.dismiss(orch(), { name: 'Z' })).text).error).toBe('not-found');
    expect(stopped).toEqual([]);

    const ok = await spawn.dismiss(orch(), { name: 'a' });
    expect(ok.isError).toBeUndefined();
    expect(stopped).toEqual(['agent-id1']);
    expect(
      roster.get(CWD).entries.map((e) => (e.kind === 'inline' ? e.name : e.profileId)),
    ).toEqual(['boss', 'other', 'B']);
    expect((await spawn.spawn(orch(), { ...GOOD, name: 'C' })).isError).toBeUndefined();
    expect(spawn.history(CWD).map((e) => `${e.type}:${e.agentName}`)).toEqual([
      'criado:A',
      'criado:B',
      'encerrado:A',
      'criado:C',
    ]);
  });
});
