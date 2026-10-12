import { describe, expect, it } from 'vitest';
import {
  BADGE_BOB_PX,
  type BoardAffordanceState,
  badgeBobOffset,
  boardAffordanceFrame,
  boardAffordanceVisible,
  GLOW_MAX_ALPHA,
  GLOW_MIN_ALPHA,
  glowAlpha,
} from '../src/world/boardAffordanceLogic';

const open: BoardAffordanceState = {
  desktop: true,
  boardOpen: false,
  helpOpen: false,
  dialogOpen: false,
  overview: false,
};

describe('boardAffordanceVisible', () => {
  it('shows in the desktop app with nothing else open', () => {
    expect(boardAffordanceVisible(open)).toBe(true);
  });

  it('never shows in a plain browser', () => {
    expect(boardAffordanceVisible({ ...open, desktop: false })).toBe(false);
  });

  it.each(['boardOpen', 'helpOpen', 'dialogOpen', 'overview'] as const)('hides while %s', (key) => {
    expect(boardAffordanceVisible({ ...open, [key]: true })).toBe(false);
  });
});

describe('badgeBobOffset', () => {
  it('stays within whole pixels from -BADGE_BOB_PX to 0', () => {
    for (let now = 0; now < 4000; now += 37) {
      const offset = badgeBobOffset(now);
      expect(Number.isInteger(offset)).toBe(true);
      expect(offset).toBeLessThanOrEqual(0);
      expect(offset).toBeGreaterThanOrEqual(-BADGE_BOB_PX);
    }
  });

  it('is deterministic and periodic', () => {
    expect(badgeBobOffset(500)).toBe(badgeBobOffset(500));
    expect(badgeBobOffset(500)).toBe(badgeBobOffset(500 + 1800));
  });

  it('actually moves', () => {
    const seen = new Set<number>();
    for (let now = 0; now < 1800; now += 50) seen.add(badgeBobOffset(now));
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('glowAlpha', () => {
  it('pulses inside the discreet range', () => {
    let min = 1;
    let max = 0;
    for (let now = 0; now < 5000; now += 20) {
      const alpha = glowAlpha(now);
      min = Math.min(min, alpha);
      max = Math.max(max, alpha);
      expect(alpha).toBeGreaterThanOrEqual(GLOW_MIN_ALPHA - 1e-9);
      expect(alpha).toBeLessThanOrEqual(GLOW_MAX_ALPHA + 1e-9);
    }
    expect(max - min).toBeGreaterThan(0.1);
  });

  it('is deterministic for the same clock', () => {
    expect(glowAlpha(1234)).toBe(glowAlpha(1234));
  });
});

describe('boardAffordanceFrame', () => {
  it('shows badge and glow when idle', () => {
    const frame = boardAffordanceFrame(open, false, 0);
    expect(frame).toMatchObject({ badge: true, glow: true });
  });

  it('swaps the glow for the outline on hover (badge stays)', () => {
    expect(boardAffordanceFrame(open, true, 0)).toMatchObject({ badge: true, glow: false });
  });

  it('shows nothing without desktop or with the board overlay open', () => {
    expect(boardAffordanceFrame({ ...open, desktop: false }, false, 0)).toMatchObject({
      badge: false,
      glow: false,
    });
    expect(boardAffordanceFrame({ ...open, boardOpen: true }, false, 0)).toMatchObject({
      badge: false,
      glow: false,
    });
  });
});
