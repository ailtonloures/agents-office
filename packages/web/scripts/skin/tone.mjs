// Color ramps and the selective outline shared by the scene art (tiles and props). The math mirrors
// src/characters/palette.ts, so furniture is shaded and outlined exactly like the characters.

/** `#rrggbb` -> [r, g, b]. */
export function rgb(color) {
  const n = Number.parseInt(color.slice(1, 7), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** [r, g, b] -> `#rrggbb`. */
export function toHex([r, g, b]) {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')}`;
}

/** Multiplies each channel by `factor` (< 1 darkens). */
export const shade = (color, factor) => toHex(rgb(color).map((v) => Math.round(v * factor)));

/** Mixes `color` towards white by `amount` (0..1). */
export const lighten = (color, amount) =>
  toHex(rgb(color).map((v) => Math.round(v + (255 - v) * amount)));

/** Mixes two colors: `t` = 0 gives `a`, 1 gives `b`. */
export function mix(a, b, t) {
  const [x, y] = [rgb(a), rgb(b)];
  return toHex(x.map((v, i) => Math.round(v + (y[i] - v) * t)));
}

/** Adds an alpha byte (0..1) to a `#rrggbb` color. */
export const alpha = (color, a) =>
  `${color.slice(0, 7)}${Math.round(a * 255)
    .toString(16)
    .padStart(2, '0')}`;

/**
 * Six tones of one material, from the lit top edge to the deepest crease. Same factors the
 * character factory derives (shade 0.84 / 0.72, lighten 0.2 / 0.25), with a cool tint in the
 * shadows so they never turn muddy.
 */
export function ramp(base) {
  const cool = '#2a3350';
  return {
    hi: lighten(base, 0.45),
    light: lighten(base, 0.2),
    base,
    mid: mix(shade(base, 0.9), cool, 0.04),
    shade: mix(shade(base, 0.78), cool, 0.1),
    deep: mix(shade(base, 0.6), cool, 0.18),
  };
}

/** Outline ink of the characters (src/characters/characterFactory.ts). */
export const OUTLINE = '#1b1d2a';
const OUTLINE_INK = 0.55;

/**
 * 1px selective outline around the opaque pixels of the `x, y, w, h` area of a canvas, in place:
 * each outline pixel is a dark version of the pixel it borders mixed with the outline ink, like the
 * characters. Translucent pixels (contact shadows) neither get nor make an outline.
 */
export function outline(c, x, y, w, h) {
  const at = (i, j) => (j * c.w + i) * 4;
  const solid = (i, j) => i >= x && j >= y && i < x + w && j < y + h && c.data[at(i, j) + 3] >= 200;
  const marks = [];
  for (let j = y; j < y + h; j++) {
    for (let i = x; i < x + w; i++) {
      if (c.data[at(i, j) + 3] >= 200) continue;
      const n = [
        [0, 1],
        [0, -1],
        [-1, 0],
        [1, 0],
      ].find(([dx, dy]) => solid(i + dx, j + dy));
      if (!n) continue;
      const k = at(i + n[0], j + n[1]);
      const near = [c.data[k], c.data[k + 1], c.data[k + 2]];
      const ink = rgb(OUTLINE);
      const tint = near.map((v, q) => Math.round(v * 0.3 + (ink[q] - v * 0.3) * OUTLINE_INK));
      marks.push([at(i, j), tint]);
    }
  }
  for (const [k, [r, g, b]] of marks) c.data.set([r, g, b, 255], k);
}
