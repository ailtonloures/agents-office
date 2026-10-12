import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type ProjectRoster,
  ProjectRosterSchema,
  ROSTER_MAX_CONNECTIONS,
} from '@agents-office/shared';
import { afterEach, describe, expect, it } from 'vitest';
import {
  conectar,
  desconectar,
  pares,
  podeFalar,
  removerEntrada,
  vizinhos,
} from '../src/main/connectionGraph';
import { RosterStore } from '../src/main/rosterStore';

const entry = (id: string, createdBy: string | null = null) => ({
  kind: 'profile' as const,
  profileId: id,
  createdBy,
  connections: [] as string[],
  notes: '',
  reopen: true,
});
const roster = (...ids: string[]): ProjectRoster =>
  ProjectRosterSchema.parse({ entries: ids.map((id) => entry(id)) });

describe('connectionGraph', () => {
  it('has no connection by default', () => {
    const r = roster('a', 'b');
    expect(podeFalar(r, 'a', 'b')).toBe(false);
    expect(pares(r)).toEqual([]);
  });

  it('connections hold in both directions', () => {
    const r = roster('a', 'b', 'c');
    conectar(r, 'a', 'b');
    expect(podeFalar(r, 'a', 'b')).toBe(true);
    expect(podeFalar(r, 'b', 'a')).toBe(true);
    expect(podeFalar(r, 'a', 'c')).toBe(false);
    expect(vizinhos(r, 'b')).toEqual(['a']);
    expect(pares(r)).toEqual([['a', 'b']]);
  });

  it('is idempotent and rejects self links and unknown entries', () => {
    const r = roster('a', 'b');
    conectar(r, 'a', 'b');
    conectar(r, 'b', 'a');
    expect(r.entries.map((e) => e.connections)).toEqual([['b'], ['a']]);
    expect(() => conectar(r, 'a', 'a')).toThrow();
    expect(() => conectar(r, 'a', 'zzz')).toThrow();
    expect(podeFalar(r, 'a', 'a')).toBe(false);
  });

  it('treats a one-sided stored link as bidirectional', () => {
    const r = roster('a', 'b');
    r.entries[0]?.connections.push('b');
    expect(podeFalar(r, 'b', 'a')).toBe(true);
  });

  it('disconnects both sides', () => {
    const r = roster('a', 'b');
    conectar(r, 'a', 'b');
    desconectar(r, 'b', 'a');
    expect(podeFalar(r, 'a', 'b')).toBe(false);
    expect(r.entries.every((e) => e.connections.length === 0)).toBe(true);
  });

  it('removing an entry cascades to every connection and creator link', () => {
    const r = roster('a', 'b', 'c');
    conectar(r, 'a', 'b');
    conectar(r, 'c', 'b');
    const c = r.entries[2];
    if (c) c.createdBy = 'b';
    removerEntrada(r, 'b');
    expect(r.entries.map((e) => e.connections)).toEqual([[], []]);
    expect(r.entries[1]?.createdBy).toBeNull();
    expect(podeFalar(r, 'a', 'b')).toBe(false);
  });

  it('caps connections per agent', () => {
    const ids = Array.from({ length: ROSTER_MAX_CONNECTIONS + 2 }, (_, i) => `p${i}`);
    const r: ProjectRoster = { entries: ids.map((id) => entry(id)), autoReopen: true };
    for (let i = 1; i <= ROSTER_MAX_CONNECTIONS; i++) conectar(r, 'p0', `p${i}`);
    expect(() => conectar(r, 'p0', `p${ROSTER_MAX_CONNECTIONS + 1}`)).toThrow();
  });
});

describe('RosterStore connections', () => {
  let root: string | undefined;
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = undefined;
  });

  it('persists connections per project and cascades on removal', () => {
    root = mkdtempSync(join(tmpdir(), 'ao-graph-'));
    const path = join(root, 'rosters.json');
    const store = new RosterStore(path);
    store.addProfile('/p', 'a');
    store.addProfile('/p', 'b');
    store.addProfile('/q', 'a');
    store.connect('/p', 'a', 'b');
    const reloaded = new RosterStore(path);
    expect(reloaded.canTalk('/p', 'b', 'a')).toBe(true);
    expect(reloaded.canTalk('/q', 'a', 'b')).toBe(false);
    reloaded.remove('/p', 'b');
    expect(reloaded.get('/p').entries[0]?.connections).toEqual([]);
    reloaded.addProfile('/p', 'b');
    expect(reloaded.canTalk('/p', 'a', 'b')).toBe(false);
  });
});
