import { type Profession, ProfessionSchema } from '@agents-office/shared';
import Phaser from 'phaser';
import {
  animationKeyFor,
  CHARACTER_ANIMATIONS,
  CharacterFactory,
} from '../characters/characterFactory';
import { logicalSizeOf, renderScaleOf } from '../renderScale';
import { SKIN_KEYS, type Skin } from '../skin';
import { EVENT_SCENE_READY, REGISTRY_SKIN } from './BootScene';

export const DEBUG_CHARACTERS_SCENE = 'CharactersDebugScene';
const COLUMNS = 8;
const VARIATIONS = 4;
const CELL_H = 72;
const SPRITE_SCALE = 2;
const SWITCH_MS = 1500;

/** `?debug=characters`: grid of 6 professions x 4 variations cycling through every animation. */
export class CharactersDebugScene extends Phaser.Scene {
  private readonly sprites: { sprite: Phaser.GameObjects.Sprite; id: string; offset: number }[] =
    [];
  private label!: Phaser.GameObjects.BitmapText;
  private step = -1;
  private timer = 0;

  constructor() {
    super(DEBUG_CHARACTERS_SCENE);
  }

  create(): void {
    this.events.once(Phaser.Scenes.Events.CREATE, () => this.game.events.emit(EVENT_SCENE_READY));
    const { skin } = this.registry.get(REGISTRY_SKIN) as { skin: Skin };
    const factory = new CharacterFactory(this.textures, this.anims, skin);
    const view = logicalSizeOf(this);
    this.cameras.main.setBackgroundColor(0x1d2233).setOrigin(0, 0).setZoom(renderScaleOf(this));

    const cellW = view.width / COLUMNS;
    const professions: Profession[] = ProfessionSchema.options;
    let n = 0;
    for (const profession of professions) {
      for (let v = 0; v < VARIATIONS; v++) {
        const id = `debug-${profession}-${v}`;
        const { textureKey } = factory.get(id, profession);
        const col = n % COLUMNS;
        const row = Math.floor(n / COLUMNS);
        const sprite = this.add
          .sprite(col * cellW + cellW / 2, row * CELL_H + CELL_H / 2 + 4, textureKey, 0)
          .setScale(SPRITE_SCALE);
        this.sprites.push({ sprite, id, offset: n });
        n++;
      }
    }
    this.label = this.add
      .bitmapText(2, view.height - 12, SKIN_KEYS.font, '', 11)
      .setDepth(10)
      .setTint(0xffffff);
    this.advance();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => factory.releaseAll());
  }

  override update(_time: number, delta: number): void {
    this.timer += delta;
    if (this.timer >= SWITCH_MS) {
      this.timer = 0;
      this.advance();
    }
  }

  /** Every character plays a different animation each tick, so all of them show up on screen. */
  private advance(): void {
    this.step++;
    for (const { sprite, id, offset } of this.sprites) {
      const name = CHARACTER_ANIMATIONS[(this.step + offset) % CHARACTER_ANIMATIONS.length];
      if (name) sprite.play(animationKeyFor(id, name));
    }
    this.label.setText(`debug=characters  step ${this.step % CHARACTER_ANIMATIONS.length}`);
  }
}
