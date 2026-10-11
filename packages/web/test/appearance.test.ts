import { type Profession, ProfessionSchema } from '@agents-office/shared';
import { describe, expect, it } from 'vitest';
import {
  ACCESSORY_BY_PROFESSION,
  appearanceFor,
  fnv1a,
  PLAYER_LOOK,
} from '../src/characters/appearance';

const combo = (id: string, profession: Profession) => {
  const a = appearanceFor(id, profession);
  return [a.hairStyle, a.skin, a.hairColor, a.shirt, a.pants].join('/');
};

describe('appearanceFor', () => {
  it('is stable: same id gives the same appearance across calls', () => {
    const first = appearanceFor('agent-42', 'developer');
    for (let i = 0; i < 5; i++) expect(appearanceFor('agent-42', 'developer')).toEqual(first);
  });

  it('matches the FNV-1a reference vectors', () => {
    expect(fnv1a('')).toBe(0x811c9dc5);
    expect(fnv1a('a')).toBe(0xe40c292c);
    expect(fnv1a('foobar')).toBe(0xbf9cf968);
  });

  it('spreads 100 ids so no single combination exceeds 20%', () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 100; i++) {
      const key = combo(`agent-${i}-${(i * 7919).toString(16)}`, 'qa');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(20);
    expect(counts.size).toBeGreaterThan(50);
  });

  it('gives each profession its own accessory', () => {
    expect(appearanceFor('x', 'tech-lead').accessory).toBe('tie');
    expect(appearanceFor('x', 'analyst').accessory).toBe('glasses');
    expect(appearanceFor('x', 'architect').accessory).toBe('cap');
    expect(appearanceFor('x', 'developer').accessory).toBe('headphones');
    expect(appearanceFor('x', 'qa').accessory).toBe('badge');
    expect(appearanceFor('x', 'support').accessory).toBe('headset');
    for (const p of ProfessionSchema.options) {
      expect(appearanceFor('y', p).accessory).toBe(ACCESSORY_BY_PROFESSION[p]);
    }
  });

  it('keeps colors independent of the profession', () => {
    const a = appearanceFor('same', 'qa');
    const b = appearanceFor('same', 'support');
    expect({ ...a, profession: 0, accessory: 0 }).toEqual({ ...b, profession: 0, accessory: 0 });
  });
});

describe('PLAYER_LOOK', () => {
  it('uses shirt and pants colors outside the default skin palettes, so it is unique', async () => {
    const { DEFAULT_PALETTES } = await import('../src/skin');
    expect(DEFAULT_PALETTES.shirt).not.toContain(PLAYER_LOOK.shirtColor);
    expect(DEFAULT_PALETTES.pants).not.toContain(PLAYER_LOOK.pantsColor);
    expect(ACCESSORY_BY_PROFESSION[PLAYER_LOOK.profession]).toBe('cap');
  });
});
