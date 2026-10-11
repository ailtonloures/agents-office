import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn as spawnPty } from 'node-pty';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  cleanClaudeEnv,
  type PtyFactory,
  type PtyLike,
  SessionError,
  SessionManager,
  type SessionManagerOptions,
} from '../src/main/sessionManager';

class FakePty implements PtyLike {
  pid = 4242;
  written: string[] = [];
  sizes: Array<[number, number]> = [];
  signals: Array<string | undefined> = [];
  private dataListener: (d: string) => void = () => {};
  private exitListener: (e: { exitCode: number; signal?: number }) => void = () => {};
  onData(l: (d: string) => void) {
    this.dataListener = l;
  }
  onExit(l: (e: { exitCode: number; signal?: number }) => void) {
    this.exitListener = l;
  }
  write(d: string) {
    this.written.push(d);
  }
  resize(c: number, r: number) {
    this.sizes.push([c, r]);
  }
  kill(signal?: string) {
    this.signals.push(signal);
  }
  emit(d: string) {
    this.dataListener(d);
  }
  exit(exitCode = 0, signal?: number) {
    this.exitListener({ exitCode, signal });
  }
}

function setup(overrides: Partial<SessionManagerOptions> = {}) {
  const ptys: FakePty[] = [];
  const calls: Array<{ file: string; args: string[]; env: Record<string, string>; cwd: string }> =
    [];
  const spawn: PtyFactory = (file, args, options) => {
    const pty = new FakePty();
    ptys.push(pty);
    calls.push({ file, args, env: options.env, cwd: options.cwd });
    return pty;
  };
  const manager = new SessionManager({
    spawn,
    resolveClaude: async () => ({ path: '/bin/claude', pathEnv: '/login/bin:/usr/bin' }),
    baseEnv: { HOME: '/h', PATH: '/usr/bin' },
    isDirectory: (p) => p.startsWith('/work'),
    newId: (() => {
      let n = 0;
      return () => `t${++n}`;
    })(),
    ...overrides,
  });
  return { manager, ptys, calls };
}

describe('cleanClaudeEnv', () => {
  it('drops session markers but keeps the user choices', () => {
    const env = cleanClaudeEnv({
      HOME: '/h',
      CLAUDECODE: '1',
      CLAUDE_CODE_CHILD_SESSION: '1',
      CLAUDE_CODE_ENTRYPOINT: 'cli',
      CLAUDE_CODE_USE_BEDROCK: '1',
      CLAUDE_EFFORT: 'high',
      CLAUDE_PID: '12',
      CLAUDE_CONFIG_DIR: '/cfg',
      UNSET: undefined,
    });
    expect(env).toEqual({ HOME: '/h', CLAUDE_CODE_USE_BEDROCK: '1', CLAUDE_CONFIG_DIR: '/cfg' });
  });
});

describe('SessionManager (fake pty)', () => {
  it('starts claude with the cleaned env, login PATH and the terminal id', async () => {
    const { manager, calls } = setup({
      baseEnv: { PATH: '/usr/bin', CLAUDECODE: '1', CLAUDE_CODE_CHILD_SESSION: '1', FOO: 'bar' },
    });
    const { id } = await manager.start({ cwd: '/work/app', permissionMode: 'default' });
    expect(id).toBe('t1');
    const call = calls[0];
    expect(call?.file).toBe('/bin/claude');
    expect(call?.args).toEqual(['--permission-mode', 'default']);
    expect(call?.cwd).toBe('/work/app');
    expect(call?.env.AGENTS_OFFICE_TERMINAL_ID).toBe('t1');
    expect(call?.env.PATH).toBe('/login/bin:/usr/bin');
    expect(call?.env.FOO).toBe('bar');
    expect(call?.env.CLAUDECODE).toBeUndefined();
    expect(call?.env.CLAUDE_CODE_CHILD_SESSION).toBeUndefined();
  });

  it('turns the start options into claude arguments', async () => {
    const { manager, calls } = setup();
    await manager.start({ cwd: '/work', continueLast: true, permissionMode: 'plan' });
    expect(calls[0]?.args).toEqual(['--permission-mode', 'plan', '--continue']);
    await manager.start({
      cwd: '/work',
      resume: 'abc',
      continueLast: true,
      permissionMode: 'default',
    });
    expect(calls[1]?.args).toEqual(['--permission-mode', 'default', '--resume', 'abc']);
    await manager.start({ cwd: '/work' });
    expect(calls[2]?.args).toEqual([]);
  });

  it('passes --resume and ignores claude lookup when a command is given', async () => {
    const resolveClaude = vi.fn(async () => ({ path: '/bin/claude', pathEnv: '/p' }));
    const { manager, calls } = setup({ resolveClaude });
    await manager.start({ cwd: '/work', resume: 'abc-123' });
    expect(calls[0]?.args).toEqual(['--resume', 'abc-123']);
    await manager.start({ cwd: '/work', command: '/fake/claude', args: ['x'] });
    expect(calls[1]?.file).toBe('/fake/claude');
    expect(calls[1]?.args).toEqual(['x']);
    expect(resolveClaude).toHaveBeenCalledTimes(1);
  });

  it('rejects a cwd that is not a directory', async () => {
    const { manager, calls } = setup();
    await expect(manager.start({ cwd: '/nope' })).rejects.toMatchObject({ code: 'invalid-cwd' });
    expect(calls).toHaveLength(0);
  });

  it('propagates resolveClaude errors and wraps spawn failures', async () => {
    const boom = new Error('claude-not-found');
    const { manager } = setup({
      resolveClaude: async () => {
        throw boom;
      },
    });
    await expect(manager.start({ cwd: '/work' })).rejects.toBe(boom);

    const failing = setup({
      spawn: () => {
        throw new Error('ENOENT');
      },
    });
    await expect(failing.manager.start({ cwd: '/work' })).rejects.toMatchObject({
      code: 'spawn-failed',
    });
  });

  it('enforces the simultaneous session limit', async () => {
    const { manager, ptys } = setup({ maxSessions: () => 2 });
    await manager.start({ cwd: '/work' });
    await manager.start({ cwd: '/work' });
    const error = await manager.start({ cwd: '/work' }).catch((e) => e);
    expect(error).toBeInstanceOf(SessionError);
    expect(error.code).toBe('session-limit');
    ptys[0]?.exit();
    await expect(manager.start({ cwd: '/work' })).resolves.toBeDefined();
  });

  it('forwards write and resize, lists sessions and tracks the size', async () => {
    const { manager, ptys } = setup();
    const { id } = await manager.start({ cwd: '/work', cols: 100, rows: 30 });
    manager.write(id, 'hi');
    manager.resize(id, 120, 40);
    expect(ptys[0]?.written).toEqual(['hi']);
    expect(ptys[0]?.sizes).toEqual([[120, 40]]);
    expect(manager.list()).toMatchObject([{ id, cwd: '/work', pid: 4242, cols: 120, rows: 40 }]);
    manager.write('unknown', 'x');
    manager.resize('unknown', 1, 1);
  });

  it('emits data and exit, keeps the buffer and forgets the session on exit', async () => {
    const { manager, ptys } = setup();
    const data: string[] = [];
    const exits: unknown[] = [];
    const off = manager.onData((e) => data.push(`${e.id}:${e.data}`));
    manager.onExit((e) => exits.push(e));
    const { id } = await manager.start({ cwd: '/work' });
    ptys[0]?.emit('hello\n');
    ptys[0]?.emit('world\n');
    expect(data).toEqual(['t1:hello\n', 't1:world\n']);
    expect(manager.getBuffer(id)).toBe('hello\nworld\n');
    off();
    ptys[0]?.emit('more\n');
    expect(data).toHaveLength(2);
    expect(manager.getBuffer(id)).toBe('hello\nworld\nmore\n');
    ptys[0]?.exit(3);
    expect(exits).toEqual([{ id, exitCode: 3, signal: null }]);
    expect(manager.list()).toEqual([]);
    expect(manager.getBuffer(id)).toBeNull();
  });

  it('kills with SIGHUP and only escalates to SIGKILL after the grace period', async () => {
    vi.useFakeTimers();
    try {
      const { manager, ptys } = setup({ killGraceMs: 5000 });
      const { id } = await manager.start({ cwd: '/work' });
      const done = manager.kill(id);
      expect(ptys[0]?.signals).toEqual(['SIGHUP']);
      await vi.advanceTimersByTimeAsync(4999);
      expect(ptys[0]?.signals).toEqual(['SIGHUP']);
      await vi.advanceTimersByTimeAsync(2);
      expect(ptys[0]?.signals).toEqual(['SIGHUP', 'SIGKILL']);
      ptys[0]?.exit(0, 9);
      await done;
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not send SIGKILL when the process exits after SIGHUP', async () => {
    vi.useFakeTimers();
    try {
      const { manager, ptys } = setup();
      const { id } = await manager.start({ cwd: '/work' });
      const done = manager.kill(id);
      ptys[0]?.exit(0, 1);
      await done;
      await vi.advanceTimersByTimeAsync(10_000);
      expect(ptys[0]?.signals).toEqual(['SIGHUP']);
      await manager.kill(id);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('SessionManager lifecycle hooks (fake pty)', () => {
  it('announces started sessions to onStart listeners', async () => {
    const { manager } = setup();
    const started: string[] = [];
    manager.onStart((info) => started.push(`${info.id}:${info.cwd}`));
    await manager.start({ cwd: '/work/a', permissionMode: 'plan' });
    expect(started).toEqual(['t1:/work/a']);
  });

  it('signals the whole process group on kill and sweeps leftovers once the leader is gone', async () => {
    const groupSignals: string[] = [];
    const { manager, ptys } = setup({
      killGroup: (pid, signal) => groupSignals.push(`${pid}:${signal}`),
      killGraceMs: 10_000,
    });
    const { id } = await manager.start({ cwd: '/work/a' });
    const killed = manager.kill(id);
    expect(groupSignals).toEqual(['4242:SIGHUP']);
    ptys[0]?.exit();
    await killed;
    expect(groupSignals).toEqual(['4242:SIGHUP', '4242:SIGKILL']);
  });

  it('also sweeps the group when the process ended on its own, so nothing outlives the session', async () => {
    const groupSignals: string[] = [];
    const { manager, ptys } = setup({ killGroup: (pid, s) => groupSignals.push(`${pid}:${s}`) });
    await manager.start({ cwd: '/work/a' });
    ptys[0]?.exit();
    expect(groupSignals).toEqual(['4242:SIGKILL']);
  });
});

describe('SessionManager (real pty, fake claude)', () => {
  let dir: string;
  const managers: SessionManager[] = [];
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'ao-pty-'));
    // Prints the env it cares about, echoes stdin upper-cased and reports its size on resize.
    writeFileSync(
      join(dir, 'fake-claude.cjs'),
      `
const out = (s) => process.stdout.write(s + '\\n');
// Installed before READY: the test kills as soon as it sees READY.
if (process.argv.includes('--ignore-hup')) { process.on('SIGHUP', () => out('HUP IGNORED')); }
out('READY id=' + process.env.AGENTS_OFFICE_TERMINAL_ID + ' child=' + (process.env.CLAUDE_CODE_CHILD_SESSION ?? 'none') + ' cwd=' + process.cwd());
process.stdout.on('resize', () => out('SIZE ' + process.stdout.columns + 'x' + process.stdout.rows));
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => out('ECHO ' + d.trim().toUpperCase()));
setInterval(() => {}, 1000);
`,
    );
  });
  afterEach(async () => {
    await Promise.all(managers.splice(0).map((m) => m.killAll()));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  function realManager(grace = 300) {
    const manager = new SessionManager({
      spawn: (file, args, options) => spawnPty(file, args, { name: 'xterm-256color', ...options }),
      resolveClaude: async () => {
        throw new Error('not used');
      },
      baseEnv: { ...process.env, CLAUDE_CODE_CHILD_SESSION: '1', CLAUDECODE: '1' },
      killGraceMs: grace,
    });
    managers.push(manager);
    return manager;
  }

  const waitFor = async (fn: () => boolean, ms = 8000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (fn()) return;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error('timeout waiting for condition');
  };

  it('runs, takes input, resizes, reconnects through the buffer and exits clean', async () => {
    const manager = realManager();
    let output = '';
    manager.onData((e) => {
      output += e.data;
    });
    const exits: Array<{ exitCode: number; signal: number | null }> = [];
    manager.onExit((e) => exits.push(e));

    const { id } = await manager.start({
      cwd: dir,
      command: process.execPath,
      args: [join(dir, 'fake-claude.cjs')],
    });
    await waitFor(() => output.includes('READY'));
    expect(output).toContain(`id=${id}`);
    expect(output).toContain('child=none');
    expect(output).toContain(`cwd=${dir}`);

    manager.write(id, 'ping\r');
    await waitFor(() => output.includes('ECHO PING'));

    manager.resize(id, 101, 33);
    await waitFor(() => output.includes('SIZE 101x33'));

    // A reloaded view gets the whole history from the buffer.
    const replay = manager.getBuffer(id) ?? '';
    expect(replay).toContain('READY');
    expect(replay).toContain('ECHO PING');
    expect(replay).toContain('SIZE 101x33');
    expect(manager.list().map((s) => s.id)).toEqual([id]);

    await manager.kill(id);
    expect(exits).toHaveLength(1);
    expect(exits[0]?.signal ?? 1).toBe(1); // killed by SIGHUP
    expect(manager.list()).toEqual([]);
  });

  it('kills with SIGKILL a process that ignores SIGHUP', async () => {
    const manager = realManager(300);
    let output = '';
    manager.onData((e) => {
      output += e.data;
    });
    const exits: Array<{ exitCode: number; signal: number | null }> = [];
    manager.onExit((e) => exits.push(e));
    const { id } = await manager.start({
      cwd: dir,
      command: process.execPath,
      args: [join(dir, 'fake-claude.cjs'), '--ignore-hup'],
    });
    await waitFor(() => output.includes('READY'));
    const started = Date.now();
    await manager.kill(id);
    expect(Date.now() - started).toBeGreaterThanOrEqual(250);
    // Under load the pty data event can land after the exit promise settles.
    await waitFor(() => output.includes('HUP IGNORED') && exits.length > 0);
    expect(exits).toHaveLength(1);
    expect(exits[0]?.signal).toBe(9);
  }, 20_000);

  it('starts a command that does not exist as a spawn failure or an immediate exit', async () => {
    const manager = realManager();
    const exited = new Promise<void>((resolve) => manager.onExit(() => resolve()));
    const result = await manager
      .start({ cwd: dir, command: join(dir, 'missing-binary') })
      .then(() => 'started')
      .catch((e: SessionError) => e.code);
    if (result === 'started') await exited;
    else expect(result).toBe('spawn-failed');
  });
});
