import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SpawnAuditEvent, TerminalExitEvent } from '@agents-office/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promoteInlineAgent } from '../src/main/agentBus/promoteAgent';
import { fileAuditStorage, SpawnAgents } from '../src/main/agentBus/spawnAgent';
import { ManagedSessions } from '../src/main/managedSessions';
import { ProfileLibrary } from '../src/main/profileLibrary';
import { registerProfilesIpc } from '../src/main/profilesIpc';
import { RosterStore } from '../src/main/rosterStore';
import type { StartOptions } from '../src/main/sessionManager';
import { createProfilesBridge } from '../src/preload/profilesBridge';

const CWD = '/p';
const SPEC = {
  name: 'Migrator',
  profession: 'developer',
  instructions: 'Migrate the module.',
  task: 'MIGRATE-NOW-123',
};

describe('created agents: reopen, audit and promotion', () => {
  let root: string;
  let roster: RosterStore;
  let library: ProfileLibrary;
  let starts: StartOptions[];
  let managed: ManagedSessions;
  let now: number;

  const host = {
    async start(o: StartOptions) {
      starts.push(o);
      return { id: `term-${starts.length}` };
    },
    async kill() {},
    onExit(_l: (e: TerminalExitEvent) => void) {
      return () => {};
    },
  };
  const names = (cwd: string) =>
    roster.get(cwd).entries.flatMap((e) => {
      const name = e.kind === 'inline' ? e.name : library.get(e.profileId)?.name;
      return name ? [{ entryId: e.kind === 'inline' ? e.id : e.profileId, name }] : [];
    });
  const spawner = () =>
    new SpawnAgents({
      roster,
      names,
      sessions: {
        start: (cwd, id, task) => managed.start(cwd, id, task),
        stop: (cwd, id) => managed.stop(cwd, id),
      },
      auditStorage: fileAuditStorage(join(root, 'audit.json')),
      now: () => new Date(++now),
    });
  const boss = { sessionId: 's', entryId: 'tech-lead', cwd: CWD, role: 'orquestrador' };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ao-created-'));
    starts = [];
    now = 1_700_000_000_000;
    roster = new RosterStore(join(root, 'r.json'));
    library = new ProfileLibrary({ dir: join(root, 'profiles') });
    managed = new ManagedSessions({ host, library, roster });
    roster.addProfile(CWD, 'tech-lead');
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('reopens created agents with their instructions and notes but never the task', async () => {
    const res = await spawner().spawn(boss, SPEC);
    expect(res.isError).toBeUndefined();
    expect(starts[0]?.instructions).toContain('MIGRATE-NOW-123');
    const entry = roster.get(CWD).entries.find((e) => e.kind === 'inline');
    if (entry?.kind !== 'inline') throw new Error('missing inline entry');
    roster.setNotes(CWD, entry.id, 'remember: step 2');

    // New app run: fresh stores/managers over the same files.
    starts = [];
    roster = new RosterStore(join(root, 'r.json'));
    managed = new ManagedSessions({ host, library, roster });
    const report = await managed.reopenAll();
    expect(report.started.map((s) => s.entryId)).toContain(entry.id);
    const agentStart = starts.find((s) => s.profileId === entry.id);
    expect(agentStart?.instructions).toContain('Migrate the module.');
    expect(agentStart?.instructions).toContain('remember: step 2');
    expect(agentStart?.instructions).not.toContain('MIGRATE-NOW-123');
    expect(agentStart?.resume).toBeUndefined();
    // The original task stays available for the tab header.
    expect(managed.list().sessions.find((s) => s.entryId === entry.id)?.task).toBe(
      'MIGRATE-NOW-123',
    );
  });

  it('keeps the audit log across restarts and records user removals', async () => {
    const first = spawner();
    await first.spawn(boss, SPEC);
    const agent = roster.get(CWD).entries.find((e) => e.kind === 'inline');
    if (agent?.kind !== 'inline') throw new Error('missing inline entry');

    const second = spawner();
    expect(second.history(CWD).map((e) => [e.type, e.agentName, e.orchestratorName])).toEqual([
      ['criado', 'Migrator', 'Tech Lead'],
    ]);
    second.recordRemovedByUser(CWD, agent);
    const events = spawner().history(CWD);
    expect(events.map((e) => e.type)).toEqual(['criado', 'encerrado']);
    expect(events[1]?.by).toBe('usuario');
  });

  it('starts empty when the audit file is corrupt', () => {
    writeFileSync(join(root, 'audit.json'), '{not json');
    expect(spawner().history(CWD)).toEqual([]);
    expect(() => readFileSync(join(root, 'audit.json'))).toThrow();
  });

  it('promotes a created agent to the library as a default-role profile', async () => {
    await spawner().spawn(boss, SPEC);
    const agent = roster.get(CWD).entries.find((e) => e.kind === 'inline');
    if (agent?.kind !== 'inline') throw new Error('missing inline entry');
    const profile = promoteInlineAgent({ roster, library }, CWD, agent.id);
    expect(profile).toMatchObject({
      name: 'Migrator',
      instructions: 'Migrate the module.',
      role: 'padrao',
    });
    expect(profile.appearance.base).toBe('developer');
    expect(library.list().map((p) => p.name)).toContain('Migrator');
    // The task is not part of the profile and a second promotion collides on the name.
    expect(JSON.stringify(profile)).not.toContain('MIGRATE-NOW-123');
    expect(() => promoteInlineAgent({ roster, library }, CWD, agent.id)).toThrow(/already in use/);
    expect(() => promoteInlineAgent({ roster, library }, CWD, 'tech-lead')).toThrow(/created by/);
  });

  it('exposes history, promotion and audited removal through the bridge', async () => {
    const handlers = new Map<string, (...a: unknown[]) => unknown>();
    const spawn = spawner();
    registerProfilesIpc<object>({
      ipcMain: { handle: (c, l) => handlers.set(c, (...a) => l({}, ...a)) },
      library,
      roster,
      audit: {
        history: (cwd) => spawn.history(cwd),
        removedByUser: (cwd, entry) => spawn.recordRemovedByUser(cwd, entry),
      },
      comms: {
        status: () => ({ mutedEntryIds: [], paused: false, hops: 0, hopLimit: 8 }),
        mute() {},
        resume() {},
        stop() {},
      },
      trusted: () => {},
    });
    const api = createProfilesBridge(async (c, ...a) => handlers.get(c)?.(...a));
    await spawn.spawn(boss, SPEC);
    const agent = roster.get(CWD).entries.find((e) => e.kind === 'inline');
    if (agent?.kind !== 'inline') throw new Error('missing inline entry');

    const saved = await api.agents.saveAsProfile(CWD, agent.id);
    expect((await api.list()).map((p) => p.id)).toContain(saved.id);
    await api.roster.remove(CWD, agent.id);
    const history: SpawnAuditEvent[] = await api.agents.history(CWD);
    expect(history.map((e) => e.type)).toEqual(['criado', 'encerrado']);
    await expect(api.agents.saveAsProfile(CWD, agent.id)).rejects.toThrow();
  });
});
