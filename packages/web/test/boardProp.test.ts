import { describe, expect, it } from 'vitest';
import { setLocale } from '../src/i18n/i18n';
import { boardAtPoi, boardAtPoint, boardLabel, boardSpots } from '../src/world/boardProp';
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

  it('keeps every board and its tile inside the room bounds', () => {
    const layout = build(3);
    const inside = (r: { x: number; y: number; w: number; h: number }, x: number, y: number) =>
      x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
    for (const spot of boardSpots(layout)) {
      const bounds = layout.roomBounds[spot.roomId];
      expect(bounds && inside(bounds, spot.x, spot.y)).toBe(true);
      expect(bounds && inside(bounds, spot.x + spot.w - 1, spot.y)).toBe(true);
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

  it('counts the floating badge above the board as part of it', () => {
    const spot = { roomId: 'r', x: 10, y: 3, w: 2 };
    // Board top is (3 - 1) * 16 = 32; the badge floats up to 14px above.
    expect(boardAtPoint([spot], { x: 168, y: 20 }, 16)).toBe(spot);
    expect(boardAtPoint([spot], { x: 168, y: 10 }, 16)).toBeUndefined();
  });

  it('labels the hover with the explicit action', () => {
    expect(boardLabel()).toBe('Board — click to draw');
    setLocale('pt-BR');
    expect(boardLabel()).toBe('Quadro — clique para desenhar');
    setLocale('es');
    expect(boardLabel()).toBe('Pizarra — haz clic para dibujar');
    setLocale('en');
  });

  it('finds the board from its drawing spot, one per room, inside the room', () => {
    const layout = build(3);
    const spots = boardSpots(layout);
    for (const spot of spots) {
      const poi = layout.pois.find((p) => p.type === 'whiteboard' && p.roomId === spot.roomId);
      if (!poi) throw new Error('missing whiteboard poi');
      expect(boardAtPoi(layout, spots, poi.tile)).toBe(spot);
      // One row further from the board does not count.
      expect(boardAtPoi(layout, spots, { x: poi.tile.x, y: poi.tile.y + 1 })).toBeUndefined();
    }
  });
});
