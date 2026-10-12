import { describe, expect, it } from 'vitest';
import { ConversationPoints, DeskAssignments, deskSpots } from '../src/characters/deskAssignment';
import { CUBICLES_PER_CHUNK, layoutBuilding } from '../src/world/roomLayout';

const layoutWith = (agents: number, projects = 1) =>
  layoutBuilding(
    Array.from({ length: projects }, (_, i) => ({
      id: `p${i}`,
      name: `p${i}`,
      firstSeen: i,
      sessions: [{ id: `s${i}`, agentCount: agents }],
    })),
  );

const dist = (a: { tile: { x: number; y: number } }, b: { tile: { x: number; y: number } }) =>
  Math.abs(a.tile.x - b.tile.x) + Math.abs(a.tile.y - b.tile.y);

describe('DeskAssignments', () => {
  it('gives a subagent the free cubicle closest to the lead desk, never a lead desk', () => {
    const layout = layoutWith(7);
    const lead = layout.desks.find((d) => d.sessionId === 's0');
    const desks = new DeskAssignments();
    const desk = desks.assign('a1', 'p0', layout.desks, lead?.id);
    expect(desk?.sessionId).toBeUndefined();
    const cubicles = layout.desks.filter((d) => d.sessionId === undefined);
    const nearest = Math.min(...cubicles.map((d) => dist(d, lead as never)));
    expect(dist(desk as never, lead as never)).toBe(nearest);
  });

  it('seats a nested agent near its parent', () => {
    const layout = layoutWith(11);
    const lead = layout.desks.find((d) => d.sessionId === 's0');
    const desks = new DeskAssignments();
    for (let i = 0; i < CUBICLES_PER_CHUNK; i += 1)
      desks.assign(`filler${i}`, 'p0', layout.desks, lead?.id);
    const parent = desks.assign('parent', 'p0', layout.desks, lead?.id);
    const child = desks.assign('child', 'p0', layout.desks, parent?.id);
    // And it is the closest free one.
    const free = layout.desks.filter(
      (d) => d.sessionId === undefined && !desks.isTaken(d.id) && d.id !== child?.id,
    );
    for (const other of free)
      expect(dist(child as never, parent as never)).toBeLessThanOrEqual(
        dist(other, parent as never),
      );
  });

  it('never assigns the same desk twice and runs out gracefully', () => {
    const layout = layoutWith(CUBICLES_PER_CHUNK); // one full chunk of cubicles
    const desks = new DeskAssignments();
    const names = Array.from({ length: CUBICLES_PER_CHUNK }, (_, i) => `a${i}`);
    const ids = names.map((id) => desks.assign(id, 'p0', layout.desks)?.id);
    expect(new Set(ids).size).toBe(CUBICLES_PER_CHUNK);
    expect(ids.every((id) => id !== undefined)).toBe(true);
    expect(desks.assign('e', 'p0', layout.desks)).toBeUndefined();
  });

  it('is stable: asking again returns the same desk', () => {
    const layout = layoutWith(5);
    const desks = new DeskAssignments();
    const first = desks.assign('a', 'p0', layout.desks);
    desks.assign('b', 'p0', layout.desks);
    expect(desks.assign('a', 'p0', layout.desks)?.id).toBe(first?.id);
  });

  it('releases a desk so that the next agent can use it', () => {
    const layout = layoutWith(3);
    const desks = new DeskAssignments();
    for (const id of ['a', 'b', 'c']) desks.assign(id, 'p0', layout.desks);
    const freed = desks.deskIdOf('b');
    desks.release('b');
    expect(desks.deskIdOf('b')).toBeUndefined();
    expect(desks.isTaken(freed as string)).toBe(false);
    expect(desks.assign('g', 'p0', layout.desks)?.id).toBe(freed);
  });

  it('only uses desks of the agent room', () => {
    const layout = layoutWith(3, 2);
    const desks = new DeskAssignments();
    expect(desks.assign('a', 'p1', layout.desks)?.roomId).toBe('p1');
  });

  it('forgets assignments whose desk vanished from the layout', () => {
    const big = layoutWith(11);
    const small = layoutWith(CUBICLES_PER_CHUNK);
    const desks = new DeskAssignments();
    for (let i = 0; i <= CUBICLES_PER_CHUNK; i += 1) desks.assign(`a${i}`, 'p0', big.desks);
    const keptIds = new Set(small.desks.map((d) => d.id));
    const names = Array.from({ length: CUBICLES_PER_CHUNK + 1 }, (_, i) => `a${i}`);
    const expectedLost = names.filter((n) => !keptIds.has(desks.deskIdOf(n) as string));
    expect(expectedLost.length).toBeGreaterThan(0);
    expect(desks.reconcile(small.desks).sort()).toEqual(expectedLost.sort());
    for (const name of expectedLost) expect(desks.deskIdOf(name)).toBeUndefined();
    for (const name of names.filter((n) => !expectedLost.includes(n)))
      expect(desks.deskIdOf(name)).toBeDefined();
  });

  it('reseats the active agent that lost its desk when the layout shrinks', () => {
    const big = layoutWith(CUBICLES_PER_CHUNK * 2);
    const small = layoutWith(CUBICLES_PER_CHUNK);
    const desks = new DeskAssignments();
    const names = Array.from({ length: CUBICLES_PER_CHUNK * 2 }, (_, i) => `a${i}`);
    for (const n of names) desks.assign(n, 'p0', big.desks);
    // The agents of the vanishing chunk finished and left; the last one is still working.
    const keptIds = new Set(small.desks.map((d) => d.id));
    const gone = names.filter((n) => !keptIds.has(desks.deskIdOf(n) as string));
    const active = gone.pop() as string;
    for (const n of gone) desks.release(n);
    const finishedKept = names.find((n) => keptIds.has(desks.deskIdOf(n) as string)) as string;
    desks.release(finishedKept);
    expect(desks.reconcile(small.desks)).toEqual([active]);
    const seat = desks.assign(active, 'p0', small.desks);
    expect(seat).toBeDefined();
    expect(keptIds.has(seat?.id as string)).toBe(true);
  });
});

describe('conversation points', () => {
  const layout = layoutWith(2);
  const desk = layout.desks[0] as (typeof layout.desks)[number];
  const walkable = (t: { x: number; y: number }) => layout.collision[t.y]?.[t.x] === false;
  const spots = deskSpots(desk, walkable);
  const same = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    a.x === b.x && a.y === b.y;

  it('finds walkable talk and waiting tiles around the seat, facing it, never the seat', () => {
    expect(spots.talk.length).toBeGreaterThanOrEqual(2);
    expect(spots.wait.length).toBeGreaterThan(0);
    for (const spot of [...spots.talk, ...spots.wait]) {
      expect(walkable(spot.tile)).toBe(true);
      expect(same(spot.tile, desk.tile)).toBe(false);
    }
    const first = spots.talk[0] as (typeof spots.talk)[number];
    expect(first.facing).toBe(first.tile.x > desk.tile.x ? 'left' : 'right');
    const tiles = [...spots.talk, ...spots.wait].map((s) => `${s.tile.x},${s.tile.y}`);
    expect(new Set(tiles).size).toBe(tiles.length);
  });

  it('gives each visitor a distinct talk spot and keeps it stable', () => {
    const points = new ConversationPoints();
    const taken: string[] = [];
    for (let i = 0; i < spots.talk.length; i += 1) {
      const spot = points.acquire(`v${i}`, desk.id, spots);
      expect(points.isTalking(`v${i}`)).toBe(true);
      taken.push(`${spot?.tile.x},${spot?.tile.y}`);
    }
    expect(new Set(taken).size).toBe(spots.talk.length);
    expect(points.acquire('v0', desk.id, spots)?.tile).toEqual(spots.talk[0]?.tile);
  });

  it('makes extra visitors wait on their feet in order, then promotes the first in line', () => {
    const points = new ConversationPoints();
    for (let i = 0; i < spots.talk.length; i += 1) points.acquire(`v${i}`, desk.id, spots);
    const w1 = points.acquire('w1', desk.id, spots);
    const w2 = points.acquire('w2', desk.id, spots);
    expect(points.isTalking('w1')).toBe(false);
    expect(w1 && w2 && same(w1.tile, w2.tile)).toBe(false);
    expect(spots.wait.some((s) => w1 !== undefined && same(s.tile, w1.tile))).toBe(true);
    expect(points.queueLength(desk.id)).toBe(2);
    // The second in line does not jump the queue.
    points.release('v0');
    expect(points.acquire('w2', desk.id, spots)?.tile).toEqual(w2?.tile);
    expect(points.isTalking('w2')).toBe(false);
    expect(points.acquire('w1', desk.id, spots)?.tile).toEqual(spots.talk[0]?.tile);
    expect(points.isTalking('w1')).toBe(true);
    expect(points.queueLength(desk.id)).toBe(1);
  });

  it('returns undefined when even the waiting tiles are taken, and frees on release', () => {
    const points = new ConversationPoints();
    const total = spots.talk.length + spots.wait.length;
    for (let i = 0; i < total; i += 1)
      expect(points.acquire(`v${i}`, desk.id, spots)).toBeDefined();
    expect(points.acquire('late', desk.id, spots)).toBeUndefined();
    points.release(`v${total - 1}`);
    expect(points.acquire('late', desk.id, spots)).toBeDefined();
  });
});
