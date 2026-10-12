import type Phaser from 'phaser';
import { animationKeyFor, type CharacterFactory } from '../characters/characterFactory';
import { t } from '../i18n/i18n';
import type { Direction } from '../skin';
import { SKIN_KEYS } from '../skin';
import { NameTag } from '../ui/nameTag';
import type { Tile } from '../world/roomLayout';
import { ensureShadow, SHADOW_KEY } from '../world/rugs';
import { type MotionWorld, PlayerMotion, tileAhead } from './playerMotion';

const TILE = 16;
const SPRITE_DEPTH = 4;

/** The user's avatar: a sprite driven by the pure {@link PlayerMotion}. */
export class PlayerAvatar {
  readonly motion: PlayerMotion;
  readonly sprite: Phaser.GameObjects.Sprite;
  private anim = '';
  private readonly shadow: Phaser.GameObjects.Image;
  private readonly tag: NameTag;

  constructor(scene: Phaser.Scene, factory: CharacterFactory, spawn: Tile) {
    this.motion = new PlayerMotion(spawn);
    const { textureKey } = factory.getPlayer();
    this.sprite = scene.add.sprite(0, 0, textureKey, 0).setOrigin(0.5, 1);
    ensureShadow(scene.textures);
    this.shadow = scene.add.image(0, 0, SHADOW_KEY);
    this.tag = new NameTag(scene, scene.cache.bitmapFont.exists(SKIN_KEYS.fontSmall));
    this.tag.set({
      profession: 'architect',
      name: t('player.name'),
      nameOnly: true,
      detail: '',
      status: undefined,
      color: 0xff6b5e,
    });
    this.render();
  }

  get tile(): Tile {
    return this.motion.tile;
  }

  get facing(): Direction {
    return this.motion.facing;
  }

  /** The tile the avatar is looking at (where A interacts). */
  frontTile(): Tile {
    return tileAhead(this.motion.tile, this.motion.facing);
  }

  update(delta: number, input: Direction | undefined, world: MotionWorld, blocked: boolean): void {
    this.motion.update(input, delta, world, blocked);
    this.render();
  }

  teleport(tile: Tile, facing?: Direction): void {
    this.motion.teleport(tile, facing);
    this.render();
  }

  /** World position (pixels) of the sprite's feet. */
  worldPosition(): { x: number; y: number } {
    const p = this.motion.position();
    return { x: Math.round(p.x * TILE + TILE / 2), y: Math.round(p.y * TILE + TILE) };
  }

  setTagVisible(visible: boolean): void {
    this.tag.setVisible(visible);
  }

  destroy(): void {
    this.sprite.destroy();
    this.shadow.destroy();
    this.tag.destroy();
  }

  private render(): void {
    const { x, y } = this.worldPosition();
    this.sprite.setPosition(x, y).setDepth(SPRITE_DEPTH + y / 10_000 + 0.00005);
    this.shadow.setPosition(x, y - 1).setDepth(SPRITE_DEPTH - 0.5 + y / 10_000);
    this.tag.place(x, y + 2 + this.tag.tagHeight, 7 + y / 10_000, 1);
    const animation = this.motion.moving
      ? (`walk-${this.motion.facing}` as const)
      : (`idle-${this.motion.facing}` as const);
    if (animation !== this.anim) {
      this.anim = animation;
      this.sprite.play(animationKeyFor('player', animation));
    }
  }
}
