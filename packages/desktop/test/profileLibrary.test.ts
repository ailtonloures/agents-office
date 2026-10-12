import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProfileLibrary } from '../src/main/profileLibrary';

const appearance = {
  base: 'developer' as const,
  hairStyle: 1,
  hairColor: '#112233',
  skinColor: '#f1c9a5',
  outfitColor: '#445566',
};

describe('ProfileLibrary', () => {
  let root: string;
  let dir: string;
  let used: string[] = [];
  const make = () => new ProfileLibrary({ dir, usage: () => used });

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ao-lib-'));
    dir = join(root, 'profiles');
    used = [];
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('seeds the Tech Lead on first run', () => {
    const lib = make();
    expect(lib.list().map((p) => p.id)).toEqual(['tech-lead']);
    expect(readdirSync(dir)).toEqual(['tech-lead.json']);
  });

  it('creates, updates and persists across instances', () => {
    const lib = make();
    const created = lib.create({ name: 'Revisora Ágil', appearance });
    expect(created.id).toBe('revisora-agil');
    lib.update(created.id, { name: 'Revisora', appearance, instructions: 'be nice' });
    const reloaded = make();
    expect(reloaded.get(created.id)).toMatchObject({ name: 'Revisora', instructions: 'be nice' });
  });

  it('rejects duplicate names (case-insensitive) and invalid input', () => {
    const lib = make();
    lib.create({ name: 'Dev', appearance });
    expect(() => lib.create({ name: ' dev ', appearance })).toThrow(/already in use/);
    expect(() => lib.create({ name: '', appearance })).toThrow();
    expect(() => lib.update('tech-lead', { name: 'DEV', appearance })).toThrow(/already in use/);
  });

  it('keeps the Tech Lead id and role when edited', () => {
    const lib = make();
    const edited = lib.update('tech-lead', { name: 'Chefe', appearance, role: 'orquestrador' });
    expect(edited).toMatchObject({ id: 'tech-lead', role: 'padrao', name: 'Chefe' });
  });

  it('duplicates with a unique name', () => {
    const lib = make();
    const a = lib.duplicate('tech-lead');
    const b = lib.duplicate('tech-lead');
    expect(a.name).toBe('Tech Lead (cópia)');
    expect(b.name).toBe('Tech Lead (cópia) 2');
    expect(a.id).not.toBe('tech-lead');
  });

  it('refuses to delete the Tech Lead', () => {
    expect(() => make().remove('tech-lead', true)).toThrow();
  });

  it('warns about projects using a profile and deletes only when forced', () => {
    const lib = make();
    const p = lib.create({ name: 'Dev', appearance });
    used = ['/a', '/b'];
    expect(lib.remove(p.id)).toEqual({ deleted: false, usedBy: ['/a', '/b'] });
    expect(lib.get(p.id)).toBeDefined();
    expect(lib.remove(p.id, true)).toEqual({ deleted: true, usedBy: ['/a', '/b'] });
    expect(make().get(p.id)).toBeUndefined();
  });

  it('backs up corrupt files and recreates the Tech Lead', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'tech-lead.json'), '{not json');
    writeFileSync(join(dir, 'x.json'), JSON.stringify({ id: 'x', name: 'X' }));
    const lib = make();
    expect(lib.list().map((p) => p.id)).toEqual(['tech-lead']);
    const files = readdirSync(dir);
    expect(files.filter((f) => f.includes('.corrupt-'))).toHaveLength(2);
    expect(JSON.parse(readFileSync(join(dir, 'tech-lead.json'), 'utf8')).id).toBe('tech-lead');
  });
});
