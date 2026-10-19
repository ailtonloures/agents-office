import { describe, expect, it } from 'vitest';
import {
  canvasCssSize,
  computeViewport,
  viewportChanged,
  viewportForArea,
  worldViewSize,
} from '../src/scale';

describe('computeViewport', () => {
  it.each([
    [1280, 720, 1, 3, 427, 240],
    [1920, 1080, 1, 4, 480, 270],
    [2560, 1440, 1, 6, 427, 240],
    [1366, 768, 1, 3, 456, 256],
    [480, 270, 1, 1, 480, 270],
    [100, 100, 1, 1, 100, 100],
  ])('%ix%i @%ix -> zoom %i, %ix%i', (w, h, dpr, zoom, width, height) => {
    // Without HiDPI the canvas is drawn 1:1 with the screen: render scale equals the zoom.
    expect(computeViewport(w, h, dpr)).toEqual({ zoom, renderScale: zoom, width, height });
  });

  it('fills the window: zoom times size covers every CSS pixel', () => {
    for (const [w, h] of [
      [1280, 720],
      [1440, 900],
      [1000, 1000],
    ] as const) {
      const v = computeViewport(w, h);
      expect(v.width * v.zoom).toBeGreaterThanOrEqual(w);
      expect(v.height * v.zoom).toBeGreaterThanOrEqual(h);
      expect((v.width - 1) * v.zoom).toBeLessThan(w);
    }
  });

  it('lowers the zoom on narrow windows so the view keeps a minimum width', () => {
    const v = computeViewport(600, 1000);
    expect(v.zoom).toBe(2);
    expect(v.width).toBe(300);
  });

  it('keeps whole device pixels on HiDPI screens', () => {
    // 2560x1440 device px -> 6x -> 3 CSS px per game pixel.
    expect(computeViewport(1280, 720, 2)).toEqual({
      zoom: 3,
      renderScale: 6,
      width: 427,
      height: 240,
    });
    expect(computeViewport(700, 400, 1.25).zoom).toBeCloseTo(1.6); // 2 device px per game pixel
    expect(computeViewport(700, 400, 1.25).renderScale).toBe(2);
  });
});

describe('viewportChanged', () => {
  const base = { zoom: 3, renderScale: 3, width: 427, height: 240 };

  it('accepts the first viewport', () => {
    expect(viewportChanged(undefined, base)).toBe(true);
  });

  it('ignores equal values', () => {
    expect(viewportChanged(base, { ...base })).toBe(false);
  });

  it.each([
    ['zoom', { zoom: 4 }],
    ['renderScale', { renderScale: 4 }],
    ['width', { width: 428 }],
    ['height', { height: 241 }],
  ])('accepts a change of %s', (_name, patch) => {
    expect(viewportChanged(base, { ...base, ...patch })).toBe(true);
  });
});

describe('viewportForArea', () => {
  it('keeps the zoom of the whole window whatever the terminal takes', () => {
    const full = computeViewport(1280, 720);
    for (const [w, h] of [
      [1280, 720],
      [640, 720],
      [1280, 300],
      [300, 720],
    ] as const) {
      const v = viewportForArea(w, h, 1280, 720);
      expect(v.zoom).toBe(full.zoom);
      expect(v.renderScale).toBe(full.renderScale);
      expect(v.width * v.zoom).toBeGreaterThanOrEqual(w);
      expect(v.height * v.zoom).toBeGreaterThanOrEqual(h);
    }
  });

  it('matches computeViewport when the area is the whole window', () => {
    expect(viewportForArea(1366, 768, 1366, 768, 2)).toEqual(computeViewport(1366, 768, 2));
  });
});

describe('canvasCssSize', () => {
  it.each([
    [1280, 720, 1],
    [1920, 1080, 1],
    [3440, 1440, 1],
    [1920, 1080, 1.5],
    [1920, 1080, 2],
  ])('%ix%i @%ix: width * zoom by height * zoom', (w, h, dpr) => {
    const v = computeViewport(w, h, dpr);
    const css = canvasCssSize(v);
    expect(css).toEqual({ width: v.width * v.zoom, height: v.height * v.zoom });
    expect(css.width).toBeGreaterThanOrEqual(w);
    expect(css.height).toBeGreaterThanOrEqual(h);
  });

  it('is exact for a known viewport', () => {
    expect(canvasCssSize({ zoom: 3, renderScale: 3, width: 427, height: 240 })).toEqual({
      width: 1281,
      height: 720,
    });
  });
});

describe('terminal opens and closes', () => {
  it.each([1, 1.5, 2])('keeps zoom and renderScale at dpr %s and restores on close', (dpr) => {
    const closed = viewportForArea(1920, 1080, 1920, 1080, dpr);
    const open = viewportForArea(1920, 540, 1920, 1080, dpr);
    expect(open.zoom).toBe(closed.zoom);
    expect(open.renderScale).toBe(closed.renderScale);
    expect(open.height).toBeLessThan(closed.height);
    expect(open.width).toBe(closed.width);
    expect(viewportForArea(1920, 1080, 1920, 1080, dpr)).toEqual(closed);
  });
});

describe('worldViewSize', () => {
  it('is the logical size divided by the user zoom, independent of the camera', () => {
    expect(worldViewSize({ width: 480, height: 270 }, 2)).toEqual({ width: 240, height: 135 });
    expect(worldViewSize({ width: 480, height: 270 }, 1)).toEqual({ width: 480, height: 270 });
  });
});
