import type { ActorStatus, Profession } from '@agents-office/shared';
import type Phaser from 'phaser';
import { SKIN_KEYS } from '../skin';
import { statusShort } from './identity';
import { DARK_PANEL, drawPanel } from './panel';

export const NAME_TAG_DEPTH = 7;
/** Longest action line (tiny font, 4 px per char) on an expanded tag. */
export const TAG_DETAIL_MAX = 22;

export const ROLE_TAG: Record<Profession, string> = {
  'tech-lead': 'TECH LEAD',
  analyst: 'ANALISTA',
  architect: 'ARQUITETO',
  developer: 'DEV',
  qa: 'QA',
  support: 'SUPORTE',
};

/** Identity colors of each profession (tag stripe, role text). */
export const ROLE_COLOR: Record<Profession, number> = {
  'tech-lead': 0xf2c94c,
  analyst: 0x5fa8f0,
  architect: 0xb49cff,
  developer: 0x58d6c4,
  qa: 0x6fdc7e,
  support: 0xff9f6b,
};

export const STATUS_COLOR: Record<ActorStatus, number> = {
  spawning: 0x9aa3b5,
  thinking: 0xe08a63,
  working: 0x58d36b,
  waiting: 0xf2c94c,
  error: 0xe0584f,
  idle: 0x7b869c,
  finished: 0x58d36b,
  ended: 0x7b869c,
};

const NAME_COLOR = 0xf4f6fb;
const MUTED = 0x8f9ab3;
const ACTION_COLOR = 0xc3cbe0;
const SEPARATOR = 0x2a3250;
/** Inner left padding: stripe (2) + gap. */
const TEXT_X = 6;
const PAD_R = 4;
/** Height of the name row (label font: accent row, 5 px capitals, 2 px descenders). */
const NAME_H = 8;
/** Height of each tiny-font row. */
const SMALL_H = 6;
/** Height of the action row (label font). */
const ACTION_H = 8;

/** Accented letters the label font draws; other accents fall back to the plain letter. */
const LABEL_ACCENTS = new Set('áàâãéêíóôõúç');

/** Mixed-case text for the label font (printable ASCII, its accents, `·` and `…`). */
export function labelText(text: string, max: number): string {
  const chars = Array.from(text.replace(/\s+/g, ' ').trim()).map((ch) => {
    if ((ch >= ' ' && ch <= '~') || ch === '·' || ch === '…' || LABEL_ACCENTS.has(ch)) return ch;
    const plain = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return plain.length === 1 && plain >= ' ' && plain <= '~' ? plain : '?';
  });
  if (chars.length <= max) return chars.join('');
  return `${chars
    .slice(0, Math.max(0, max - 1))
    .join('')
    .trimEnd()}…`;
}

/** Upper-case ASCII only: what the tiny font can draw. */
export function tagText(text: string, max: number): string {
  const ascii = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/…/g, '.')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9 .,:\-/!?+_()'#%&*=<>[\]]/g, ' ')
    .replace(/ +/g, ' ')
    .trim();
  if (ascii.length <= max) return ascii;
  return `${ascii.slice(0, Math.max(0, max - 1)).trimEnd()}.`;
}

export interface TagContent {
  profession: Profession;
  /** Display name (main font). Defaults to the role. */
  name?: string;
  /** Third line of the expanded tag: what the character is doing now. Omitted when empty. */
  detail: string;
  status: ActorStatus | undefined;
  /** Replaces the role label of the second line. */
  role?: string;
  /** Stripe color (defaults to the profession's). */
  color?: number;
  /** Only the name, no role/status line (the player). */
  nameOnly?: boolean;
}

/**
 * The identification plate under every character: a dark glass pill with a stripe in the role
 * color, the status dot and the name (label font). Expanded (player nearby, mouse over, or
 * `?tags=full`) it becomes a card: the role and the status in their colors, then what the
 * character is doing right now.
 */
export class NameTag {
  private readonly box: Phaser.GameObjects.Graphics;
  private readonly name: Phaser.GameObjects.BitmapText;
  private readonly role: Phaser.GameObjects.BitmapText;
  private readonly status: Phaser.GameObjects.BitmapText;
  private readonly detail: Phaser.GameObjects.BitmapText;
  /** The skin has the mixed-case label font (else names fall back to the tiny/main font). */
  private readonly label: boolean;
  private key = '';
  private width = 0;
  private height = NAME_H + 2;
  private statusColor = 0;
  private roleColor = 0;
  private hasDetail = false;
  private nameOnly = false;
  private expanded = false;
  private shown = true;

  constructor(scene: Phaser.Scene, smallFont: boolean) {
    this.label = scene.cache.bitmapFont.exists(SKIN_KEYS.fontLabel);
    const tiny = smallFont ? SKIN_KEYS.fontSmall : SKIN_KEYS.font;
    const labelFont = this.label ? SKIN_KEYS.fontLabel : tiny;
    const text = (font: string, tint: number) =>
      scene.add
        .bitmapText(0, 0, font, '')
        .setOrigin(0, 0)
        .setTint(tint)
        .setDepth(NAME_TAG_DEPTH + 0.1);
    this.box = scene.add.graphics().setDepth(NAME_TAG_DEPTH);
    this.name = text(labelFont, NAME_COLOR);
    this.role = text(tiny, MUTED);
    this.status = text(tiny, MUTED);
    this.detail = text(labelFont, ACTION_COLOR);
  }

  /** Total height in pixels. */
  get tagHeight(): number {
    return this.height;
  }

  set(content: TagContent): void {
    const roleLabel = content.role ?? ROLE_TAG[content.profession];
    const name = content.name ?? roleLabel;
    const detail = this.label
      ? labelText(content.detail, TAG_DETAIL_MAX)
      : tagText(content.detail, TAG_DETAIL_MAX);
    const color = content.color ?? ROLE_COLOR[content.profession];
    const statusColor = content.status ? STATUS_COLOR[content.status] : color;
    const statusText = content.status ? statusShort(content.status) : '';
    const nameOnly = content.nameOnly === true;
    const key = `${name}|${roleLabel}|${statusText}|${detail}|${color}|${statusColor}|${nameOnly}`;
    if (key === this.key) return;
    this.key = key;
    this.name.setText(this.label ? labelText(name, 16) : tagText(name, 16));
    this.role.setText(tagText(roleLabel, 12));
    this.status.setText(statusText ? `· ${statusText}` : '');
    this.detail.setText(detail);
    this.hasDetail = detail !== '';
    this.nameOnly = nameOnly;
    this.roleColor = color;
    this.statusColor = statusColor;
    this.role.setTint(color);
    this.status.setTint(statusColor);
    this.draw();
    this.setVisible(this.shown);
  }

  /** Shows (or hides) the "doing now" line. */
  setExpanded(expanded: boolean): void {
    if (expanded === this.expanded) return;
    this.expanded = expanded;
    this.draw();
    this.setVisible(this.shown);
  }

  /** The role/status row: only on the expanded card (the dot carries the status otherwise). */
  private get roleRow(): boolean {
    return this.expanded && !this.nameOnly;
  }

  private get withDetail(): boolean {
    return this.expanded && this.hasDetail && !this.nameOnly;
  }

  private draw(): void {
    const { roleRow } = this;
    const nameW = 6 + this.name.width;
    const roleW = roleRow ? this.role.width + 2 + this.status.width : 0;
    const detailW = this.withDetail ? this.detail.width : 0;
    this.width = TEXT_X + Math.max(nameW, roleW, detailW) + PAD_R;
    this.height = 3 + NAME_H + (roleRow ? SMALL_H + 1 : 0) + (this.withDetail ? ACTION_H + 2 : 0);
    const { width: w, height: h } = this;
    const g = this.box.clear();
    drawPanel(g, 0, 0, w, h, DARK_PANEL, 2);
    // Role stripe on the left, full height.
    g.fillStyle(this.roleColor, 1).fillRect(1, 2, 2, h - 4);
    g.fillStyle(0xffffff, 0.35).fillRect(1, 2, 1, 1);
    // Status dot (rounded 4x4 with a highlight) before the name.
    const dy = 3;
    g.fillStyle(this.statusColor, 0.28).fillRect(TEXT_X - 1, dy - 1, 6, 6);
    g.fillStyle(this.statusColor, 1)
      .fillRect(TEXT_X, dy + 1, 4, 2)
      .fillRect(TEXT_X + 1, dy, 2, 4);
    g.fillStyle(0xffffff, 0.6).fillRect(TEXT_X + 1, dy + 1, 1, 1);
    if (this.withDetail) {
      const y = 2 + NAME_H + SMALL_H + 1;
      g.fillStyle(SEPARATOR, 1).fillRect(TEXT_X, y, w - TEXT_X - PAD_R + 1, 1);
    }
  }

  /** Centres the tag on `x` with its bottom edge at `bottom` (world pixels). */
  place(x: number, bottom: number, depth: number, alpha: number): void {
    const left = Math.round(x - this.width / 2);
    const top = Math.round(bottom - this.height);
    const textDepth = depth + 0.1;
    this.box.setPosition(left, top).setDepth(depth).setAlpha(alpha);
    this.name
      .setPosition(left + TEXT_X + 6, top + 1)
      .setDepth(textDepth)
      .setAlpha(alpha);
    const roleY = top + 2 + NAME_H;
    this.role
      .setPosition(left + TEXT_X, roleY)
      .setDepth(textDepth)
      .setAlpha(alpha);
    this.status
      .setPosition(left + TEXT_X + this.role.width + 2, roleY)
      .setDepth(textDepth)
      .setAlpha(alpha);
    this.detail
      .setPosition(left + TEXT_X, roleY + SMALL_H + 2)
      .setDepth(textDepth)
      .setAlpha(alpha);
  }

  setVisible(visible: boolean): void {
    this.shown = visible;
    this.box.setVisible(visible);
    this.name.setVisible(visible);
    this.role.setVisible(visible && this.roleRow);
    this.status.setVisible(visible && this.roleRow);
    this.detail.setVisible(visible && this.withDetail);
  }

  destroy(): void {
    this.box.destroy();
    this.name.destroy();
    this.role.destroy();
    this.status.destroy();
    this.detail.destroy();
  }
}
