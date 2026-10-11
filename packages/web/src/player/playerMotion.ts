import type { Direction } from '../skin';
import type { Tile } from '../world/roomLayout';

/** One tile every 200 ms (a bit quicker than the NPCs, which walk at 4 tiles per second). */
export const PLAYER_STEP_MS = 200;
/** A direction key must be held this long before the player walks; a shorter tap only turns. */
export const TURN_TAP_MS = 110;

export const DIRECTION_DELTA: Record<Direction, Tile> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export function tileAhead(tile: Tile, facing: Direction): Tile {
  const d = DIRECTION_DELTA[facing];
  return { x: tile.x + d.x, y: tile.y + d.y };
}

export function directionBetween(from: Tile, to: Tile): Direction | undefined {
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);
  if (dx === 0 && dy === 0) return undefined;
  if (Math.abs(to.x - from.x) >= Math.abs(to.y - from.y)) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'up' : 'down';
}

/** The direction the opposite way. */
export function opposite(direction: Direction): Direction {
  return { up: 'down', down: 'up', left: 'right', right: 'left' }[direction] as Direction;
}

export interface MotionWorld {
  /** `collision[y][x]`: true when the tile cannot be walked on. */
  collision: readonly (readonly boolean[])[];
  /** True when a character occupies the tile. */
  isOccupied: (tile: Tile) => boolean;
}

/** Whether the player may step onto `tile` (inside the grid, not furniture/wall, no character). */
export function canEnter(world: MotionWorld, tile: Tile): boolean {
  return world.collision[tile.y]?.[tile.x] === false && !world.isOccupied(tile);
}

/**
 * Grid-based movement of the player avatar, Pokemon style: a short tap on a direction only turns
 * the avatar, holding it walks one tile at a time. Pure (no Phaser) so it is node-testable.
 */
export class PlayerMotion {
  tile: Tile;
  /** Tile being walked to; `stepMs / PLAYER_STEP_MS` of the step is done. */
  to: Tile | undefined;
  stepMs = 0;
  facing: Direction = 'down';
  private heldMs = 0;
  private heldDirection: Direction | undefined;

  constructor(tile: Tile) {
    this.tile = { ...tile };
  }

  get moving(): boolean {
    return this.to !== undefined;
  }

  /** Position in tiles, fractional while walking. */
  position(): Tile {
    if (!this.to) return { ...this.tile };
    const t = Math.min(1, this.stepMs / PLAYER_STEP_MS);
    return {
      x: this.tile.x + (this.to.x - this.tile.x) * t,
      y: this.tile.y + (this.to.y - this.tile.y) * t,
    };
  }

  /** Puts the player on `tile` right away (Tab teleport, regenerated layout). */
  teleport(tile: Tile, facing?: Direction): void {
    this.tile = { ...tile };
    this.to = undefined;
    this.stepMs = 0;
    this.heldMs = 0;
    this.heldDirection = undefined;
    if (facing) this.facing = facing;
  }

  /** Tiles the player takes up (the one it stands on and the one it is walking to). */
  occupiedTiles(): Tile[] {
    return this.to ? [this.tile, this.to] : [this.tile];
  }

  /**
   * Advances the simulation. `input` is the direction currently held (undefined = none);
   * `blocked` freezes new steps (dialog open) but lets the step in progress finish.
   */
  update(input: Direction | undefined, dtMs: number, world: MotionWorld, blocked = false): void {
    let budget = dtMs;
    let arrived = false;
    for (let guard = 0; guard < 4; guard += 1) {
      if (this.to) {
        const remaining = PLAYER_STEP_MS - this.stepMs;
        if (budget < remaining) {
          this.stepMs += budget;
          return;
        }
        budget -= remaining;
        this.tile = this.to;
        this.to = undefined;
        this.stepMs = 0;
        arrived = true;
      }
      const dir = blocked ? undefined : input;
      if (!dir) {
        this.heldDirection = undefined;
        this.heldMs = 0;
        return;
      }
      const fresh = this.heldDirection !== dir;
      if (!arrived && fresh && dir !== this.facing) {
        // A new direction while standing: turn on the spot; walking needs the key held a bit.
        this.facing = dir;
        this.heldDirection = dir;
        this.heldMs = 0;
        return;
      }
      if (!arrived && !fresh) {
        this.heldMs += budget;
        if (this.heldMs < TURN_TAP_MS) return;
      }
      this.heldDirection = dir;
      this.facing = dir;
      const next = tileAhead(this.tile, dir);
      if (!canEnter(world, next)) return;
      this.to = next;
      this.stepMs = 0;
      arrived = false;
    }
  }
}

/**
 * Turns the set of held direction keys into one direction: the most recently pressed one wins,
 * and releasing it falls back to the one still held.
 */
export class DirectionInput {
  private order: Direction[] = [];

  update(down: Readonly<Record<Direction, boolean>>): Direction | undefined {
    this.order = this.order.filter((d) => down[d]);
    for (const d of ['up', 'down', 'left', 'right'] as const) {
      if (down[d] && !this.order.includes(d)) this.order.push(d);
    }
    return this.order[this.order.length - 1];
  }
}
