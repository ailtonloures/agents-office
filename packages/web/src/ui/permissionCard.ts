import type { OfficeModel, PermissionDecision, PermissionRequest } from '@agents-office/shared';
import type Phaser from 'phaser';
import { SKIN_KEYS } from '../skin';
import { hintFonts, KEY_COLORS } from './keyHints';
import { DARK_PANEL, drawPanel, pixelRoundRect } from './panel';
import {
  type CardChoice,
  cardContent,
  decisionFor,
  editReason,
  queueView,
  shortcutFor,
  TERMINAL_HINT,
} from './permissionLogic';

export const PERMISSION_CARD_DEPTH = 1700;
const WIDTH = 280;
const HEIGHT = 104;
const TOP = 26;
const PAD = 10;
const SUMMARY_LINES = 3;
const BLINK_MS = 420;
const PULSE_MS = 700;
const GOLD = 0xf2c94c;
const BUTTON_H = 14;
const BUTTON_Y = HEIGHT - PAD - BUTTON_H + 2;
const BUTTON_GAP = 6;

interface ButtonSpec {
  key: string;
  label: string;
  color: number;
  action: () => void;
}

interface PlacedButton extends ButtonSpec {
  x: number;
  width: number;
}

/**
 * The permission card: a dark GBC panel at the top centre of the screen (it never takes the
 * movement keys) with who is asking, the tool and a short summary, and three buttons, Approve (Y),
 * Deny (N, which asks for an optional reason first) and Leave to the terminal (T, which only
 * dismisses the card: the terminal prompt is on screen in parallel). Shows the oldest request and
 * "+N na fila". Mouse and keyboard.
 */
export class PermissionCard {
  private readonly container: Phaser.GameObjects.Container;
  private readonly frame: Phaser.GameObjects.Graphics;
  private readonly buttonsGfx: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.BitmapText;
  private readonly queueText: Phaser.GameObjects.BitmapText;
  private readonly who: Phaser.GameObjects.BitmapText;
  private readonly tool: Phaser.GameObjects.BitmapText;
  private readonly summary: Phaser.GameObjects.BitmapText[] = [];
  private readonly hint: Phaser.GameObjects.BitmapText;
  private readonly reasonText: Phaser.GameObjects.BitmapText;
  private buttonTexts: Phaser.GameObjects.BitmapText[] = [];
  private buttons: PlacedButton[] = [];
  private queue: readonly PermissionRequest[] = [];
  private model: OfficeModel | undefined;
  private contentKey = '';
  private typing = false;
  private reason = '';
  private hidden = false;
  private clockMs = 0;
  private x = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly onDecide: (id: string, decision: PermissionDecision) => void,
  ) {
    const fonts = hintFonts(scene);
    this.frame = scene.add.graphics();
    this.buttonsGfx = scene.add.graphics();
    const text = (y: number, tint: number, font: string = SKIN_KEYS.font) =>
      scene.add.bitmapText(PAD, y, font, '').setTint(tint);
    this.title = text(6, GOLD);
    this.queueText = text(6, KEY_COLORS.muted);
    this.who = text(20, KEY_COLORS.label, fonts.label);
    this.tool = text(31, KEY_COLORS.text);
    for (let i = 0; i < SUMMARY_LINES; i += 1) this.summary.push(text(43 + i * 10, 0xdfe5f5));
    this.hint = text(HEIGHT - PAD - BUTTON_H - 10, KEY_COLORS.muted, fonts.label);
    this.reasonText = text(BUTTON_Y - 24, KEY_COLORS.text);
    this.container = scene.add
      .container(0, TOP, [
        this.frame,
        this.buttonsGfx,
        this.title,
        this.queueText,
        this.who,
        this.tool,
        ...this.summary,
        this.hint,
        this.reasonText,
      ])
      .setScrollFactor(0)
      .setDepth(PERMISSION_CARD_DEPTH)
      .setVisible(false);
    this.layout(scene.scale.width);
  }

  /** The card is on screen (a request is pending and the card is not hidden). */
  get isOpen(): boolean {
    return this.queue.length > 0 && !this.hidden;
  }

  /** The reason field has the keyboard: movement and the other shortcuts must stay quiet. */
  get isTyping(): boolean {
    return this.typing && this.queue.length > 0;
  }

  get current(): PermissionRequest | undefined {
    return queueView(this.queue).current;
  }

  /** Card rectangle in game (screen) pixels. */
  get rect(): { x: number; y: number; width: number; height: number } {
    return { x: this.x, y: TOP, width: WIDTH, height: HEIGHT };
  }

  layout(width: number): void {
    this.x = Math.max(0, Math.floor((width - WIDTH) / 2));
    this.container.setPosition(this.x, TOP);
  }

  /** Hidden while the camera is zoomed out (fixed objects would be scaled with it). */
  setVisible(visible: boolean): void {
    this.hidden = !visible;
    this.container.setVisible(this.isOpen);
  }

  /** Feeds the pending queue (oldest first) and the model used for names. */
  set(queue: readonly PermissionRequest[], model: OfficeModel): void {
    this.model = model;
    const before = this.current?.id;
    this.queue = queue;
    if (this.current?.id !== before) {
      // A different request (the answered one went away, e.g. in the terminal): start clean.
      this.typing = false;
      this.reason = '';
    }
    this.render();
  }

  update(delta: number): void {
    if (!this.isOpen) return;
    this.clockMs += delta;
    this.drawFrame();
    if (this.typing) this.drawReason();
  }

  /** Keyboard. Returns true when the key was for the card (nothing else should act on it). */
  handleKey(event: KeyboardEvent): boolean {
    if (!this.isOpen) return false;
    if (this.typing) {
      if (event.key === 'Enter') this.decide('deny', this.reason);
      else if (event.key === 'Escape') this.cancelReason();
      else {
        this.reason = editReason(this.reason, event);
        this.drawReason();
      }
      return true;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return false;
    const choice = shortcutFor(event.key);
    if (!choice) return false;
    this.choose(choice);
    return true;
  }

  /** Mouse (screen coordinates). Returns true when a button was hit. */
  handlePointer(screenX: number, screenY: number): boolean {
    if (!this.isOpen) return false;
    const x = screenX - this.x;
    const y = screenY - TOP;
    const hit = this.buttons.find(
      (b) => x >= b.x && x < b.x + b.width && y >= BUTTON_Y && y < BUTTON_Y + BUTTON_H,
    );
    if (hit) {
      hit.action();
      return true;
    }
    return x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT; // clicks on the card never reach the world
  }

  destroy(): void {
    this.container.destroy(true);
  }

  private choose(choice: CardChoice): void {
    if (choice === 'deny') {
      this.typing = true;
      this.reason = '';
      this.contentKey = '';
      this.render();
      return;
    }
    this.decide(choice);
  }

  private cancelReason(): void {
    this.typing = false;
    this.reason = '';
    this.contentKey = '';
    this.render();
  }

  private decide(choice: CardChoice, reason = ''): void {
    const current = this.current;
    if (!current) return;
    this.typing = false;
    this.reason = '';
    this.contentKey = '';
    this.onDecide(current.id, decisionFor(choice, reason));
  }

  private render(): void {
    const { current, more } = queueView(this.queue);
    const model = this.model;
    this.container.setVisible(current !== undefined && !this.hidden);
    if (!current || !model) {
      this.contentKey = '';
      return;
    }
    const content = cardContent(model, current, more);
    const key = JSON.stringify([current.id, content, this.typing]);
    if (key === this.contentKey) return;
    this.contentKey = key;
    this.title.setText('! Pedido de permissão');
    this.queueText.setText(content.queue);
    this.queueText.setX(WIDTH - PAD - this.queueText.width);
    this.who.setText(content.who);
    this.tool.setText(content.tool);
    this.summary.forEach((line, i) => {
      line.setText(content.summary[i] ?? '');
    });
    this.hint.setText(this.typing ? 'Motivo para o Claude (opcional):' : TERMINAL_HINT);
    this.hint.setTint(this.typing ? KEY_COLORS.label : KEY_COLORS.muted);
    this.setButtons(
      this.typing
        ? [
            {
              key: 'ENTER',
              label: 'Negar',
              color: 0xb23a3a,
              action: () => this.decide('deny', this.reason),
            },
            { key: 'ESC', label: 'Voltar', color: 0x3a4466, action: () => this.cancelReason() },
          ]
        : [
            { key: 'Y', label: 'Aprovar', color: 0x2f8f4e, action: () => this.choose('allow') },
            { key: 'N', label: 'Negar', color: 0xb23a3a, action: () => this.choose('deny') },
            { key: 'T', label: 'Terminal', color: 0x3a4466, action: () => this.choose('defer') },
          ],
    );
    this.drawReason();
    this.drawFrame();
  }

  private setButtons(specs: readonly ButtonSpec[]): void {
    for (const t of this.buttonTexts) t.destroy();
    this.buttonTexts = [];
    const g = this.buttonsGfx.clear();
    const inner = WIDTH - PAD * 2;
    const width = Math.floor((inner - BUTTON_GAP * (specs.length - 1)) / specs.length);
    this.buttons = specs.map((spec, i) => ({
      ...spec,
      x: PAD + i * (width + BUTTON_GAP),
      width,
    }));
    for (const b of this.buttons) {
      pixelRoundRect(g, b.x, BUTTON_Y + 1, b.width, BUTTON_H, 0x05070f, 0.6);
      pixelRoundRect(g, b.x, BUTTON_Y, b.width, BUTTON_H, b.color, 1);
      g.fillStyle(0xffffff, 0.22).fillRect(b.x + 1, BUTTON_Y, b.width - 2, 1);
      const label = this.scene.add
        .bitmapText(0, BUTTON_Y + 3, SKIN_KEYS.font, `[${b.key}] ${b.label}`)
        .setTint(0xffffff);
      label.setPosition(b.x + Math.floor((b.width - label.width) / 2), BUTTON_Y + 3);
      this.container.add(label);
      this.buttonTexts.push(label);
    }
  }

  private drawReason(): void {
    if (!this.typing) {
      this.reasonText.setText('');
      return;
    }
    const cursor = Math.floor(this.clockMs / BLINK_MS) % 2 === 0 ? '_' : ' ';
    const shown = this.reason.length > 40 ? `…${this.reason.slice(-39)}` : this.reason;
    this.reasonText.setText(`> ${shown}${cursor}`);
  }

  /** Panel with a gold border that pulses: a strong "look here" even in a busy office. */
  private drawFrame(): void {
    const g = this.frame.clear();
    const pulse = 0.5 + 0.5 * Math.sin((this.clockMs / PULSE_MS) * Math.PI * 2);
    drawPanel(g, 0, 0, WIDTH, HEIGHT, { ...DARK_PANEL, fillAlpha: 0.97 }, 2);
    g.lineStyle(1, GOLD, 0.35 + 0.65 * pulse).strokeRect(0.5, 0.5, WIDTH - 1, HEIGHT - 1);
    g.fillStyle(GOLD, 1).fillRect(PAD, 3, 18, 1);
  }
}
