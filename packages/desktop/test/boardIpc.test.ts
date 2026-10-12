import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOARD_CHANNELS } from '../src/main/boardChannels';
import { registerBoardIpc } from '../src/main/boardIpc';
import { type BoardElement, BoardStore, emptyScene } from '../src/main/boardStore';
import { createBoardBridge } from '../src/preload/boardBridge';

const el = (id: string, over: Partial<BoardElement> = {}): BoardElement => ({
  id,
  type: 'rectangle',
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  version: 1,
  versionNonce: 5,
  isDeleted: false,
  ...over,
});

describe('registerBoardIpc', () => {
  let dir: string;
  let store: BoardStore;
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
  const send = vi.fn();
  const trusted = vi.fn();
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'board-ipc-'));
    store = new BoardStore({ dir });
    handlers.clear();
    send.mockClear();
    trusted.mockReset();
    registerBoardIpc({
      ipcMain: { handle: (channel, listener) => void handlers.set(channel, listener) },
      store,
      trusted,
      target: () => ({ isDestroyed: () => false, send }),
    });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const call = (channel: string, ...args: unknown[]) => handlers.get(channel)?.({}, ...args);

  it('loads the scene of a workspace and checks the sender', () => {
    store.set('/p', { ...emptyScene(), elements: [el('a')] });
    const result = call(BOARD_CHANNELS.load, '/p') as {
      scene: { elements: unknown[] };
      status: string;
    };
    expect(result.status).toBe('ok');
    expect(result.scene.elements).toHaveLength(1);
    expect(trusted).toHaveBeenCalled();
  });

  it('merges saved user edits without echoing them back', () => {
    expect(call(BOARD_CHANNELS.save, '/p', { elements: [el('u')] })).toEqual({ ok: true });
    expect(store.get('/p').elements.map((e) => e.id)).toEqual(['u']);
    expect(send).not.toHaveBeenCalled();
  });

  it('pushes agent changes to the window', () => {
    store.merge('/p', [el('g')], 'agent');
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toBe(BOARD_CHANNELS.changed);
    expect(send.mock.calls[0]?.[1].cwd).toBe('/p');
  });

  it('rejects malformed scenes and over-limit saves', () => {
    expect(call(BOARD_CHANNELS.save, '/p', { elements: [{ nope: 1 }] })).toMatchObject({
      ok: false,
    });
    expect(call(BOARD_CHANNELS.save, '', { elements: [] })).toMatchObject({ ok: false });
    const small = new BoardStore({ dir, maxElements: 1 });
    const limited = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
    registerBoardIpc({
      ipcMain: { handle: (c, l) => void limited.set(c, l) },
      store: small,
      trusted,
      target: () => undefined,
    });
    const result = limited.get(BOARD_CHANNELS.save)?.({}, '/q', { elements: [el('a'), el('b')] });
    expect(result).toMatchObject({ ok: false });
  });
});

describe('createBoardBridge', () => {
  it('maps load/save/onChange to their channels', async () => {
    const invoke = vi.fn(async (_c: string, ..._a: unknown[]): Promise<unknown> => ({ ok: true }));
    const off = vi.fn();
    const subscribe = vi.fn((_c: string, _l: (payload: unknown) => void) => off);
    const bridge = createBoardBridge(invoke, subscribe);
    await bridge.load('/p');
    expect(invoke).toHaveBeenLastCalledWith(BOARD_CHANNELS.load, '/p');
    await bridge.save('/p', { elements: [] });
    expect(invoke).toHaveBeenLastCalledWith(BOARD_CHANNELS.save, '/p', { elements: [] });
    const listener = vi.fn();
    expect(bridge.onChange(listener)).toBe(off);
    subscribe.mock.calls[0]?.[1]({ cwd: '/p', scene: { elements: [] } });
    expect(listener).toHaveBeenCalledWith('/p', { elements: [] });
  });
});
