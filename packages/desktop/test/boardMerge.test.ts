import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOARD_CHANNELS } from '../src/main/boardChannels';
import { registerBoardIpc, rejectedElements } from '../src/main/boardIpc';
import { type BoardElement, BoardStore, liveElements } from '../src/main/boardStore';

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
const agentEl = (id: string, over: Partial<BoardElement> = {}): BoardElement =>
  el(id, { customData: { author: { id: 'a1', name: 'Ana' } }, ...over });

describe('concurrent edits: user x agent', () => {
  let dir: string;
  let store: BoardStore;
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
  const send = vi.fn();
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'board-merge-'));
    store = new BoardStore({ dir });
    handlers.clear();
    send.mockClear();
    registerBoardIpc({
      ipcMain: { handle: (channel, listener) => void handlers.set(channel, listener) },
      store,
      trusted: () => undefined,
      target: () => ({ isDestroyed: () => false, send }),
    });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const userSave = (elements: BoardElement[]) =>
    handlers.get(BOARD_CHANNELS.save)?.({}, '/p', { elements });

  it('keeps both drawings when user and agent add different elements', () => {
    store.merge('/p', [agentEl('g1')], 'agent');
    userSave([el('u1')]);
    store.merge('/p', [agentEl('g2')], 'agent');
    userSave([el('u2')]);
    expect(store.get('/p').elements.map((e) => e.id)).toEqual(['g1', 'u1', 'g2', 'u2']);
    // Only the agent's changes were pushed, never the user's own saves.
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('the higher version wins whoever wrote it, and authorship survives', () => {
    store.merge('/p', [agentEl('s', { version: 3 })], 'agent');
    userSave([el('s', { version: 4, x: 99, customData: { author: { id: 'a1', name: 'Ana' } } })]);
    expect(store.get('/p').elements[0]).toMatchObject({ version: 4, x: 99 });
    expect(store.get('/p').elements[0]?.customData?.author?.name).toBe('Ana');
    store.merge('/p', [agentEl('s', { version: 2, x: 1 })], 'agent');
    expect(store.get('/p').elements[0]?.x).toBe(99);
  });

  it('sends the agent version back to the window when it beat the user save', () => {
    store.merge('/p', [agentEl('s', { version: 5, x: 7 })], 'agent');
    send.mockClear();
    userSave([el('s', { version: 4, x: 1 }), el('n')]);
    expect(send).toHaveBeenCalledTimes(1);
    const pushed = send.mock.calls[0]?.[1] as { scene: { elements: BoardElement[] } };
    expect(pushed.scene.elements.map((e) => [e.id, e.version])).toEqual([['s', 5]]);
    expect(store.get('/p').elements.map((e) => e.id)).toEqual(['s', 'n']);
  });

  it('breaks a same-version tie by the lower nonce on both sides', () => {
    store.merge('/p', [agentEl('s', { version: 2, versionNonce: 10 })], 'agent');
    userSave([el('s', { version: 2, versionNonce: 3, x: 5 })]);
    expect(store.get('/p').elements[0]).toMatchObject({ versionNonce: 3, x: 5 });
    store.merge('/p', [agentEl('s', { version: 2, versionNonce: 8 })], 'agent');
    expect(store.get('/p').elements[0]?.versionNonce).toBe(3);
  });

  it('a deletion by the user is not resurrected by an older agent copy', () => {
    store.merge('/p', [agentEl('s', { version: 1 })], 'agent');
    userSave([el('s', { version: 2, isDeleted: true })]);
    store.merge('/p', [agentEl('s', { version: 1 })], 'agent');
    expect(liveElements(store.get('/p'))).toHaveLength(0);
  });

  it('rejectedElements lists only the ids where the stored copy differs', () => {
    expect(rejectedElements([el('a'), el('b')], [el('a'), el('b', { version: 2 })])).toEqual([
      el('b', { version: 2 }),
    ]);
  });
});
