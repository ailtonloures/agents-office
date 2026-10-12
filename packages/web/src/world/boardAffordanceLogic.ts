// Interactivity signals of the whiteboard (spec 093): a floating badge and a soft pulsing glow.
// Pure: the scene gathers the facts and draws; `now` is injected so it is testable without Phaser.

/** What hides the signals: they only make sense while the board can actually be opened by a click. */
export interface BoardAffordanceState {
  /** Running inside the desktop app (the board does not work in a plain browser). */
  desktop: boolean;
  /** The Excalidraw overlay is open. */
  boardOpen: boolean;
  helpOpen: boolean;
  dialogOpen: boolean;
  /** The zoomed-out map of the whole building. */
  overview: boolean;
}

export function boardAffordanceVisible(state: BoardAffordanceState): boolean {
  return (
    state.desktop && !state.boardOpen && !state.helpOpen && !state.dialogOpen && !state.overview
  );
}

/** World pixels the badge floats up and down (a gentle, whole-pixel bob keeps the pixel art crisp). */
export const BADGE_BOB_PX = 2;
const BADGE_BOB_PERIOD_MS = 1800;

/** Vertical offset of the badge at `now` (ms): `0..-BADGE_BOB_PX`, integer. */
export function badgeBobOffset(now: number): number {
  const wave = (Math.sin((now / BADGE_BOB_PERIOD_MS) * Math.PI * 2) + 1) / 2;
  return -Math.round(wave * BADGE_BOB_PX);
}

/** Alpha range of the glow: discreet so it never competes with the agents' monitors. */
export const GLOW_MIN_ALPHA = 0.1;
export const GLOW_MAX_ALPHA = 0.32;

/** Same pulse family as the active Tech Lead outline (`0.65 + 0.35 * |sin(now / 400)|`), slowed down. */
export function glowAlpha(now: number): number {
  const pulse = 0.65 + 0.35 * Math.abs(Math.sin(now / 700));
  return GLOW_MIN_ALPHA + (GLOW_MAX_ALPHA - GLOW_MIN_ALPHA) * ((pulse - 0.65) / 0.35);
}

/** The whole signal for a frame: nothing when hidden, and no glow while hovered (outline takes over). */
export interface BoardAffordanceFrame {
  badge: boolean;
  glow: boolean;
  badgeOffset: number;
  glowAlpha: number;
}

export function boardAffordanceFrame(
  state: BoardAffordanceState,
  hovered: boolean,
  now: number,
): BoardAffordanceFrame {
  const visible = boardAffordanceVisible(state);
  return {
    badge: visible,
    glow: visible && !hovered,
    badgeOffset: badgeBobOffset(now),
    glowAlpha: glowAlpha(now),
  };
}
