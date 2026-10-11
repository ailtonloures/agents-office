// Pixel helpers for the character factory. Pure (no Phaser, no DOM) so they are node-testable.

export type Rgb = readonly [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** Multiplies each channel by `factor` (< 1 darkens). */
export function shade(color: Rgb, factor: number): Rgb {
  return [
    Math.round(color[0] * factor),
    Math.round(color[1] * factor),
    Math.round(color[2] * factor),
  ];
}

/** Mixes `color` towards white by `amount` (0..1). */
export function lighten(color: Rgb, amount: number): Rgb {
  return [
    Math.round(color[0] + (255 - color[0]) * amount),
    Math.round(color[1] + (255 - color[1]) * amount),
    Math.round(color[2] + (255 - color[2]) * amount),
  ];
}

const packRgb = ([r, g, b]: Rgb): number => (r << 16) | (g << 8) | b;

/** Base color (hex) -> replacement color. Both sides are `#rrggbb`. */
export type SwapTable = ReadonlyMap<number, Rgb>;

export function buildSwapTable(pairs: readonly (readonly [string, Rgb])[]): SwapTable {
  return new Map(pairs.map(([base, to]) => [packRgb(hexToRgb(base)), to]));
}

/** Replaces, in place, every opaque pixel whose color is a key of `table`. */
export function applyPaletteSwap(data: Uint8ClampedArray | Uint8Array, table: SwapTable): void {
  for (let i = 0; i < data.length; i += 4) {
    if ((data[i + 3] ?? 0) === 0) continue;
    const to = table.get(packRgb([data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0]));
    if (!to) continue;
    data[i] = to[0];
    data[i + 1] = to[1];
    data[i + 2] = to[2];
  }
}

/** Mixes two colors: `t` = 0 gives `a`, 1 gives `b`. */
export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/**
 * Adds a 1px outline (4-neighbourhood) around the opaque pixels of every frame of a sheet,
 * in place. Frames are processed independently so outlines never bleed into a neighbour frame.
 *
 * With `selective` (0..1) the outline is tinted by the pixel it borders ("sel-out"): a dark
 * version of that pixel mixed with `color` by `selective`, which reads softer than flat ink.
 */
export function outlineFrames(
  data: Uint8ClampedArray | Uint8Array,
  sheetWidth: number,
  frames: readonly { x: number; y: number; width: number; height: number }[],
  color: Rgb,
  selective?: number,
): void {
  const opaque = (x: number, y: number) => (data[(y * sheetWidth + x) * 4 + 3] ?? 0) > 0;
  const rgbAt = (x: number, y: number): Rgb => {
    const i = (y * sheetWidth + x) * 4;
    return [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0];
  };
  for (const f of frames) {
    const marks: [number, Rgb][] = [];
    for (let y = 0; y < f.height; y++) {
      for (let x = 0; x < f.width; x++) {
        const px = f.x + x;
        const py = f.y + y;
        if (opaque(px, py)) continue;
        // Below first: the outline under a shoe takes the shoe's tone, and so on.
        const neighbour = (
          [
            [0, 1],
            [0, -1],
            [-1, 0],
            [1, 0],
          ] as const
        ).find(
          ([dx, dy]) =>
            x + dx >= 0 &&
            x + dx < f.width &&
            y + dy >= 0 &&
            y + dy < f.height &&
            opaque(px + dx, py + dy),
        );
        if (!neighbour) continue;
        const tint =
          selective === undefined
            ? color
            : mix(shade(rgbAt(px + neighbour[0], py + neighbour[1]), 0.3), color, selective);
        marks.push([(py * sheetWidth + px) * 4, tint]);
      }
    }
    for (const [i, tint] of marks) {
      data[i] = tint[0];
      data[i + 1] = tint[1];
      data[i + 2] = tint[2];
      data[i + 3] = 255;
    }
  }
}
