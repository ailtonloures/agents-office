import { describe, expect, it } from 'vitest';
import { groundRect } from '../src/world/groundLogic';

const building = { x: 0, y: 0, width: 640, height: 480 };

describe('groundRect', () => {
  it('adds only the margin when the view fits inside the building', () => {
    const view = { x: 100, y: 50, width: 427, height: 240 };
    expect(groundRect(view, building, 32)).toEqual({ x: -32, y: -32, width: 704, height: 544 });
  });

  it('covers a 1920x1080 view (480x270) that fits inside the building', () => {
    const view = { x: 0, y: 0, width: 480, height: 270 };
    expect(groundRect(view, building, 0)).toEqual(building);
  });

  it('extends to the right of the building for a 3440x1440 view (573x240) wider than it', () => {
    const wide = { x: 0, y: 0, width: 1024, height: 480 };
    const view = { x: 0, y: -22, width: 1146, height: 480 };
    const rect = groundRect(view, wide, 16);
    expect(rect.x).toBe(-16);
    expect(rect.x + rect.width).toBeGreaterThanOrEqual(1146 + 16);
  });

  it('covers a 5120x1440 view (853x240) over a 512 wide building', () => {
    const small = { x: 0, y: 0, width: 512, height: 400 };
    const view = { x: 0, y: -22, width: 853, height: 240 };
    const rect = groundRect(view, small, 0);
    expect(rect).toEqual({ x: 0, y: -22, width: 853, height: 422 });
  });

  it('covers a narrower view (terminal open) the same as the building plus margin', () => {
    const view = { x: 0, y: 0, width: 300, height: 240 };
    expect(groundRect(view, building, 8)).toEqual({ x: -8, y: -8, width: 656, height: 496 });
  });

  it('covers a zoomed-out overview view that is far larger than the building', () => {
    const view = { x: -800, y: -600, width: 2400, height: 1700 };
    const rect = groundRect(view, building, 0);
    expect(rect).toEqual({ x: -800, y: -600, width: 2400, height: 1700 });
  });

  it('covers a view that sticks out on the left and top', () => {
    const view = { x: -50, y: -40, width: 100, height: 100 };
    const rect = groundRect(view, building, 0);
    expect(rect).toEqual({ x: -50, y: -40, width: 690, height: 520 });
  });

  it('does not throw with zero, negative or non-finite values', () => {
    const empty = { x: 0, y: 0, width: 0, height: 0 };
    expect(() => groundRect(empty, empty, 0)).not.toThrow();
    expect(groundRect(empty, empty, -5)).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    const bad = { x: Number.NaN, y: 0, width: -10, height: Number.POSITIVE_INFINITY };
    const rect = groundRect(bad, building, 0);
    expect(rect).toEqual(building);
  });
});
