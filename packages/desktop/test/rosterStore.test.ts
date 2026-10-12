import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProfileLibrary } from '../src/main/profileLibrary';
import { RosterStore } from '../src/main/rosterStore';

describe('RosterStore', () => {
  let root: string;
  let path: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ao-roster-'));
    path = join(root, 'rosters.json');
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('starts empty with autoReopen on', () => {
    expect(new RosterStore(path).get('/p')).toEqual({ entries: [], autoReopen: true });
  });

  it('adds (idempotently), annotates, toggles and persists', () => {
    const store = new RosterStore(path);
    store.addProfile('/p', 'tech-lead');
    store.addProfile('/p', 'tech-lead');
    store.setNotes('/p', 'tech-lead', 'remember this');
    store.setAutoReopen('/p', false);
    const reloaded = new RosterStore(path).get('/p');
    expect(reloaded.autoReopen).toBe(false);
    expect(reloaded.entries).toHaveLength(1);
    expect(reloaded.entries[0]).toMatchObject({ profileId: 'tech-lead', notes: 'remember this' });
    expect(() => store.setNotes('/p', 'nope', 'x')).toThrow();
  });

  it('persists whether an entry session should reopen (default true)', () => {
    const store = new RosterStore(path);
    store.addProfile('/p', 'a');
    expect(store.get('/p').entries[0]).toMatchObject({ reopen: true });
    store.setReopen('/p', 'a', false);
    store.setReopen('/p', 'unknown', false); // ignored
    expect(new RosterStore(path).get('/p').entries[0]).toMatchObject({ reopen: false });
  });

  it('removes entries and dangling connections', () => {
    const store = new RosterStore(path);
    store.addProfile('/p', 'a');
    store.addProfile('/p', 'b', 'a');
    const roster = store.get('/p');
    const first = roster.entries[0];
    if (first) first.connections = ['b'];
    writeFileSync(path, JSON.stringify({ projects: { '/p': roster } }));
    const reloaded = new RosterStore(path);
    const after = reloaded.remove('/p', 'b');
    expect(after.entries).toHaveLength(1);
    expect(after.entries[0]?.connections).toEqual([]);
  });

  it('backs up a corrupt file and starts empty', () => {
    writeFileSync(path, 'garbage');
    const store = new RosterStore(path);
    expect(store.get('/p').entries).toEqual([]);
    expect(readdirSync(root).some((f) => f.startsWith('rosters.json.corrupt-'))).toBe(true);
    store.addProfile('/p', 'x');
    expect(new RosterStore(path).get('/p').entries).toHaveLength(1);
  });

  it('reflects profile edits in every roster and reports usage', () => {
    const store = new RosterStore(path);
    const lib = new ProfileLibrary({
      dir: join(root, 'profiles'),
      usage: (id) => store.projectsUsing(id),
    });
    const p = lib.create({
      name: 'Dev',
      appearance: {
        base: 'developer',
        hairStyle: 0,
        hairColor: '#000000',
        skinColor: '#ffffff',
        outfitColor: '#123456',
      },
    });
    store.addProfile('/a', p.id);
    store.addProfile('/b', p.id);
    const { id: _id, ...draft } = p;
    lib.update(p.id, { ...draft, name: 'Dev Sênior' });
    for (const cwd of ['/a', '/b']) {
      const entry = store.get(cwd).entries[0];
      expect(entry?.kind === 'profile' && lib.get(entry.profileId)?.name).toBe('Dev Sênior');
    }
    expect(lib.remove(p.id)).toEqual({ deleted: false, usedBy: ['/a', '/b'] });
    expect(lib.remove(p.id, true).deleted).toBe(true);
    store.purgeProfile(p.id);
    expect(store.projectsUsing(p.id)).toEqual([]);
  });
});
