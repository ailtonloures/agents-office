import type { Profession, Appearance as ProfileAppearance } from '@agents-office/shared';

/** Fixed accessory per profession; the names match the accessory art of the default skin. */
export const ACCESSORY_BY_PROFESSION = {
  'tech-lead': 'tie',
  analyst: 'glasses',
  architect: 'cap',
  developer: 'headphones',
  qa: 'badge',
  support: 'headset',
} as const satisfies Record<Profession, string>;
export type Accessory = (typeof ACCESSORY_BY_PROFESSION)[Profession];

/** Size of the index spaces. The factory wraps them (modulo) onto the skin's real lists. */
export const APPEARANCE_RANGES = {
  hairStyle: 7,
  skin: 6,
  hairColor: 7,
  shirt: 8,
  pants: 4,
} as const;

export interface Appearance {
  profession: Profession;
  accessory: Accessory;
  /** Indexes into the skin's hair layers / palettes (wrapped by the factory). */
  hairStyle: number;
  skin: number;
  hairColor: number;
  shirt: number;
  pants: number;
  /**
   * Explicit colors (`#rrggbb`) chosen in a profile; they replace the palette entries picked by
   * `skin`, `hairColor` and `shirt`. Absent for hash-based looks.
   */
  explicit?: { skinColor: string; hairColor: string; outfitColor: string };
}

/** FNV-1a, 32 bits. */
export function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Index in [0, size) for one trait, hashed separately so traits do not correlate. */
function pick(id: string, trait: string, size: number): number {
  return fnv1a(`${trait}:${id}`) % size;
}

/** Stable, pure appearance of an agent: same id and profession always give the same result. */
export function appearanceFor(id: string, profession: Profession): Appearance {
  return {
    profession,
    accessory: ACCESSORY_BY_PROFESSION[profession],
    hairStyle: pick(id, 'hair-style', APPEARANCE_RANGES.hairStyle),
    skin: pick(id, 'skin', APPEARANCE_RANGES.skin),
    hairColor: pick(id, 'hair-color', APPEARANCE_RANGES.hairColor),
    shirt: pick(id, 'shirt', APPEARANCE_RANGES.shirt),
    pants: pick(id, 'pants', APPEARANCE_RANGES.pants),
  };
}

/**
 * Look of an agent from an explicit profile appearance (base, hair style, colors). The traits the
 * profile does not choose (pants) still come from the hash of `id`, so the result is stable.
 */
export function explicitAppearance(id: string, look: ProfileAppearance): Appearance {
  return {
    ...appearanceFor(id, look.base),
    hairStyle: look.hairStyle,
    explicit: {
      skinColor: look.skinColor,
      hairColor: look.hairColor,
      outfitColor: look.outfitColor,
    },
  };
}

/** Stable text key of a look, to tell whether a built texture is still current. */
export function appearanceKey(look: Appearance | undefined): string {
  if (!look) return '';
  const { profession, hairStyle, explicit } = look;
  return explicit
    ? `${profession}|${hairStyle}|${explicit.skinColor}|${explicit.hairColor}|${explicit.outfitColor}`
    : `${profession}|${look.hairStyle}|${look.skin}|${look.hairColor}|${look.shirt}|${look.pants}`;
}

/**
 * The player avatar's fixed look: the architect outfit with its cap (like the protagonist of the
 * classic games), a vivid red shirt and blue pants. The two colors are not in the skin's shirt and
 * pants palettes, so none of the 24 appearance combinations can be mistaken for the player.
 */
export const PLAYER_LOOK = {
  id: 'player',
  profession: 'architect',
  hairStyle: 1,
  skin: 1,
  hairColor: 0,
  shirtColor: '#e0322b',
  pantsColor: '#233a8c',
} as const satisfies { id: string; profession: Profession } & Record<string, unknown>;
