import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppConfigStore, DEFAULT_MAX_SESSIONS } from '../src/main/appConfig';
import { BinaryResolver, ClaudeNotFound } from '../src/main/binaries';
import { registerTerminalIpc, terminalSchemas } from '../src/main/ipc';
import { SessionManager } from '../src/main/sessionManager';
import { SessionRegistry } from '../src/main/sessionRegistry';
import { TERMINAL_CHANNELS } from '../src/main/terminalChannels';
import { createTerminalBridge } from '../src/preload/terminalBridge';

type Handler = (event: { trusted: boolean }, ...args: unknown[]) => unknown;

describe('terminalSchemas', () => {
  it('accepts a valid start and rejects extras, bad modes and bad sizes', () => {
    const ok = terminalSchemas.start.safeParse({
      cwd: '/w',
      permissionMode: 'plan',
      continueLast: true,
      cols: 80,
    });
    expect(ok.success).toBe(true);
    for (const bad of [
      { cwd: '' },
      { cwd: '/w', command: '/bin/sh' },
      { cwd: '/w', permissionMode: 'yolo' },
      { cwd: '/w', cols: 0 },
      { cwd: '/w', resume: '../x' },
      { cwd: 5 },
      null,
    ]) {
      expect(terminalSchemas.start.safeParse(bad).success).toBe(false);
    }
  });

  it('validates write, resize, id and config payloads', () => {
    expect(terminalSchemas.write.safeParse({ id: 'a', data: 'x' }).success).toBe(true);
    expect(terminalSchemas.write.safeParse({ id: 'a', data: 1 }).success).toBe(false);
    expect(terminalSchemas.resize.safeParse({ id: 'a', cols: 1.5, rows: 2 }).success).toBe(false);
    expect(terminalSchemas.resize.safeParse({ id: 'a', cols: 10, rows: 2 }).success).toBe(true);
    expect(terminalSchemas.id.safeParse({ id: '' }).success).toBe(false);
    expect(terminalSchemas.setConfig.safeParse({ maxSessions: 0 }).success).toBe(false);
    expect(terminalSchemas.setConfig.safeParse({ claudePath: null }).success).toBe(true);
  });
});

describe('registerTerminalIpc', () => {
  let dir: string;
  const handlers = new Map<string, Handler>();
  const sent: Array<{ channel: string; payload: unknown }> = [];
  let destroyed = false;
  let manager: SessionManager;
  let startMock: ReturnType<typeof vi.fn>;
  let resolver: BinaryResolver;
  let registry: SessionRegistry;

  beforeEach(() => {
    handlers.clear();
    sent.length = 0;
    destroyed = false;
    dir = mkdtempSync(join(tmpdir(), 'ao-ipc-'));
    startMock = vi.fn(async () => ({ id: 'term-1' }));
    resolver = new BinaryResolver({
      env: {},
      platform: 'linux',
      homedir: dir,
      isExecutable: () => false,
      runShell: async () => '',
    });
    const real = new SessionManager({
      spawn: () => {
        throw new Error('unused');
      },
      resolveClaude: async () => {
        throw new ClaudeNotFound(['x']);
      },
    });
    manager = Object.assign(real, { start: startMock });
    registry = new SessionRegistry(join(dir, 'sessions.json'));
    registerTerminalIpc<{ trusted: boolean }>({
      ipcMain: {
        handle: (channel, listener) => handlers.set(channel, listener as unknown as Handler),
      },
      manager,
      registry,
      config: new AppConfigStore(join(dir, 'config.json')),
      resolver,
      isExecutable: (p) => p === '/ok/claude',
      trusted: (event) => {
        if (!event.trusted) throw new Error('Untrusted sender.');
      },
      target: () => ({
        isDestroyed: () => destroyed,
        send: (channel, payload) => sent.push({ channel, payload }),
      }),
    });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  // The manager's listener sets are private; reach them to emit as the real pty would.
  const listenersOf = (name: string): Set<(event: unknown) => void> =>
    Reflect.get(manager, name) as Set<(event: unknown) => void>;
  const emitData = (event: unknown) => {
    for (const listener of listenersOf('dataListeners')) listener(event);
  };
  const emitExit = (event: unknown) => {
    for (const listener of listenersOf('exitListeners')) listener(event);
  };

  const call = (channel: string, trusted: boolean, ...args: unknown[]) => {
    const handler = handlers.get(channel);
    if (!handler) throw new Error(`no handler for ${channel}`);
    return Promise.resolve().then(() => handler({ trusted }, ...args));
  };

  it('registers every terminal channel', () => {
    for (const channel of Object.values(TERMINAL_CHANNELS)) {
      if (channel.endsWith(':data') || channel.endsWith(':exit')) continue;
      expect(handlers.has(channel), channel).toBe(true);
    }
  });

  it('rejects every call from an untrusted sender', async () => {
    await expect(call(TERMINAL_CHANNELS.start, false, { cwd: '/w' })).rejects.toThrow(/untrusted/i);
    await expect(call(TERMINAL_CHANNELS.write, false, 'a', 'x')).rejects.toThrow(/untrusted/i);
    await expect(call(TERMINAL_CHANNELS.list, false)).rejects.toThrow(/untrusted/i);
    await expect(call(TERMINAL_CHANNELS.setConfig, false, {})).rejects.toThrow(/untrusted/i);
    expect(startMock).not.toHaveBeenCalled();
  });

  it('starts a session from a valid payload and returns a typed result', async () => {
    await expect(call(TERMINAL_CHANNELS.start, true, { cwd: '/w' })).resolves.toEqual({
      ok: true,
      id: 'term-1',
    });
    expect(startMock).toHaveBeenCalledWith({ cwd: '/w' });
  });

  it('never lets the renderer choose the command', async () => {
    const result = await call(TERMINAL_CHANNELS.start, true, { cwd: '/w', command: '/bin/sh' });
    expect(result).toMatchObject({ ok: false, code: 'invalid-request' });
    expect(startMock).not.toHaveBeenCalled();
  });

  it('maps ClaudeNotFound to a clear error result', async () => {
    startMock.mockRejectedValueOnce(new ClaudeNotFound(['a']));
    const result = (await call(TERMINAL_CHANNELS.start, true, { cwd: '/w' })) as {
      ok: boolean;
      code: string;
      message: string;
    };
    expect(result.ok).toBe(false);
    expect(result.code).toBe('claude-not-found');
    expect(result.message).toMatch(/claude/i);
  });

  it('validates write/resize/kill/buffer arguments', async () => {
    await expect(call(TERMINAL_CHANNELS.write, true, 'a', 5)).rejects.toThrow();
    await expect(call(TERMINAL_CHANNELS.resize, true, 'a', 0, 10)).rejects.toThrow();
    await expect(call(TERMINAL_CHANNELS.kill, true, 42)).rejects.toThrow();
    await expect(call(TERMINAL_CHANNELS.buffer, true, '')).rejects.toThrow();
    await expect(call(TERMINAL_CHANNELS.buffer, true, 'nope')).resolves.toBeNull();
    await expect(call(TERMINAL_CHANNELS.list, true)).resolves.toEqual([]);
  });

  it('lists, dismisses and binds sessions of the registry with validated payloads', async () => {
    writeFileSync(
      join(dir, 'sessions.json'),
      JSON.stringify({ active: [{ id: 'old', cwd: '/w', startedAt: '2026-01-01T00:00:00Z' }] }),
    );
    registry = new SessionRegistry(join(dir, 'sessions.json'));
    const fresh = new Map<string, Handler>();
    registerTerminalIpc<{ trusted: boolean }>({
      ipcMain: { handle: (c, l) => fresh.set(c, l as unknown as Handler) },
      manager,
      registry,
      config: new AppConfigStore(join(dir, 'config.json')),
      resolver,
      isExecutable: () => true,
      trusted: () => {},
      target: () => undefined,
    });
    const run = (channel: string, ...args: unknown[]) =>
      Promise.resolve((fresh.get(channel) as Handler)({ trusted: true }, ...args));
    expect(await run(TERMINAL_CHANNELS.lost)).toEqual([
      { id: 'old', cwd: '/w', startedAt: '2026-01-01T00:00:00Z' },
    ]);
    await run(TERMINAL_CHANNELS.noteSession, 'old', '../bad');
    expect(() => run(TERMINAL_CHANNELS.dismissLost, '')).toThrow();
    await run(TERMINAL_CHANNELS.dismissLost, 'old');
    expect(await run(TERMINAL_CHANNELS.lost)).toEqual([]);
  });

  it('forwards terminal data and exit events to the window, unless it is destroyed', () => {
    emitData({ id: 'a', data: 'x' });
    emitExit({ id: 'a', exitCode: 0, signal: null });
    expect(sent).toEqual([
      { channel: TERMINAL_CHANNELS.data, payload: { id: 'a', data: 'x' } },
      { channel: TERMINAL_CHANNELS.exit, payload: { id: 'a', exitCode: 0, signal: null } },
    ]);
    destroyed = true;
    emitData({ id: 'a', data: 'y' });
    expect(sent).toHaveLength(2);
  });

  it('saves a manual claude path only when it is an executable absolute path', async () => {
    expect(await call(TERMINAL_CHANNELS.getConfig, true)).toEqual({
      claudePath: null,
      maxSessions: DEFAULT_MAX_SESSIONS,
    });
    expect(
      await call(TERMINAL_CHANNELS.setConfig, true, { claudePath: '/nope/claude' }),
    ).toMatchObject({
      ok: false,
    });
    expect(await call(TERMINAL_CHANNELS.setConfig, true, { claudePath: 'claude' })).toMatchObject({
      ok: false,
    });
    expect(
      await call(TERMINAL_CHANNELS.setConfig, true, { claudePath: '/ok/claude', maxSessions: 3 }),
    ).toEqual({ ok: true, config: { claudePath: '/ok/claude', maxSessions: 3 } });
    expect(await call(TERMINAL_CHANNELS.setConfig, true, { claudePath: null })).toEqual({
      ok: true,
      config: { claudePath: null, maxSessions: 3 },
    });
    expect(await call(TERMINAL_CHANNELS.setConfig, true, { maxSessions: 0 })).toMatchObject({
      ok: false,
    });
  });

  it('persists the config across restarts', () => {
    const path = join(dir, 'persist.json');
    new AppConfigStore(path).update({ claudePath: '/x/claude', maxSessions: 5 });
    expect(new AppConfigStore(path).get()).toEqual({ claudePath: '/x/claude', maxSessions: 5 });
  });
});

describe('createTerminalBridge', () => {
  it('maps calls to channels and subscribes to events', () => {
    const invoke = vi.fn(async () => undefined);
    const listeners = new Map<string, (payload: unknown) => void>();
    const off = vi.fn();
    const bridge = createTerminalBridge(invoke, (channel, listener) => {
      listeners.set(channel, listener);
      return off;
    });
    void bridge.start({ cwd: '/w' });
    void bridge.write('a', 'x');
    void bridge.resize('a', 1, 2);
    void bridge.kill('a');
    void bridge.list();
    void bridge.buffer('a');
    expect(invoke.mock.calls).toEqual([
      [TERMINAL_CHANNELS.start, { cwd: '/w' }],
      [TERMINAL_CHANNELS.write, 'a', 'x'],
      [TERMINAL_CHANNELS.resize, 'a', 1, 2],
      [TERMINAL_CHANNELS.kill, 'a'],
      [TERMINAL_CHANNELS.list],
      [TERMINAL_CHANNELS.buffer, 'a'],
    ]);
    const seen: unknown[] = [];
    const unsubscribe = bridge.onData((e) => seen.push(e));
    listeners.get(TERMINAL_CHANNELS.data)?.({ id: 'a', data: 'y' });
    expect(seen).toEqual([{ id: 'a', data: 'y' }]);
    unsubscribe();
    expect(off).toHaveBeenCalled();
    expect(Object.keys(bridge).sort()).toEqual(
      [
        'buffer',
        'dismissLost',
        'getConfig',
        'kill',
        'list',
        'lostSessions',
        'noteSession',
        'onData',
        'onExit',
        'resize',
        'setConfig',
        'start',
        'write',
      ].sort(),
    );
  });
});
