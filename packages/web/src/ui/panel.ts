import type Phaser from 'phaser';

/** Colors of a UI panel (rounded pixel corners, 1px border, soft drop shadow). */
export interface PanelStyle {
  fill: number;
  fillAlpha: number;
  border: number;
  /** Bright line inside the top edge (a bevel). */
  highlight: number;
  shadowAlpha: number;
}

/** Dark glass used by the HUD, name tags and toasts. */
export const DARK_PANEL: PanelStyle = {
  fill: 0x141a2c,
  fillAlpha: 0.92,
  border: 0x2e3756,
  highlight: 0x232b45,
  shadowAlpha: 0.32,
};

/** Light paper used by the dialog box. */
export const PAPER_PANEL: PanelStyle = {
  fill: 0xf7f6f2,
  fillAlpha: 1,
  border: 0x1b1f2b,
  highlight: 0xffffff,
  shadowAlpha: 0.35,
};

/** Rectangle with its four corner pixels cut (`radius` 1) or a 2px rounding (`radius` 2). */
export function pixelRoundRect(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  color: number,
  alpha: number,
  radius: 1 | 2 = 1,
): void {
  g.fillStyle(color, alpha);
  if (w <= 2 * radius || h <= 2 * radius) {
    g.fillRect(x, y, w, h);
    return;
  }
  if (radius === 1) {
    g.fillRect(x + 1, y, w - 2, h);
    g.fillRect(x, y + 1, 1, h - 2);
    g.fillRect(x + w - 1, y + 1, 1, h - 2);
    return;
  }
  g.fillRect(x + 2, y, w - 4, h);
  g.fillRect(x + 1, y + 1, 1, h - 2);
  g.fillRect(x + w - 2, y + 1, 1, h - 2);
  g.fillRect(x, y + 2, 1, h - 4);
  g.fillRect(x + w - 1, y + 2, 1, h - 4);
}

/** Draws a panel of `w` x `h` at (`x`, `y`) into `g` (which is not cleared). */
export function drawPanel(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  style: PanelStyle = DARK_PANEL,
  radius: 1 | 2 = 2,
): void {
  if (style.shadowAlpha > 0) pixelRoundRect(g, x, y + 1, w, h, 0x05070f, style.shadowAlpha, radius);
  pixelRoundRect(g, x, y, w, h, style.border, 1, radius);
  pixelRoundRect(g, x + 1, y + 1, w - 2, h - 2, style.fill, style.fillAlpha, 1);
  g.fillStyle(style.highlight, 1).fillRect(x + 2, y + 1, w - 4, 1);
}

/** A key cap (`TAB`, `M`) drawn as a small raised button. Returns its width. */
export function drawKeyCap(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  labelWidth: number,
): number {
  const w = labelWidth + 5;
  pixelRoundRect(g, x, y + 1, w, 8, 0x0a0d18, 1);
  pixelRoundRect(g, x, y, w, 8, 0x3a4466, 1);
  g.fillStyle(0x4a5680, 1).fillRect(x + 1, y, w - 2, 1);
  return w;
}
