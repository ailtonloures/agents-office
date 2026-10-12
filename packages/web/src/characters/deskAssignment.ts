import type { Direction } from '../skin/schema';
import type { Desk, Tile } from '../world/roomLayout';

const distance = (a: Desk, b: Desk): number =>
  Math.abs(a.tile.x - b.tile.x) + Math.abs(a.tile.y - b.tile.y);

/**
 * Stable desk allocation for subagents. Tech Leads sit at the desk bound to their session
 * (`Desk.sessionId`); subagents get the free cubicle of their room closest to an anchor desk (the
 * parent's), keep it until released and never share it.
 */
export class DeskAssignments {
  private readonly byActor = new Map<string, string>();
  private readonly byDesk = new Map<string, string>();

  deskIdOf(actorId: string): string | undefined {
    return this.byActor.get(actorId);
  }

  isTaken(deskId: string): boolean {
    return this.byDesk.has(deskId);
  }

  /**
   * Returns the actor's desk (existing assignment first), or the free cubicle of `roomId` nearest
   * to `anchorDeskId`. `undefined` when the room has no free cubicle.
   */
  assign(
    actorId: string,
    roomId: string,
    desks: readonly Desk[],
    anchorDeskId?: string,
  ): Desk | undefined {
    const current = this.byActor.get(actorId);
    if (current !== undefined) {
      const kept = desks.find((desk) => desk.id === current);
      if (kept) return kept;
      this.release(actorId);
    }
    const anchor =
      desks.find((desk) => desk.id === anchorDeskId) ??
      desks.find((desk) => desk.roomId === roomId);
    let chosen: Desk | undefined;
    for (const desk of desks) {
      if (desk.roomId !== roomId || desk.sessionId !== undefined || this.byDesk.has(desk.id)) {
        continue;
      }
      if (!chosen || (anchor && distance(anchor, desk) < distance(anchor, chosen))) chosen = desk;
    }
    if (chosen) {
      this.byActor.set(actorId, chosen.id);
      this.byDesk.set(chosen.id, actorId);
    }
    return chosen;
  }

  release(actorId: string): void {
    const deskId = this.byActor.get(actorId);
    if (deskId === undefined) return;
    this.byActor.delete(actorId);
    if (this.byDesk.get(deskId) === actorId) this.byDesk.delete(deskId);
  }

  /** Drops assignments whose desk no longer exists; returns the actors that lost their desk. */
  reconcile(desks: readonly Desk[]): string[] {
    const alive = new Set(desks.map((desk) => desk.id));
    const lost: string[] = [];
    for (const [actorId, deskId] of this.byActor) {
      if (!alive.has(deskId)) lost.push(actorId);
    }
    for (const actorId of lost) this.release(actorId);
    return lost;
  }
}

/** A tile where a visitor stands to talk to the occupant of a desk (or waits its turn). */
export interface ConversationSpot {
  tile: Tile;
  /** Direction the visitor faces: towards the seat. */
  facing: Direction;
}

export interface DeskSpots {
  /** Adjacent tiles, in order of preference. */
  talk: ConversationSpot[];
  /** Second ring, where visitors wait on their feet when every talk spot is taken. */
  wait: ConversationSpot[];
}

const sign = (n: number): number => (n > 0 ? 1 : n < 0 ? -1 : 0);

function facingToward(from: Tile, to: Tile): Direction {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return sign(dx) < 0 ? 'left' : 'right';
  return sign(dy) < 0 ? 'up' : 'down';
}

/**
 * Where visitors stand around a desk: the walkable tiles beside and in front of the seat (the desk
 * itself is behind it), then a ring of waiting tiles one step further. Tiles are walkable per
 * `walkable` (the static collision grid) and never include the seat.
 */
export function deskSpots(desk: Desk, walkable: (tile: Tile) => boolean): DeskSpots {
  const seat = desk.tile;
  const at = (dx: number, dy: number): ConversationSpot | undefined => {
    const tile = { x: seat.x + dx, y: seat.y + dy };
    return walkable(tile) ? { tile, facing: facingToward(tile, seat) } : undefined;
  };
  const pick = (offsets: readonly (readonly [number, number])[]): ConversationSpot[] =>
    offsets.flatMap(([dx, dy]) => at(dx, dy) ?? []);
  return {
    talk: pick([
      [1, 0],
      [-1, 0],
      [0, 1],
      [1, 1],
      [-1, 1],
    ]),
    wait: pick([
      [2, 1],
      [-2, 1],
      [0, 2],
      [1, 2],
      [-1, 2],
      [2, 0],
      [-2, 0],
    ]),
  };
}

/**
 * Who stands where around each desk: visitors take distinct talk spots, and when none is free they
 * wait on a waiting tile in arrival order (first in line gets the next free talk spot). Pure
 * bookkeeping: the caller supplies the spots of the desk and releases visitors when they leave.
 */
export class ConversationPoints {
  private readonly held = new Map<
    string,
    { deskId: string; tile: Tile; facing: Direction; talking: boolean }
  >();
  private readonly lines = new Map<string, string[]>();

  private takenAt(deskId: string, tile: Tile): boolean {
    for (const spot of this.held.values()) {
      if (spot.deskId === deskId && spot.tile.x === tile.x && spot.tile.y === tile.y) return true;
    }
    return false;
  }

  /** True when the visitor holds a talk spot (not just a place in line). */
  isTalking(visitorId: string): boolean {
    return this.held.get(visitorId)?.talking === true;
  }

  /** Visitors standing in line at a desk. */
  queueLength(deskId: string): number {
    return this.lines.get(deskId)?.length ?? 0;
  }

  /**
   * The spot `visitorId` should stand on at `deskId`: a talk spot when one is free and nobody is
   * ahead in line, otherwise a waiting tile; `undefined` when even those are all taken (the
   * visitor stays put and asks again later). Stable between calls while nothing changes.
   */
  acquire(visitorId: string, deskId: string, spots: DeskSpots): ConversationSpot | undefined {
    const mine = this.held.get(visitorId);
    if (mine && mine.deskId !== deskId) this.release(visitorId);
    const current = this.held.get(visitorId);
    if (current?.talking) return { tile: current.tile, facing: current.facing };

    const line = this.lines.get(deskId) ?? [];
    const myTurn = line.length === 0 || line[0] === visitorId;
    if (myTurn) {
      const free = spots.talk.find((s) => !this.takenAt(deskId, s.tile));
      if (free) {
        this.release(visitorId);
        this.held.set(visitorId, { deskId, ...free, talking: true });
        return free;
      }
    }
    if (current) return { tile: current.tile, facing: current.facing };
    const wait = spots.wait.find((s) => !this.takenAt(deskId, s.tile));
    if (!wait) return undefined;
    if (!line.includes(visitorId)) line.push(visitorId);
    this.lines.set(deskId, line);
    this.held.set(visitorId, { deskId, ...wait, talking: false });
    return wait;
  }

  release(visitorId: string): void {
    const spot = this.held.get(visitorId);
    if (!spot) return;
    this.held.delete(visitorId);
    const line = this.lines.get(spot.deskId);
    if (!line) return;
    const index = line.indexOf(visitorId);
    if (index >= 0) line.splice(index, 1);
    if (line.length === 0) this.lines.delete(spot.deskId);
  }
}
