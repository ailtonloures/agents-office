// Props of the default skin: furniture bigger than one tile (workstations with monitors, tall
// plants, shelves, sofas, the kitchen island...), drawn in the same language as the characters:
// three-plus tones per material derived from one base color (tone.mjs `ramp`), light from the
// top-left, a 1px selective outline and a soft contact shadow on the floor.
//
// Each prop is placed by the layout on a footprint of whole tiles; its art may rise above it (a
// monitor, a plant) and is anchored by the footprint's bottom-left corner (`ax`, `ay` in the art).
import { createCanvas, px, rect } from './canvas.mjs';
import {
  faceColor,
  plasterShade,
  SLAB_EDGE,
  SLAB_FACE,
  SLAB_FACE_LO,
  SLAB_TOP,
  WALL_ROWS,
  noise as wallNoise,
} from './tiles.mjs';
import { alpha, mix, outline, ramp } from './tone.mjs';

// --------------------------------------------------------------------------- materials

/**
 * Furniture ramps are contrasted (spec 052): brighter top planes and front edges, darker shadow
 * sides, so every piece reads as a volume against the floor and next to the characters.
 */
const K = { contrast: 1.3 };
const OAK = ramp('#d7b98d', K);
const WALNUT = ramp('#9a6b47', K);
const WHITE = ramp('#eceef1', K);
const QUARTZ = ramp('#f4f3ef', K);
const GRAPH = ramp('#3b4256', K);
const METAL = ramp('#b9c0cc', K);
const FELT = ramp('#8a9ab8', K);
const FABRIC = ramp('#4d7d8a', K);
const LINEN = ramp('#e6dcc8', K);
const MUSTARD = ramp('#e0b24e', K);
const CORAL = ramp('#df8a68', K);
const LEATHER = ramp('#5b3a2e', K);
const LEAF_K = { contrast: 1.2 };
const LEAF = ramp('#3f9159', LEAF_K);
const LEAF_DARK = ramp('#2e7148', LEAF_K);
const LEAF_LIGHT = ramp('#5aa865', LEAF_K);
const LEAF_OLIVE = ramp('#6f9a45', LEAF_K);
const LEAF_TEAL = ramp('#2f8070', LEAF_K);
const POT_WHITE = ramp('#efece6', K);
const POT_TERRA = ramp('#c9794f', K);
const POT_COAL = ramp('#4b5266', K);
const SOIL = ramp('#4e3a2b');
const AO = '#0e1120';
const SCREEN = {
  bg: '#14233b',
  bar: '#22385c',
  cyan: '#57d3c2',
  blue: '#5aa2ff',
  violet: '#a98bff',
  yellow: '#f2c94c',
  coral: '#ff8a6b',
  green: '#6fd38a',
  glare: '#2c4468',
};
const BOOKS = [
  '#4a6fa5',
  '#c97b5a',
  '#5b8f73',
  '#e2b95b',
  '#7a6aa8',
  '#2f3a52',
  '#d9d4c7',
  '#b5534a',
];
/** Page edges of books seen from the side. */
const PAGES = '#f3ecd9';

/** Tiny deterministic hash for texture and variety. */
const noise = (i, j, seed) => ((i * 73856093) ^ (j * 19349663) ^ (seed * 83492791)) >>> 0;

// --------------------------------------------------------------------------- helpers

const hline = (c, x, y, w, color) => rect(c, x, y, w, 1, color);
const vline = (c, x, y, h, color) => rect(c, x, y, 1, h, color);

/** Soft elliptical contact shadow, painted only on empty pixels (after the outline). */
function shadow(c, cx, cy, rx, ry, strength = 0.32, clip = { x: 0, y: 0, w: c.w, h: c.h }) {
  for (let j = -Math.ceil(ry); j <= Math.ceil(ry); j++) {
    for (let i = -Math.ceil(rx); i <= Math.ceil(rx); i++) {
      const d = (i / rx) ** 2 + (j / ry) ** 2;
      if (d > 1) continue;
      const x = Math.round(cx + i);
      const y = Math.round(cy + j);
      if (x < clip.x || y < clip.y || x >= clip.x + clip.w || y >= clip.y + clip.h) continue;
      if (c.data[(y * c.w + x) * 4 + 3] !== 0) continue;
      px(c, x, y, alpha(AO, d < 0.45 ? strength : strength * 0.5));
    }
  }
}

/** Rounded rectangle (1px corners cut). */
function rounded(c, x, y, w, h, color) {
  rect(c, x + 1, y, w - 2, h, color);
  rect(c, x, y + 1, w, h - 2, color);
}

// Volume helpers (spec 052): the building blocks of the furniture, all lit from the top-left like
// the walls. Each takes a material ramp `R` (tone.mjs `ramp`, ideally with `{ contrast }` so the
// planes separate from the floor) and returns the first row below what it drew, so pieces stack.
// Draw what sits UNDER a slab (legs, cabinet) first: the slab's shadow line falls on it.

/**
 * Table top with thickness, `w` wide, from `y` (back edge): a `depth`-row top plane shaded from
 * the back (`R.light`) towards the front, whose last row is the lit front edge (`R.hi`), then
 * `thick` rows of edge band (`R.mid` -> `R.shade`) and a 1px shadow line blended over whatever is
 * under the top (legs, a cabinet; on empty pixels the outline takes it).
 */
export function slab(c, x, y, w, depth, thick, R) {
  for (let v = 0; v < depth - 1; v++) {
    hline(c, x, y + v, w, mix(R.light, R.hi, depth > 2 ? (v / (depth - 2)) * 0.5 : 0));
  }
  hline(c, x, y + depth - 1, w, R.hi);
  for (let v = 0; v < thick; v++) {
    hline(c, x, y + depth + v, w, mix(R.mid, R.shade, thick > 1 ? v / (thick - 1) : 0));
  }
  const under = y + depth + thick;
  hline(c, x, under, w, alpha(AO, 0.35));
  return under + 1;
}

/**
 * Box (cabinet, counter, appliance), `w` wide, from `y`: a `topDepth`-row top plane (`R.light`,
 * front edge `R.hi`) over a `frontH`-row front face shaded top to bottom (`R.base` -> `R.mid`),
 * with a 1px lit edge on the left (`R.hi`), a 1px shadow edge on the right (`R.deep`) and 1px of
 * ambient occlusion along its base.
 */
export function box(c, x, y, w, topDepth, frontH, R) {
  if (topDepth > 0) {
    rect(c, x, y, w, topDepth - 1, R.light);
    hline(c, x, y + topDepth - 1, w, R.hi);
  }
  const fy = y + topDepth;
  for (let v = 0; v < frontH; v++) {
    hline(c, x, fy + v, w, mix(R.base, R.mid, frontH > 1 ? v / (frontH - 1) : 0));
  }
  vline(c, x, fy, frontH, R.hi);
  vline(c, x + w - 1, fy, frontH, R.deep);
  hline(c, x + 1, fy + frontH - 1, w - 2, mix(R.mid, AO, 0.3));
  return fy + frontH;
}

/**
 * Legs `w` px wide (1 or 2, default 2) at each x of `xs`, from `y` down `h` rows: a 2px leg has
 * its right half in shadow (`R.mid` | `R.deep`), a 1px leg is `R.shade`. A dot of ambient
 * occlusion falls on the floor down-right of each foot.
 */
export function legs(c, xs, y, h, R, { w = 2 } = {}) {
  for (const lx of xs) {
    if (w >= 2) {
      vline(c, lx, y, h, R.mid);
      vline(c, lx + 1, y, h, R.deep);
    } else {
      vline(c, lx, y, h, R.shade);
    }
    px(c, lx + w, y + h, alpha(AO, 0.4));
  }
  return y + h;
}

/**
 * One leaf: a rotated ellipse shaded from the top-left, with a lighter midrib. `split` cuts
 * monstera-like slits into its lower side.
 */
function leaf(c, cx, cy, rx, ry, angle, R, { split = false, rib = true } = {}) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const ext = Math.ceil(Math.max(rx, ry)) + 1;
  for (let j = -ext; j <= ext; j++) {
    for (let i = -ext; i <= ext; i++) {
      const u = i * cos + j * sin;
      const v = -i * sin + j * cos;
      const d = (u / rx) ** 2 + (v / ry) ** 2;
      if (d > 1) continue;
      if (split && Math.abs(v) > ry * 0.45 && u > -rx * 0.5 && Math.round(u + rx) % 3 === 0)
        continue;
      const s = (i * 0.7 + j) / ext;
      let color = R.base;
      if (s < -0.4) color = R.light;
      else if (s > 0.5) color = R.shade;
      if (d > 0.78 && s > 0.1) color = R.deep;
      if (rib && Math.abs(v) < 0.5 && u > -rx * 0.85 && u < rx * 0.7) color = R.light;
      if (d < 0.2 && s < -0.15) color = R.hi;
      px(c, Math.round(cx + i), Math.round(cy + j), color);
    }
  }
}

/** Straight 1px stem from (x0, y0) to (x1, y1). */
function stem(c, x0, y0, x1, y1, color) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let k = 0; k <= n; k++) {
    px(c, Math.round(x0 + ((x1 - x0) * k) / n), Math.round(y0 + ((y1 - y0) * k) / n), color);
  }
}

/** Shadow an object casts on the surface under it (a desk top, a counter), blended over it. */
const castOn = (c, x, y, w, strength = 0.28) => hline(c, x, y, w, alpha(AO, strength));

/**
 * Cylindrical pot `w` wide and `h` tall seen from above: an elliptical mouth (back rim, the soil
 * inside, lit front rim) over a body shaded like a cylinder lit from the left, with the shadow of
 * the lip under the rim and a darker, tapered foot. Draw the plant after it: stems grow out of
 * the soil and low leaves hang over the rim.
 */
function pot(c, x, y, w, h, R) {
  const soilRows = w >= 8 ? 2 : 1;
  hline(c, x + 1, y, w - 2, R.light);
  for (let v = 1; v <= soilRows; v++) {
    px(c, x, y + v, R.light);
    px(c, x + w - 1, y + v, R.mid);
    hline(c, x + 1, y + v, w - 2, v === 1 ? SOIL.deep : SOIL.base);
  }
  for (let i = 2; i < w - 2; i += 3) px(c, x + i, y + soilRows, SOIL.light);
  const front = y + soilRows + 1;
  hline(c, x, front, w, R.hi);
  px(c, x + w - 1, front, R.light);
  for (let v = front + 1; v < y + h; v++) {
    const foot = v === y + h - 1 && w > 4;
    const inset = foot ? 1 : 0;
    for (let i = inset; i < w - inset; i++) {
      const t = i / (w - 1);
      let color = t < 0.2 ? R.light : t < 0.55 ? R.base : t < 0.85 ? R.mid : R.shade;
      if (i === w - 1 - inset) color = R.deep;
      if (v === front + 1) color = mix(color, R.deep, 0.35);
      if (foot) color = mix(color, R.deep, 0.5);
      px(c, x + i, v, color);
    }
  }
  // Glaze highlight down the lit side of the bigger pots.
  if (w >= 8 && h >= 7) vline(c, x + 1, front + 2, y + h - front - 4, R.hi);
}

/** Glass rectangles of the monitors drawn by the prop being painted (absolute atlas pixels). */
let screens = [];

/**
 * Monitor facing the viewer: a bezel with depth (lit top edge and left side, darker right side),
 * glass and chin. With `kind` = 'off' the glass is dark and recorded in `screens`: the game
 * animates what it shows (see src/world/screenArt.ts). Other kinds bake static content (laptops).
 */
function monitor(c, x, y, w, h, kind, seed) {
  rounded(c, x, y, w, h, GRAPH.deep);
  hline(c, x + 1, y, w - 2, GRAPH.light);
  vline(c, x, y + 1, h - 2, GRAPH.base);
  vline(c, x + w - 1, y + 1, h - 2, mix(GRAPH.deep, AO, 0.4));
  rect(c, x + 1, y + 1, w - 2, h - 3, SCREEN.bg);
  if (kind === 'off') {
    rect(c, x + 1, y + 1, w - 2, h - 3, '#0f1626');
    vline(c, x + 1, y + 1, 3, '#1f2c45');
    hline(c, x + 2, y + 1, 2, '#1f2c45');
    screens.push({ x: x + 1, y: y + 1, w: w - 2, h: h - 3 });
  } else {
    hline(c, x + 1, y + 1, w - 2, SCREEN.bar);
    px(c, x + 2, y + 1, SCREEN.coral);
    px(c, x + 3, y + 1, SCREEN.yellow);
    px(c, x + 4, y + 1, SCREEN.green);
    const sx = x + 2;
    const sw = w - 4;
    const sy = y + 3;
    const sh = h - 6;
    if (kind === 'code') {
      const colors = [SCREEN.cyan, SCREEN.violet, SCREEN.yellow, SCREEN.blue, SCREEN.green];
      for (let r = 0; r < sh; r++) {
        const n = noise(r, seed, 5);
        const indent = (n >> 3) % 3;
        const len = 2 + ((n >> 5) % (sw - 3 - indent));
        hline(c, sx + indent, sy + r, Math.min(len, sw - indent), colors[n % colors.length]);
        r += n % 4 === 0 ? 1 : 0;
      }
    } else {
      for (let k = 0; k < sw; k += 2) {
        const bh = 1 + (noise(k, seed, 9) % (sh - 1));
        rect(c, sx + k, sy + sh - bh, 1, bh, k % 4 === 0 ? SCREEN.cyan : SCREEN.blue);
      }
    }
    px(c, x + 1, y + 2, SCREEN.glare);
  }
  // Chin with the power LED.
  hline(c, x + 1, y + h - 2, w - 2, GRAPH.mid);
  px(c, x + Math.floor(w / 2), y + h - 2, kind === 'off' ? '#6fd38a' : GRAPH.light);
}

/** Monitor stand: a lit neck on an oval foot (top plane, front edge), its shadow on the desk. */
function stand(c, cx, y, neck) {
  vline(c, cx - 1, y, neck, METAL.light);
  vline(c, cx, y, neck, METAL.shade);
  hline(c, cx - 3, y + neck, 7, METAL.hi);
  hline(c, cx - 3, y + neck + 1, 7, METAL.shade);
  castOn(c, cx - 2, y + neck + 2, 7, 0.3);
}

/** Wood grain streaks on the top plane of a desk (`rows` rows from `y`). */
function grain(c, x, y, w, rows, R, seed) {
  for (let k = 0; k < 7; k++) {
    const n = noise(k, w, seed + 3);
    hline(c, x + 2 + (n % (w - 10)), y + (k % rows), 3 + (n % 5), mix(R.base, R.light, 0.4));
  }
}

/** Keyboard seen from above: lit back edge, keys, front edge and its shadow on the desk. */
function keyboard(c, x, y, w) {
  hline(c, x, y, w, WHITE.hi);
  hline(c, x, y + 1, w, WHITE.light);
  for (let k = 1; k < w - 1; k += 2) px(c, x + k, y + 1, WHITE.mid);
  hline(c, x, y + 2, w, WHITE.shade);
  castOn(c, x + 1, y + 3, w);
}

/** Mug: rim with the coffee, a body lit from the left, the handle and its shadow. */
function mug(c, x, y, R = WHITE) {
  hline(c, x, y, 3, R.hi);
  px(c, x + 1, y, '#5a3a24');
  rect(c, x, y + 1, 3, 2, R.base);
  px(c, x, y + 1, R.light);
  vline(c, x + 2, y + 1, 2, R.shade);
  hline(c, x, y + 3, 3, R.mid);
  px(c, x + 2, y + 3, R.deep);
  vline(c, x + 3, y + 1, 2, R.shade);
  castOn(c, x + 1, y + 4, 3);
  px(c, x + 4, y + 3, alpha(AO, 0.25));
}

function succulent(c, x, y) {
  pot(c, x, y + 3, 5, 4, POT_TERRA);
  leaf(c, x + 1, y + 2, 1.6, 1, -0.6, LEAF, { rib: false });
  leaf(c, x + 3.5, y + 1.5, 1.8, 1, 0.5, LEAF_LIGHT, { rib: false });
  px(c, x + 2, y + 1, LEAF_LIGHT.hi);
}

/** Stack of books lying flat (top cover lit, page edges on the right) and its shadow. */
function bookStack(c, x, y, picks = [1, 0, 3]) {
  picks.forEach((pick, k) => {
    const R = ramp(BOOKS[pick], K);
    const dx = k % 2;
    const w = 6 - dx;
    hline(c, x + dx, y + k, w, k === 0 ? R.light : R.base);
    px(c, x + dx, y + k, R.hi);
    px(c, x + dx + w - 1, y + k, PAGES);
  });
  castOn(c, x + 1, y + picks.length, 6);
}

/**
 * Books standing on a shelf from `x`, bottoms on row `bottom`: tops seen from above (`R.hi`),
 * shaded spines. With `lean`, the last one leans against the others. Returns the next free x.
 */
function standingBooks(c, x, bottom, count, seed, h, lean = false) {
  let i = x;
  let last = null;
  for (let k = 0; k < count; k++) {
    const n = noise(k, seed, 21);
    const bh = h - (n % 3);
    const R = ramp(BOOKS[n % BOOKS.length], K);
    const top = bottom - bh + 1;
    rect(c, i, top, 2, bh, R.base);
    vline(c, i + 1, top, bh, R.shade);
    hline(c, i, top, 2, R.hi);
    if (bh > 4) hline(c, i, top + 2, 2, mix(R.base, R.light, 0.7));
    last = R;
    i += 2;
  }
  if (lean && last) {
    const R = ramp(BOOKS[(seed + 3) % BOOKS.length], K);
    for (let r = 0; r < h - 1; r++) {
      const off = Math.floor((h - 2 - r) / 3);
      px(c, i + off, bottom - r, R.base);
      px(c, i + off + 1, bottom - r, R.shade);
    }
    px(c, i + Math.floor((h - 2) / 3) + 1, bottom - h + 2, R.hi);
    i += 4;
  }
  return i;
}

/** Small mouse on a dark pad, with its shadow on the desk. */
function mousePad(c, x, y) {
  rounded(c, x, y, 6, 4, GRAPH.base);
  hline(c, x + 1, y, 4, GRAPH.light);
  rounded(c, x + 3, y + 1, 2, 2, WHITE.hi);
  px(c, x + 4, y + 2, WHITE.shade);
  castOn(c, x + 1, y + 4, 6, 0.22);
}

/**
 * Acoustic felt divider along the back edge of a desk: the aluminium cap seen from above (lit
 * back row, bright front edge), the shadow it casts on the felt, lit left side, shaded right one.
 */
function divider(c, x, y, w, h, R = FELT) {
  hline(c, x, y, w, METAL.light);
  hline(c, x, y + 1, w, METAL.hi);
  rect(c, x, y + 2, w, h - 2, R.base);
  hline(c, x, y + 2, w, mix(R.base, AO, 0.3));
  for (let j = 4; j < h - 1; j++) {
    for (let i = 1; i < w - 1; i++) if (noise(i, j, 17 + w) % 9 === 0) px(c, x + i, y + j, R.mid);
  }
  vline(c, x, y + 2, h - 2, R.light);
  vline(c, x + w - 1, y + 2, h - 2, R.deep);
  hline(c, x + 1, y + h - 1, w - 2, R.shade);
}

/** Sticky note pinned on a divider, with a hint of shadow. */
function note(c, x, y, color) {
  const R = ramp(color);
  rect(c, x, y, 4, 4, R.base);
  hline(c, x, y, 4, R.light);
  px(c, x + 3, y + 3, R.shade);
  hline(c, x + 1, y + 2, 2, R.deep);
  vline(c, x + 4, y + 1, 4, alpha(AO, 0.2));
}

// --------------------------------------------------------------------------- props

/**
 * Open-plan workstation, 2 tiles: acoustic divider, a widescreen monitor over the seat (left
 * cell; its glass is animated by the game), keyboard and mouse, an oak top 3px thick on steel legs
 * with a drawer pedestal, and a second station on the right that changes per variant (portrait
 * monitor, laptop on a riser, desk lamp and books).
 */
function workstation(variant) {
  const dividers = [FELT, ramp('#7f9a8e', K), ramp('#9a8fb3', K)];
  return (c, x, y) => {
    divider(c, x, y + 8, 32, 13, dividers[variant]);
    note(c, x + 21 + variant * 2, y + 11, ['#f2c94c', '#8fd0a8', '#f2a3b8'][variant]);
    if (variant !== 1) note(c, x + 26, y + 14, '#a7c4f2');
    // Under the top: steel legs, the cable to the floor and the drawer pedestal.
    legs(c, [x + 1, x + 29], y + 31, 5, METAL);
    vline(c, x + 14, y + 31, 5, GRAPH.deep);
    box(c, x + 18, y + 31, 10, 0, 5, WHITE);
    hline(c, x + 19, y + 33, 8, WHITE.shade);
    for (const hy of [32, 34]) hline(c, x + 21, y + hy, 4, GRAPH.light);
    slab(c, x, y + 21, 32, 7, 3, OAK);
    grain(c, x, y + 22, 32, 5, OAK, variant);
    // Main widescreen monitor, centred over the seat, its cable down the divider.
    vline(c, x + 12, y + 18, 3, GRAPH.deep);
    monitor(c, x, y + 4, 18, 14, 'off', variant);
    stand(c, x + 9, y + 18, 3);
    keyboard(c, x + 3, y + 23, 11);
    mousePad(c, x + 15, y + 23);
    if (variant === 0) {
      // Portrait monitor, a coffee mug and a succulent.
      monitor(c, x + 21, y + 6, 9, 12, 'code', 11);
      stand(c, x + 25, y + 18, 3);
      mug(c, x + 22, y + 24);
      succulent(c, x + 27, y + 21);
    } else if (variant === 1) {
      // Laptop on a riser with a chart, a notebook and a phone.
      rect(c, x + 20, y + 12, 11, 8, GRAPH.base);
      hline(c, x + 20, y + 12, 11, GRAPH.light);
      vline(c, x + 30, y + 13, 7, GRAPH.deep);
      rect(c, x + 21, y + 13, 9, 6, SCREEN.bg);
      for (let k = 0; k < 4; k++) rect(c, x + 22 + k * 2, y + 18 - k, 1, k + 1, SCREEN.cyan);
      hline(c, x + 21, y + 13, 9, SCREEN.bar);
      hline(c, x + 19, y + 20, 13, METAL.hi);
      box(c, x + 20, y + 21, 11, 0, 2, WHITE);
      castOn(c, x + 21, y + 23, 11);
      rect(c, x + 22, y + 24, 6, 3, '#2f3a52');
      hline(c, x + 22, y + 24, 6, '#5a6b8f');
      vline(c, x + 27, y + 24, 3, '#e2b95b');
      castOn(c, x + 23, y + 27, 6);
      rect(c, x + 29, y + 24, 2, 3, GRAPH.deep);
      px(c, x + 29, y + 24, SCREEN.glare);
      castOn(c, x + 30, y + 27, 2);
    } else {
      // Desk lamp lighting the desk, a stack of books and a mug.
      rect(c, x + 19, y + 22, 7, 2, alpha('#fff2c6', 0.3));
      hline(c, x + 26, y + 22, 4, GRAPH.light);
      hline(c, x + 26, y + 23, 4, GRAPH.deep);
      castOn(c, x + 27, y + 24, 4);
      stem(c, x + 28, y + 21, x + 27, y + 14, GRAPH.base);
      stem(c, x + 27, y + 14, x + 23, y + 15, GRAPH.light);
      rect(c, x + 20, y + 15, 4, 2, MUSTARD.base);
      hline(c, x + 20, y + 15, 4, MUSTARD.light);
      px(c, x + 20, y + 15, MUSTARD.hi);
      px(c, x + 23, y + 16, MUSTARD.deep);
      hline(c, x + 20, y + 17, 4, '#fff2c6');
      bookStack(c, x + 20, y + 24);
      mug(c, x + 27, y + 24, ramp('#6d8fd0', K));
    }
  };
}

/**
 * The Tech Lead's command desk, 3 tiles: a walnut credenza behind it (and a plant), three
 * monitors (the middle one over the seat; the side ones show the team dashboard), a walnut top on
 * waterfall sides and a brass name plate on the front edge.
 */
function leadDesk(c, x, y) {
  // Credenza: top plane, doors with pulls.
  box(c, x + 1, y + 11, 46, 3, 7, WALNUT);
  for (const k of [12, 23, 35]) {
    vline(c, x + 1 + k, y + 14, 6, WALNUT.deep);
    vline(c, x + 2 + k, y + 14, 6, WALNUT.light);
  }
  for (const k of [10, 14, 33, 37]) vline(c, x + 1 + k, y + 16, 2, MUSTARD.light);
  // A plant on the credenza, peeking over the right monitor.
  pot(c, x + 42, y + 8, 5, 4, POT_COAL);
  stem(c, x + 44, y + 9, x + 45, y + 3, LEAF_DARK.shade);
  leaf(c, x + 43, y + 5, 2.6, 1.6, -0.6, LEAF);
  leaf(c, x + 46, y + 3, 2.4, 1.6, 0.5, LEAF_LIGHT);
  leaf(c, x + 45, y + 1, 2, 1.3, -1.2, LEAF_OLIVE);
  // Three monitors (the main one first, so its glass is screens[0]) and their cables.
  for (const cx of [11, 28, 36]) vline(c, x + cx, y + 17, 4, GRAPH.deep);
  monitor(c, x + 15, y + 3, 18, 14, 'off', 7);
  monitor(c, x + 2, y + 6, 13, 12, 'off', 8);
  monitor(c, x + 33, y + 6, 13, 12, 'off', 9);
  // Waterfall sides and a recessed modesty panel under the walnut top.
  rect(c, x + 3, y + 31, 42, 3, WALNUT.deep);
  box(c, x, y + 31, 3, 0, 5, WALNUT);
  box(c, x + 45, y + 31, 3, 0, 5, WALNUT);
  slab(c, x, y + 21, 48, 7, 3, WALNUT);
  grain(c, x, y + 22, 48, 5, WALNUT, 9);
  // Brass name plate on the front edge.
  rect(c, x + 20, y + 28, 8, 2, MUSTARD.base);
  hline(c, x + 20, y + 28, 8, MUSTARD.hi);
  hline(c, x + 22, y + 29, 4, MUSTARD.deep);
  stand(c, x + 24, y + 17, 4);
  stand(c, x + 8, y + 18, 3);
  stand(c, x + 39, y + 18, 3);
  keyboard(c, x + 18, y + 23, 12);
  mousePad(c, x + 31, y + 23);
  mug(c, x + 4, y + 24, CORAL);
  // Papers: two sheets with lines.
  rect(c, x + 39, y + 24, 6, 3, '#e9e4d8');
  rect(c, x + 38, y + 23, 6, 3, '#fbf9f3');
  hline(c, x + 39, y + 24, 4, METAL.base);
  castOn(c, x + 39, y + 27, 6);
}

/** Ergonomic office chair seen from behind (the seated character faces the desk, up). */
function chair(c, x, y) {
  const back = ramp('#3f4d6e', K);
  // Star base on casters, under the gas lift.
  hline(c, x + 5, y + 12, 6, GRAPH.mid);
  hline(c, x + 2, y + 13, 12, GRAPH.base);
  hline(c, x + 3, y + 13, 3, GRAPH.light);
  for (const k of [1, 7, 13]) rect(c, x + k, y + 14, 2, 1, GRAPH.deep);
  rect(c, x + 7, y + 10, 2, 2, METAL.shade);
  px(c, x + 7, y + 10, METAL.light);
  // Seat cushion: its lit top on both sides of the backrest, then a thick front edge.
  rounded(c, x + 1, y + 6, 14, 5, GRAPH.light);
  hline(c, x + 2, y + 6, 12, GRAPH.hi);
  hline(c, x + 1, y + 9, 14, GRAPH.mid);
  hline(c, x + 2, y + 10, 12, GRAPH.shade);
  // Armrests: pads seen from above on their posts.
  hline(c, x, y + 4, 3, GRAPH.hi);
  hline(c, x, y + 5, 3, GRAPH.mid);
  vline(c, x, y + 6, 3, GRAPH.base);
  hline(c, x + 13, y + 4, 3, GRAPH.light);
  hline(c, x + 13, y + 5, 3, GRAPH.shade);
  vline(c, x + 15, y + 6, 3, GRAPH.deep);
  // Mesh backrest: lit top of the frame, lumbar band, shaded right side.
  rounded(c, x + 3, y, 10, 10, back.base);
  hline(c, x + 4, y, 8, back.hi);
  hline(c, x + 3, y + 1, 10, back.light);
  for (let j = 3; j < 9; j++) {
    for (let i = 5; i < 11; i++) if ((i + j) % 2 === 0) px(c, x + i, y + j, back.mid);
  }
  hline(c, x + 4, y + 6, 8, back.shade);
  vline(c, x + 3, y + 1, 8, back.light);
  vline(c, x + 12, y + 1, 8, back.deep);
  hline(c, x + 4, y + 9, 8, back.deep);
}

/** The Tech Lead's high-back leather chair (seen from behind), tufted, with a headrest. */
function chairExec(c, x, y) {
  const L = LEATHER;
  // Star base and the gas lift.
  hline(c, x + 5, y + 14, 6, METAL.mid);
  hline(c, x + 2, y + 15, 12, GRAPH.base);
  hline(c, x + 3, y + 15, 3, METAL.light);
  for (const k of [1, 7, 13]) rect(c, x + k, y + 16, 2, 1, GRAPH.deep);
  rect(c, x + 7, y + 12, 2, 2, METAL.shade);
  px(c, x + 7, y + 12, METAL.light);
  // Seat with a thick padded edge.
  rounded(c, x + 1, y + 8, 14, 5, L.light);
  hline(c, x + 2, y + 8, 12, L.hi);
  hline(c, x + 1, y + 11, 14, L.mid);
  hline(c, x + 2, y + 12, 12, L.shade);
  // Walnut armrests.
  hline(c, x, y + 6, 3, WALNUT.hi);
  hline(c, x, y + 7, 3, WALNUT.mid);
  vline(c, x, y + 8, 3, GRAPH.base);
  hline(c, x + 13, y + 6, 3, WALNUT.light);
  hline(c, x + 13, y + 7, 3, WALNUT.shade);
  vline(c, x + 15, y + 8, 3, GRAPH.deep);
  // Tall tufted backrest with the headrest seam.
  rounded(c, x + 2, y, 12, 11, L.base);
  hline(c, x + 3, y, 10, L.hi);
  hline(c, x + 2, y + 1, 12, L.light);
  hline(c, x + 3, y + 3, 10, L.shade);
  hline(c, x + 3, y + 4, 10, L.light);
  for (const [i, j] of [
    [5, 6],
    [8, 6],
    [11, 6],
    [6, 8],
    [10, 8],
  ]) {
    px(c, x + i, y + j, L.deep);
    px(c, x + i - 1, y + j - 1, L.light);
  }
  vline(c, x + 2, y + 1, 9, L.light);
  vline(c, x + 13, y + 1, 9, L.deep);
  hline(c, x + 3, y + 10, 10, L.deep);
}

/** Free-standing kanban board on legs: three columns of sticky notes, a marker tray. */
function kanban(c, x, y) {
  legs(c, [x + 3, x + 27], y + 20, 9, METAL);
  for (const fx of [1, 25]) {
    hline(c, x + fx, y + 29, 6, GRAPH.light);
    hline(c, x + fx, y + 30, 6, GRAPH.deep);
  }
  // Aluminium frame: top edge seen from above, lit left side, shadow side on the right.
  rect(c, x + 1, y + 1, 30, 19, METAL.base);
  hline(c, x + 1, y + 1, 30, METAL.light);
  hline(c, x + 1, y + 2, 30, METAL.hi);
  vline(c, x + 1, y + 2, 18, METAL.light);
  vline(c, x + 30, y + 2, 18, METAL.deep);
  hline(c, x + 2, y + 19, 28, METAL.shade);
  rect(c, x + 2, y + 3, 28, 16, '#fbfcfe');
  hline(c, x + 2, y + 3, 28, '#dfe5ee');
  for (const k of [11, 20]) vline(c, x + 2 + k, y + 5, 13, '#d5dbe6');
  hline(c, x + 3, y + 5, 7, '#5aa2ff');
  hline(c, x + 14, y + 5, 5, MUSTARD.base);
  hline(c, x + 23, y + 5, 6, '#6fd38a');
  const colors = ['#f2c94c', '#8fd0a8', '#f2a3b8', '#a7c4f2', '#f6b38a'];
  for (const [col, rows] of [
    [0, 3],
    [1, 2],
    [2, 2],
  ]) {
    for (let r = 0; r < rows; r++) {
      const n = noise(col, r, 61);
      const R = ramp(colors[n % colors.length]);
      const nx = x + 4 + col * 9 + (n % 2);
      const ny = y + 7 + r * 4;
      rect(c, nx, ny, 5, 3, R.base);
      hline(c, nx, ny, 5, R.light);
      hline(c, nx + 1, ny + 1, 3, R.deep);
      hline(c, nx + 1, ny + 3, 5, alpha(AO, 0.14));
      px(c, nx + 5, ny + 1, alpha(AO, 0.14));
    }
  }
  // Marker tray with three markers lying on it.
  slab(c, x + 6, y + 19, 20, 2, 1, METAL);
  rect(c, x + 9, y + 19, 3, 1, '#3f7fd0');
  rect(c, x + 14, y + 19, 3, 1, SCREEN.coral);
  rect(c, x + 19, y + 19, 3, 1, '#3d9a4a');
}

function bookshelf(c, x, y) {
  // Back panel, darker under each shelf (the shelf above shades it).
  rect(c, x + 2, y + 5, 28, 28, WHITE.shade);
  for (const top of [5, 16, 26]) {
    [0.4, 0.22, 0.1].forEach((t, k) => {
      hline(c, x + 2, y + top + k, 28, mix(WHITE.shade, AO, t));
    });
  }
  // Sides 2px thick (lit left, shadow right) and the centre divider.
  vline(c, x, y + 3, 36, OAK.light);
  vline(c, x + 1, y + 3, 36, OAK.base);
  vline(c, x + 30, y + 3, 36, OAK.mid);
  vline(c, x + 31, y + 3, 36, OAK.deep);
  vline(c, x + 15, y + 5, 27, OAK.base);
  vline(c, x + 16, y + 5, 27, OAK.shade);
  // Top shelf: books (one leaning), a potted plant, a framed photo.
  standingBooks(c, x + 3, y + 13, 4, 1, 8, true);
  pot(c, x + 19, y + 9, 5, 5, POT_WHITE);
  leaf(c, x + 20, y + 7, 2.4, 1.4, -0.6, LEAF);
  leaf(c, x + 23, y + 6, 2.4, 1.4, 0.6, LEAF_LIGHT);
  rect(c, x + 25, y + 7, 4, 7, GRAPH.base);
  hline(c, x + 25, y + 7, 4, GRAPH.light);
  rect(c, x + 26, y + 8, 2, 4, '#9fd0f0');
  px(c, x + 26, y + 11, LEAF_LIGHT.base);
  // Middle shelf: books, a lidded box, a flat stack.
  standingBooks(c, x + 3, y + 23, 4, 2, 7);
  box(c, x + 11, y + 19, 4, 1, 4, LINEN);
  standingBooks(c, x + 18, y + 23, 4, 3, 7);
  bookStack(c, x + 25, y + 20, [6, 4, 0]);
  // Bottom shelf: storage boxes, a vase, a few books.
  box(c, x + 3, y + 27, 5, 1, 5, LINEN);
  box(c, x + 9, y + 27, 5, 1, 5, ramp('#c9b99a', K));
  hline(c, x + 5, y + 29, 1, LINEN.deep);
  hline(c, x + 11, y + 29, 1, GRAPH.base);
  pot(c, x + 19, y + 27, 4, 5, ramp('#df8a68', K));
  standingBooks(c, x + 24, y + 31, 3, 4, 5);
  // Shelf boards: lit front edge, darker lip, shadow on what is under them.
  for (const sy of [14, 24]) {
    hline(c, x + 2, y + sy, 28, OAK.hi);
    hline(c, x + 2, y + sy + 1, 28, OAK.mid);
  }
  hline(c, x + 2, y + 32, 28, OAK.hi);
  // Top with its depth seen from above.
  slab(c, x, y, 32, 3, 2, OAK);
  // Cabinet doors at the bottom, with pulls, on a dark kick.
  box(c, x, y + 33, 32, 0, 6, OAK);
  vline(c, x + 15, y + 33, 5, OAK.deep);
  vline(c, x + 16, y + 33, 5, OAK.light);
  for (const hx of [13, 18]) vline(c, x + hx, y + 34, 2, METAL.hi);
  hline(c, x + 2, y + 39, 28, GRAPH.deep);
}

function plantTall(c, x, y) {
  // Monstera in a white ceramic pot.
  pot(c, x + 5, y + 22, 10, 10, POT_WHITE);
  stem(c, x + 9, y + 23, x + 5, y + 10, LEAF_DARK.shade);
  stem(c, x + 10, y + 23, x + 14, y + 8, LEAF_DARK.shade);
  stem(c, x + 9, y + 23, x + 9, y + 5, LEAF_DARK.shade);
  leaf(c, x + 5, y + 14, 5, 3.2, 0.5, LEAF_DARK, { split: true });
  leaf(c, x + 15, y + 12, 5, 3.2, -0.4, LEAF_TEAL, { split: true });
  leaf(c, x + 9, y + 6, 5.5, 3.5, -0.1, LEAF, { split: true });
  leaf(c, x + 4, y + 8, 4.5, 3, 0.9, LEAF_LIGHT, { split: true });
  leaf(c, x + 15, y + 18, 4.5, 2.8, 0.35, LEAF);
  leaf(c, x + 5, y + 20, 4, 2.5, -0.3, LEAF_OLIVE);
}

function plantFig(c, x, y) {
  // Fiddle-leaf fig: slim trunk, big glossy leaves, charcoal planter.
  pot(c, x + 3, y + 27, 10, 9, POT_COAL);
  vline(c, x + 8, y + 12, 17, WALNUT.shade);
  vline(c, x + 7, y + 18, 11, WALNUT.light);
  const leaves = [
    [8, 4, -1.3, LEAF],
    [4, 7, -0.6, LEAF_DARK],
    [12, 8, 0.6, LEAF_TEAL],
    [5, 12, -0.4, LEAF_LIGHT],
    [11, 14, 0.5, LEAF_DARK],
    [6, 18, -0.5, LEAF_OLIVE],
    [11, 20, 0.6, LEAF_LIGHT],
    [8, 9, 1.4, LEAF_OLIVE],
  ];
  for (const [lx, ly, angle, R] of leaves) leaf(c, x + lx, y + ly, 3.6, 2.4, angle, R);
}

function plantSmall(c, x, y) {
  // Snake plant: upright blades with pale edges growing out of a terracotta pot.
  pot(c, x + 4, y + 13, 9, 8, POT_TERRA);
  const blades = [
    [5, 4, LEAF],
    [7, 1, LEAF_DARK],
    [9, 3, LEAF],
    [11, 6, LEAF_OLIVE],
    [6, 7, LEAF_LIGHT],
  ];
  for (const [bx, top, R] of blades) {
    const h = 15 - top;
    rect(c, x + bx, y + top + 1, 2, h, R.base);
    vline(c, x + bx, y + top + 1, h, R.light);
    px(c, x + bx, y + top, R.hi);
    vline(c, x + bx + 1, y + top + 3, h - 3, R.deep);
    for (let k = 2; k < h; k += 3) px(c, x + bx, y + top + k, LEAF_LIGHT.hi);
  }
}

/** Puffy cushion: rounded, lit top and left, shaded right and bottom, a diagonal crease. */
function pillow(c, x, y, w, h, R) {
  rounded(c, x, y, w, h, R.base);
  hline(c, x + 1, y, w - 2, R.hi);
  vline(c, x, y + 1, h - 2, R.light);
  vline(c, x + w - 1, y + 1, h - 2, R.shade);
  hline(c, x + 1, y + h - 1, w - 2, R.shade);
  px(c, x + 2, y + 2, R.mid);
  px(c, x + 3, y + 3, R.mid);
}

/** Two-seat sofa facing the viewer: block arms, two back cushions, throw pillows, oak legs. */
function sofa(c, x, y) {
  const F = FABRIC;
  box(c, x + 3, y + 3, 28, 2, 9, F);
  vline(c, x + 16, y + 6, 5, F.shade);
  vline(c, x + 17, y + 6, 5, F.light);
  pillow(c, x + 6, y + 6, 7, 6, MUSTARD);
  pillow(c, x + 21, y + 6, 7, 6, LINEN);
  // Seat cushions (top plane, front face) and the base under them.
  rect(c, x + 3, y + 19, 28, 2, F.deep);
  for (const sx of [5, 17]) {
    box(c, x + sx, y + 12, 12, 3, 4, F);
    hline(c, x + sx + 2, y + 13, 8, mix(F.light, F.hi, 0.5));
  }
  // Arms as blocks: top plane, front face, shadow side on the right.
  box(c, x + 1, y + 6, 4, 3, 13, F);
  box(c, x + 29, y + 6, 4, 3, 13, F);
  vline(c, x + 31, y + 9, 13, F.mid);
  legs(c, [x + 3, x + 29], y + 21, 2, OAK);
}

function armchair(c, x, y) {
  const F = ramp('#c98f6a', K);
  box(c, x + 3, y + 2, 12, 2, 9, F);
  hline(c, x + 5, y + 6, 8, F.mid);
  rect(c, x + 3, y + 18, 12, 1, F.deep);
  box(c, x + 4, y + 11, 10, 3, 4, F);
  hline(c, x + 6, y + 12, 6, mix(F.light, F.hi, 0.5));
  box(c, x + 1, y + 5, 3, 3, 11, F);
  box(c, x + 14, y + 5, 3, 3, 11, F);
  vline(c, x + 15, y + 8, 11, F.mid);
  legs(c, [x + 2, x + 14], y + 19, 2, WALNUT);
}

function coffeeTable(c, x, y) {
  legs(c, [x + 3, x + 27], y + 10, 4, GRAPH);
  slab(c, x + 1, y + 3, 30, 5, 2, OAK);
  // Books, a cup and a little plant.
  bookStack(c, x + 5, y + 3, [0, 3]);
  mug(c, x + 14, y + 3);
  succulent(c, x + 21, y - 1);
}

function sideTable(c, x, y) {
  legs(c, [x + 3, x + 11], y + 10, 6, GRAPH);
  slab(c, x + 2, y + 5, 12, 3, 2, WHITE);
  // Bud vase with a sprig.
  pot(c, x + 6, y + 3, 3, 4, CORAL);
  castOn(c, x + 7, y + 7, 3);
  stem(c, x + 7, y + 3, x + 7, y + 1, LEAF_DARK.base);
  leaf(c, x + 5, y + 1, 2, 1.2, -0.7, LEAF, { rib: false });
  leaf(c, x + 9, y + 1, 2, 1.2, 0.7, LEAF_LIGHT, { rib: false });
}

function floorLamp(c, x, y) {
  // Drum shade: elliptical top (warm light inside), body shaded like a cylinder, glowing rim.
  hline(c, x + 4, y + 1, 8, LINEN.light);
  px(c, x + 3, y + 2, LINEN.hi);
  hline(c, x + 4, y + 2, 8, '#fff1c8');
  px(c, x + 12, y + 2, LINEN.mid);
  hline(c, x + 3, y + 3, 10, LINEN.hi);
  for (let v = 4; v < 10; v++) {
    for (let i = 0; i < 10; i++) {
      const t = i / 9;
      const color =
        t < 0.25 ? LINEN.light : t < 0.6 ? LINEN.base : t < 0.9 ? LINEN.mid : LINEN.shade;
      px(c, x + 3 + i, y + v, color);
    }
  }
  hline(c, x + 3, y + 10, 10, '#fff6dc');
  // Pole.
  vline(c, x + 7, y + 11, 20, GRAPH.light);
  vline(c, x + 8, y + 11, 20, GRAPH.base);
  // Weighted disc base: top plane, lit front edge, thickness.
  hline(c, x + 5, y + 30, 6, GRAPH.base);
  hline(c, x + 4, y + 31, 8, GRAPH.light);
  hline(c, x + 4, y + 32, 8, GRAPH.hi);
  hline(c, x + 4, y + 33, 8, GRAPH.shade);
  vline(c, x + 7, y + 30, 2, GRAPH.light);
  vline(c, x + 8, y + 30, 2, GRAPH.base);
}

function serverRack(c, x, y) {
  box(c, x + 1, y, 14, 3, 31, GRAPH);
  for (let k = 0; k < 5; k++) px(c, x + 4 + k * 2, y + 1, GRAPH.mid);
  vline(c, x + 13, y + 3, 30, GRAPH.shade);
  // Glass door with the units behind it.
  rect(c, x + 3, y + 5, 9, 27, '#161c29');
  for (let u = 0; u < 8; u++) {
    const uy = y + 6 + u * 3;
    hline(c, x + 4, uy, 7, GRAPH.base);
    hline(c, x + 4, uy + 1, 7, GRAPH.shade);
    const n = noise(u, 3, 31);
    px(c, x + 5, uy + 1, ['#58d36b', '#58d36b', '#5aa2ff', '#f2c94c'][n % 4]);
    px(c, x + 6, uy + 1, n % 3 === 0 ? '#5aa2ff' : '#58d36b');
    for (let k = 8; k < 11; k += 2) px(c, x + k, uy + 1, GRAPH.deep);
  }
  stem(c, x + 3, y + 30, x + 11, y + 8, alpha('#ffffff', 0.1));
  // Handle on the door edge, feet.
  vline(c, x + 12, y + 15, 6, METAL.hi);
  rect(c, x + 2, y + 34, 3, 1, GRAPH.deep);
  rect(c, x + 11, y + 34, 3, 1, GRAPH.deep);
}

function printer(c, x, y) {
  // Cabinet with two drawers.
  box(c, x + 1, y + 12, 16, 2, 8, WHITE);
  hline(c, x + 2, y + 17, 14, WHITE.shade);
  for (const hy of [15, 19]) hline(c, x + 7, y + hy, 4, GRAPH.light);
  hline(c, x + 2, y + 22, 14, GRAPH.deep);
  // Printer: scanner lid (top plane) with the panel, output slot with paper, shadow side.
  box(c, x + 2, y + 3, 14, 3, 8, METAL);
  hline(c, x + 3, y + 4, 8, METAL.hi);
  rect(c, x + 12, y + 3, 3, 2, GRAPH.base);
  px(c, x + 13, y + 3, SCREEN.cyan);
  rect(c, x + 4, y + 7, 8, 1, GRAPH.deep);
  rect(c, x + 4, y + 8, 8, 2, '#ffffff');
  hline(c, x + 5, y + 9, 6, WHITE.mid);
  px(c, x + 13, y + 8, '#58d36b');
  hline(c, x + 4, y + 11, 8, METAL.shade);
  castOn(c, x + 3, y + 14, 14, 0.3);
}

/** Kitchen island: quartz top over oak slats, espresso machine (left cell), fruit bowl, sink. */
function kitchen(c, x, y) {
  slats(c, x + 1, y + 20, 46, 9);
  rect(c, x + 2, y + 29, 44, 2, GRAPH.deep);
  slab(c, x, y + 11, 48, 7, 2, QUARTZ);
  castOn(c, x + 1, y + 21, 46, 0.15);
  for (const [vx, vy, len] of [
    [16, 15, 7],
    [28, 12, 4],
  ]) {
    stem(c, x + vx, y + vy, x + vx + len, y + vy + 1, mix(QUARTZ.light, QUARTZ.mid, 0.4));
  }
  // Espresso machine with its shadow on the counter.
  box(c, x + 3, y + 1, 11, 2, 11, METAL);
  rect(c, x + 14, y + 11, 1, 3, alpha(AO, 0.25));
  castOn(c, x + 4, y + 14, 11, 0.3);
  rect(c, x + 5, y + 4, 7, 3, GRAPH.deep);
  hline(c, x + 5, y + 4, 7, GRAPH.base);
  px(c, x + 6, y + 5, SCREEN.cyan);
  px(c, x + 10, y + 5, SCREEN.coral);
  rect(c, x + 7, y + 7, 3, 1, GRAPH.base);
  hline(c, x + 7, y + 9, 3, WHITE.hi);
  px(c, x + 8, y + 9, '#5a3a24');
  rect(c, x + 7, y + 10, 3, 1, WHITE.base);
  hline(c, x + 5, y + 11, 7, GRAPH.base);
  // Fruit bowl.
  rounded(c, x + 20, y + 11, 3, 3, CORAL.base);
  px(c, x + 20, y + 11, CORAL.hi);
  rounded(c, x + 23, y + 10, 3, 3, MUSTARD.base);
  px(c, x + 23, y + 10, MUSTARD.hi);
  rounded(c, x + 25, y + 11, 3, 3, ramp('#7cbf5a', K).base);
  hline(c, x + 19, y + 13, 9, WALNUT.hi);
  hline(c, x + 19, y + 14, 9, WALNUT.base);
  hline(c, x + 20, y + 15, 7, WALNUT.shade);
  castOn(c, x + 21, y + 16, 8);
  // Sink sunk into the top (dark back wall, lit rim) and a tall faucet.
  rect(c, x + 33, y + 13, 10, 4, METAL.light);
  rect(c, x + 34, y + 14, 8, 2, METAL.mid);
  hline(c, x + 34, y + 14, 8, METAL.deep);
  hline(c, x + 33, y + 16, 10, METAL.hi);
  vline(c, x + 38, y + 7, 6, METAL.light);
  vline(c, x + 39, y + 8, 5, METAL.shade);
  hline(c, x + 36, y + 7, 3, METAL.hi);
  px(c, x + 36, y + 8, METAL.shade);
  castOn(c, x + 39, y + 13, 2, 0.3);
}

/** Vertical oak slats, each with a lit edge and a shaded groove, darker at both ends. */
function slats(c, x, y, w, h) {
  rect(c, x, y, w, h, OAK.base);
  for (let k = 0; k < w; k += 3) {
    vline(c, x + k, y, h, OAK.light);
    vline(c, x + k + 2, y, h, OAK.shade);
  }
  vline(c, x, y, h, OAK.hi);
  vline(c, x + w - 1, y, h, OAK.deep);
  hline(c, x, y + h - 1, w, mix(OAK.shade, AO, 0.3));
}

function fridge(c, x, y) {
  box(c, x + 1, y, 14, 3, 31, METAL);
  vline(c, x + 3, y + 3, 30, METAL.hi);
  vline(c, x + 13, y + 3, 30, METAL.shade);
  // Freezer and fridge doors, handles, magnets and a note.
  hline(c, x + 1, y + 12, 14, METAL.deep);
  hline(c, x + 2, y + 13, 12, METAL.light);
  for (const [hy, hh] of [
    [5, 6],
    [15, 8],
  ]) {
    vline(c, x + 10, y + hy, hh, GRAPH.light);
    vline(c, x + 11, y + hy, hh, GRAPH.deep);
  }
  px(c, x + 6, y + 17, SCREEN.coral);
  px(c, x + 8, y + 19, SCREEN.yellow);
  rect(c, x + 5, y + 21, 3, 4, '#ffffff');
  vline(c, x + 8, y + 22, 3, alpha(AO, 0.2));
  hline(c, x + 2, y + 34, 12, GRAPH.deep);
}

function cooler(c, x, y) {
  // Translucent water bottle, upside down (alpha high enough to keep its outline).
  const glass = (color) => alpha(color, 0.86);
  rounded(c, x + 4, y + 1, 8, 9, glass('#7fbfe6'));
  hline(c, x + 5, y + 1, 6, glass('#d8effc'));
  rect(c, x + 4, y + 2, 8, 2, glass('#c4e5f8'));
  hline(c, x + 4, y + 4, 8, glass('#eaf7ff'));
  hline(c, x + 4, y + 7, 8, glass('#6aaedb'));
  vline(c, x + 5, y + 2, 7, glass('#eef9ff'));
  vline(c, x + 10, y + 2, 7, glass('#5598c8'));
  rect(c, x + 6, y + 10, 4, 2, glass('#5f9fcf'));
  // Body: top plane, tap recess with two taps, drip tray.
  box(c, x + 3, y + 12, 10, 2, 14, WHITE);
  rect(c, x + 5, y + 16, 6, 5, GRAPH.base);
  hline(c, x + 5, y + 16, 6, GRAPH.deep);
  rect(c, x + 6, y + 17, 1, 2, '#e0584f');
  rect(c, x + 9, y + 17, 1, 2, '#4b93d8');
  px(c, x + 6, y + 17, '#ff9a90');
  px(c, x + 9, y + 17, '#9ccaf2');
  hline(c, x + 5, y + 20, 6, METAL.hi);
  hline(c, x + 5, y + 21, 6, METAL.shade);
  hline(c, x + 4, y + 28, 8, GRAPH.deep);
}

function phoneTable(c, x, y) {
  legs(c, [x + 2, x + 12], y + 12, 6, GRAPH);
  slab(c, x + 1, y + 7, 14, 3, 2, OAK);
  // Desk phone: body with a top plane, handset, keypad light, and its shadow.
  box(c, x + 3, y + 5, 7, 2, 2, GRAPH);
  rect(c, x + 3, y + 3, 3, 2, GRAPH.light);
  hline(c, x + 3, y + 3, 3, GRAPH.hi);
  px(c, x + 8, y + 5, SCREEN.cyan);
  castOn(c, x + 4, y + 9, 7);
  succulent(c, x + 10, y + 1);
}

/** Reception desk: quartz ledge, oak slats, graphite logo panel, iMac and a plant. */
function reception(c, x, y) {
  // Slatted front under the overhanging ledge, logo panel standing out of it.
  slats(c, x + 1, y + 15, 62, 12);
  rect(c, x + 2, y + 27, 60, 1, GRAPH.deep);
  box(c, x + 22, y + 16, 20, 1, 8, GRAPH);
  castOn(c, x + 23, y + 25, 20, 0.25);
  rect(c, x + 42, y + 17, 1, 8, alpha(AO, 0.25));
  for (const [lx, ly, lw, lh] of [
    [26, 19, 2, 3],
    [29, 18, 2, 4],
    [32, 20, 2, 2],
    [35, 19, 3, 3],
  ]) {
    rect(c, x + lx, y + ly, lw, lh, '#f2d27a');
    hline(c, x + lx, y + ly, lw, '#fff0b8');
  }
  hline(c, x + 25, y + 23, 14, alpha('#f2d27a', 0.5));
  slab(c, x, y + 9, 64, 4, 2, QUARTZ);
  castOn(c, x + 1, y + 16, 62, 0.15);
  // On the ledge: a plant, the back of the iMac, a pen cup.
  pot(c, x + 6, y + 6, 6, 5, POT_WHITE);
  leaf(c, x + 7, y + 3, 2.6, 1.5, -0.6, LEAF);
  leaf(c, x + 10, y + 3, 2.6, 1.5, 0.6, LEAF_LIGHT);
  castOn(c, x + 7, y + 11, 6);
  rect(c, x + 49, y + 8, 2, 3, METAL.mid);
  px(c, x + 49, y + 8, METAL.light);
  hline(c, x + 47, y + 11, 6, METAL.hi);
  castOn(c, x + 48, y + 12, 6);
  rounded(c, x + 44, y, 12, 8, WHITE.base);
  hline(c, x + 45, y, 10, WHITE.hi);
  vline(c, x + 44, y + 1, 6, WHITE.light);
  vline(c, x + 55, y + 1, 6, WHITE.shade);
  hline(c, x + 45, y + 7, 10, WHITE.mid);
  rect(c, x + 49, y + 3, 2, 2, WHITE.mid);
  rect(c, x + 30, y + 7, 3, 4, GRAPH.base);
  hline(c, x + 30, y + 7, 3, GRAPH.light);
  px(c, x + 30, y + 6, '#3f7fd0');
  px(c, x + 32, y + 5, SCREEN.coral);
  castOn(c, x + 31, y + 11, 3);
}

function planter(c, x, y) {
  // Long oak trough: back rim, soil, plants growing out of it, front rim and the slatted front.
  hline(c, x + 2, y + 12, 28, OAK.light);
  rect(c, x + 1, y + 13, 30, 2, SOIL.base);
  hline(c, x + 2, y + 13, 28, SOIL.deep);
  for (const sx of [1, 30]) vline(c, x + sx, y + 13, 2, sx === 1 ? OAK.light : OAK.mid);
  const greens = [LEAF_DARK, LEAF, LEAF_LIGHT, LEAF_OLIVE, LEAF_TEAL];
  for (let k = 0; k < 6; k++)
    stem(c, x + 5 + k * 4, y + 14, x + 4 + k * 4 + (k % 3), y + 3 + (k % 2) * 2, LEAF_LIGHT.base);
  for (let k = 0; k < 9; k++) {
    const n = noise(k, 7, 41);
    leaf(c, x + 3 + k * 3.3, y + 8 + (n % 4), 3 + (n % 2), 1.8, (n % 3) - 1, greens[n % 5]);
  }
  hline(c, x + 1, y + 15, 30, OAK.hi);
  box(c, x + 1, y + 16, 30, 0, 5, OAK);
  for (let k = 5; k < 30; k += 5) vline(c, x + 1 + k, y + 16, 4, OAK.mid);
  legs(c, [x + 3, x + 27], y + 21, 2, GRAPH);
}

// Wall-mounted props: drawn over the face of the top wall (its middle row, eye level). Each frame
// stands out of the wall: its top edge is seen from above (lit) and the shadow it casts on the
// wall, 1-2 px down-right, is added after the outline (`wallShadow`).

function whiteboard(c, x, y) {
  rect(c, x + 1, y + 2, 30, 11, METAL.base);
  hline(c, x + 1, y + 2, 30, METAL.hi);
  vline(c, x + 1, y + 3, 10, METAL.light);
  vline(c, x + 30, y + 3, 10, METAL.deep);
  hline(c, x + 2, y + 12, 28, METAL.shade);
  rect(c, x + 2, y + 3, 28, 9, '#fbfcfe');
  hline(c, x + 2, y + 3, 28, '#e1e6ee');
  hline(c, x + 4, y + 5, 9, '#3f7fd0');
  hline(c, x + 4, y + 7, 6, '#3f7fd0');
  hline(c, x + 4, y + 9, 8, SCREEN.coral);
  for (const [nx, ny, color] of [
    [16, 5, '#f2c94c'],
    [20, 5, '#8fd0a8'],
    [24, 5, '#f2a3b8'],
    [18, 9, '#a7c4f2'],
  ]) {
    const R = ramp(color);
    rect(c, x + nx, y + ny, 3, ny === 9 ? 2 : 3, R.base);
    hline(c, x + nx, y + ny, 3, R.light);
    vline(c, x + nx + 3, y + ny + 1, ny === 9 ? 1 : 2, alpha(AO, 0.12));
  }
  stem(c, x + 23, y + 10, x + 27, y + 9, '#3d9a4a');
  // Marker tray sticking out under the board.
  hline(c, x + 4, y + 13, 24, METAL.hi);
  hline(c, x + 4, y + 14, 24, METAL.shade);
  rect(c, x + 6, y + 13, 3, 1, SCREEN.coral);
  rect(c, x + 10, y + 13, 3, 1, '#3f7fd0');
}

function tv(c, x, y) {
  rect(c, x + 2, y + 2, 28, 11, GRAPH.deep);
  hline(c, x + 2, y + 2, 28, GRAPH.light);
  vline(c, x + 2, y + 3, 10, GRAPH.base);
  vline(c, x + 29, y + 3, 10, mix(GRAPH.deep, AO, 0.4));
  rect(c, x + 3, y + 3, 26, 9, SCREEN.bg);
  // KPI tiles, a line chart and bars.
  rect(c, x + 4, y + 4, 5, 3, SCREEN.bar);
  hline(c, x + 5, y + 5, 3, SCREEN.green);
  rect(c, x + 4, y + 8, 5, 3, SCREEN.bar);
  hline(c, x + 5, y + 9, 2, SCREEN.yellow);
  const line = [10, 9, 9, 8, 6, 7, 5, 5, 4, 4];
  line.forEach((ly, k) => {
    px(c, x + 11 + k, y + ly, SCREEN.cyan);
  });
  for (let k = 0; k < 4; k++) rect(c, x + 23 + k * 2, y + 11 - (k + 2), 1, k + 2, SCREEN.violet);
  px(c, x + 3, y + 3, SCREEN.glare);
  px(c, x + 4, y + 3, SCREEN.glare);
  hline(c, x + 14, y + 13, 4, GRAPH.shade);
}

/** Picture frame `w`x`h` with thickness (lit top and left, shaded right and bottom) and a mat. */
function frame(c, x, y, w, h, R, mat) {
  rect(c, x, y, w, h, R.base);
  hline(c, x, y, w, R.hi);
  vline(c, x, y + 1, h - 1, R.light);
  vline(c, x + w - 1, y + 1, h - 1, R.deep);
  hline(c, x + 1, y + h - 1, w - 1, R.shade);
  rect(c, x + 1, y + 1, w - 2, h - 2, mat);
  hline(c, x + 1, y + 1, w - 2, mix(mat, AO, 0.18));
  vline(c, x + 1, y + 2, h - 3, mix(mat, AO, 0.1));
}

function artWide(c, x, y) {
  // Two framed prints.
  frame(c, x + 2, y + 2, 13, 11, OAK, '#f6f1e7');
  rounded(c, x + 5, y + 6, 5, 5, CORAL.base);
  px(c, x + 6, y + 6, CORAL.light);
  rect(c, x + 8, y + 4, 4, 4, ramp('#3f7d8f').base);
  frame(c, x + 17, y + 2, 13, 11, GRAPH, '#eef2f6');
  for (let k = 0; k < 11; k++)
    px(c, x + 18 + k, y + 8 - Math.round(Math.sin(k / 1.8) * 2), '#4a6fa5');
  rect(c, x + 18, y + 9, 11, 3, ramp('#8fb6d3').base);
}

/**
 * The props: art size `w`x`h`, anchor (`ax`, `ay`) = the art pixel at the bottom-left corner of
 * the footprint, the contact shadow (`shadow`: centre x, centre y, radius x, radius y) and whether
 * it hangs on a wall (`wall`: no contact shadow, a drop shadow on the wall instead).
 */
export const PROPS = [
  {
    id: 'workstation',
    w: 32,
    h: 36,
    ax: 0,
    ay: 36,
    draw: workstation(0),
    shadow: [16, 35, 15, 1.6],
  },
  {
    id: 'workstation-b',
    w: 32,
    h: 36,
    ax: 0,
    ay: 36,
    draw: workstation(1),
    shadow: [16, 35, 15, 1.6],
  },
  {
    id: 'workstation-c',
    w: 32,
    h: 36,
    ax: 0,
    ay: 36,
    draw: workstation(2),
    shadow: [16, 35, 15, 1.6],
  },
  { id: 'lead-desk', w: 48, h: 36, ax: 0, ay: 36, draw: leadDesk, shadow: [24, 35, 23, 1.6] },
  { id: 'chair', w: 16, h: 16, ax: 0, ay: 10, draw: chair, shadow: [8, 14.5, 6.5, 1.4] },
  {
    id: 'chair-exec',
    w: 16,
    h: 18,
    ax: 0,
    ay: 12,
    draw: chairExec,
    shadow: [8, 16.5, 6.5, 1.4],
  },
  { id: 'kanban', w: 32, h: 32, ax: 0, ay: 32, draw: kanban, shadow: [16, 30.5, 15, 1.5] },
  { id: 'bookshelf', w: 32, h: 40, ax: 0, ay: 40, draw: bookshelf, shadow: [16, 38.5, 16, 1.5] },
  { id: 'plant-tall', w: 20, h: 34, ax: 2, ay: 34, draw: plantTall, shadow: [10, 32, 7, 1.8] },
  { id: 'plant-fig', w: 16, h: 38, ax: 0, ay: 38, draw: plantFig, shadow: [8, 36, 7, 1.6] },
  { id: 'plant', w: 16, h: 22, ax: 0, ay: 22, draw: plantSmall, shadow: [8, 21, 6, 1.4] },
  { id: 'planter', w: 32, h: 24, ax: 0, ay: 24, draw: planter, shadow: [16, 22.5, 16, 1.6] },
  { id: 'sofa', w: 34, h: 26, ax: 1, ay: 26, draw: sofa, shadow: [17, 23, 17, 2] },
  { id: 'armchair', w: 18, h: 24, ax: 1, ay: 24, draw: armchair, shadow: [9, 21, 9, 2] },
  {
    id: 'coffee-table',
    w: 32,
    h: 16,
    ax: 0,
    ay: 16,
    draw: coffeeTable,
    shadow: [16, 13.5, 15, 1.8],
  },
  { id: 'side-table', w: 16, h: 18, ax: 0, ay: 18, draw: sideTable, shadow: [8, 15.5, 6, 1.4] },
  { id: 'floor-lamp', w: 16, h: 36, ax: 0, ay: 36, draw: floorLamp, shadow: [8, 33.5, 6, 1.4] },
  { id: 'server-rack', w: 16, h: 36, ax: 0, ay: 36, draw: serverRack, shadow: [8, 34.5, 8, 1.5] },
  { id: 'printer', w: 18, h: 24, ax: 1, ay: 24, draw: printer, shadow: [9, 22.5, 9, 1.5] },
  { id: 'kitchen', w: 48, h: 32, ax: 0, ay: 32, draw: kitchen, shadow: [24, 30.5, 24, 1.5] },
  { id: 'fridge', w: 16, h: 36, ax: 0, ay: 36, draw: fridge, shadow: [8, 34.5, 8, 1.5] },
  { id: 'cooler', w: 16, h: 30, ax: 0, ay: 30, draw: cooler, shadow: [8, 28.5, 6, 1.4] },
  { id: 'phone-table', w: 16, h: 20, ax: 0, ay: 20, draw: phoneTable, shadow: [8, 17.5, 7, 1.4] },
  { id: 'reception', w: 64, h: 30, ax: 0, ay: 30, draw: reception, shadow: [32, 28.5, 32, 1.5] },
  { id: 'whiteboard', w: 32, h: 16, ax: 0, ay: 16, draw: whiteboard, wall: true },
  { id: 'tv', w: 32, h: 16, ax: 0, ay: 16, draw: tv, wall: true },
  { id: 'art-wide', w: 32, h: 16, ax: 0, ay: 16, draw: artWide, wall: true },
];

// --------------------------------------------------------------------------- doors

/** Frames of the automatic door, closed (0) to fully open (DOOR_FRAMES - 1). */
export const DOOR_FRAMES = 6;
const DOOR_H = WALL_ROWS * 16;
/** The jambs overlap the wall on each side of the door column. */
const JAMB = 4;
/** First row (from the wall top) of the door opening: a door is ~2.1 m of a 2.7 m wall. */
const DOOR_TOP = 12;

/** Slab tones of the wall (`tiles.mjs` SLAB_*): the reveal shows the wall's thickness. */
const SLAB = { hi: SLAB_EDGE, top: SLAB_TOP, lo: SLAB_FACE, deep: SLAB_FACE_LO };
/** Glass of the sliding leaves: the character walking through shows behind it. */
const GLASS_ALPHA = 0.55;
/** The door keeps its original flat tones (it is not part of the furniture volume pass). */
const DOOR_GRAPH = ramp('#3b4256');
const DOOR_METAL = ramp('#b9c0cc');

/**
 * Back layer of the door (`door-back`), drawn under the characters: the dim doorway (the corridor
 * beyond, darker up high) and the reveal, the thickness of the wall seen through the opening (the
 * underside of the lintel and the inner faces of the jambs, in the slab's tones).
 */
function doorBack(c, x, y) {
  const ox = x + JAMB;
  for (let v = DOOR_TOP; v < DOOR_H; v++) {
    const t = (v - DOOR_TOP) / (DOOR_H - DOOR_TOP);
    rect(c, ox, y + v, 16, 1, mix('#262a36', '#5d6170', Math.min(1, t * 1.4)));
  }
  // Underside of the lintel (in shade), then the jambs: the left one faces away from the light,
  // the right one catches it.
  rect(c, ox, y + DOOR_TOP, 16, 2, SLAB.deep);
  hline(c, ox, y + DOOR_TOP + 2, 16, alpha(AO, 0.45));
  rect(c, ox, y + DOOR_TOP, 3, DOOR_H - DOOR_TOP, SLAB.lo);
  vline(c, ox + 2, y + DOOR_TOP + 2, DOOR_H - DOOR_TOP - 2, mix(SLAB.lo, AO, 0.35));
  rect(c, ox + 14, y + DOOR_TOP, 2, DOOR_H - DOOR_TOP, SLAB.top);
  vline(c, ox + 14, y + DOOR_TOP + 2, DOOR_H - DOOR_TOP - 2, SLAB.hi);
}

/**
 * Front layer of the glass sliding door, `open` in [0, 1], drawn in front of whoever walks through
 * the wall rows: the wall above the lintel (same art as the wall tiles), a graphite frame and two
 * glass leaves (translucent, opaque sash and handle) that slide into the wall pockets on each side.
 * The doorway itself is left transparent (the back layer shows through).
 */
function door(open) {
  return (c, x, y) => {
    const ox = x + JAMB;
    // Wall above the door, matching the wall tiles pixel for pixel.
    for (let v = 0; v < DOOR_TOP; v++) {
      for (let i = 0; i < 16; i++) {
        const base = faceColor(v, i);
        px(c, ox + i, y + v, wallNoise(i, v, 41) % 17 === 0 ? plasterShade(base) : base);
      }
    }
    // Sliding glass leaves (each half of the opening), clipped by the pockets in the wall: fully
    // open, both are hidden.
    const slide = Math.round(open * 8);
    const leaf = (x0, handleRight) => {
      for (let i = 0; i < 8; i++) {
        const lx = x0 + i;
        if (lx < 0 || lx >= 16) continue;
        for (let v = DOOR_TOP; v < DOOR_H - 1; v++) {
          let color = alpha(
            mix('#9fc0d6', '#c8dceb', (v - DOOR_TOP) / (DOOR_H - DOOR_TOP)),
            GLASS_ALPHA,
          );
          if (i === 0 || i === 7 || v === DOOR_TOP) color = DOOR_GRAPH.light;
          else if (v === DOOR_H - 2) color = DOOR_GRAPH.base;
          px(c, ox + lx, y + v, color);
        }
        // Diagonal reflections across the glass.
        for (let k = 0; k < 6; k++) {
          const rx = 2 + Math.floor(k / 2);
          if (i === rx) px(c, ox + lx, y + DOOR_TOP + 20 - k, alpha('#e6f2fa', 0.6));
          if (i === rx + 2) px(c, ox + lx, y + DOOR_TOP + 10 - k, alpha('#e6f2fa', 0.6));
        }
      }
      // Long bar handle near the meeting edge.
      const hx = handleRight ? x0 + 5 : x0 + 2;
      if (hx >= 0 && hx < 16) {
        rect(c, ox + hx, y + DOOR_TOP + 13, 1, 9, DOOR_METAL.hi);
        rect(c, ox + hx, y + DOOR_TOP + 22, 1, 1, DOOR_METAL.shade);
      }
    };
    leaf(-slide, true);
    leaf(8 + slide, false);
    // Graphite frame: lintel and jambs standing slightly out of the wall.
    rect(c, x, y + DOOR_TOP - 3, 16 + JAMB * 2, 3, DOOR_GRAPH.base);
    hline(c, x, y + DOOR_TOP - 3, 16 + JAMB * 2, DOOR_GRAPH.light);
    for (const jx of [x, ox + 16]) {
      rect(c, jx, y + DOOR_TOP - 3, JAMB, DOOR_H - DOOR_TOP + 3, DOOR_GRAPH.base);
      vline(c, jx, y + DOOR_TOP - 2, DOOR_H - DOOR_TOP + 2, DOOR_GRAPH.light);
      vline(c, jx + JAMB - 1, y + DOOR_TOP, DOOR_H - DOOR_TOP, DOOR_GRAPH.deep);
    }
    // Sensor light on the lintel: green when open.
    rect(c, ox + 7, y + DOOR_TOP - 2, 2, 1, open > 0 ? '#6fd38a' : '#d9d4c7');
    // Metal threshold.
    hline(c, ox, y + DOOR_H - 1, 16, DOOR_METAL.base);
  };
}

const doorFrame = (id, draw) => ({
  id,
  w: 16 + JAMB * 2,
  h: DOOR_H,
  ax: JAMB,
  ay: DOOR_H,
  draw,
  noOutline: true,
});

const DOOR_PROPS = [
  doorFrame('door-back', doorBack),
  ...Array.from({ length: DOOR_FRAMES }, (_, k) =>
    doorFrame(`door-${k}`, door(k / (DOOR_FRAMES - 1))),
  ),
];

/**
 * Shadow a wall prop casts on the wall, 1-2 px down-right of it (light from the top-left), on the
 * empty pixels of its slot only. Translucent, so it darkens whatever face it hangs on with the
 * same cool tint as the shadow under the wall slab.
 */
function wallShadow(c, x, y, w, h) {
  const solid = (i, j) =>
    i >= x && j >= y && i < x + w && j < y + h && c.data[(j * c.w + i) * 4 + 3] >= 200;
  const marks = [];
  for (let j = y; j < y + h; j++) {
    for (let i = x; i < x + w; i++) {
      if (c.data[(j * c.w + i) * 4 + 3] !== 0) continue;
      if (solid(i - 1, j - 1)) marks.push([i, j, 0.3]);
      else if (solid(i - 2, j - 2) || solid(i - 1, j - 2) || solid(i - 2, j - 1))
        marks.push([i, j, 0.14]);
    }
  }
  for (const [i, j, a] of marks) px(c, i, j, alpha(AO, a));
}

const ATLAS_WIDTH = 256;
/** Margin around each frame: the outline and the cast shadow. */
const PAD = 3;

/**
 * Packs every prop into one atlas (shelf packing) with a 1px margin for the outline. Returns the
 * canvas and the frame of each prop in the manifest format (`x, y, w, h, ax, ay`).
 */
export function makePropsAtlas() {
  const slots = [];
  let cx = 0;
  let cy = 0;
  let rowH = 0;
  for (const prop of [...PROPS, ...DOOR_PROPS]) {
    const w = prop.w + PAD * 2;
    const h = prop.h + PAD * 2;
    if (cx + w > ATLAS_WIDTH) {
      cx = 0;
      cy += rowH + 1;
      rowH = 0;
    }
    slots.push({ prop, x: cx, y: cy, w, h });
    cx += w + 1;
    rowH = Math.max(rowH, h);
  }
  const height = cy + rowH;
  const c = createCanvas(ATLAS_WIDTH, Math.ceil(height / 8) * 8);
  const frames = {};
  for (const { prop, x, y, w, h } of slots) {
    screens = [];
    prop.draw(c, x + PAD, y + PAD);
    // Monitor glass relative to the anchor (the bottom-left corner of the footprint).
    const anchorX = x + PAD + prop.ax;
    const anchorY = y + PAD + prop.ay;
    const glass = screens.map((r) => ({ x: r.x - anchorX, y: r.y - anchorY, w: r.w, h: r.h }));
    if (!prop.noOutline) outline(c, x, y, w, h);
    if (prop.wall) wallShadow(c, x, y, w, h);
    if (prop.shadow) {
      const [sx, sy, rx, ry] = prop.shadow;
      const slot = { x, y, w, h };
      // Contact shadow right under the piece, then the soft shadow it casts down-right (the light
      // comes from the top-left, like on the walls).
      shadow(c, x + PAD + sx, y + PAD + sy, rx, ry, 0.32, slot);
      shadow(c, x + PAD + sx + 2, y + PAD + sy + 1, rx + 1.5, ry * 2 + 0.6, 0.16, slot);
    }
    frames[prop.id] = {
      x,
      y,
      w,
      h,
      ax: prop.ax + PAD,
      ay: prop.ay + PAD,
      ...(glass.length > 0 ? { screens: glass } : {}),
    };
  }
  return { canvas: c, frames };
}
