import type Phaser from 'phaser';
import { SKIN_KEYS } from '../skin';
import type { KeyHint } from './hudLogic';
import { pixelRoundRect } from './panel';

export const KEY_COLORS = {
  text: 0xeef1f8,
  label: 0xc3cbe0,
  muted: 0x8b95ad,
  capFace: 0x3a4466,
  capTop: 0x56628f,
  capSide: 0x0a0d18,
  capText: 0xffffff,
} as const;

/** Height of a key cap (face 8 + 1 px side). */
export const KEY_CAP_H = 9;

/** A raised key cap with a lit top edge and a dark side: `w` x 9 at (x, y). */
export function drawKeyCapAt(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number) {
  pixelRoundRect(g, x, y + 1, w, 8, KEY_COLORS.capSide, 1);
  pixelRoundRect(g, x, y, w, 8, KEY_COLORS.capFace, 1);
  g.fillStyle(KEY_COLORS.capTop, 1).fillRect(x + 1, y, w - 2, 1);
}

/** Fonts used by the hints: tiny capitals in the caps, the label face (or fallbacks) after them. */
export function hintFonts(scene: Phaser.Scene): { cap: string; label: string } {
  const has = (key: string) => scene.cache.bitmapFont.exists(key);
  const cap = has(SKIN_KEYS.fontSmall) ? SKIN_KEYS.fontSmall : SKIN_KEYS.font;
  const label = has(SKIN_KEYS.fontLabel) ? SKIN_KEYS.fontLabel : cap;
  return { cap, label };
}

/**
 * A row of key hints (`[Z] Conversar  [X] Fechar`) built inside a container: caps drawn in a
 * Graphics, their text and the labels as bitmap texts. `set` rebuilds it; `width` is the result.
 */
export class HintRow {
  readonly container: Phaser.GameObjects.Container;
  private readonly g: Phaser.GameObjects.Graphics;
  private texts: Phaser.GameObjects.BitmapText[] = [];
  private key = '';
  width = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly labelFont?: string,
    private readonly labelTint: number = KEY_COLORS.label,
  ) {
    this.g = scene.add.graphics();
    this.container = scene.add.container(0, 0, [this.g]);
  }

  /** Lays out `hints` (and an optional trailing `text`) from x = 0; returns the width. */
  set(hints: readonly KeyHint[], text?: string, gap = 8): number {
    const key = JSON.stringify([hints, text, gap]);
    if (key === this.key) return this.width;
    this.key = key;
    for (const t of this.texts) t.destroy();
    this.texts = [];
    const g = this.g.clear();
    const fonts = hintFonts(this.scene);
    const labelFont = this.labelFont ?? fonts.label;
    let x = 0;
    hints.forEach((hint, index) => {
      if (index > 0) x += gap;
      hint.keys.forEach((name, k) => {
        if (k > 0) {
          const slash = this.text(fonts.cap, '/', KEY_COLORS.muted, x + 1, 2);
          x += slash.width + 3;
        }
        const label = this.text(fonts.cap, name, KEY_COLORS.capText, 0, 2);
        const w = label.width + 5;
        drawKeyCapAt(g, x, 0, w);
        label.setX(x + 3);
        x += w;
      });
      x += 4;
      const label = this.text(labelFont, hint.label, this.labelTint, x, 0);
      x += label.width;
    });
    if (text) {
      if (hints.length > 0) x += gap;
      const tip = this.text(labelFont, text, this.labelTint, x, 0);
      x += tip.width;
    }
    this.width = x;
    return x;
  }

  private text(font: string, value: string, tint: number, x: number, y: number) {
    const t = this.scene.add.bitmapText(x, y, font, value).setTint(tint);
    this.texts.push(t);
    this.container.add(t);
    return t;
  }

  destroy(): void {
    this.container.destroy(true);
    this.texts = [];
  }
}
