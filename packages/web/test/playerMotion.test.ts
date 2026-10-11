import { describe, expect, it } from 'vitest';
import {
  DirectionInput,
  directionBetween,
  type MotionWorld,
  PLAYER_STEP_MS,
  PlayerMotion,
  TURN_TAP_MS,
  tileAhead,
} from '../src/player/playerMotion';

/** 5x5 room walled on the border; (2,2) is a desk. */
function world(occupied: [number, number][] = []): MotionWorld {
  const collision = Array.from({ length: 5 }, (_, y) =>
    Array.from(
      { length: 5 },
      (_, x) => x === 0 || y === 0 || x === 4 || y === 4 || (x === 2 && y === 2),
    ),
  );
  return { collision, isOccupied: (t) => occupied.some(([x, y]) => x === t.x && y === t.y) };
}

describe('PlayerMotion', () => {
  it('turns on the spot on a short tap without walking', () => {
    const m = new PlayerMotion({ x: 1, y: 1 });
    const w = world();
    m.update('right', 16, w);
    expect(m.facing).toBe('right');
    expect(m.tile).toEqual({ x: 1, y: 1 });
    m.update(undefined, 16, w);
    expect(m.moving).toBe(false);
    expect(m.tile).toEqual({ x: 1, y: 1 });
  });

  it('walks tile by tile when the key is held', () => {
    const m = new PlayerMotion({ x: 1, y: 1 });
    const w = world();
    // Facing down already: a held down starts walking right away.
    m.update('down', 16, w);
    expect(m.moving).toBe(true);
    m.update('down', PLAYER_STEP_MS, w);
    expect(m.tile).toEqual({ x: 1, y: 2 });
    expect(m.facing).toBe('down');
  });

  it('walks after the tap threshold when turning first', () => {
    const m = new PlayerMotion({ x: 1, y: 1 });
    const w = world();
    m.update('right', 16, w);
    m.update('right', TURN_TAP_MS, w);
    expect(m.moving).toBe(true);
    m.update('right', PLAYER_STEP_MS, w);
    expect(m.tile.x).toBe(2);
  });

  it('is blocked by walls, furniture and characters, but still turns', () => {
    const m = new PlayerMotion({ x: 1, y: 1 });
    m.update('up', 16, world());
    m.update('up', 500, world());
    expect(m.tile).toEqual({ x: 1, y: 1 });
    expect(m.facing).toBe('up');

    const desk = new PlayerMotion({ x: 1, y: 2 });
    desk.update('right', 16, world());
    desk.update('right', 500, world());
    expect(desk.tile).toEqual({ x: 1, y: 2 });

    const npc = new PlayerMotion({ x: 1, y: 1 });
    npc.update('down', 16, world([[1, 2]]));
    npc.update('down', 500, world([[1, 2]]));
    expect(npc.tile).toEqual({ x: 1, y: 1 });
    expect(npc.moving).toBe(false);
  });

  it('chains steps while the key stays held and reports a fractional position', () => {
    const m = new PlayerMotion({ x: 1, y: 1 });
    const w = world();
    m.update('down', 16, w);
    m.update('down', PLAYER_STEP_MS / 2, w);
    expect(m.position().y).toBeCloseTo(1.5 + 16 / PLAYER_STEP_MS / 1, 0);
    m.update('down', PLAYER_STEP_MS, w);
    expect(m.tile.y).toBe(2);
    m.update('down', PLAYER_STEP_MS, w);
    expect(m.tile.y).toBe(3);
  });

  it('does not start new steps while blocked (dialog) but finishes the one in progress', () => {
    const m = new PlayerMotion({ x: 1, y: 1 });
    const w = world();
    m.update('down', 16, w);
    m.update('down', 50, w, true);
    expect(m.moving).toBe(true);
    m.update('down', PLAYER_STEP_MS, w, true);
    expect(m.tile.y).toBe(2);
    expect(m.moving).toBe(false);
    m.update('down', 1000, w, true);
    expect(m.tile.y).toBe(2);
  });

  it('teleports and reports occupied tiles', () => {
    const m = new PlayerMotion({ x: 1, y: 1 });
    m.update('down', 16, world());
    expect(m.occupiedTiles()).toHaveLength(2);
    m.teleport({ x: 3, y: 3 }, 'left');
    expect(m.tile).toEqual({ x: 3, y: 3 });
    expect(m.facing).toBe('left');
    expect(m.occupiedTiles()).toEqual([{ x: 3, y: 3 }]);
  });
});

describe('helpers', () => {
  it('tileAhead and directionBetween', () => {
    expect(tileAhead({ x: 2, y: 2 }, 'up')).toEqual({ x: 2, y: 1 });
    expect(tileAhead({ x: 2, y: 2 }, 'right')).toEqual({ x: 3, y: 2 });
    expect(directionBetween({ x: 2, y: 2 }, { x: 2, y: 5 })).toBe('down');
    expect(directionBetween({ x: 2, y: 2 }, { x: 0, y: 2 })).toBe('left');
    expect(directionBetween({ x: 2, y: 2 }, { x: 2, y: 2 })).toBeUndefined();
  });

  it('DirectionInput: the latest pressed wins and release falls back', () => {
    const input = new DirectionInput();
    const none = { up: false, down: false, left: false, right: false };
    expect(input.update(none)).toBeUndefined();
    expect(input.update({ ...none, left: true })).toBe('left');
    expect(input.update({ ...none, left: true, up: true })).toBe('up');
    expect(input.update({ ...none, left: true })).toBe('left');
    expect(input.update(none)).toBeUndefined();
  });
});
