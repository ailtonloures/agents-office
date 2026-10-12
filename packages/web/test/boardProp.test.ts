import { describe, expect, it } from 'vitest';
import { boardAtPoint, boardSpots } from '../src/world/boardProp';
import { type LayoutProjectInput, layoutBuilding } from '../src/world/roomLayout';

describe('whiteboard prop', () => {
  const build = (n: number) =>
    layoutBuilding(
      Array.from({ length: n }, (_, i) => ({
        id: `p${i}`,
        name: `p${i}`,
        firstSeen: i,
        sessions: [{ agentCount: 0 }],
      })) as unknown as LayoutProjectInput[],
    );

  it('has exactly one whiteboard per workspace', () => {
    for (const n of [1, 2, 3, 5]) {
      const layout = build(n);
      expect(layout.props.filter((p) => p.id === 'whiteboard')).toHaveLength(n);
      const spots = boardSpots(layout);
      expect(spots).toHaveLength(n);
      expect(new Set(spots.map((s) => s.roomId)).size).toBe(n);
    }
  });

  it('has no whiteboard without workspaces', () => {
    expect(boardSpots(build(0))).toHaveLength(0);
  });

  it('hits only inside the board', () => {
    const spot = { roomId: 'r', x: 10, y: 1, w: 2 };
    expect(boardAtPoint([spot], { x: 168, y: 20 }, 16)).toBe(spot);
    expect(boardAtPoint([spot], { x: 100, y: 20 }, 16)).toBeUndefined();
    expect(boardAtPoint([spot], { x: 168, y: 100 }, 16)).toBeUndefined();
  });
});
