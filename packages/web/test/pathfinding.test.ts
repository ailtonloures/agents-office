import { describe, expect, it } from 'vitest';
import { findPath } from '../src/world/pathfinding';
import { layoutBuilding } from '../src/world/roomLayout';

const grid = (rows: string[]): boolean[][] =>
  rows.map((row) => Array.from(row).map((cell) => cell === '#'));

describe('findPath', () => {
  it('returns [] when already at the goal', () => {
    expect(findPath(grid(['..']), { x: 0, y: 0 }, { x: 0, y: 0 })).toEqual([]);
  });

  it('finds the shortest path around walls, excluding the start', () => {
    const map = grid(['...', '.#.', '...']);
    const path = findPath(map, { x: 0, y: 1 }, { x: 2, y: 1 });
    expect(path).toHaveLength(4);
    expect(path?.at(-1)).toEqual({ x: 2, y: 1 });
    for (const tile of path ?? []) expect(map[tile.y]?.[tile.x]).toBe(false);
  });

  it('only takes unit 4-neighbour steps', () => {
    const path = findPath(grid(['.....', '.....']), { x: 0, y: 0 }, { x: 4, y: 1 }) ?? [];
    let prev = { x: 0, y: 0 };
    for (const tile of path) {
      expect(Math.abs(tile.x - prev.x) + Math.abs(tile.y - prev.y)).toBe(1);
      prev = tile;
    }
    expect(path).toHaveLength(5);
  });

  it('returns null when unreachable, blocked or out of bounds', () => {
    expect(findPath(grid(['.#.']), { x: 0, y: 0 }, { x: 2, y: 0 })).toBeNull();
    expect(findPath(grid(['.#']), { x: 0, y: 0 }, { x: 1, y: 0 })).toBeNull();
    expect(findPath(grid(['..']), { x: 0, y: 0 }, { x: 5, y: 0 })).toBeNull();
  });

  it('avoids dynamic obstacles but may still end on a blocked goal tile', () => {
    const map = grid(['...', '...']);
    const path = findPath(
      map,
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { blocked: (x, y) => x === 1 && y === 0 },
    );
    expect(path).toEqual([
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 2, y: 0 },
    ]);
    const toBlocked = findPath(map, { x: 0, y: 0 }, { x: 2, y: 0 }, { blocked: (x) => x === 2 });
    expect(toBlocked?.at(-1)).toEqual({ x: 2, y: 0 });
  });

  it('is deterministic', () => {
    const map = grid(['....', '....', '....']);
    expect(findPath(map, { x: 0, y: 0 }, { x: 3, y: 2 })).toEqual(
      findPath(map, { x: 0, y: 0 }, { x: 3, y: 2 }),
    );
  });

  it('walks from the corridor through the door to every desk and point of interest', () => {
    const layout = layoutBuilding([
      { id: 'p', name: 'p', firstSeen: 0, sessions: [{ id: 's', agentCount: 6 }] },
    ]);
    const door = layout.doors[0];
    if (!door) throw new Error('no door');
    for (const desk of layout.desks) {
      expect(findPath(layout.collision, door.outside, desk.tile)).not.toBeNull();
    }
    for (const poi of layout.pois.filter((p) => p.roomId === 'p')) {
      expect(findPath(layout.collision, door.outside, poi.tile)).not.toBeNull();
    }
    expect(findPath(layout.collision, layout.spawn, door.outside)).not.toBeNull();
  });
});
