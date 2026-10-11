/** Initial game size, used before the first measurement of the window. */
export const GAME_WIDTH = 480;
export const GAME_HEIGHT = 270;
/** Logical height the zoom aims at: the view is never shorter than this many game pixels. */
export const TARGET_HEIGHT = 240;
/** The view is never narrower than this many game pixels (narrow windows lower the zoom). */
export const MIN_WIDTH = 256;

export interface Viewport {
  /** CSS pixels per game pixel (a whole number of device pixels). */
  zoom: number;
  /** Logical game size that fills the window at that zoom. */
  width: number;
  height: number;
}

/**
 * Integer zoom (in device pixels) that keeps at least {@link TARGET_HEIGHT} game pixels of height
 * and {@link MIN_WIDTH} of width, and the game size that fills the whole window at that zoom
 * (no letterbox). `zoom` is returned in CSS pixels per game pixel (so `1 / dpr` at the minimum).
 */
export function computeViewport(viewportWidth: number, viewportHeight: number, dpr = 1): Viewport {
  const ratio = dpr > 0 ? dpr : 1;
  const deviceW = Math.max(1, viewportWidth * ratio);
  const deviceH = Math.max(1, viewportHeight * ratio);
  const device = Math.max(
    1,
    Math.min(Math.floor(deviceH / TARGET_HEIGHT), Math.floor(deviceW / MIN_WIDTH)),
  );
  return {
    zoom: device / ratio,
    width: Math.ceil(deviceW / device),
    height: Math.ceil(deviceH / device),
  };
}

/**
 * True when the canvas must be resized: any of zoom, width or height differs from the last applied
 * viewport (resizing clears the canvas, so equal values must never reach it).
 */
export function viewportChanged(last: Viewport | undefined, next: Viewport): boolean {
  return (
    !last || last.zoom !== next.zoom || last.width !== next.width || last.height !== next.height
  );
}
