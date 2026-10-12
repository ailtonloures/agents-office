import type Phaser from 'phaser';
import { SKIN_KEYS } from '../skin';
import { labelText } from '../ui/nameTag';
import { PAPER_PANEL, pixelRoundRect } from '../ui/panel';

/**
 * Status balloons (11x9) drawn procedurally from the pixel maps below, so they need no extra skin
 * assets (original art, CC0 like the rest of the default skin). Speech bubbles for thinking,
 * sleeping and the delivered report; round badges for waiting and errors. `K` outline, `W`
 * white, `w` paper shade, `Y`/`y` amber, `R`/`r` red, `B` blue, `.` transparent.
 */
export const BALLOON_WIDTH = 11;
export const BALLOON_HEIGHT = 9;

export const BALLOON_IDS = ['think', 'wait', 'error', 'sleep', 'doc'] as const;
export type BalloonId = (typeof BALLOON_IDS)[number];

export const BALLOON_PIXELS: Readonly<Record<BalloonId, readonly string[]>> = {
  // "..." inside a speech bubble.
  think: [
    '.KKKKKKKKK.',
    'KWWWWWWWWWK',
    'KWWBWBWBWWK',
    'KWWWWWWWWWK',
    'KwwwwwwwwwK',
    '.KKKKKKKKK.',
    '..KWK......',
    '..KK.......',
    '...........',
  ],
  // Amber badge with an exclamation mark.
  wait: [
    '...KKKKK...',
    '..KYYKYYK..',
    '.KYYYKYYyK.',
    '.KYYYKYYyK.',
    '.KYYYYYYyK.',
    '.KYYYKYYyK.',
    '..KyyyyyK..',
    '...KKKKK...',
    '...........',
  ],
  // Red badge with a white cross.
  error: [
    '...KKKKK...',
    '..KRRRRRK..',
    '.KRWRRRWrK.',
    '.KRRWRWRrK.',
    '.KRRRWRRrK.',
    '.KRRWRWRrK.',
    '..KWrrrWK..',
    '...KKKKK...',
    '...........',
  ],
  // "z" inside a speech bubble.
  sleep: [
    '.KKKKKKKKK.',
    'KWWWWWWWWWK',
    'KWWBBBBWWWK',
    'KWWWWBWWWWK',
    'KWWWBWWWWWK',
    'KwwBBBBwwwK',
    '.KKKKKKKKK.',
    '..KWK......',
    '..KK.......',
  ],
  // Report document with a folded corner.
  doc: [
    '..KKKKKK...',
    '..KWWWWKK..',
    '..KWKKWWKK.',
    '..KWWWWWWK.',
    '..KWKKKKWK.',
    '..KWWWWWWK.',
    '..KwKKKKwK.',
    '..KwwwwwwK.',
    '..KKKKKKKK.',
  ],
};

const COLORS: Readonly<Record<string, string>> = {
  K: '#1b1e2b',
  W: '#ffffff',
  w: '#dfe4ee',
  Y: '#f6c945',
  y: '#d39b1f',
  R: '#e5544b',
  r: '#b8352e',
  B: '#4f8fe8',
};

export const balloonTextureKey = (id: BalloonId): string => `balloon-${id}`;

/** Registers one canvas texture per balloon (idempotent). */
export function createBalloonTextures(textures: Phaser.Textures.TextureManager): void {
  for (const id of BALLOON_IDS) {
    const key = balloonTextureKey(id);
    if (textures.exists(key)) continue;
    const texture = textures.createCanvas(key, BALLOON_WIDTH, BALLOON_HEIGHT);
    if (!texture) continue;
    const ctx = texture.getContext();
    BALLOON_PIXELS[id].forEach((row, y) => {
      Array.from(row).forEach((cell, x) => {
        const color = COLORS[cell];
        if (!color) return;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      });
    });
    texture.refresh();
  }
}

/** How long the visitor's speech bubble shows the message summary, then the "..." balloon. */
export const VISIT_TEXT_MS = 3000;
export const VISIT_DOTS_MS = 1500;
/** Longest summary drawn in a speech bubble. */
export const BUBBLE_TEXT_MAX = 28;

/**
 * What a visitor's balloon shows at `elapsedMs`: the message summary for {@link VISIT_TEXT_MS},
 * then undefined (the "..." balloon) for {@link VISIT_DOTS_MS}, repeating.
 */
export function visitBubbleText(elapsedMs: number, preview: string): string | undefined {
  if (preview.trim() === '') return undefined;
  const phase = Math.max(0, elapsedMs) % (VISIT_TEXT_MS + VISIT_DOTS_MS);
  return phase < VISIT_TEXT_MS ? labelText(preview, BUBBLE_TEXT_MAX) : undefined;
}

const BUBBLE_PAD = 3;
const BUBBLE_TEXT_COLOR = 0x1b1f2b;

/** A small paper speech bubble with a line of text and a tail, anchored at its bottom centre. */
export class TextBubble {
  private readonly box: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.BitmapText;
  private text = '';
  private width = 0;
  private height = 0;

  constructor(scene: Phaser.Scene) {
    const font = scene.cache.bitmapFont.exists(SKIN_KEYS.fontLabel)
      ? SKIN_KEYS.fontLabel
      : scene.cache.bitmapFont.exists(SKIN_KEYS.fontSmall)
        ? SKIN_KEYS.fontSmall
        : SKIN_KEYS.font;
    this.box = scene.add.graphics().setVisible(false);
    this.label = scene.add
      .bitmapText(0, 0, font, '')
      .setOrigin(0, 0)
      .setTint(BUBBLE_TEXT_COLOR)
      .setVisible(false);
  }

  /** Shows `text` with its tail tip at (x, y); undefined hides the bubble. */
  show(text: string | undefined, x: number, y: number, depth: number): void {
    if (text === undefined || text === '') {
      this.box.setVisible(false);
      this.label.setVisible(false);
      return;
    }
    if (text !== this.text) {
      this.text = text;
      this.label.setText(text);
      this.width = Math.ceil(this.label.width) + BUBBLE_PAD * 2;
      this.height = Math.ceil(this.label.height) + BUBBLE_PAD * 2;
    }
    const left = Math.round(x - this.width / 2);
    const top = Math.round(y - 3 - this.height);
    this.box.clear();
    pixelRoundRect(this.box, left, top, this.width, this.height, PAPER_PANEL.border, 1);
    pixelRoundRect(
      this.box,
      left + 1,
      top + 1,
      this.width - 2,
      this.height - 2,
      PAPER_PANEL.fill,
      1,
    );
    this.box.fillStyle(PAPER_PANEL.border, 1).fillRect(Math.round(x) - 1, top + this.height, 3, 1);
    this.box
      .fillStyle(PAPER_PANEL.fill, 1)
      .fillRect(Math.round(x) - 1, top + this.height - 1, 3, 1);
    this.box.fillStyle(PAPER_PANEL.border, 1).fillRect(Math.round(x), top + this.height + 1, 1, 1);
    this.label.setPosition(left + BUBBLE_PAD, top + BUBBLE_PAD);
    this.box.setDepth(depth).setVisible(true);
    this.label.setDepth(depth + 0.1).setVisible(true);
  }

  destroy(): void {
    this.box.destroy();
    this.label.destroy();
  }
}
