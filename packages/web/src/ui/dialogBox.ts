import type Phaser from 'phaser';
import { SKIN_KEYS } from '../skin';
import { DIALOG_LINES, type DialogPage, pageLength, revealLines } from './dialogContent';
import { drawPanel, PAPER_PANEL } from './panel';

export const DIALOG_DEPTH = 2000;
const BOX_WIDTH = 300;
const BOX_HEIGHT = 52;
const BOTTOM_MARGIN = 8;
const TEXT_X = 14;
const TEXT_Y = 7;
const LINE_HEIGHT = 12;
/** Milliseconds per revealed character. */
const TYPE_MS = 22;
const BLINK_MS = 320;
const INK = 0x1a1d27;
const ACCENT = 0xf2c94c;

/**
 * Dialog box at the bottom of the screen: a paper card with typewriter text and a blinking arrow
 * when the page is complete. Pages come from `dialogContent`.
 */
export class DialogBox {
  private readonly container: Phaser.GameObjects.Container;
  private readonly box: Phaser.GameObjects.Graphics;
  private readonly lines: Phaser.GameObjects.BitmapText[] = [];
  private readonly arrow: Phaser.GameObjects.BitmapText;
  private pages: DialogPage[] = [];
  private pageIndex = 0;
  private typedMs = 0;
  private blinkMs = 0;
  private onClose: (() => void) | undefined;
  private visible = false;

  constructor(scene: Phaser.Scene) {
    this.box = scene.add.graphics();
    // Shadow, ink border and paper; a gold accent bar on the left and a thin rule at the bottom.
    drawPanel(this.box, 0, 0, BOX_WIDTH, BOX_HEIGHT, PAPER_PANEL);
    this.box.fillStyle(0x05070f, 0.2).fillRect(2, BOX_HEIGHT, BOX_WIDTH - 4, 2);
    this.box.fillStyle(ACCENT, 1).fillRect(4, 5, 3, BOX_HEIGHT - 10);
    this.box.fillStyle(0xc89b24, 1).fillRect(4, BOX_HEIGHT - 6, 3, 1);
    this.box.fillStyle(0xe4e0d6, 1).fillRect(TEXT_X, BOX_HEIGHT - 6, BOX_WIDTH - TEXT_X - 10, 1);
    for (let i = 0; i < DIALOG_LINES; i += 1) {
      this.lines.push(
        scene.add.bitmapText(TEXT_X, TEXT_Y + i * LINE_HEIGHT, SKIN_KEYS.font, '').setTint(INK),
      );
    }
    this.arrow = scene.add
      .bitmapText(BOX_WIDTH - 16, BOX_HEIGHT - 17, SKIN_KEYS.font, '▼')
      .setTint(0xc89b24);
    this.container = scene.add
      .container(0, 0, [this.box, ...this.lines, this.arrow])
      .setScrollFactor(0)
      .setDepth(DIALOG_DEPTH)
      .setVisible(false);
    this.layout(scene.scale.width, scene.scale.height);
  }

  /** Centres the box at the bottom of a screen of `width` x `height` game pixels. */
  layout(width: number, height: number): void {
    this.container.setPosition(
      Math.floor((width - BOX_WIDTH) / 2),
      Math.max(0, height - BOX_HEIGHT - BOTTOM_MARGIN),
    );
  }

  get isOpen(): boolean {
    return this.visible;
  }

  /** Every page of the dialog being shown (empty when closed); used by the debug state. */
  get openPages(): readonly DialogPage[] {
    return this.visible ? this.pages : [];
  }

  /** Shows `pages`; `onClose` runs when the dialog is closed (end of pages or B/Esc). */
  open(pages: DialogPage[], onClose?: () => void): void {
    if (pages.length === 0) return;
    this.pages = pages;
    this.pageIndex = 0;
    this.typedMs = 0;
    this.blinkMs = 0;
    this.onClose = onClose;
    this.setVisible(true);
    this.render();
  }

  /** A / Enter / Space: completes the typing, then goes to the next page, then closes. */
  advance(): void {
    if (!this.visible) return;
    if (!this.pageComplete()) {
      this.typedMs = Number.MAX_SAFE_INTEGER;
    } else if (this.pageIndex >= this.pages.length - 1) {
      this.close();
      return;
    } else {
      this.pageIndex += 1;
      this.typedMs = 0;
      this.blinkMs = 0;
    }
    this.render();
  }

  /** B / Esc. */
  close(): void {
    if (!this.visible) return;
    this.setVisible(false);
    const done = this.onClose;
    this.onClose = undefined;
    done?.();
  }

  update(delta: number): void {
    if (!this.visible) return;
    this.typedMs += delta;
    this.blinkMs += delta;
    this.render();
  }

  destroy(): void {
    this.container.destroy();
  }

  private page(): DialogPage {
    return this.pages[this.pageIndex] ?? [];
  }

  private pageComplete(): boolean {
    return Math.floor(this.typedMs / TYPE_MS) >= pageLength(this.page());
  }

  private setVisible(visible: boolean): void {
    this.visible = visible;
    this.container.setVisible(visible);
  }

  private render(): void {
    const shown = revealLines(this.page(), Math.floor(this.typedMs / TYPE_MS));
    this.lines.forEach((line, i) => {
      line.setText(shown[i] ?? '');
    });
    const blinkOn = Math.floor(this.blinkMs / BLINK_MS) % 2 === 0;
    this.arrow.setVisible(this.visible && this.pageComplete() && blinkOn);
  }
}
