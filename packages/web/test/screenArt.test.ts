import { describe, expect, it } from 'vitest';
import { ACTIVITIES } from '../src/characters/characterMachine';
import { secondaryMode } from '../src/world/deskScreens';
import {
  drawScreen,
  SCREEN_GLOW,
  SCREEN_MODES,
  type ScreenMode,
  screenModeFor,
} from '../src/world/screenArt';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  color: number;
}

const render = (mode: ScreenMode, w: number, h: number, frame: number, seed = 3): Rect[] => {
  const rects: Rect[] = [];
  drawScreen(
    (x, y, rw, rh, color) => rects.push({ x, y, w: rw, h: rh, color }),
    mode,
    w,
    h,
    frame,
    seed,
  );
  return rects;
};

describe('screen art', () => {
  it('every seated activity has a screen and a glow', () => {
    for (const activity of ACTIVITIES) {
      const mode = screenModeFor(activity);
      expect(SCREEN_MODES).toContain(mode);
      expect(SCREEN_GLOW[mode]).toBeDefined();
    }
    expect(SCREEN_GLOW.off).toBeUndefined();
  });

  it('draws inside the glass for every mode, size and frame', () => {
    // The glass sizes of the default skin's monitors, and a tiny one.
    for (const [w, h] of [
      [16, 11],
      [11, 9],
      [6, 4],
    ] as const) {
      for (const mode of SCREEN_MODES) {
        for (let frame = 0; frame < 40; frame += 1) {
          const rects = render(mode, w, h, frame);
          expect(rects.length).toBeGreaterThan(0);
          for (const r of rects) {
            expect(r.w).toBeGreaterThan(0);
            expect(r.h).toBeGreaterThan(0);
            expect(r.x).toBeGreaterThanOrEqual(0);
            expect(r.y).toBeGreaterThanOrEqual(0);
            expect(r.x + r.w).toBeLessThanOrEqual(w);
            expect(r.y + r.h).toBeLessThanOrEqual(h);
          }
        }
      }
    }
  });

  it('animates (frames differ) and is deterministic', () => {
    for (const mode of ['code', 'terminal', 'think', 'summon'] as const) {
      const frames = new Set(
        Array.from({ length: 24 }, (_, f) => JSON.stringify(render(mode, 16, 11, f))),
      );
      expect(frames.size).toBeGreaterThan(1);
      expect(render(mode, 16, 11, 5)).toEqual(render(mode, 16, 11, 5));
    }
  });

  it('the side monitors show the dashboard while working, the same alert otherwise', () => {
    expect(secondaryMode('code')).toBe('dashboard');
    expect(secondaryMode('summon')).toBe('summon');
    expect(secondaryMode('wait')).toBe('wait');
    expect(secondaryMode('off')).toBe('off');
  });
});
