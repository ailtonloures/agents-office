import { describe, expect, it } from 'vitest';
import { DeskAssignments } from '../src/characters/deskAssignment';
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
    // Fill the first chunk, then the parent lands in the second one.
    for (let i = 0; i < CUBICLES_PER_CHUNK; i += 1)
      desks.assign(`filler${i}`, 'p0', layout.desks, lead?.id);
    const parent = desks.assign('parent', 'p0', layout.desks, lead?.id);
    const child = desks.assign('child', 'p0', layout.desks, parent?.id);
    const index = (id?: string) => Number(id?.split(':').pop());
    expect(index(parent?.id)).toBeGreaterThanOrEqual(CUBICLES_PER_CHUNK);
    // Same chunk as the parent, not the leftovers of any other chunk.
    expect(index(child?.id)).toBeGreaterThanOrEqual(CUBICLES_PER_CHUNK);
    expect(index(child?.id)).toBeLessThan(2 * CUBICLES_PER_CHUNK);
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
    const layout = layoutWith(3); // one chunk of cubicles
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
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) desks.assign(id, 'p0', layout.desks);
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
    const small = layoutWith(3);
    const desks = new DeskAssignments();
    for (let i = 0; i <= CUBICLES_PER_CHUNK; i += 1) desks.assign(`a${i}`, 'p0', big.desks);
    const last = `a${CUBICLES_PER_CHUNK}`;
    expect(desks.reconcile(small.desks)).toEqual([last]);
    expect(desks.deskIdOf(last)).toBeUndefined();
    expect(desks.deskIdOf('a0')).toBeDefined();
  });
});
