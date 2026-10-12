import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOARD_CHANNELS } from '../src/main/boardChannels';
import { registerBoardIpc } from '../src/main/boardIpc';
import {
  findLibraryItem,
  LIBRARY_MAX_BYTES,
  LibraryError,
  LibraryStore,
  libraryId,
  libraryName,
  parseLibrary,
} from '../src/main/boardLibraries';
import { createMermaidRelay, MermaidUnavailableError } from '../src/main/boardMermaid';
import { BoardStore } from '../src/main/boardStore';

const element = (id: string) => ({
  id,
  type: 'rectangle',
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  version: 1,
  versionNonce: 1,
  isDeleted: false,
});
const v2 = (items: unknown[]) =>
  JSON.stringify({ type: 'excalidrawlib', version: 2, libraryItems: items });
const v1 = (items: unknown[]) =>
  JSON.stringify({ type: 'excalidrawlib', version: 1, library: items });

describe('parseLibrary', () => {
  it('reads v2 and v1 libraries', () => {
    const a = parseLibrary(v2([{ id: 'x', name: ' Box ', elements: [element('a')] }]));
    expect(a).toEqual([{ id: 'x', name: 'Box', elements: [expect.objectContaining({ id: 'a' })] }]);
    const b = parseLibrary(v1([[element('a')], [element('b')]]));
    expect(b.map((i) => i.id)).toEqual(['item-0', 'item-1']);
  });

  it('skips broken items but refuses libraries without valid ones', () => {
    const items = parseLibrary(v2([{ elements: [{ nope: 1 }] }, { elements: [element('a')] }]));
    expect(items).toHaveLength(1);
    expect(() => parseLibrary(v2([{ elements: [] }]))).toThrow(LibraryError);
  });

  it('refuses invalid files', () => {
    expect(() => parseLibrary('not json')).toThrow(LibraryError);
    expect(() => parseLibrary('{"type":"excalidraw","elements":[]}')).toThrow(LibraryError);
    expect(() => parseLibrary('[]')).toThrow(LibraryError);
    expect(() => parseLibrary('{"type":"excalidrawlib"}')).toThrow(LibraryError);
    expect(() => parseLibrary(' '.repeat(LIBRARY_MAX_BYTES + 1))).toThrow(/too large/);
  });

  it('makes duplicate item ids unique', () => {
    const items = parseLibrary(
      v2([
        { id: 'same', elements: [element('a')] },
        { id: 'same', elements: [element('b')] },
      ]),
    );
    expect(new Set(items.map((i) => i.id)).size).toBe(2);
  });
});

describe('names', () => {
  it('derives a safe name and id', () => {
    expect(libraryName('/a/b/Minha Lib.excalidrawlib')).toBe('Minha Lib');
    expect(libraryName('..\\x\u0001y.json')).toBe('xy');
    expect(libraryName('')).toBe('biblioteca');
    expect(libraryId('Minha Lib Ção')).toBe('minha-lib-cao');
    expect(libraryId('日本')).toMatch(/^lib-[0-9a-f]{8}$/);
  });
});

describe('LibraryStore', () => {
  let dir: string;
  let store: LibraryStore;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'board-libs-'));
    store = new LibraryStore({ dir: join(dir, 'libs') });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('lists nothing when the folder does not exist', () => {
    expect(store.list()).toEqual([]);
  });

  it('imports, lists, finds and removes', () => {
    const lib = store.import('Infra.excalidrawlib', v2([{ name: 'DB', elements: [element('a')] }]));
    expect(lib).toMatchObject({ id: 'infra', name: 'Infra' });
    expect(store.list().map((l) => l.id)).toEqual(['infra']);
    expect(store.find('INFRA')?.id).toBe('infra');
    const found = store.find('infra');
    expect(found && findLibraryItem(found, 'db')?.id).toBeDefined();
    expect(found && findLibraryItem(found, 0)).toBeDefined();
    expect(found && findLibraryItem(found, 5)).toBeUndefined();
    expect(store.remove('infra')).toBe(true);
    expect(store.remove('infra')).toBe(false);
    expect(store.remove('../etc')).toBe(false);
    expect(store.list()).toEqual([]);
  });

  it('replaces a library of the same name and leaves no temp files', () => {
    store.import('A.excalidrawlib', v1([[element('a')]]));
    store.import('A.excalidrawlib', v1([[element('a')], [element('b')]]));
    expect(store.list()[0]?.items).toHaveLength(2);
    expect(readdirSync(join(dir, 'libs'))).toEqual(['a.excalidrawlib']);
  });

  it('refuses an invalid import without touching the folder', () => {
    expect(() => store.import('bad.excalidrawlib', 'nope')).toThrow(LibraryError);
    expect(store.list()).toEqual([]);
  });

  it('skips corrupt files already in the folder', () => {
    store.import('ok.excalidrawlib', v1([[element('a')]]));
    mkdirSync(join(dir, 'libs'), { recursive: true });
    writeFileSync(join(dir, 'libs', 'broken.excalidrawlib'), '{ truncated');
    expect(store.list().map((l) => l.id)).toEqual(['ok']);
  });
});

describe('library IPC', () => {
  it('imports valid libraries, refuses invalid ones and checks the sender', () => {
    const dir = mkdtempSync(join(tmpdir(), 'board-libs-ipc-'));
    try {
      const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
      const trusted = vi.fn();
      registerBoardIpc({
        ipcMain: { handle: (c, l) => void handlers.set(c, l) },
        store: new BoardStore({ dir }),
        libraries: new LibraryStore({ dir: join(dir, 'libs') }),
        trusted,
        target: () => undefined,
      });
      const call = (c: string, ...a: unknown[]) => handlers.get(c)?.({}, ...a);
      expect(call(BOARD_CHANNELS.importLibrary, 'x.excalidrawlib', 'junk')).toMatchObject({
        ok: false,
      });
      expect(call(BOARD_CHANNELS.importLibrary, 7, 'junk')).toMatchObject({ ok: false });
      const ok = call(BOARD_CHANNELS.importLibrary, 'x.excalidrawlib', v1([[element('a')]]));
      expect(ok).toMatchObject({ ok: true, library: { id: 'x' } });
      expect(call(BOARD_CHANNELS.listLibraries)).toHaveLength(1);
      expect(call(BOARD_CHANNELS.removeLibrary, 'x')).toBe(true);
      expect(call(BOARD_CHANNELS.removeLibrary, 5)).toBe(false);
      expect(trusted).toHaveBeenCalled();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('mermaid relay', () => {
  const setup = (target: 'ok' | 'none' | 'destroyed', timeoutMs = 1000) => {
    const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
    const send = vi.fn();
    const relay = createMermaidRelay({
      ipcMain: { handle: (c, l) => void handlers.set(c, l) },
      trusted: () => undefined,
      target: () =>
        target === 'none' ? undefined : { isDestroyed: () => target === 'destroyed', send },
      timeoutMs,
      newId: () => 'req1',
    });
    const answer = (id: unknown, response: unknown) =>
      handlers.get(BOARD_CHANNELS.mermaidResponse)?.({}, id, response);
    return { relay, send, answer };
  };

  it('asks the window and resolves with its skeletons', async () => {
    const { relay, send, answer } = setup('ok');
    const result = relay.convert('graph TD; A-->B');
    expect(send).toHaveBeenCalledWith(BOARD_CHANNELS.mermaidRequest, {
      id: 'req1',
      definition: 'graph TD; A-->B',
    });
    answer('req1', { ok: true, elements: [{ type: 'rectangle' }] });
    await expect(result).resolves.toEqual({ elements: [{ type: 'rectangle' }] });
  });

  it('rejects with the window message on a conversion failure', async () => {
    const { relay, answer } = setup('ok');
    const result = relay.convert('bad');
    answer('req1', { ok: false, message: 'Parse error' });
    await expect(result).rejects.toThrow('Parse error');
    await expect(result).rejects.not.toBeInstanceOf(MermaidUnavailableError);
  });

  it('is unavailable without a window', async () => {
    await expect(setup('none').relay.convert('x')).rejects.toBeInstanceOf(MermaidUnavailableError);
    await expect(setup('destroyed').relay.convert('x')).rejects.toBeInstanceOf(
      MermaidUnavailableError,
    );
  });

  it('times out when the window never answers, and ignores late or forged answers', async () => {
    vi.useFakeTimers();
    try {
      const { relay, answer } = setup('ok', 50);
      const result = relay.convert('x');
      const assertion = expect(result).rejects.toBeInstanceOf(MermaidUnavailableError);
      answer('other', { ok: true, elements: [] });
      await vi.advanceTimersByTimeAsync(60);
      await assertion;
      expect(() => answer('req1', { ok: true, elements: [] })).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });
});
