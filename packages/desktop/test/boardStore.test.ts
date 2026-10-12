import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type BoardElement,
  BoardLimitError,
  BoardStore,
  boardFileName,
  emptyScene,
  liveElements,
  mergeElements,
} from '../src/main/boardStore';

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

describe('BoardStore', () => {
  let dir: string;
  let store: BoardStore;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'board-'));
    store = new BoardStore({ dir });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('starts empty and persists across instances', () => {
    expect(store.load('/p').status).toBe('empty');
    store.set('/p', { ...emptyScene(), elements: [el('a')] });
    const other = new BoardStore({ dir });
    const loaded = other.load('/p');
    expect(loaded.status).toBe('ok');
    expect(loaded.scene.elements.map((e) => e.id)).toEqual(['a']);
  });

  it('keeps one scene per project', () => {
    store.set('/p', { ...emptyScene(), elements: [el('a')] });
    expect(store.get('/q').elements).toEqual([]);
    expect(boardFileName('/a/proj')).not.toBe(boardFileName('/b/proj'));
  });

  it('writes valid .excalidraw JSON and leaves no temp file', () => {
    store.set('/p', { ...emptyScene(), elements: [el('a')] });
    const raw = JSON.parse(readFileSync(store.pathOf('/p'), 'utf8'));
    expect(raw.type).toBe('excalidraw');
    expect(() => readFileSync(`${store.pathOf('/p')}.tmp`)).toThrow();
  });

  it('recovers the last valid version from a corrupt file', () => {
    store.set('/p', { ...emptyScene(), elements: [el('a')] });
    store.set('/p', { ...emptyScene(), elements: [el('a'), el('b')] });
    writeFileSync(store.pathOf('/p'), '{"type":"excalid');
    const fresh = new BoardStore({ dir });
    const loaded = fresh.load('/p');
    expect(loaded.status).toBe('recovered');
    expect(loaded.scene.elements.map((e) => e.id)).toEqual(['a']); // the previous valid one
    // The main file is valid again and the broken one was kept aside.
    expect(new BoardStore({ dir }).load('/p').status).toBe('ok');
    expect(readFileSync(`${store.pathOf('/p')}.corrupt`, 'utf8')).toContain('excalid');
  });

  it('does not overwrite the backup with a corrupt file', () => {
    store.set('/p', { ...emptyScene(), elements: [el('a')] });
    store.set('/p', { ...emptyScene(), elements: [el('a'), el('b')] });
    writeFileSync(store.pathOf('/p'), 'garbage');
    const fresh = new BoardStore({ dir });
    fresh.set('/p', { ...emptyScene(), elements: [el('c')] });
    writeFileSync(fresh.pathOf('/p'), 'garbage again');
    expect(new BoardStore({ dir }).load('/p').scene.elements.map((e) => e.id)).toContain('a');
  });

  it('reports lost when corrupt without any valid copy', () => {
    writeFileSync(store.pathOf('/p'), 'nope');
    expect(store.load('/p')).toEqual({ scene: emptyScene(), status: 'lost' });
  });

  it('rejects structurally invalid scenes as corrupt', () => {
    writeFileSync(
      store.pathOf('/p'),
      JSON.stringify({ type: 'excalidraw', elements: [{ id: 1 }] }),
    );
    expect(store.load('/p').status).toBe('lost');
  });

  it('enforces the element limit without writing', () => {
    const small = new BoardStore({ dir, maxElements: 2 });
    small.set('/p', { ...emptyScene(), elements: [el('a'), el('b')] });
    expect(() =>
      small.set('/p', { ...emptyScene(), elements: [el('a'), el('b'), el('c')] }),
    ).toThrow(BoardLimitError);
    expect(small.get('/p').elements).toHaveLength(2);
    expect(new BoardStore({ dir }).get('/p').elements).toHaveLength(2);
  });

  it('does not count deleted elements and enforces the byte limit', () => {
    const small = new BoardStore({ dir, maxElements: 1, maxBytes: 600 });
    small.set('/p', { ...emptyScene(), elements: [el('a'), el('b', { isDeleted: true })] });
    expect(() =>
      small.set('/p', { ...emptyScene(), elements: [el('a', { text: 'x'.repeat(700) })] }),
    ).toThrow(/KB/);
  });

  it('prunes old tombstones', () => {
    const s = new BoardStore({ dir, maxTombstones: 2 });
    const dead = ['a', 'b', 'c', 'd'].map((id) => el(id, { isDeleted: true }));
    s.set('/p', { ...emptyScene(), elements: [...dead, el('live')] });
    expect(s.get('/p').elements.map((e) => e.id)).toEqual(['c', 'd', 'live']);
  });

  it('notifies listeners with the source and survives a failing one', () => {
    const seen = vi.fn();
    store.onChange(() => {
      throw new Error('boom');
    });
    store.onChange(seen);
    store.merge('/p', [el('a')], 'agent');
    expect(seen).toHaveBeenCalledWith('/p', expect.anything(), 'agent');
  });
});

describe('mergeElements', () => {
  it('keeps the higher version and both sides additions', () => {
    const merged = mergeElements(
      [el('a', { version: 2, x: 1 }), el('b')],
      [el('a', { version: 1, x: 9 }), el('c')],
    );
    expect(merged.map((e) => [e.id, e.x])).toEqual([
      ['a', 1],
      ['b', 0],
      ['c', 0],
    ]);
  });

  it('breaks version ties by the lower nonce and propagates deletion', () => {
    const merged = mergeElements(
      [el('a', { versionNonce: 9 })],
      [el('a', { versionNonce: 3, isDeleted: true })],
    );
    expect(merged[0]?.isDeleted).toBe(true);
    expect(liveElements({ ...emptyScene(), elements: merged })).toEqual([]);
  });
});
