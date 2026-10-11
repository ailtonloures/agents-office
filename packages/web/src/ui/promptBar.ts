import type Phaser from 'phaser';
import type { Prompt } from './hudLogic';
import { HintRow } from './keyHints';
import { DARK_PANEL, drawPanel } from './panel';

export const PROMPT_DEPTH = 1600;
const HEIGHT = 15;
const BOTTOM = 8;
const PAD_X = 6;
const FADE_MS = 180;
/** A little gold diamond before tips: "this is a hint, not an action". */
const TIP_ICON = 0xf2c94c;

/**
 * Contextual prompt at the bottom centre of the screen: the action at hand (`[Z] Conversar com
 * Explorer 2`), the dialog keys, or a rotating tip. Fades between contents.
 */
export class PromptBar {
  private readonly panel: Phaser.GameObjects.Graphics;
  private readonly row: HintRow;
  private readonly container: Phaser.GameObjects.Container;
  private key = '';
  private alpha = 0;
  private target = 0;
  private pending: Prompt | undefined;
  private screen = { width: 0, height: 0 };
  private hidden = false;
  private width = 0;

  constructor(scene: Phaser.Scene) {
    this.panel = scene.add.graphics();
    this.row = new HintRow(scene);
    this.container = scene.add
      .container(0, 0, [this.panel, this.row.container])
      .setScrollFactor(0)
      .setDepth(PROMPT_DEPTH)
      .setAlpha(0);
    this.layout(scene.scale.width, scene.scale.height);
  }

  layout(width: number, height: number): void {
    this.screen = { width, height };
    this.place();
  }

  /** Shows `prompt` (or nothing). A change fades the old content out, then the new one in. */
  show(prompt: Prompt | undefined): void {
    const key = JSON.stringify(prompt ?? null);
    if (key === this.key) return;
    this.key = key;
    this.pending = prompt;
    this.target = 0;
  }

  setVisible(visible: boolean): void {
    this.hidden = !visible;
    this.container.setVisible(visible);
  }

  update(delta: number): void {
    const step = delta / FADE_MS;
    if (this.alpha > this.target) this.alpha = Math.max(this.target, this.alpha - step);
    else if (this.alpha < this.target) this.alpha = Math.min(this.target, this.alpha + step);
    // Faded out: swap in the pending content and fade back in.
    if (this.alpha === 0 && this.target === 0 && this.pending !== undefined) {
      this.apply(this.pending);
      this.pending = undefined;
      this.target = 1;
    }
    this.container.setAlpha(this.alpha);
  }

  /** Rendered text of the current prompt (debug state). */
  get shownKey(): string {
    return this.key;
  }

  private apply(prompt: Prompt): void {
    const tip = prompt.text !== undefined && prompt.hints.length === 0;
    const width = this.row.set(prompt.hints, prompt.text);
    const iconW = tip ? 7 : 0;
    const w = width + PAD_X * 2 + iconW;
    const g = this.panel.clear();
    drawPanel(g, 0, 0, w, HEIGHT, DARK_PANEL);
    if (tip) {
      const cx = PAD_X + 2;
      const cy = 7;
      g.fillStyle(TIP_ICON, 1)
        .fillRect(cx, cy - 2, 1, 5)
        .fillRect(cx - 1, cy - 1, 3, 3)
        .fillRect(cx - 2, cy, 5, 1);
    }
    this.row.container.setPosition(PAD_X + iconW, 3);
    this.container.setSize(w, HEIGHT);
    this.width = w;
    this.place();
  }

  private place(): void {
    const { width, height } = this.screen;
    this.container.setPosition(Math.round((width - this.width) / 2), height - BOTTOM - HEIGHT);
    if (!this.hidden) this.container.setVisible(this.width > 0);
  }

  destroy(): void {
    this.row.destroy();
    this.container.destroy(true);
  }
}
