import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../src/i18n/i18n';
import {
  authorsLabel,
  backgroundOf,
  boardAuthors,
  boardBridgeOf,
  changedElements,
  debounce,
  escapeCloses,
  exportFileName,
  knownOf,
  mergeIncoming,
  parseExcalidrawFile,
  replaceScene,
  type SceneElement,
  serializeExcalidrawFile,
} from '../src/ui/boardLogic';

const el = (id: string, over: Partial<SceneElement> = {}): SceneElement => ({
  id,
  type: 'rectangle',
  version: 1,
  versionNonce: 10,
  isDeleted: false,
  ...over,
});

beforeEach(() => setLocale('pt-BR'));
afterEach(() => setLocale('en'));

describe('boardBridgeOf', () => {
  it('needs the full bridge', () => {
    const board = { load: () => {}, save: () => {}, onChange: () => {}, listLibraries: () => {} };
    expect(boardBridgeOf({ agentsOfficeDesktop: { board } })).toBe(board);
    expect(boardBridgeOf({ agentsOfficeDesktop: { board: { load: () => {} } } })).toBeUndefined();
    expect(boardBridgeOf({})).toBeUndefined();
  });
});

describe('changedElements', () => {
  it('returns only the elements whose version moved', () => {
    const known = knownOf([el('a'), el('b')]);
    expect(
      changedElements([el('a'), el('b', { version: 2 }), el('c')], known).map((e) => e.id),
    ).toEqual(['b', 'c']);
  });
});

describe('mergeIncoming', () => {
  it('higher version wins, ties go to the lower nonce, new elements are appended', () => {
    const merged = mergeIncoming(
      [el('a'), el('b', { version: 3 }), el('c', { versionNonce: 50 })],
      [el('a', { version: 2 }), el('b', { version: 2 }), el('c', { versionNonce: 5 }), el('d')],
    );
    expect(merged.map((e) => [e.id, e.version, e.versionNonce])).toEqual([
      ['a', 2, 10],
      ['b', 3, 10],
      ['c', 1, 5],
      ['d', 1, 10],
    ]);
  });
});

describe('replaceScene', () => {
  it('deletes the old drawing with newer versions and brings the import in', () => {
    const next = replaceScene(
      [el('old', { version: 4 }), el('gone', { isDeleted: true }), el('same', { version: 7 })],
      [el('new'), el('same', { version: 2 })],
    );
    const byId = Object.fromEntries(next.map((e) => [e.id, e]));
    expect(byId.old).toMatchObject({ isDeleted: true, version: 5 });
    expect(byId.new).toMatchObject({ isDeleted: false });
    expect(byId.same?.version).toBe(8);
    expect(byId.gone).toBeUndefined();
  });
});

describe('.excalidraw files', () => {
  it('round-trips a scene', () => {
    const text = serializeExcalidrawFile({
      elements: [el('a')],
      appState: { viewBackgroundColor: '#112233' },
    });
    const parsed = parseExcalidrawFile(text);
    expect(parsed?.elements).toHaveLength(1);
    expect(parsed && backgroundOf(parsed)).toBe('#112233');
  });

  it('rejects anything that is not a scene', () => {
    expect(parseExcalidrawFile('nope')).toBeNull();
    expect(parseExcalidrawFile('{"type":"other","elements":[]}')).toBeNull();
    expect(parseExcalidrawFile('{"type":"excalidraw","elements":[{"id":1}]}')).toBeNull();
  });

  it('only accepts color-like backgrounds and names exports after the project', () => {
    expect(backgroundOf({ elements: [], appState: { viewBackgroundColor: 'url(x)' } })).toBe(
      '#ffffff',
    );
    expect(exportFileName('/home/me/My Project')).toBe('quadro-My-Project.excalidraw');
  });
});

describe('debounce', () => {
  it('coalesces calls, flushes and cancels', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 500);
    debounced();
    debounced();
    vi.advanceTimersByTime(499);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    debounced();
    debounced.flush();
    expect(fn).toHaveBeenCalledTimes(2);
    debounced.flush();
    expect(fn).toHaveBeenCalledTimes(2);
    debounced();
    debounced.cancel();
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});

describe('escapeCloses', () => {
  it('closes on Esc unless typing, in a dialog or already handled', () => {
    const free = { typing: false, dialogOpen: false };
    expect(escapeCloses({ key: 'Escape' }, free)).toBe(true);
    expect(escapeCloses({ key: 'a' }, free)).toBe(false);
    expect(escapeCloses({ key: 'Escape' }, { ...free, typing: true })).toBe(false);
    expect(escapeCloses({ key: 'Escape' }, { ...free, dialogOpen: true })).toBe(false);
    expect(escapeCloses({ key: 'Escape', defaultPrevented: true }, free)).toBe(false);
  });
});

describe('authorship', () => {
  it('lists the agents that drew, once each, ignoring deleted and unsigned elements', () => {
    const by = (name: string, isDeleted = false) => ({
      isDeleted,
      customData: { author: { id: name, name } },
    });
    const names = boardAuthors([by('Ana'), by('Bia'), by('Ana'), by('Gone', true), {}]);
    expect(names).toEqual(['Ana', 'Bia']);
    expect(authorsLabel(names)).toBe('Desenhado por: Ana, Bia');
    expect(authorsLabel([])).toBe('');
    setLocale('en');
    expect(authorsLabel(names)).toBe('Drawn by: Ana, Bia');
    setLocale('es');
    expect(authorsLabel(names)).toBe('Dibujado por: Ana, Bia');
  });
});
