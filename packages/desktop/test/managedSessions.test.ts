import {
  type AgentProfile,
  type ProjectRoster,
  type RosterEntry,
  rosterEntryId,
  type TerminalExitEvent,
} from '@agents-office/shared';
import { describe, expect, it } from 'vitest';
import { ManagedSessions, type SessionEndDeps } from '../src/main/managedSessions';
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
  reopen: true,
});

function setup(
  rosters: Record<string, Partial<ProjectRoster> & { entries: RosterEntry[] }>,
  options: {
    limit?: number;
    fail?: (o: StartOptions) => Error | undefined;
    sessionEnd?: SessionEndDeps;
  } = {},
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
      setReopen: (cwd, entryId, reopen) => {
        const e = rosters[cwd]?.entries.find((x) => rosterEntryId(x) === entryId);
        if (e) e.reopen = reopen;
      },
    },
    maxSessions: options.limit === undefined ? undefined : () => options.limit as number,
    liveCount: () => alive.size,
    ...(options.sessionEnd ? { sessionEnd: options.sessionEnd } : {}),
    now: () => new Date('2026-01-01T00:00:00Z'),
  });
  return { managed, starts, host, alive };
}

describe('ManagedSessions', () => {
  it('does not reopen a session that was ended, but reopens one open when the app quit', async () => {
    const rosters = { '/p': { entries: [entry('a'), entry('b')] } };
    const first = setup(rosters);
    await first.managed.start('/p', 'a');
    await first.managed.start('/p', 'b');
    await first.managed.stop('/p', 'a'); // ended on purpose
    first.managed.beginShutdown();
    await first.host.kill('term-2'); // killed by the app quitting
    expect(rosters['/p'].entries.map((e) => e.reopen)).toEqual([false, true]);
    const second = setup(rosters);
    const report = await second.managed.reopenAll();
    expect(report.started.map((s) => s.entryId)).toEqual(['b']);
  });

  it('does not reopen legacy entries (reopen false) and marks started ones to reopen', async () => {
    const legacy = { ...entry('a'), reopen: false };
    const rosters = { '/p': { entries: [legacy, { ...entry('b'), reopen: false }] } };
    const first = setup(rosters);
    const report = await first.managed.reopenAll();
    expect(report.started).toEqual([]);
    await first.managed.start('/p', 'a');
    expect(rosters['/p'].entries.map((e) => e.reopen)).toEqual([true, false]);
  });

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

  describe('synthetic SessionEnd on unexpected exit', () => {
    const rosters = () => ({ '/p': { entries: [entry('a'), entry('b')] } });
    const deps = (post: SessionEndDeps['post'], known = true) => {
      const posted: Array<Parameters<SessionEndDeps['post']>[0]> = [];
      const sessionEnd: SessionEndDeps = {
        sessionIdOfTerminal: (id) => (known ? `claude-${id}` : null),
        post: (event) => {
          posted.push(event);
          return post(event);
        },
      };
      return { posted, sessionEnd };
    };

    it('posts SessionEnd with the session bound to the dead terminal', async () => {
      const { posted, sessionEnd } = deps(async () => {});
      const s = setup(rosters(), { sessionEnd });
      await s.managed.start('/p', 'a');
      await s.host.kill('term-1'); // pty died on its own
      expect(posted).toEqual([
        {
          hook_event_name: 'SessionEnd',
          session_id: 'claude-term-1',
          cwd: '/p',
          reason: 'terminal-exited',
          terminalId: 'term-1',
        },
      ]);
    });

    it('does not post for a requested stop, an app quit or an unbound terminal', async () => {
      const a = deps(async () => {});
      const s = setup(rosters(), { sessionEnd: a.sessionEnd });
      await s.managed.start('/p', 'a');
      await s.managed.start('/p', 'b');
      await s.managed.stop('/p', 'a');
      s.managed.beginShutdown();
      await s.host.kill('term-2');
      expect(a.posted).toEqual([]);
      const b = deps(async () => {}, false);
      const t = setup(rosters(), { sessionEnd: b.sessionEnd });
      await t.managed.start('/p', 'a');
      await t.host.kill('term-1');
      expect(b.posted).toEqual([]);
    });

    it('survives a failing post (rejection or throw) and still updates its state', async () => {
      for (const post of [
        () => Promise.reject(new Error('network down')),
        () => {
          throw new Error('sync boom');
        },
      ]) {
        const r = rosters();
        const { sessionEnd } = deps(post);
        const s = setup(r, { sessionEnd });
        await s.managed.start('/p', 'a');
        await expect(s.host.kill('term-1')).resolves.toBeUndefined();
        expect(s.managed.list().sessions).toEqual([]);
        expect(r['/p'].entries[0]?.reopen).toBe(false);
      }
    });
  });
});
