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
  /**
   * Device pixels per game pixel (a whole number). The canvas is rendered at `width * renderScale`
   * so it maps 1:1 to the screen: the world stays sharp when the camera zooms out.
   */
  renderScale: number;
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
  return viewportForArea(viewportWidth, viewportHeight, viewportWidth, viewportHeight, dpr);
}

/**
 * Like {@link computeViewport}, but the zoom comes from the whole window while the game size fills
 * only the office area (the window minus the terminal panel). Opening, closing or moving the
 * terminal therefore never changes the scale: the office stays at the same size and the area just
 * shows more or less of it.
 */
export function viewportForArea(
  areaWidth: number,
  areaHeight: number,
  windowWidth: number,
  windowHeight: number,
  dpr = 1,
): Viewport {
  const ratio = dpr > 0 ? dpr : 1;
  const device = Math.max(
    1,
    Math.min(
      Math.floor(Math.max(1, windowHeight * ratio) / TARGET_HEIGHT),
      Math.floor(Math.max(1, windowWidth * ratio) / MIN_WIDTH),
    ),
  );
  return {
    zoom: device / ratio,
    renderScale: device,
    width: Math.ceil(Math.max(1, areaWidth * ratio) / device),
    height: Math.ceil(Math.max(1, areaHeight * ratio) / device),
  };
}

/**
 * True when the canvas must be resized: any of zoom, width or height differs from the last applied
 * viewport (resizing clears the canvas, so equal values must never reach it).
 */
export function viewportChanged(last: Viewport | undefined, next: Viewport): boolean {
  return (
    !last ||
    last.zoom !== next.zoom ||
    last.renderScale !== next.renderScale ||
    last.width !== next.width ||
    last.height !== next.height
  );
}

/**
 * CSS size of the canvas element for a viewport: the logical size times the zoom. Written to
 * `canvas.style` explicitly so it never depends on the scale manager's own bookkeeping.
 */
export function canvasCssSize(viewport: Viewport): { width: number; height: number } {
  return { width: viewport.width * viewport.zoom, height: viewport.height * viewport.zoom };
}

/**
 * World pixels the camera shows at a user zoom, from the logical game size. Unlike
 * `camera.displayWidth` it does not depend on whether the camera has already been resized.
 */
export function worldViewSize(
  logical: { width: number; height: number },
  userZoom: number,
): { width: number; height: number } {
  return { width: logical.width / userZoom, height: logical.height / userZoom };
}
