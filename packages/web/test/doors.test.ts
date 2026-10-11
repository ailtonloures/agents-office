import { describe, expect, it } from 'vitest';
import { PLAYER_STEP_MS } from '../src/player/playerMotion';
import {
  closedDoor,
  DOOR_CLOSE_DELAY_MS,
  DOOR_FRAME_MS,
  DoorAnimator,
  type DoorMotion,
  doorFrontDepth,
  doorShouldOpen,
  stepDoor,
} from '../src/world/doors';
import { type Door, layoutBuilding, type Tile, WALL_ROWS } from '../src/world/roomLayout';

const FRAMES = 6;
/** `STEP_MS` of the character controller (4 tiles/s; the module needs Phaser, so not imported). */
const NPC_STEP_MS = 250;

function door() {
  const layout = layoutBuilding([{ id: 'p', name: 'p', firstSeen: 1, sessions: [] }]);
  const found = layout.doors[0];
  if (!found) throw new Error('no door');
  return found;
}

/** Runs `stepDoor` for `ms` in 16 ms frames. */
function run(motion: DoorMotion, near: boolean, ms: number): DoorMotion {
  let m = motion;
  for (let t = 0; t < ms; t += 16) m = stepDoor(m, near, 16, FRAMES);
  return m;
}

describe('doorShouldOpen', () => {
  it('opens for someone in front of it, inside it or right behind it', () => {
    const d = door();
    expect(doorShouldOpen(d, [d.outside])).toBe(true);
    expect(doorShouldOpen(d, [d.tile])).toBe(true);
    expect(doorShouldOpen(d, [{ x: d.tile.x, y: d.tile.y - WALL_ROWS + 1 }])).toBe(true);
    expect(doorShouldOpen(d, [{ x: d.tile.x + 1, y: d.tile.y + 2 }])).toBe(true);
    expect(doorShouldOpen(d, [{ x: d.tile.x, y: d.outside.y - 0.5 }])).toBe(true);
  });

  it('stays shut for whoever is away from it', () => {
    const d = door();
    expect(doorShouldOpen(d, [])).toBe(false);
    expect(doorShouldOpen(d, [{ x: d.tile.x + 2, y: d.outside.y }])).toBe(false);
    expect(doorShouldOpen(d, [{ x: d.tile.x, y: d.tile.y + 3 }])).toBe(false);
    expect(doorShouldOpen(d, [{ x: d.tile.x, y: d.outside.y - 2 }])).toBe(false);
  });
});

describe('stepDoor', () => {
  it('slides open one frame at a time while someone is near', () => {
    const one = stepDoor(closedDoor(), true, DOOR_FRAME_MS, FRAMES);
    expect(one.frame).toBe(1);
    expect(run(closedDoor(), true, DOOR_FRAME_MS * FRAMES).frame).toBe(FRAMES - 1);
  });

  it('waits before closing, then slides shut', () => {
    const open = run(closedDoor(), true, 1000);
    const waiting = run(open, false, DOOR_CLOSE_DELAY_MS - 32);
    expect(waiting.frame).toBe(FRAMES - 1);
    const shut = run(waiting, false, 32 + DOOR_FRAME_MS * FRAMES + 16);
    expect(shut.frame).toBe(0);
  });

  it('turns around halfway when someone comes back', () => {
    const open = run(closedDoor(), true, 1000);
    const closing = run(open, false, DOOR_CLOSE_DELAY_MS + DOOR_FRAME_MS * 2);
    expect(closing.frame).toBeGreaterThan(0);
    expect(closing.frame).toBeLessThan(FRAMES - 1);
    const next = run(closing, true, DOOR_FRAME_MS);
    expect(next.frame).toBeGreaterThan(closing.frame);
  });

  it('never leaves the frame range', () => {
    expect(stepDoor(closedDoor(), false, 10_000, FRAMES).frame).toBe(0);
    expect(run(closedDoor(), true, 10_000).frame).toBe(FRAMES - 1);
  });
});

/**
 * Walks `path` (tiles, one straight step at a time) taking `stepMs` per tile, sampling the position
 * every 16 ms as the game does, and steps the door (closed at the start) with it. Returns the frame
 * of the door at each sampled position.
 */
function walk(d: Door, path: readonly Tile[], stepMs: number): { at: Tile; frame: number }[] {
  const samples: { at: Tile; frame: number }[] = [];
  let motion = closedDoor();
  const total = (path.length - 1) * stepMs;
  for (let t = 0; t <= total; t += 16) {
    const k = Math.min(path.length - 2, Math.floor(t / stepMs));
    const from = path[k] as Tile;
    const to = path[k + 1] as Tile;
    const f = Math.min(1, (t - k * stepMs) / stepMs);
    const at = { x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f };
    motion = stepDoor(motion, doorShouldOpen(d, [at]), 16, FRAMES);
    samples.push({ at, frame: motion.frame });
  }
  return samples;
}

/** Tiles from `from` to `to` along one column or row. */
function line(from: Tile, to: Tile): Tile[] {
  const n = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
  const sx = Math.sign(to.x - from.x);
  const sy = Math.sign(to.y - from.y);
  return Array.from({ length: n + 1 }, (_, i) => ({ x: from.x + sx * i, y: from.y + sy * i }));
}

/** Feet on a row of the opening, from the top wall row to the room's first row (glass plane). */
function inOpening(d: Door, at: Tile): boolean {
  const top = d.tile.y - WALL_ROWS + 1;
  return Math.abs(at.x - d.tile.x) < 1 && at.y >= top && at.y <= d.tile.y + 1;
}

describe('crossing the door', () => {
  it('is open all the time the player walks through it into the room', () => {
    const d = door();
    const samples = walk(d, line(d.outside, { x: d.tile.x, y: d.tile.y + 2 }), PLAYER_STEP_MS);
    const inside = samples.filter((s) => inOpening(d, s.at));
    expect(inside.length).toBeGreaterThan(0);
    for (const s of inside) expect(s.frame, `at y=${s.at.y}`).toBe(FRAMES - 1);
  });

  it('is open all the time the player walks out of the room', () => {
    const d = door();
    const samples = walk(d, line({ x: d.tile.x, y: d.tile.y + 2 }, d.outside), PLAYER_STEP_MS);
    const inside = samples.filter((s) => inOpening(d, s.at));
    expect(inside.length).toBeGreaterThan(0);
    for (const s of inside) expect(s.frame, `at y=${s.at.y}`).toBe(FRAMES - 1);
  });

  it('is open before the feet of someone coming along the corridor leave it', () => {
    const d = door();
    const path = [
      ...line({ x: d.outside.x - 3, y: d.outside.y }, d.outside),
      ...line(d.outside, { x: d.tile.x, y: d.tile.y + 2 }).slice(1),
    ];
    const past = walk(d, path, PLAYER_STEP_MS).filter(
      (s) => s.at.x === d.tile.x && s.at.y > d.outside.y && s.at.y <= d.tile.y + 1,
    );
    expect(past.length).toBeGreaterThan(0);
    for (const s of past) expect(s.frame, `at y=${s.at.y}`).toBe(FRAMES - 1);
  });

  it('is open for the NPCs, both ways, at their pace', () => {
    const d = door();
    const room = { x: d.tile.x, y: d.tile.y + 2 };
    for (const path of [line(d.outside, room), line(room, d.outside)]) {
      const inside = walk(d, path, NPC_STEP_MS).filter((s) => inOpening(d, s.at));
      expect(inside.length).toBeGreaterThan(0);
      for (const s of inside) expect(s.frame, `at y=${s.at.y}`).toBe(FRAMES - 1);
    }
  });

  it('closes behind the walker once inside the room, away from the door', () => {
    const d = door();
    const samples = walk(d, line(d.outside, { x: d.tile.x, y: d.tile.y + 5 }), PLAYER_STEP_MS);
    const last = samples[samples.length - 1];
    let motion = { frame: last?.frame ?? 0, stepMs: 0, awayMs: 0 };
    motion = run(motion, false, DOOR_CLOSE_DELAY_MS + DOOR_FRAME_MS * FRAMES + 32);
    expect(motion.frame).toBe(0);
  });
});

describe('doorFrontDepth', () => {
  it('sorts the frame between whoever is in the wall rows and whoever is in the room', () => {
    const d = door();
    const feet = (row: number) => 4 + ((row + 1) * 16) / 10_000;
    // NPCs (`4 + y/10000`) and the player (+1/2 px) on the wall's bottom row: behind.
    expect(feet(d.tile.y)).toBeLessThan(doorFrontDepth(d));
    expect(feet(d.tile.y) + 0.00005).toBeLessThan(doorFrontDepth(d));
    // First row of the room: in front.
    expect(feet(d.tile.y + 1)).toBeGreaterThan(doorFrontDepth(d));
  });
});

describe('DoorAnimator.frameCount / hasBack', () => {
  const frame = { x: 0, y: 0, w: 24, h: 48, ax: 4, ay: 48 };
  it('counts the consecutive door frames of the skin (none without at least two)', () => {
    expect(DoorAnimator.frameCount(undefined)).toBe(0);
    expect(DoorAnimator.frameCount({ 'door-0': frame })).toBe(0);
    expect(DoorAnimator.frameCount({ 'door-0': frame, 'door-1': frame, 'door-3': frame })).toBe(2);
    expect(DoorAnimator.frameCount({ 'door-back': frame, 'door-0': frame, 'door-1': frame })).toBe(
      2,
    );
  });

  it('tells whether the door has a back layer', () => {
    expect(DoorAnimator.hasBack(undefined)).toBe(false);
    expect(DoorAnimator.hasBack({ 'door-0': frame, 'door-1': frame })).toBe(false);
    expect(DoorAnimator.hasBack({ 'door-back': frame, 'door-0': frame, 'door-1': frame })).toBe(
      true,
    );
  });
});
