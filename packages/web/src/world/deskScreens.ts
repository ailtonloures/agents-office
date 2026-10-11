import type Phaser from 'phaser';
import type { Activity } from '../characters/characterMachine';
import type { PropFrame } from '../skin/schema';
import { isWallProp, PROP_DEFS, type PropPlacement } from './props';
import type { BuildingLayout, Tile } from './roomLayout';
import { drawScreen, SCREEN_FPS, SCREEN_GLOW, type ScreenMode, screenModeFor } from './screenArt';

const TILE = 16;

/** A character sitting at a workstation, as the screens see it. */
export interface SeatedWorker {
  tile: Tile;
  activity: Activity;
}

interface ScreenRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Slot {
  graphics: Phaser.GameObjects.Graphics;
  /** World rectangles of the monitors (the first one shows the activity). */
  rects: ScreenRect[];
  seed: number;
  /** `modes|frame` last drawn: redraw only when it changes. */
  drawn: string;
}

const keyOf = (tile: Tile): string => `${tile.x},${tile.y}`;

/** Props with a computer: a seat right below their footprint uses their monitors. */
function hasComputer(prop: PropPlacement): boolean {
  return (
    !isWallProp(prop.id) && (PROP_DEFS[prop.id].fallback as readonly string[]).includes('computer')
  );
}

/**
 * The second monitor of a desk: the Tech Lead's dashboard while it works, otherwise the same
 * content as the main one (asleep, waiting, failing: the whole desk says it).
 */
export function secondaryMode(primary: ScreenMode): ScreenMode {
  if (primary === 'off' || primary === 'sleep' || primary === 'wait' || primary === 'error') {
    return primary;
  }
  return primary === 'summon' ? 'summon' : 'dashboard';
}

/**
 * Animated monitor content over every workstation of the props atlas (skins that declare the
 * monitors' `screens` rectangles): dark while the seat is empty, then code, a terminal, a page,
 * a browser... depending on what the seated character is doing.
 */
export class DeskScreens {
  /** By seat tile. */
  private readonly slots = new Map<string, Slot>();
  private clock = 0;
  private visible = true;

  constructor(private readonly scene: Phaser.Scene) {}

  sync(layout: BuildingLayout, frames: Readonly<Record<string, PropFrame>> | undefined): void {
    const wanted = new Set<string>();
    for (const desk of layout.desks) {
      const seat = desk.tile;
      const prop = layout.props.find(
        (p) =>
          hasComputer(p) && p.y === seat.y - 1 && seat.x >= p.x && seat.x < p.x + PROP_DEFS[p.id].w,
      );
      const frame = prop ? frames?.[prop.id] : undefined;
      if (!prop || !frame?.screens?.length) continue;
      const key = keyOf(seat);
      wanted.add(key);
      const left = prop.x * TILE;
      const bottom = (prop.y + 1) * TILE;
      const rects = frame.screens.map((s) => ({
        x: left + s.x,
        y: bottom + s.y,
        w: s.w,
        h: s.h,
      }));
      const existing = this.slots.get(key);
      if (existing && JSON.stringify(existing.rects) === JSON.stringify(rects)) continue;
      existing?.graphics.destroy();
      // Right above the desk image (same depth formula as the props), under the seated character.
      const graphics = this.scene.add
        .graphics()
        .setDepth(4 + (bottom - 0.4) / 10_000)
        .setVisible(this.visible);
      this.slots.set(key, { graphics, rects, seed: seat.x * 31 + seat.y * 17, drawn: '' });
    }
    for (const [key, slot] of this.slots) {
      if (wanted.has(key)) continue;
      slot.graphics.destroy();
      this.slots.delete(key);
    }
  }

  /**
   * Redraws the screens whose content changed. Returns the glow of each lit monitor (its seat
   * tile and color) for the lighting.
   */
  update(delta: number, workers: readonly SeatedWorker[]): { tile: Tile; color: number }[] {
    this.clock += delta;
    const frame = Math.floor((this.clock / 1000) * SCREEN_FPS);
    const bySeat = new Map(workers.map((w) => [keyOf(w.tile), w.activity]));
    const glows: { tile: Tile; color: number }[] = [];
    for (const [key, slot] of this.slots) {
      const activity = bySeat.get(key);
      const primary: ScreenMode = activity ? screenModeFor(activity) : 'off';
      const modes = slot.rects.map((_, i) => (i === 0 ? primary : secondaryMode(primary)));
      const animated = modes.some((m) => m !== 'off');
      const stamp = `${modes.join(',')}|${animated ? frame : 0}`;
      const glow = SCREEN_GLOW[primary];
      if (glow !== undefined) {
        const [x = 0, y = 0] = key.split(',').map(Number);
        glows.push({ tile: { x, y }, color: glow });
      }
      if (stamp === slot.drawn) continue;
      slot.drawn = stamp;
      const g = slot.graphics.clear();
      slot.rects.forEach((rect, i) => {
        const put = (x: number, y: number, w: number, h: number, color: number) => {
          g.fillStyle(color, 1).fillRect(rect.x + x, rect.y + y, w, h);
        };
        drawScreen(put, modes[i] ?? 'off', rect.w, rect.h, frame + i * 7, slot.seed + i * 101);
        // Glass reflection in the top-left corner.
        g.fillStyle(0xffffff, 0.1).fillRect(rect.x, rect.y, 1, Math.min(3, rect.h));
      });
    }
    return glows;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    for (const slot of this.slots.values()) slot.graphics.setVisible(visible);
  }

  destroy(): void {
    for (const slot of this.slots.values()) slot.graphics.destroy();
    this.slots.clear();
  }
}
