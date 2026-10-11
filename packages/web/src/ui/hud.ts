import type Phaser from 'phaser';
import { SKIN_KEYS } from '../skin';
import { HUD_HINTS, type HudCounts, hintPanelX, hudText, type Rect } from './hudLogic';
import { HintRow } from './keyHints';
import { DARK_PANEL, drawPanel } from './panel';
import type { UiOverlay } from './uiOverlay';

export const HUD_DEPTH = 1500;
export const HUD_HEIGHT = 15;
const MARGIN = 6;
const BLINK_MS = 450;
const COLOR_TEXT = 0xeef1f8;
const COLOR_ALERT = 0xf2c94c;
const COLOR_CONNECTED = 0x58d36b;
const COLOR_DISCONNECTED = 0xe0584f;

/**
 * Floating HUD: a status pill at the top left (`n sessões · n agentes · ! n`, the `!` blinks while
 * someone waits, and the connection dot) and the keyboard shortcuts at the top right.
 */
export class Hud {
  private readonly panel: Phaser.GameObjects.Graphics;
  private readonly hintPanel: Phaser.GameObjects.Graphics;
  private readonly hints: HintRow;
  private readonly main: Phaser.GameObjects.BitmapText;
  private readonly alert: Phaser.GameObjects.BitmapText;
  private readonly dot: Phaser.GameObjects.Graphics;
  private blinkMs = 0;
  private waiting = 0;
  private text = '';
  private hidden = false;
  private connected: boolean | undefined;
  private screenWidth = 0;
  private hintRect = { x: 0, y: 0, width: 0, height: 0 };

  constructor(scene: Phaser.Scene, ui: UiOverlay) {
    const fixed = <T extends Phaser.GameObjects.Components.ScrollFactor>(
      object: T,
      depth = 0,
    ): T => {
      object.setScrollFactor(0);
      (object as unknown as Phaser.GameObjects.Components.Depth).setDepth(HUD_DEPTH + depth);
      ui.add(object as unknown as Phaser.GameObjects.GameObject);
      return object;
    };
    this.panel = fixed(scene.add.graphics());
    this.dot = fixed(scene.add.graphics(), 1);
    this.main = fixed(scene.add.bitmapText(0, 0, SKIN_KEYS.font, '').setTint(COLOR_TEXT), 1);
    this.alert = fixed(scene.add.bitmapText(0, 0, SKIN_KEYS.font, '').setTint(COLOR_ALERT), 1);
    this.hintPanel = fixed(scene.add.graphics());
    this.hints = new HintRow(scene);
    fixed(this.hints.container, 1);
    this.hints.set(HUD_HINTS);
    this.layout(scene.scale.width);
  }

  /** The full text currently shown, for the E2E debug state. */
  get shownText(): string {
    return this.text;
  }

  /** Screen rectangles (game pixels) of the status pill and the shortcuts panel, for the debug state. */
  get bounds(): { status: Rect; hints: Rect } {
    return {
      status: { x: MARGIN, y: MARGIN, width: this.statusWidth(), height: HUD_HEIGHT },
      hints: { ...this.hintRect },
    };
  }

  /** Places the hint panel against the right edge of a screen `width` game pixels wide. */
  layout(width: number): void {
    this.screenWidth = width;
    const g = this.hintPanel.clear();
    const w = this.hints.width + 12;
    const x0 = hintPanelX(width, w, MARGIN);
    this.hintRect = { x: x0, y: MARGIN, width: w, height: HUD_HEIGHT };
    // Hide the hints when they would collide with the status pill (narrow windows).
    const visible = !this.hidden && x0 > MARGIN + this.statusWidth() + 8;
    drawPanel(g, x0, MARGIN, w, HUD_HEIGHT, DARK_PANEL);
    this.hints.container.setPosition(x0 + 6, MARGIN + 3);
    g.setVisible(visible);
    this.hints.container.setVisible(visible);
  }

  update(delta: number, counts: HudCounts, connected: boolean): void {
    if (this.hidden) return;
    this.blinkMs += delta;
    const full = hudText(counts);
    if (full !== this.text || connected !== this.connected) {
      const resized = full.length !== this.text.length;
      this.text = full;
      this.connected = connected;
      const split = full.lastIndexOf('!');
      this.main.setText(full.slice(0, split));
      this.alert.setText(full.slice(split));
      this.drawStatus();
      if (resized) this.layout(this.screenWidth);
    }
    this.waiting = counts.waiting;
    const blinkOn = this.waiting === 0 || Math.floor(this.blinkMs / BLINK_MS) % 2 === 0;
    this.alert.setVisible(blinkOn);
    this.alert.setTint(this.waiting > 0 ? COLOR_ALERT : COLOR_TEXT);
  }

  /** Hidden while the camera is zoomed out: fixed-to-screen objects would be scaled with it. */
  setVisible(visible: boolean): void {
    this.hidden = !visible;
    for (const object of [this.panel, this.dot, this.main, this.alert]) object.setVisible(visible);
    this.layout(this.screenWidth);
  }

  destroy(): void {
    for (const object of [this.panel, this.dot, this.main, this.alert, this.hintPanel]) {
      object.destroy();
    }
    this.hints.destroy();
  }

  private statusWidth(): number {
    return 16 + this.main.width + this.alert.width + 6;
  }

  private drawStatus(): void {
    const w = this.statusWidth();
    this.panel.clear();
    drawPanel(this.panel, MARGIN, MARGIN, w, HUD_HEIGHT, DARK_PANEL);
    const color = this.connected ? COLOR_CONNECTED : COLOR_DISCONNECTED;
    const cx = MARGIN + 6;
    const cy = MARGIN + 5;
    // A soft halo around a 3x3 rounded dot.
    this.dot.clear();
    this.dot.fillStyle(color, 0.25).fillRect(cx - 2, cy - 1, 7, 7);
    this.dot
      .fillStyle(color, 1)
      .fillRect(cx - 1, cy + 1, 5, 3)
      .fillRect(cx, cy, 3, 5);
    this.dot.fillStyle(0xffffff, 0.55).fillRect(cx, cy + 1, 1, 1);
    this.main.setPosition(MARGIN + 14, MARGIN + 2);
    this.alert.setPosition(MARGIN + 14 + this.main.width, MARGIN + 2);
  }
}
