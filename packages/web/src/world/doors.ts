import type Phaser from 'phaser';
import type { PropFrame } from '../skin/schema';
import { type BuildingLayout, type Door, type Tile, WALL_ROWS } from './roomLayout';

const TILE = 16;
/** Depth of the characters at y = 0 (`SPRITE_DEPTH` of the controller and the player). */
const SPRITE_DEPTH = 4;
/** Frames of the door in the props atlas: `door-0` (closed) .. `door-<n-1>` (open). */
export const DOOR_FRAME_PREFIX = 'door-';
/** Back layer of the door (the doorway and the wall's thickness), under the characters. */
export const DOOR_BACK_FRAME = 'door-back';
/**
 * Time per frame while the door slides (6 frames: 180 ms to open or close). Set by the player's
 * step (`PLAYER_STEP_MS`, 200 ms per tile): someone who steps from the corridor towards a
 * closed door finds it fully open by the time their feet reach the first wall row, even with 16 ms
 * game frames (5 frames x 36 ms = 12 frames of 16 ms = 192 ms).
 */
export const DOOR_FRAME_MS = 36;
/** The door stays open this long after the last one walked away. */
export const DOOR_CLOSE_DELAY_MS = 350;
/** Someone opens the door within this many tiles of its column, across... */
const NEAR_X = 1;
/** ...and this many tiles above or below its opening (the corridor and the room). */
const NEAR_Y = 2;

/**
 * Whether someone at one of `points` (tile coordinates, fractional while walking) is close enough
 * to `door` for it to open: on its column or the next one, at most {@link NEAR_Y} tiles from the
 * opening, which runs through the whole top wall.
 */
export function doorShouldOpen(door: Door, points: readonly Tile[]): boolean {
  const top = door.tile.y - WALL_ROWS + 1;
  const bottom = door.tile.y;
  return points.some((p) => {
    const dx = Math.abs(p.x - door.tile.x);
    const dy = Math.max(0, top - p.y, p.y - bottom);
    return dx <= NEAR_X && dy <= NEAR_Y;
  });
}

/** Motion state of one door: the frame shown and how long nobody has been near it. */
export interface DoorMotion {
  /** Frame shown, 0 (closed) .. frames - 1 (open). */
  frame: number;
  /** Time accumulated towards the next frame. */
  stepMs: number;
  /** Time since nobody is near (the door closes after {@link DOOR_CLOSE_DELAY_MS}). */
  awayMs: number;
}

export const closedDoor = (): DoorMotion => ({ frame: 0, stepMs: 0, awayMs: DOOR_CLOSE_DELAY_MS });

/**
 * Advances a door by `delta` ms: it slides one frame per {@link DOOR_FRAME_MS} towards open while
 * someone is near, and back to closed {@link DOOR_CLOSE_DELAY_MS} after the last one left. It can
 * turn around halfway. Pure: returns the new state.
 */
export function stepDoor(
  motion: DoorMotion,
  near: boolean,
  delta: number,
  frames: number,
): DoorMotion {
  const awayMs = near ? 0 : motion.awayMs + delta;
  const target = awayMs < DOOR_CLOSE_DELAY_MS ? frames - 1 : 0;
  if (motion.frame === target) return { frame: target, stepMs: 0, awayMs };
  let { frame } = motion;
  let stepMs = motion.stepMs + delta;
  while (stepMs >= DOOR_FRAME_MS && frame !== target) {
    stepMs -= DOOR_FRAME_MS;
    frame += frame < target ? 1 : -1;
  }
  return { frame, stepMs: frame === target ? 0 : stepMs, awayMs };
}

/**
 * Depth of the front layer of `door`: the characters' formula (`4 + y / 10000`, y = feet) on the
 * floor line of the wall, plus 3/4 px. Whoever walks the wall rows (feet above that line) is behind
 * the lintel, jambs and glass; whoever stands in the room is in front. The 3/4 px keeps the player
 * (which adds 1/2 px over the NPCs) behind it while its feet are exactly on the line.
 */
export function doorFrontDepth(door: Door): number {
  const base = (door.tile.y + 1) * TILE;
  return SPRITE_DEPTH + (base + 0.75) / 10_000;
}

interface Slot {
  door: Door;
  /** Doorway and reveal (skins with {@link DOOR_BACK_FRAME}), under the characters. */
  back: Phaser.GameObjects.Image | undefined;
  /** The animated frame: wall above the lintel, frame and glass leaves. */
  front: Phaser.GameObjects.Image;
  motion: DoorMotion;
}

/**
 * Automatic sliding doors of the rooms (skins whose props atlas has the `door-*` frames): they open
 * when a character or the player comes near and close once everybody walked away. With a
 * {@link DOOR_BACK_FRAME} the door has two layers: the doorway on the wall (under the characters)
 * and the frame + glass sorted with the characters by the wall's floor line, so whoever crosses the
 * wall passes inside the frame. Without it the single animated layer stays on the wall, under the
 * characters, who walk through in front of it.
 */
export class DoorAnimator {
  /** By room id. */
  private readonly slots = new Map<string, Slot>();
  private frames = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly textureKey: string,
    private readonly depth: number,
  ) {}

  /** Number of door frames the skin provides (0 = no animated doors: the `door` tile is drawn). */
  static frameCount(frames: Record<string, PropFrame> | undefined): number {
    let count = 0;
    while (frames?.[`${DOOR_FRAME_PREFIX}${count}`]) count += 1;
    return count >= 2 ? count : 0;
  }

  /** Whether the skin draws the door in two layers (it has the {@link DOOR_BACK_FRAME}). */
  static hasBack(frames: Record<string, PropFrame> | undefined): boolean {
    return frames?.[DOOR_BACK_FRAME] !== undefined;
  }

  get active(): boolean {
    return this.frames > 0;
  }

  sync(layout: BuildingLayout, frames: Record<string, PropFrame> | undefined): void {
    this.frames = DoorAnimator.frameCount(frames);
    const closed = frames?.[`${DOOR_FRAME_PREFIX}0`];
    const backFrame = frames?.[DOOR_BACK_FRAME];
    const wanted = new Set<string>();
    if (this.active && closed) {
      for (const door of layout.doors) {
        wanted.add(door.roomId);
        const x = door.tile.x * TILE;
        const y = (door.tile.y + 1) * TILE;
        const frontDepth = backFrame ? doorFrontDepth(door) : this.depth;
        let slot = this.slots.get(door.roomId);
        // The skin gained or lost its back layer: rebuild the door.
        if (slot && (slot.back !== undefined) !== (backFrame !== undefined)) {
          this.destroy(slot);
          slot = undefined;
        }
        if (slot) {
          slot.door = door;
          slot.back?.setPosition(x, y);
          slot.front.setPosition(x, y).setDepth(frontDepth);
          continue;
        }
        const back = backFrame
          ? this.scene.add
              .image(x, y, this.textureKey, DOOR_BACK_FRAME)
              .setOrigin(backFrame.ax / backFrame.w, backFrame.ay / backFrame.h)
              .setDepth(this.depth)
          : undefined;
        const front = this.scene.add
          .image(x, y, this.textureKey, `${DOOR_FRAME_PREFIX}0`)
          .setOrigin(closed.ax / closed.w, closed.ay / closed.h)
          .setDepth(frontDepth);
        this.slots.set(door.roomId, { door, back, front, motion: closedDoor() });
      }
    }
    for (const [id, slot] of this.slots) {
      if (wanted.has(id)) continue;
      this.destroy(slot);
      this.slots.delete(id);
    }
  }

  /** Opens or closes each door for the characters and the player at `points` (tile units). */
  update(delta: number, points: readonly Tile[]): void {
    for (const slot of this.slots.values()) {
      const before = slot.motion.frame;
      slot.motion = stepDoor(slot.motion, doorShouldOpen(slot.door, points), delta, this.frames);
      if (slot.motion.frame !== before) {
        slot.front.setFrame(`${DOOR_FRAME_PREFIX}${slot.motion.frame}`);
      }
    }
  }

  /** Door state per room id, for the E2E debug state. */
  states(): Record<string, 'open' | 'closed' | 'moving'> {
    const out: Record<string, 'open' | 'closed' | 'moving'> = {};
    for (const [id, { motion }] of this.slots) {
      out[id] =
        motion.frame === 0 ? 'closed' : motion.frame === this.frames - 1 ? 'open' : 'moving';
    }
    return out;
  }

  private destroy(slot: Slot): void {
    slot.back?.destroy();
    slot.front.destroy();
  }
}
