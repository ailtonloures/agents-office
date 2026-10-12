export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 3;
export const ZOOM_STEP = 0.25;
export const ZOOM_DEFAULT = 1;
export const ZOOM_STORAGE_KEY = 'agents-office.zoom';

/** Game event (on `game.events`) asking the office scene to zoom one step: payload `1 | -1`. */
export const ZOOM_STEP_EVENT = 'zoom-step';

/** Game event (on `game.events`) published by the scene when the zoom or the overview changes. */
export const ZOOM_CHANGED_EVENT = 'zoom-changed';

/**
 * Game event (on `game.events`) published by the terminal panel with the tab id of the open
 * terminal (`string`), or `undefined` when the panel is collapsed or has no tabs.
 */
export const TERMINAL_ACTIVE_EVENT = 'terminal-active';

/** Registry key holding the last value of TERMINAL_ACTIVE_EVENT (the scene may boot later). */
export const REGISTRY_ACTIVE_TERMINAL = 'activeTerminal';

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

/**
 * Rounds a user zoom so the effective zoom (`zoom * renderScale`, canvas pixels per texel) is a
 * whole number: every texel then covers the same number of pixels and the pixel art stays crisp.
 * Below one canvas pixel per texel there is nothing to round to; the zoom is kept as is.
 */
export function snapZoom(zoom: number, renderScale: number): number {
  const effective = zoom * renderScale;
  return effective >= 1 ? Math.round(effective) / renderScale : zoom;
}

/** Like {@link stepZoom}, but lands on a crisp (whole effective) zoom and always moves one level. */
export function stepZoomCrisp(zoom: number, direction: ZoomDirection, renderScale: number): number {
  const target = stepZoom(zoom, direction);
  const snapped = snapZoom(target, renderScale);
  const current = snapZoom(zoom, renderScale);
  if (snapped !== current || target === zoom) return clampZoom(snapped);
  // The step was smaller than one whole effective pixel: move a full level instead.
  const level = Math.round(current * renderScale) + direction;
  return clampZoom(level >= 1 ? level / renderScale : target);
}

/** Texture filter for an effective zoom: nearest keeps pixel art hard, linear averages minified texels. */
export type TextureFilter = 'nearest' | 'linear';
export function textureFilterFor(effectiveZoom: number): TextureFilter {
  return effectiveZoom < 1 ? 'linear' : 'nearest';
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
