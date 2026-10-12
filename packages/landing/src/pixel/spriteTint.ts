// Pure pixel helpers that turn the key-colored character layers of the skin into a finished
// sprite sheet: palette swap plus a selective 1px outline. They only touch raw RGBA buffers (no
// DOM), so they run once at load time and are unit-testable in node. The math mirrors
// `packages/web/src/characters/palette.ts`, so the landing characters look like the app's.

export type Rgb = readonly [number, number, number];

export interface SkinColors {
  readonly skin: string;
  readonly skinShade: string;
  readonly skinLight: string;
  readonly hair: string;
  readonly hairShade: string;
  readonly hairLight: string;
  readonly shirt: string;
  readonly shirtShade: string;
  readonly shirtLight: string;
  readonly pants: string;
  readonly pantsShade: string;
  readonly pantsLight: string;
}

export interface LookColors {
  readonly skin: string;
  readonly hair: string;
  readonly shirt: string;
  readonly pants: string;
}

export interface FrameRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Dark ink of the outline, and how much of it goes into the selective outline. */
export const OUTLINE_COLOR: Rgb = [0x1b, 0x1d, 0x2a];
export const OUTLINE_INK = 0.55;

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

/** Mixes two colors: `t` = 0 gives `a`, 1 gives `b`. */
export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

const pack = ([r, g, b]: Rgb): number => (r << 16) | (g << 8) | b;

/** Key color (packed `0xrrggbb`) -> replacement color. */
export type SwapTable = ReadonlyMap<number, Rgb>;

/** Same derivation of the shade and light tones as the app's character factory. */
export function swapTableFor(base: SkinColors, look: LookColors): SwapTable {
  const skin = hexToRgb(look.skin);
  const hair = hexToRgb(look.hair);
  const shirt = hexToRgb(look.shirt);
  const pants = hexToRgb(look.pants);
  const pairs: readonly (readonly [string, Rgb])[] = [
    [base.skin, skin],
    [base.skinShade, shade(skin, 0.84)],
    [base.skinLight, lighten(skin, 0.25)],
    [base.hair, hair],
    [base.hairShade, shade(hair, 0.7)],
    [base.hairLight, lighten(hair, 0.3)],
    [base.shirt, shirt],
    [base.shirtShade, shade(shirt, 0.76)],
    [base.shirtLight, lighten(shirt, 0.2)],
    [base.pants, pants],
    [base.pantsShade, shade(pants, 0.72)],
    [base.pantsLight, lighten(pants, 0.18)],
  ];
  return new Map(pairs.map(([key, to]) => [pack(hexToRgb(key)), to]));
}

/** Replaces, in place, every opaque pixel whose color is a key of `table`. */
export function applyPaletteSwap(data: Uint8ClampedArray, table: SwapTable): void {
  for (let i = 0; i < data.length; i += 4) {
    if ((data[i + 3] ?? 0) === 0) continue;
    const to = table.get(pack([data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0]));
    if (!to) continue;
    data[i] = to[0];
    data[i + 1] = to[1];
    data[i + 2] = to[2];
  }
}

const NEIGHBOURS = [
  [0, 1],
  [0, -1],
  [-1, 0],
  [1, 0],
] as const;

/**
 * Adds a 1px outline (4-neighbourhood) around the opaque pixels of every frame of a sheet, in
 * place. Frames are independent, so outlines never bleed into a neighbour frame. The ink is
 * tinted by the pixel it borders (below first), which reads softer than a flat color.
 */
export function outlineFrames(
  data: Uint8ClampedArray,
  sheetWidth: number,
  frames: readonly FrameRect[],
  color: Rgb = OUTLINE_COLOR,
  ink: number = OUTLINE_INK,
): void {
  const opaque = (x: number, y: number) => (data[(y * sheetWidth + x) * 4 + 3] ?? 0) > 0;
  for (const f of frames) {
    const marks: { at: number; tint: Rgb }[] = [];
    for (let y = 0; y < f.height; y++) {
      for (let x = 0; x < f.width; x++) {
        const px = f.x + x;
        const py = f.y + y;
        if (opaque(px, py)) continue;
        const near = NEIGHBOURS.find(
          ([dx, dy]) =>
            x + dx >= 0 &&
            x + dx < f.width &&
            y + dy >= 0 &&
            y + dy < f.height &&
            opaque(px + dx, py + dy),
        );
        if (!near) continue;
        const j = ((py + near[1]) * sheetWidth + px + near[0]) * 4;
        const neighbour: Rgb = [data[j] ?? 0, data[j + 1] ?? 0, data[j + 2] ?? 0];
        marks.push({
          at: (py * sheetWidth + px) * 4,
          tint: mix(shade(neighbour, 0.3), color, ink),
        });
      }
    }
    for (const { at, tint } of marks) {
      data[at] = tint[0];
      data[at + 1] = tint[1];
      data[at + 2] = tint[2];
      data[at + 3] = 255;
    }
  }
}

/** Frame rectangles of a sheet with `columns` columns and `count` frames. */
export function frameRects(
  count: number,
  columns: number,
  frameWidth: number,
  frameHeight: number,
): FrameRect[] {
  return Array.from({ length: count }, (_, i) => ({
    x: (i % columns) * frameWidth,
    y: Math.floor(i / columns) * frameHeight,
    width: frameWidth,
    height: frameHeight,
  }));
}
