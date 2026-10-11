import { describe, expect, it } from 'vitest';
import { isWallProp, PROP_DEFS } from '../src/world/props';
import {
  type BuildingLayout,
  CHUNK,
  CUBICLES_PER_CHUNK,
  cubicleChunksFor,
  type LayoutProjectInput,
  layoutBuilding,
  type Rect,
  SIGN_MAX_CHARS,
  type Tile,
} from '../src/world/roomLayout';

function project(id: string, firstSeen: number, agentsPerSession: number[]): LayoutProjectInput {
  return {
    id,
    name: id,
    firstSeen,
    sessions: agentsPerSession.map((agentCount, i) => ({ id: `${id}-s${i}`, agentCount })),
  };
}

/** Tiles reachable from `start` over free (non-colliding) tiles, 4-neighbourhood. */
function reachable(layout: BuildingLayout, start: Tile): Set<string> {
  const seen = new Set<string>([`${start.x},${start.y}`]);
  const queue: Tile[] = [start];
  while (queue.length > 0) {
    const { x, y } = queue.shift() as Tile;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      const key = `${nx},${ny}`;
      if (seen.has(key) || layout.collision[ny]?.[nx] !== false) continue;
      seen.add(key);
      queue.push({ x: nx, y: ny });
    }
  }
  return seen;
}

function rect(layout: BuildingLayout, id: string): Rect {
  const found = layout.roomBounds[id];
  if (!found) throw new Error(`no room ${id}`);
  return found;
}

const key = (t: Tile) => `${t.x},${t.y}`;

describe('layoutBuilding', () => {
  it('is deterministic and independent of input order', () => {
    const a = project('alpha', 1, [2, 0]);
    const b = project('beta', 2, [5]);
    expect(layoutBuilding([a, b])).toEqual(layoutBuilding([a, b]));
    expect(layoutBuilding([b, a])).toEqual(layoutBuilding([a, b]));
  });

  it('builds just the lobby with no projects', () => {
    const layout = layoutBuilding([]);
    expect(layout.rooms).toHaveLength(0);
    expect(layout.pois.some((p) => p.type === 'hall-of-fame')).toBe(true);
    expect(layout.collision[layout.spawn.y]?.[layout.spawn.x]).toBe(false);
  });

  it.each([0, 1, 3, 9])('has capacity for %i agents, 3 desks per Tech Lead', (agents) => {
    const layout = layoutBuilding([project('p', 1, [agents])]);
    const cubicles = layout.desks.filter((d) => d.sessionId === undefined);
    expect(cubicles.length).toBeGreaterThanOrEqual(Math.max(agents, CUBICLES_PER_CHUNK));
    expect(layout.rooms[0]?.cubicleCapacity).toBe(cubicles.length);
    expect(cubicles.length).toBe(cubicleChunksFor(agents, 1) * CUBICLES_PER_CHUNK);
  });

  it('gives each Tech Lead exactly 3 programmer desks', () => {
    const layout = layoutBuilding([project('p', 1, [0, 0])]);
    expect(layout.desks.filter((d) => d.sessionId === undefined)).toHaveLength(6);
    const single = layoutBuilding([project('q', 1, [0])]);
    expect(single.desks.filter((d) => d.sessionId === undefined)).toHaveLength(3);
  });

  it('gives each session one lead desk with a stable id', () => {
    const layout = layoutBuilding([project('p', 1, [0, 3])]);
    const leads = layout.desks.filter((d) => d.sessionId !== undefined);
    expect(leads.map((d) => d.id)).toEqual(['p:lead:p-s0', 'p:lead:p-s1']);
    expect(new Set(layout.desks.map((d) => d.id)).size).toBe(layout.desks.length);
  });

  it('keeps desk ids stable when a room grows', () => {
    const before = layoutBuilding([project('p', 1, [2])]);
    const after = layoutBuilding([project('p', 1, [9])]);
    const ids = new Set(after.desks.map((d) => d.id));
    for (const desk of before.desks) expect(ids.has(desk.id)).toBe(true);
  });

  it('does not move existing rooms when a project is added', () => {
    const a = project('alpha', 1, [3]);
    const b = project('beta', 2, [1]);
    const before = layoutBuilding([a, b]);
    const after = layoutBuilding([a, b, project('gamma', 3, [9])]);
    for (const id of ['alpha', 'beta']) {
      expect(after.roomBounds[id]).toEqual(before.roomBounds[id]);
    }
    expect(rect(after, 'gamma').x).toBeGreaterThan(rect(after, 'beta').x);
    expect(after.doors.find((d) => d.roomId === 'alpha')).toEqual(
      before.doors.find((d) => d.roomId === 'alpha'),
    );
  });

  it('places rooms by first-seen order, not by id', () => {
    const layout = layoutBuilding([project('aaa', 5, []), project('zzz', 1, [])]);
    expect(rect(layout, 'zzz').x).toBe(CHUNK);
    expect(rect(layout, 'aaa').x).toBe(2 * CHUNK);
  });

  it('truncates the sign text', () => {
    const layout = layoutBuilding([{ ...project('p', 1, []), name: 'a-very-long-project-name' }]);
    expect(layout.signs[0]?.text).toBe('a-very-long-pr');
    expect(layout.signs[0]?.text).toHaveLength(SIGN_MAX_CHARS);
  });

  it('varies the cosmetics deterministically by project id', () => {
    const tints = new Set(
      Array.from(
        { length: 12 },
        (_, i) => layoutBuilding([project(`proj-${i}`, 1, [])]).rooms[0]?.accent,
      ),
    );
    expect(tints.size).toBeGreaterThan(1);
  });

  it('reaches every door, desk, point of interest and the lobby from the spawn', () => {
    const layout = layoutBuilding([
      project('alpha', 1, [2, 9]),
      project('beta', 2, []),
      project('gamma', 3, [1]),
    ]);
    const seen = reachable(layout, layout.spawn);
    expect(layout.doors).toHaveLength(3);
    for (const door of layout.doors) {
      expect(seen.has(key(door.tile))).toBe(true);
      expect(seen.has(key(door.outside))).toBe(true);
    }
    for (const desk of layout.desks) expect(seen.has(key(desk.tile))).toBe(true);
    for (const poi of layout.pois) expect(seen.has(key(poi.tile))).toBe(true);
  });

  it('keeps walls and furniture blocking', () => {
    const layout = layoutBuilding([project('p', 1, [1])]);
    const { x, y } = rect(layout, 'p');
    const door = layout.doors[0];
    expect(layout.collision[y]?.[x]).toBe(true);
    expect(layout.collision[door?.tile.y ?? -1]?.[door?.tile.x ?? -1]).toBe(false);
  });

  it('places props on free floor, without overlaps, with their fallback tiles under them', () => {
    const layout = layoutBuilding([project('alpha', 1, [2, 9]), project('beta', 2, [0])]);
    const taken = new Set<string>();
    for (const prop of layout.props) {
      const { w, fallback } = PROP_DEFS[prop.id];
      for (let i = 0; i < w; i += 1) {
        const x = prop.x + i;
        const cell = `${isWallProp(prop.id) ? 'wall' : 'floor'}:${x},${prop.y}`;
        expect(taken.has(cell), `${prop.id} overlaps at ${cell}`).toBe(false);
        taken.add(cell);
        if (isWallProp(prop.id)) {
          // Hangs on a top wall face.
          expect(layout.layers.walls[prop.y]?.[x]).toBe('wall');
        } else {
          expect(layout.layers.floor[prop.y]?.[x]).not.toBeNull();
          expect(layout.layers.walls[prop.y]?.[x]).toBeNull();
          expect(layout.layers.furniture[prop.y]?.[x]).toBe(fallback[i]);
        }
      }
    }
    // Every desk has its chair prop on the seat (the Tech Lead's is the executive one), and the
    // seat stays walkable.
    for (const desk of layout.desks) {
      const id = desk.sessionId ? 'chair-exec' : 'chair';
      expect(layout.props).toContainEqual({ id, x: desk.tile.x, y: desk.tile.y });
      expect(layout.collision[desk.tile.y]?.[desk.tile.x]).toBe(false);
    }
  });

  it('frames rooms with oriented walls (face on top, slim sides, bottom slab)', () => {
    const layout = layoutBuilding([project('p', 1, [1])]);
    const { x, y, w, h } = rect(layout, 'p');
    const walls = layout.layers.walls;
    expect(walls[y]?.[x]).toBe('wall-corner-tl');
    expect(walls[y + 1]?.[x]).toBe('wall-side-l');
    expect(walls[y + 1]?.[x + w - 1]).toBe('wall-side-r');
    expect(walls[y + h - 1]?.[x + 1]).toBe('wall-bottom');
    // The lobby's top-right corner opens onto the corridor, whose far end is a corner.
    expect(walls[0]?.[CHUNK - 1]).toBe('wall');
    expect(walls[0]?.[layout.width - 1]).toBe('wall-corner-tr');
  });
});
