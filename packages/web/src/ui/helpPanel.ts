import type { ActorStatus, Profession } from '@agents-office/shared';
import type Phaser from 'phaser';
import { type MessageKey, t } from '../i18n/i18n';
import { logicalSizeOf } from '../renderScale';
import { SKIN_KEYS } from '../skin';
import { helpControls } from './hudLogic';
import { HintRow, hintFonts, KEY_COLORS } from './keyHints';
import { DARK_PANEL, drawPanel } from './panel';
import type { UiOverlay } from './uiOverlay';

export const HELP_DEPTH = 2100;
const WIDTH = 236;
const PAD = 10;
const ROW_H = 12;
const GOLD = 0xf2c94c;

const ROLES: readonly [Profession, MessageKey][] = [
  ['tech-lead', 'help.role.techLead'],
  ['developer', 'help.role.developer'],
  ['analyst', 'help.role.analyst'],
  ['architect', 'help.role.architect'],
  ['qa', 'help.role.qa'],
  ['support', 'help.role.support'],
];

const STATUSES: readonly [ActorStatus, MessageKey][] = [
  ['working', 'help.status.working'],
  ['thinking', 'help.status.thinking'],
  ['waiting', 'help.status.waiting'],
  ['error', 'help.status.error'],
  ['idle', 'help.status.idle'],
];

/**
 * The help overlay (H / ?): every control with its key caps, then the legend of the status dots and
 * of the role stripes used by the name tags. Centred, over a dimmed screen.
 */
export class HelpPanel {
  private readonly container: Phaser.GameObjects.Container;
  private readonly dim: Phaser.GameObjects.Rectangle;
  private readonly height: number;
  private open = false;

  constructor(
    scene: Phaser.Scene,
    roleColor: Record<Profession, number>,
    statusColor: Record<ActorStatus, number>,
    ui: UiOverlay,
  ) {
    const fonts = hintFonts(scene);
    const g = scene.add.graphics();
    const items: Phaser.GameObjects.GameObject[] = [g];
    const text = (x: number, y: number, value: string, tint: number, font = fonts.label) => {
      const t = scene.add.bitmapText(x, y, font, value).setTint(tint);
      items.push(t);
      return t;
    };

    let y = PAD;
    text(PAD, y - 2, t('help.title'), KEY_COLORS.text, SKIN_KEYS.font);
    const close = new HintRow(scene);
    close.set([{ keys: ['H'], label: t('help.close') }]);
    close.container.setPosition(WIDTH - PAD - close.width, y);
    items.push(close.container);
    y += 14;
    g.fillStyle(0x2a3250, 1).fillRect(PAD, y - 3, WIDTH - PAD * 2, 1);
    for (const control of helpControls()) {
      const row = new HintRow(scene);
      // Keys on the left column, the action on the right one.
      const keysWidth = row.set([{ keys: control.keys, label: '' }]);
      row.container.setPosition(PAD, y);
      items.push(row.container);
      text(PAD + Math.max(keysWidth + 4, 78), y + 1, control.label, KEY_COLORS.label);
      y += ROW_H;
    }

    y += 4;
    g.fillStyle(0x2a3250, 1).fillRect(PAD, y - 3, WIDTH - PAD * 2, 1);
    text(PAD, y, t('help.statusHeading'), KEY_COLORS.muted, fonts.cap);
    text(PAD + 112, y, t('help.rolesHeading'), KEY_COLORS.muted, fonts.cap);
    y += 9;
    const rows = Math.max(STATUSES.length, Math.ceil(ROLES.length / 2));
    STATUSES.forEach(([status, label], i) => {
      const ry = y + i * 10;
      const color = statusColor[status];
      g.fillStyle(color, 0.28).fillRect(PAD - 1, ry, 6, 6);
      g.fillStyle(color, 1)
        .fillRect(PAD, ry + 2, 4, 2)
        .fillRect(PAD + 1, ry + 1, 2, 4);
      text(PAD + 8, ry, t(label), KEY_COLORS.label);
    });
    ROLES.forEach(([role, label], i) => {
      const col = i % 2;
      const ry = y + Math.floor(i / 2) * 10;
      const rx = PAD + 112 + col * 56;
      g.fillStyle(roleColor[role], 1).fillRect(rx, ry, 2, 7);
      text(rx + 5, ry, t(label), KEY_COLORS.label);
    });
    y += rows * 10 + 2;
    text(PAD, y, t('help.legend'), KEY_COLORS.muted);
    y += 10 + PAD - 2;
    this.height = y;

    // The frame is drawn last (its size is known now) and put at the back of the container.
    const frame = scene.add.graphics();
    drawPanel(frame, 0, 0, WIDTH, this.height, { ...DARK_PANEL, fillAlpha: 0.97 }, 2);
    frame.fillStyle(GOLD, 1).fillRect(PAD, 4, 18, 1);
    items.unshift(frame);

    this.dim = scene.add
      .rectangle(0, 0, 10, 10, 0x05070f, 0.55)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(HELP_DEPTH - 1)
      .setVisible(false);
    this.container = scene.add
      .container(0, 0, items)
      .setScrollFactor(0)
      .setDepth(HELP_DEPTH)
      .setVisible(false);
    ui.add(this.dim, this.container);
    const size = logicalSizeOf(scene);
    this.layout(size.width, size.height);
  }

  get isOpen(): boolean {
    return this.open;
  }

  toggle(): void {
    this.setOpen(!this.open);
  }

  setOpen(open: boolean): void {
    this.open = open;
    this.container.setVisible(open);
    this.dim.setVisible(open);
  }

  layout(width: number, height: number): void {
    this.dim.setSize(width, height);
    this.container.setPosition(
      Math.round((width - WIDTH) / 2),
      Math.max(4, Math.round((height - this.height) / 2)),
    );
  }

  destroy(): void {
    this.container.destroy(true);
    this.dim.destroy();
  }
}
