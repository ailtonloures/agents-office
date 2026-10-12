import type {
  AgentProfile,
  ProjectRoster,
  RosterEntry,
  TerminalExitEvent,
} from '@agents-office/shared';
import { describe, expect, it } from 'vitest';
import { ManagedSessions } from '../src/main/managedSessions';
import { SessionError, type StartOptions } from '../src/main/sessionManager';

const profile = (id: string, patch: Partial<AgentProfile> = {}): AgentProfile => ({
  id,
  name: id.toUpperCase(),
  description: '',
  appearance: {
    base: 'developer',
    hairStyle: 2,
    hairColor: '#111111',
    skinColor: '#f1c9a5',
    outfitColor: '#336699',
  },
  instructions: `be ${id}`,
  permissionMode: 'plan',
  role: 'padrao',
  ...patch,
});

const entry = (profileId: string, notes = ''): RosterEntry => ({
  kind: 'profile',
  profileId,
  createdBy: null,
  connections: [],
  notes,
});

function setup(
  rosters: Record<string, Partial<ProjectRoster> & { entries: RosterEntry[] }>,
  options: { limit?: number; fail?: (o: StartOptions) => Error | undefined } = {},
) {
  const starts: StartOptions[] = [];
  const exitListeners: Array<(e: TerminalExitEvent) => void> = [];
  const alive = new Set<string>();
  let n = 0;
  const host = {
    async start(o: StartOptions) {
      const error = options.fail?.(o);
      if (error) throw error;
      if (alive.size >= (options.limit ?? Number.POSITIVE_INFINITY)) {
        throw new SessionError('session-limit', 'limit');
      }
      starts.push(o);
      const id = `term-${++n}`;
      alive.add(id);
      return { id };
    },
    async kill(id: string) {
      alive.delete(id);
      for (const l of exitListeners) l({ id, exitCode: 0, signal: null });
    },
    onExit(l: (e: TerminalExitEvent) => void) {
      exitListeners.push(l);
      return () => {};
    },
  };
  const library = new Map(['a', 'b', 'c'].map((id) => [id, profile(id)]));
  const managed = new ManagedSessions({
    host,
    library: { get: (id) => library.get(id) },
    roster: {
      get: (cwd) => ({ autoReopen: true, ...rosters[cwd] }) as ProjectRoster,
      projectCwds: () => Object.keys(rosters),
    },
    maxSessions: options.limit === undefined ? undefined : () => options.limit as number,
    liveCount: () => alive.size,
    now: () => new Date('2026-01-01T00:00:00Z'),
  });
  return { managed, starts, host, alive };
}

describe('ManagedSessions', () => {
  it('starts an entry with the profile instructions, model and ids, never with --resume', async () => {
    const { managed, starts } = setup({ '/p': { entries: [entry('a', 'old notes')] } });
    const result = await managed.start('/p', 'a');
    expect(result).toMatchObject({ ok: true, alreadyRunning: false });
    expect(starts[0]).toMatchObject({
      cwd: '/p',
      profileId: 'a',
      projectId: '/p',
      permissionMode: 'plan',
      role: 'padrao',
    });
    expect(starts[0]?.instructions).toContain('be a');
    expect(starts[0]?.instructions).toContain('old notes');
    expect(starts[0]?.resume).toBeUndefined();
    expect(starts[0]?.continueLast).toBeUndefined();
    expect(managed.list().sessions[0]).toMatchObject({ entryId: 'a', name: 'A', cwd: '/p' });
  });

  it('is idempotent while running and maps terminal to entry', async () => {
    const { managed, starts } = setup({ '/p': { entries: [entry('a')] } });
    const [first, second] = await Promise.all([managed.start('/p', 'a'), managed.start('/p', 'a')]);
    expect(first).toEqual(second);
    expect(starts).toHaveLength(1);
    const again = await managed.start('/p', 'a');
    expect(again).toMatchObject({ ok: true, alreadyRunning: true });
    if (again.ok) expect(managed.sessionOfTerminal(again.terminalId)?.entryId).toBe('a');
    expect(managed.sessionOfTerminal('other')).toBeNull();
  });

  it('stops a session and forgets it', async () => {
    const { managed } = setup({ '/p': { entries: [entry('a')] } });
    await managed.start('/p', 'a');
    await managed.stop('/p', 'a');
    expect(managed.list().sessions).toEqual([]);
  });

  it('records per-session errors and clears them on success', async () => {
    let broken = true;
    const { managed } = setup(
      { '/p': { entries: [entry('a')] } },
      { fail: () => (broken ? new SessionError('invalid-cwd', 'no dir') : undefined) },
    );
    const failed = await managed.start('/p', 'a');
    expect(failed).toMatchObject({ ok: false, failure: { code: 'invalid-cwd', name: 'A' } });
    expect(managed.list().failures).toHaveLength(1);
    broken = false;
    await managed.start('/p', 'a');
    expect(managed.list().failures).toEqual([]);
  });

  it('fails clearly for entries missing from the roster or the library', async () => {
    const { managed } = setup({ '/p': { entries: [entry('zzz')] } });
    expect(await managed.start('/p', 'nope')).toMatchObject({
      ok: false,
      failure: { code: 'unknown-entry' },
    });
    expect(await managed.start('/p', 'zzz')).toMatchObject({
      ok: false,
      failure: { code: 'unknown-entry' },
    });
  });

  it('reopens in roster order, skipping projects with autoReopen off', async () => {
    const { managed, starts } = setup({
      '/one': { entries: [entry('a'), entry('b')] },
      '/two': { entries: [entry('c')], autoReopen: false },
      '/three': { entries: [entry('c')] },
    });
    const report = await managed.reopenAll();
    expect(starts.map((s) => `${s.cwd}:${s.profileId}`)).toEqual(['/one:a', '/one:b', '/three:c']);
    expect(report.started).toHaveLength(3);
    expect(report.failed).toEqual([]);
    expect(managed.reopenReport()).toBe(report);
  });

  it('respects the session limit and reports what did not open', async () => {
    const { managed, starts } = setup(
      { '/p': { entries: [entry('a'), entry('b'), entry('c')] } },
      { limit: 2 },
    );
    const report = await managed.reopenAll();
    expect(starts).toHaveLength(2);
    expect(report.failed.map((f) => [f.entryId, f.code])).toEqual([['c', 'session-limit']]);
  });

  it('keeps going after one entry fails', async () => {
    const { managed, starts } = setup(
      { '/p': { entries: [entry('a'), entry('b')] } },
      { fail: (o) => (o.profileId === 'a' ? new SessionError('spawn-failed', 'boom') : undefined) },
    );
    const report = await managed.reopenAll();
    expect(starts.map((s) => s.profileId)).toEqual(['b']);
    expect(report.failed).toHaveLength(1);
    expect(report.failed[0]).toMatchObject({ entryId: 'a', code: 'spawn-failed' });
  });

  it('notifies listeners on start and exit', async () => {
    const { managed } = setup({ '/p': { entries: [entry('a')] } });
    const seen: number[] = [];
    managed.onChange((c) => seen.push(c.sessions.length));
    await managed.start('/p', 'a');
    await managed.stop('/p', 'a');
    expect(seen).toEqual([1, 0]);
  });
});
