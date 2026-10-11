import { describe, expect, it } from 'vitest';
import { applyPaletteSwap, buildSwapTable, outlineFrames, shade } from '../src/characters/palette';

describe('palette helpers', () => {
  it('swaps only opaque pixels matching a base color', () => {
    const data = new Uint8ClampedArray([255, 0, 255, 255, 255, 0, 255, 0, 1, 2, 3, 255]);
    applyPaletteSwap(data, buildSwapTable([['#ff00ff', [10, 20, 30]]]));
    expect([...data]).toEqual([10, 20, 30, 255, 255, 0, 255, 0, 1, 2, 3, 255]);
  });

  it('shade darkens', () => {
    expect(shade([100, 200, 50], 0.5)).toEqual([50, 100, 25]);
  });

  it('outlines each frame independently', () => {
    // Two 3x3 frames side by side (6x3 sheet).
    const w = 6;
    const data = new Uint8ClampedArray(w * 3 * 4);
    data[(1 * w + 1) * 4 + 3] = 255;
    // opaque pixel on the right edge of frame 0 would bleed into frame 1 if frames were not isolated
    data[(1 * w + 2) * 4 + 3] = 255;
    const frames = [
      { x: 0, y: 0, width: 3, height: 3 },
      { x: 3, y: 0, width: 3, height: 3 },
    ];
    outlineFrames(data, w, frames, [1, 2, 3]);
    const alpha = (x: number, y: number) => data[(y * w + x) * 4 + 3];
    expect(alpha(0, 1)).toBe(255);
    expect(alpha(1, 0)).toBe(255);
    expect(alpha(3, 1)).toBe(0);
  });

  it('tints a selective outline with the pixel it borders', () => {
    // 3x3 frame with a single red pixel in the middle.
    const w = 3;
    const data = new Uint8ClampedArray(w * 3 * 4);
    data.set([200, 0, 0, 255], (1 * w + 1) * 4);
    outlineFrames(data, w, [{ x: 0, y: 0, width: 3, height: 3 }], [0, 0, 0], 0.5);
    const above = [...data.slice((0 * w + 1) * 4, (0 * w + 1) * 4 + 4)];
    // Half the ink (black), half the red darkened to 30%: a deep red, fully opaque.
    expect(above).toEqual([30, 0, 0, 255]);
    // Corners stay empty (4-neighbourhood).
    expect(data[3]).toBe(0);
  });
});
