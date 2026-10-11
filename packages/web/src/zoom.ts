export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 3;
export const ZOOM_STEP = 0.25;
export const ZOOM_DEFAULT = 1;
export const ZOOM_STORAGE_KEY = 'agents-office.zoom';

/** Game event (on `game.events`) asking the office scene to zoom one step: payload `1 | -1`. */
export const ZOOM_STEP_EVENT = 'zoom-step';

/** Game event (on `game.events`) published by the scene when the zoom or the overview changes. */
export const ZOOM_CHANGED_EVENT = 'zoom-changed';

export interface ZoomChange {
  zoom: number;
  overview: boolean;
}

export type ZoomDirection = 1 | -1;

export function clampZoom(zoom: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

/** One step closer (1) or farther (-1): lands on a multiple of the step, inside the limits. */
export function stepZoom(zoom: number, direction: ZoomDirection): number {
  const next = Math.round(zoom / ZOOM_STEP + direction) * ZOOM_STEP;
  return clampZoom(next);
}

/** A wheel that scrolls up (negative deltaY) zooms in. */
export function wheelDirection(deltaY: number): ZoomDirection {
  return deltaY < 0 ? 1 : -1;
}

/** The remembered zoom; anything missing, not a number or out of range is the default. */
export function readStoredZoom(): number {
  try {
    const raw = localStorage.getItem(ZOOM_STORAGE_KEY);
    if (raw === null || raw.trim() === '') return ZOOM_DEFAULT;
    const value = Number(raw);
    return Number.isFinite(value) && value >= ZOOM_MIN && value <= ZOOM_MAX ? value : ZOOM_DEFAULT;
  } catch {
    return ZOOM_DEFAULT;
  }
}

export function writeStoredZoom(zoom: number): void {
  try {
    localStorage.setItem(ZOOM_STORAGE_KEY, String(zoom));
  } catch {
    // Not remembering the zoom is harmless.
  }
}
