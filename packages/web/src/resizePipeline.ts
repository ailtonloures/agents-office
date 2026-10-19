import { type Viewport, viewportChanged } from './scale';

/** The engine operations the resize pipeline drives (injected, so the order is testable). */
export interface ResizePipelineDeps {
  /** Assigns the zoom (no `resize` event of its own); also publishes the render scale. */
  setZoom(viewport: Viewport): void;
  /** Resizes the game; clears the canvas and emits the single `resize` the scenes lay out on. */
  resize(width: number, height: number): void;
  /** Writes the canvas CSS size. */
  applyStyle(viewport: Viewport): void;
  /** Re-measures the canvas bounds and display scale (does not clear the canvas). */
  refresh(): void;
}

/**
 * Applies the next viewport and returns the one now applied (the same object when nothing changed).
 * The canvas CSS size is always written before the engine re-measures, so the pointer mapping
 * (canvas bounds and display scale) matches what is on screen. Resizing clears the canvas, so it
 * only runs when the viewport changed.
 */
export function applyResizePipeline(
  deps: ResizePipelineDeps,
  applied: Viewport | undefined,
  next: Viewport,
): Viewport {
  if (!viewportChanged(applied, next)) {
    // The container may have moved even though the size did not.
    deps.applyStyle(next);
    deps.refresh();
    return applied as Viewport;
  }
  deps.setZoom(next);
  deps.resize(next.width * next.renderScale, next.height * next.renderScale);
  deps.applyStyle(next);
  deps.refresh();
  return next;
}
