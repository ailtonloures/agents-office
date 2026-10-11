import type { Profession } from '@agents-office/shared';
import type Phaser from 'phaser';
import {
  DIRECTIONS,
  type Direction,
  POSE_IDS,
  SKIN_KEYS,
  type Skin,
  TYPING_ALT_POSE,
} from '../skin';
import { type Appearance, appearanceFor, PLAYER_LOOK } from './appearance';
import {
  applyPaletteSwap,
  buildSwapTable,
  hexToRgb,
  lighten,
  outlineFrames,
  type Rgb,
  shade,
} from './palette';

/** Dark ink of the outline; each outline pixel is also tinted by the pixel it borders. */
export const OUTLINE_COLOR: Rgb = [0x1b, 0x1d, 0x2a];
/** How much of the ink goes into the selective outline (the rest is the darkened neighbour). */
const OUTLINE_INK = 0.55;
const SKIN_SHADE_FACTOR = 0.84;

export const WALK_ANIMATIONS = DIRECTIONS.map((d) => `walk-${d}` as const);
export const IDLE_ANIMATIONS = DIRECTIONS.map((d) => `idle-${d}` as const);
/** Every animation registered for a character (names, without the per-character prefix). */
export const CHARACTER_ANIMATIONS = [
  ...WALK_ANIMATIONS,
  ...IDLE_ANIMATIONS,
  ...POSE_IDS,
  'celebrate',
  'sit',
] as const;
export type CharacterAnimation = (typeof CHARACTER_ANIMATIONS)[number];
/** Animations played sitting at the desk (the head is lower in the frame). */
export const SEATED_ANIMATIONS: ReadonlySet<CharacterAnimation> = new Set([
  'sit-type',
  'read',
  'sleep',
  'sit',
]);

const WALK_FPS = 7;
const POSE_FPS = 2;
const TYPE_FPS = 4;
/** Typing with three frames (a, b, a, c) runs a bit faster. */
const TYPE3_FPS = 7;
const SLEEP_FPS = 1.2;
const CELEBRATE_FPS = 6;
/** Idle loop: stand, breathe, stand, blink (ms per frame). Characters start at random points. */
const IDLE_TIMING = [1800, 450, 1500, 130] as const;
/** Seated and still: a long pause, then a single keystroke. */
const SIT_TIMING = [2600, 160] as const;
/** Reading: the page-turn frame shows briefly between long reads. */
const READ_TIMING = [2400, 500] as const;
/** Walk cycle over the 3 frames of a direction: stand, step, stand, other step. */
const WALK_SEQUENCE = [0, 1, 0, 2] as const;
/** The skin has no dedicated celebration pose: turn around on the spot (down, right, up, left). */
const CELEBRATE_DIRECTIONS: readonly Direction[] = ['down', 'right', 'up', 'left'];

export interface BuiltCharacter {
  id: string;
  profession: Profession;
  appearance: Appearance;
  /** Texture key (`char-<id>`) to use with `scene.add.sprite(x, y, textureKey)`. */
  textureKey: string;
}

export const textureKeyFor = (id: string): string => `char-${id}`;
/** Phaser animations are global, so each character's are namespaced by its texture key. */
export const animationKeyFor = (id: string, animation: CharacterAnimation): string =>
  `${textureKeyFor(id)}:${animation}`;

const wrap = <T>(list: readonly T[], index: number): T => list[index % list.length] as T;

/**
 * Builds the composed sprite sheet of a character (`char-<id>`), palette-swapped and outlined,
 * together with its animations. Characters are cached by id until `release`d.
 */
export class CharacterFactory {
  private readonly cache = new Map<string, BuiltCharacter>();

  constructor(
    private readonly textures: Phaser.Textures.TextureManager,
    private readonly anims: Phaser.Animations.AnimationManager,
    private readonly skin: Skin,
  ) {}

  /** Returns the cached character, building it first when needed (or when the profession changed). */
  get(id: string, profession: Profession): BuiltCharacter {
    const cached = this.cache.get(id);
    if (cached?.profession === profession) return cached;
    if (cached) this.release(id);
    const built = this.build(id, profession);
    this.cache.set(id, built);
    return built;
  }

  /** The player avatar (fixed look, see PLAYER_LOOK). */
  getPlayer(): BuiltCharacter {
    const cached = this.cache.get(PLAYER_LOOK.id);
    if (cached) return cached;
    const built = this.build(PLAYER_LOOK.id, PLAYER_LOOK.profession, {
      ...appearanceFor(PLAYER_LOOK.id, PLAYER_LOOK.profession),
      hairStyle: PLAYER_LOOK.hairStyle,
      skin: PLAYER_LOOK.skin,
      hairColor: PLAYER_LOOK.hairColor,
    });
    this.cache.set(PLAYER_LOOK.id, built);
    return built;
  }

  /** Height, in pixels above the feet, of the top of the head (standing or seated). */
  headHeight(seated: boolean): number {
    const { frame, head } = this.skin.characters;
    return frame.height - (seated ? head.seatedTop : head.top);
  }

  has(id: string): boolean {
    return this.cache.has(id);
  }

  /** Frees the texture and the animations of a character that left the office. */
  release(id: string): void {
    if (!this.cache.delete(id)) return;
    for (const name of CHARACTER_ANIMATIONS) this.anims.remove(animationKeyFor(id, name));
    const key = textureKeyFor(id);
    if (this.textures.exists(key)) this.textures.remove(key);
  }

  releaseAll(): void {
    for (const id of [...this.cache.keys()]) this.release(id);
  }

  private build(id: string, profession: Profession, fixed?: Appearance): BuiltCharacter {
    const appearance = fixed ?? appearanceFor(id, profession);
    const key = textureKeyFor(id);
    if (this.textures.exists(key)) this.textures.remove(key);

    const { characters } = this.skin;
    const { width: fw, height: fh } = characters.frame;
    const body = this.textures.get(SKIN_KEYS.body);
    const frameCount = body.frameTotal - 1; // minus Phaser's __BASE frame
    const columns = characters.columns;
    const rows = Math.ceil(frameCount / columns);
    const canvasTexture = this.textures.createCanvas(key, columns * fw, rows * fh);
    if (!canvasTexture) throw new Error(`could not create texture ${key}`);
    const ctx = canvasTexture.getContext();
    ctx.imageSmoothingEnabled = false;

    const hairCount = characters.hair.length;
    const layerKeys = [
      SKIN_KEYS.body,
      SKIN_KEYS.outfit(profession),
      SKIN_KEYS.hair(appearance.hairStyle % hairCount),
      characters.accessory[profession] ? SKIN_KEYS.accessory(profession) : undefined,
    ];
    for (const layerKey of layerKeys) {
      if (!layerKey) continue;
      ctx.drawImage(this.textures.get(layerKey).getSourceImage() as CanvasImageSource, 0, 0);
    }

    const frames = Array.from({ length: frameCount }, (_, i) => ({
      x: (i % columns) * fw,
      y: Math.floor(i / columns) * fh,
      width: fw,
      height: fh,
    }));
    const image = ctx.getImageData(0, 0, canvasTexture.width, canvasTexture.height);
    applyPaletteSwap(image.data, this.swapTable(appearance, fixed !== undefined));
    outlineFrames(image.data, canvasTexture.width, frames, OUTLINE_COLOR, OUTLINE_INK);
    ctx.putImageData(image, 0, 0);

    frames.forEach((f, i) => {
      canvasTexture.add(i, 0, f.x, f.y, f.width, f.height);
    });
    canvasTexture.refresh();

    this.createAnimations(id);
    return { id, profession, appearance, textureKey: key };
  }

  private swapTable(appearance: Appearance, player = false) {
    const { baseColors, palettes } = this.skin.characters;
    const skin = hexToRgb(wrap(palettes.skin, appearance.skin));
    const hair = hexToRgb(wrap(palettes.hair, appearance.hairColor));
    const shirt = hexToRgb(
      player ? PLAYER_LOOK.shirtColor : wrap(palettes.shirt, appearance.shirt),
    );
    const pants = hexToRgb(
      player ? PLAYER_LOOK.pantsColor : wrap(palettes.pants, appearance.pants),
    );
    return buildSwapTable([
      [baseColors.skin, skin],
      [baseColors.skinShade, shade(skin, SKIN_SHADE_FACTOR)],
      [baseColors.skinLight, lighten(skin, 0.25)],
      [baseColors.hair, hair],
      [baseColors.hairShade, shade(hair, 0.7)],
      [baseColors.hairLight, lighten(hair, 0.3)],
      [baseColors.shirt, shirt],
      [baseColors.shirtShade, shade(shirt, 0.76)],
      [baseColors.shirtLight, lighten(shirt, 0.2)],
      [baseColors.pants, pants],
      [baseColors.pantsShade, shade(pants, 0.72)],
      [baseColors.pantsLight, lighten(pants, 0.18)],
    ]);
  }

  private createAnimations(id: string): void {
    const { walk, poses, idle } = this.skin.characters;
    const textureKey = textureKeyFor(id);
    const add = (
      name: CharacterAnimation,
      frames: readonly (number | readonly [number, number])[],
      frameRate: number,
    ) => {
      this.anims.create({
        key: animationKeyFor(id, name),
        // A [frame, ms] pair holds that frame for `ms` (the frame rate is then negligible).
        frames: frames.map((frame) =>
          typeof frame === 'number'
            ? { key: textureKey, frame }
            : { key: textureKey, frame: frame[0], duration: frame[1] },
        ),
        frameRate,
        repeat: -1,
      });
    };
    for (const dir of DIRECTIONS) {
      const [stand] = walk[dir];
      add(
        `walk-${dir}`,
        WALK_SEQUENCE.map((step) => walk[dir][step]),
        WALK_FPS,
      );
      const extra = idle?.[dir];
      if (extra && extra.length > 0) {
        const breathe = extra[0] as number;
        const blink = extra[1] ?? breathe;
        add(
          `idle-${dir}`,
          [
            [stand, IDLE_TIMING[0]],
            [breathe, IDLE_TIMING[1]],
            [stand, IDLE_TIMING[2]],
            [blink, IDLE_TIMING[3]],
          ],
          1000,
        );
      } else {
        add(`idle-${dir}`, [stand], 1);
      }
    }

    const typeB = poses[TYPING_ALT_POSE];
    const typeC = poses['sit-type-c'];
    if (typeB !== undefined && typeC !== undefined) {
      add('sit-type', [poses['sit-type'], typeB, poses['sit-type'], typeC], TYPE3_FPS);
    } else if (typeB !== undefined) add('sit-type', [poses['sit-type'], typeB], TYPE_FPS);
    else add('sit-type', [poses['sit-type']], POSE_FPS);

    // Seated, hands on the keyboard but still (thinking, waiting, error): a rare keystroke.
    const sitFrames: (number | readonly [number, number])[] = [[poses['sit-type'], SIT_TIMING[0]]];
    if (typeB !== undefined) sitFrames.push([typeB, SIT_TIMING[1]]);
    add('sit', sitFrames, 1000);

    const readB = poses['read-b'];
    if (readB !== undefined) {
      add(
        'read',
        [
          [poses.read, READ_TIMING[0]],
          [readB, READ_TIMING[1]],
        ],
        1000,
      );
    } else add('read', [poses.read], POSE_FPS);

    add('phone', [poses.phone], POSE_FPS);
    const sleepB = poses['sleep-b'];
    add('sleep', sleepB !== undefined ? [poses.sleep, sleepB] : [poses.sleep], SLEEP_FPS);

    const cheer = poses.celebrate;
    if (cheer !== undefined) {
      add('celebrate', [cheer, poses['celebrate-b'] ?? cheer], CELEBRATE_FPS);
    } else {
      // Older skins have no celebration pose: turn around on the spot.
      add(
        'celebrate',
        CELEBRATE_DIRECTIONS.map((dir) => walk[dir][0]),
        CELEBRATE_FPS,
      );
    }
  }
}
