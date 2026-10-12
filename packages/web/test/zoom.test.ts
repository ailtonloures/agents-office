import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clampZoom,
  readStoredZoom,
  snapZoom,
  stepZoom,
  stepZoomCrisp,
  textureFilterFor,
  wheelDirection,
  writeStoredZoom,
  ZOOM_DEFAULT,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STORAGE_KEY,
} from '../src/zoom';

function stubStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  });
  return data;
}

afterEach(() => vi.unstubAllGlobals());

describe('clampZoom / stepZoom', () => {
  it('keeps the zoom inside the limits', () => {
    expect(clampZoom(0.1)).toBe(ZOOM_MIN);
    expect(clampZoom(9)).toBe(ZOOM_MAX);
    expect(clampZoom(1.5)).toBe(1.5);
  });

  it('moves in steps of 0.25', () => {
    expect(stepZoom(1, 1)).toBe(1.25);
    expect(stepZoom(1, -1)).toBe(0.75);
  });

  it('stops at the limits', () => {
    expect(stepZoom(ZOOM_MAX, 1)).toBe(ZOOM_MAX);
    expect(stepZoom(ZOOM_MIN, -1)).toBe(ZOOM_MIN);
    expect(stepZoom(2.75, 1)).toBe(ZOOM_MAX);
    expect(stepZoom(0.3, -1)).toBe(ZOOM_MIN);
  });

  it('rounds an off-step value to the step', () => {
    expect(stepZoom(1.1, 1)).toBe(1.25);
    expect(stepZoom(1.1, -1)).toBe(0.75);
  });

  it('reaches both limits from the default', () => {
    let zoom = ZOOM_DEFAULT;
    for (let i = 0; i < 20; i++) zoom = stepZoom(zoom, 1);
    expect(zoom).toBe(ZOOM_MAX);
    for (let i = 0; i < 20; i++) zoom = stepZoom(zoom, -1);
    expect(zoom).toBe(ZOOM_MIN);
  });
});

describe('wheelDirection', () => {
  it('zooms in when scrolling up and out when scrolling down', () => {
    expect(wheelDirection(-100)).toBe(1);
    expect(wheelDirection(100)).toBe(-1);
  });
});

describe('stored zoom', () => {
  it('round-trips a valid value', () => {
    const data = stubStorage();
    writeStoredZoom(1.75);
    expect(data.get(ZOOM_STORAGE_KEY)).toBe('1.75');
    expect(readStoredZoom()).toBe(1.75);
  });

  it.each(['', 'abc', 'NaN', '0.1', '5', 'Infinity'])('falls back to the default for %j', (raw) => {
    stubStorage({ [ZOOM_STORAGE_KEY]: raw });
    expect(readStoredZoom()).toBe(ZOOM_DEFAULT);
  });

  it('uses the default when nothing is stored', () => {
    stubStorage();
    expect(readStoredZoom()).toBe(ZOOM_DEFAULT);
  });

  it('survives an unavailable storage', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    });
    expect(readStoredZoom()).toBe(ZOOM_DEFAULT);
    expect(() => writeStoredZoom(2)).not.toThrow();
  });
});

describe('crisp zoom', () => {
  it('snaps to a whole number of canvas pixels per texel', () => {
    expect(snapZoom(0.75, 3)).toBeCloseTo(2 / 3);
    expect(snapZoom(1, 3)).toBe(1);
    expect(snapZoom(1.25, 2)).toBe(1.5);
  });

  it('keeps the zoom when it is below one pixel per texel', () => {
    expect(snapZoom(0.5, 1)).toBe(0.5);
  });

  it('always moves one level and stays whole', () => {
    let zoom = 1;
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      zoom = stepZoomCrisp(zoom, -1, 3);
      seen.push(zoom);
    }
    expect(seen[0]).toBeCloseTo(2 / 3);
    expect(seen[1]).toBeCloseTo(1 / 3); // one canvas pixel per texel
    expect(seen[3]).toBe(ZOOM_MIN); // beyond that the linear filter takes over
  });

  it('uses a linear filter only when texels are minified', () => {
    expect(textureFilterFor(0.5)).toBe('linear');
    expect(textureFilterFor(1)).toBe('nearest');
  });
});
