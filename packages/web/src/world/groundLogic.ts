export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A rectangle with finite coordinates and a non-negative size (anything else becomes zero). */
function sane(rect: Rect): Rect {
  const finite = (n: number) => (Number.isFinite(n) ? n : 0);
  return {
    x: finite(rect.x),
    y: finite(rect.y),
    width: Math.max(0, finite(rect.width)),
    height: Math.max(0, finite(rect.height)),
  };
}

/**
 * The decorative ground behind the building: the union of the building and the camera view (both
 * in world pixels), grown by `margin` on every side. Pure, so it is tested without Phaser.
 */
export function groundRect(view: Rect, building: Rect, margin: number): Rect {
  const a = sane(building);
  const b = sane(view);
  const m = Math.max(0, Number.isFinite(margin) ? margin : 0);
  const left = Math.min(a.x, b.x) - m;
  const top = Math.min(a.y, b.y) - m;
  const right = Math.max(a.x + a.width, b.x + b.width) + m;
  const bottom = Math.max(a.y + a.height, b.y + b.height) + m;
  return { x: left, y: top, width: right - left, height: bottom - top };
}
