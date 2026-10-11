// Props of the default skin: furniture bigger than one tile (workstations with monitors, tall
// plants, shelves, sofas, the kitchen island...), drawn in the same language as the characters:
// three-plus tones per material derived from one base color (tone.mjs `ramp`), light from the
// top-left, a 1px selective outline and a soft contact shadow on the floor.
//
// Each prop is placed by the layout on a footprint of whole tiles; its art may rise above it (a
// monitor, a plant) and is anchored by the footprint's bottom-left corner (`ax`, `ay` in the art).
import { createCanvas, px, rect } from './canvas.mjs';
import { alpha, mix, outline, ramp } from './tone.mjs';

// --------------------------------------------------------------------------- materials

const OAK = ramp('#d7b98d');
const WALNUT = ramp('#9a6b47');
const WHITE = ramp('#eceef1');
const QUARTZ = ramp('#f4f3ef');
const GRAPH = ramp('#3b4256');
const METAL = ramp('#b9c0cc');
const FELT = ramp('#8a9ab8');
const FABRIC = ramp('#4d7d8a');
const LINEN = ramp('#e6dcc8');
const MUSTARD = ramp('#e0b24e');
const CORAL = ramp('#df8a68');
const LEAF = ramp('#3f9159');
const LEAF_DARK = ramp('#2e7148');
const LEAF_LIGHT = ramp('#5aa865');
const POT_WHITE = ramp('#efece6');
const POT_TERRA = ramp('#c9794f');
const POT_COAL = ramp('#4b5266');
const SOIL = '#4e3a2b';
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

/** Tiny deterministic hash for texture and variety. */
const noise = (i, j, seed) => ((i * 73856093) ^ (j * 19349663) ^ (seed * 83492791)) >>> 0;

// --------------------------------------------------------------------------- helpers

const hline = (c, x, y, w, color) => rect(c, x, y, w, 1, color);
const vline = (c, x, y, h, color) => rect(c, x, y, 1, h, color);

/** Soft elliptical contact shadow, painted only on empty pixels (after the outline). */
function shadow(c, cx, cy, rx, ry, strength = 0.32) {
  for (let j = -Math.ceil(ry); j <= Math.ceil(ry); j++) {
    for (let i = -Math.ceil(rx); i <= Math.ceil(rx); i++) {
      const d = (i / rx) ** 2 + (j / ry) ** 2;
      if (d > 1) continue;
      const x = Math.round(cx + i);
      const y = Math.round(cy + j);
      if (x < 0 || y < 0 || x >= c.w || y >= c.h) continue;
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

/** Cylindrical pot `w` wide, `h` tall, lit from the left, with soil showing in the rim. */
function pot(c, x, y, w, h, R) {
  rounded(c, x, y, w, 2, R.light);
  hline(c, x + 1, y, w - 2, R.hi);
  rect(c, x + 1, y + 1, w - 2, 1, SOIL);
  rect(c, x, y + 2, w, h - 2, R.base);
  vline(c, x + 1, y + 2, h - 3, R.light);
  rect(c, x + w - 3, y + 2, 2, h - 2, R.mid);
  vline(c, x + w - 1, y + 2, h - 2, R.shade);
  hline(c, x, y + 2, w, R.mid);
  hline(c, x + 1, y + h - 1, w - 2, R.shade);
}

/** Glass rectangles of the monitors drawn by the prop being painted (absolute atlas pixels). */
let screens = [];

/**
 * Monitor facing the viewer: slim bezel, glass and chin. With `kind` = 'off' the glass is dark
 * and recorded in `screens`: the game animates what it shows (see src/world/screenArt.ts). Other
 * kinds bake static content (wall TVs, laptops).
 */
function monitor(c, x, y, w, h, kind, seed) {
  rounded(c, x, y, w, h, GRAPH.deep);
  hline(c, x + 1, y, w - 2, GRAPH.base);
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
  rect(c, x + 1, y + h - 2, w - 2, 1, GRAPH.base);
  px(c, x + Math.floor(w / 2), y + h - 2, kind === 'off' ? '#6fd38a' : GRAPH.light);
}

function stand(c, cx, y, neck) {
  rect(c, cx - 1, y, 2, neck, METAL.shade);
  vline(c, cx - 1, y, neck, METAL.base);
  rect(c, cx - 3, y + neck, 6, 1, METAL.base);
  hline(c, cx - 3, y + neck, 2, METAL.light);
}

/** Oak desk top from `y` (back edge) to `y + depth`, then the front edge. */
function deskTop(c, x, y, w, depth, R = OAK) {
  hline(c, x, y, w, R.mid);
  hline(c, x, y + 1, w, R.light);
  rect(c, x, y + 2, w, depth - 3, R.base);
  for (let k = 0; k < 6; k++) {
    const n = noise(k, w, 3);
    hline(c, x + 2 + (n % (w - 10)), y + 3 + (k % (depth - 4)), 4 + (n % 5), R.mid);
  }
  hline(c, x, y + depth - 1, w, R.light);
  hline(c, x, y + depth, w, R.shade);
  hline(c, x, y + depth + 1, w, R.deep);
}

function keyboard(c, x, y, w) {
  hline(c, x, y, w, WHITE.hi);
  hline(c, x, y + 1, w, WHITE.base);
  for (let k = 1; k < w - 1; k += 2) px(c, x + k, y + 1, WHITE.mid);
  hline(c, x, y + 2, w, WHITE.shade);
}

function mug(c, x, y, R = WHITE) {
  rect(c, x, y, 3, 3, R.base);
  hline(c, x, y, 3, '#5a3a24');
  vline(c, x + 2, y + 1, 2, R.shade);
  px(c, x + 3, y + 1, R.shade);
}

function succulent(c, x, y) {
  pot(c, x, y + 3, 5, 3, POT_TERRA);
  leaf(c, x + 1, y + 2, 1.6, 1, -0.6, LEAF, { rib: false });
  leaf(c, x + 3.5, y + 1.5, 1.8, 1, 0.5, LEAF_LIGHT, { rib: false });
  px(c, x + 2, y + 1, LEAF_LIGHT.hi);
}

// --------------------------------------------------------------------------- props

/** Small mouse on a dark pad. */
function mousePad(c, x, y) {
  rounded(c, x, y, 6, 4, GRAPH.base);
  hline(c, x + 1, y, 4, GRAPH.light);
  rounded(c, x + 3, y + 1, 2, 2, WHITE.hi);
  px(c, x + 4, y + 2, WHITE.shade);
}

/** Acoustic felt divider along the back edge of a desk, with a lit aluminium rail on top. */
function divider(c, x, y, w, h, R = FELT) {
  rect(c, x, y, w, h, R.base);
  hline(c, x, y, w, METAL.hi);
  hline(c, x, y + 1, w, METAL.base);
  hline(c, x, y + 2, w, R.light);
  for (let j = 3; j < h - 1; j++) {
    for (let i = 1; i < w - 1; i++) if (noise(i, j, 17 + w) % 9 === 0) px(c, x + i, y + j, R.mid);
  }
  vline(c, x, y + 2, h - 2, R.light);
  vline(c, x + w - 1, y + 2, h - 2, R.shade);
  hline(c, x, y + h - 1, w, R.shade);
}

/** Sticky note pinned on a divider. */
function note(c, x, y, color) {
  const R = ramp(color);
  rect(c, x, y, 4, 4, R.base);
  hline(c, x, y, 4, R.light);
  px(c, x + 3, y + 3, R.shade);
  hline(c, x + 1, y + 2, 2, R.deep);
}

/**
 * Open-plan workstation, 2 tiles: acoustic divider, a widescreen monitor over the seat (left
 * cell; its glass is animated by the game), keyboard and mouse, and a second station on the right
 * that changes per variant (portrait monitor, laptop on a stand, lamp and books).
 */
function workstation(variant) {
  const dividers = [FELT, ramp('#7f9a8e'), ramp('#9a8fb3')];
  return (c, x, y) => {
    divider(c, x, y + 8, 32, 13, dividers[variant]);
    note(c, x + 21 + variant * 2, y + 11, ['#f2c94c', '#8fd0a8', '#f2a3b8'][variant]);
    if (variant !== 1) note(c, x + 27, y + 13, '#a7c4f2');
    // Desk on a white steel frame.
    deskTop(c, x, y + 21, 32, 10);
    rect(c, x + 1, y + 33, 2, 3, WHITE.base);
    rect(c, x + 29, y + 33, 2, 3, WHITE.base);
    vline(c, x + 2, y + 33, 3, WHITE.shade);
    vline(c, x + 30, y + 33, 3, WHITE.shade);
    rect(c, x + 3, y + 33, 26, 1, alpha(AO, 0.3));
    // Main widescreen monitor, centred over the seat.
    monitor(c, x, y + 4, 18, 14, 'off', variant);
    stand(c, x + 9, y + 18, 3);
    keyboard(c, x + 3, y + 26, 11);
    mousePad(c, x + 15, y + 25);
    if (variant === 0) {
      // Portrait monitor and a coffee mug.
      monitor(c, x + 21, y + 6, 9, 12, 'code', 11);
      stand(c, x + 25, y + 18, 3);
      mug(c, x + 25, y + 25);
      succulent(c, x + 26, y + 15);
    } else if (variant === 1) {
      // Laptop on a riser with a chart, a phone and a notebook.
      rect(c, x + 20, y + 13, 11, 8, GRAPH.base);
      rect(c, x + 21, y + 14, 9, 6, SCREEN.bg);
      for (let k = 0; k < 4; k++) rect(c, x + 22 + k * 2, y + 19 - k, 1, k + 1, SCREEN.cyan);
      hline(c, x + 21, y + 14, 9, SCREEN.bar);
      rect(c, x + 19, y + 21, 13, 2, METAL.light);
      hline(c, x + 19, y + 22, 13, METAL.shade);
      rect(c, x + 22, y + 25, 6, 4, '#2f3a52');
      hline(c, x + 22, y + 25, 6, '#4a5a7a');
      vline(c, x + 27, y + 25, 4, '#e2b95b');
      rect(c, x + 29, y + 26, 2, 3, GRAPH.deep);
      px(c, x + 29, y + 26, SCREEN.glare);
    } else {
      // Desk lamp, a stack of books and a mug.
      rect(c, x + 27, y + 22, 3, 1, GRAPH.base);
      stem(c, x + 28, y + 21, x + 26, y + 14, GRAPH.base);
      stem(c, x + 26, y + 14, x + 22, y + 15, GRAPH.base);
      rect(c, x + 20, y + 15, 4, 2, MUSTARD.base);
      hline(c, x + 20, y + 15, 4, MUSTARD.light);
      hline(c, x + 20, y + 17, 4, '#fff2c6');
      rect(c, x + 21, y + 25, 6, 1, BOOKS[1]);
      rect(c, x + 22, y + 26, 5, 1, BOOKS[0]);
      rect(c, x + 21, y + 27, 6, 1, BOOKS[3]);
      mug(c, x + 28, y + 25, ramp('#6d8fd0'));
    }
  };
}

/**
 * The Tech Lead's command desk, 3 tiles: walnut top on a credenza, three monitors (the middle one
 * over the seat; the side ones show the team dashboard), a brass name plate on the front edge.
 */
function leadDesk(c, x, y) {
  // Credenza behind the desk with books, a trophy and a plant.
  rect(c, x + 1, y + 12, 46, 9, WALNUT.base);
  hline(c, x + 1, y + 12, 46, WALNUT.hi);
  hline(c, x + 1, y + 13, 46, WALNUT.light);
  for (const k of [11, 23, 35]) vline(c, x + 1 + k, y + 14, 7, WALNUT.shade);
  hline(c, x + 1, y + 20, 46, WALNUT.deep);
  rect(c, x + 3, y + 7, 2, 5, BOOKS[0]);
  rect(c, x + 5, y + 8, 2, 4, BOOKS[3]);
  rect(c, x + 7, y + 6, 2, 6, BOOKS[1]);
  // Trophy.
  rect(c, x + 39, y + 6, 4, 3, MUSTARD.light);
  hline(c, x + 39, y + 6, 4, MUSTARD.hi);
  vline(c, x + 41, y + 9, 2, MUSTARD.shade);
  rect(c, x + 39, y + 11, 4, 1, MUSTARD.deep);
  leaf(c, x + 45, y + 6, 2.6, 1.8, -0.5, LEAF);
  pot(c, x + 43, y + 8, 4, 4, POT_COAL);
  // Desk: wide walnut top on waterfall sides.
  deskTop(c, x, y + 21, 48, 10, WALNUT);
  rect(c, x, y + 33, 3, 3, WALNUT.shade);
  rect(c, x + 45, y + 33, 3, 3, WALNUT.deep);
  vline(c, x, y + 33, 3, WALNUT.mid);
  rect(c, x + 3, y + 33, 42, 1, alpha(AO, 0.35));
  // Brass name plate on the front edge.
  rect(c, x + 20, y + 30, 8, 2, MUSTARD.base);
  hline(c, x + 20, y + 30, 8, MUSTARD.hi);
  hline(c, x + 22, y + 31, 4, MUSTARD.deep);
  // Three monitors: the middle one over the seat first (the main screen), then the side ones.
  monitor(c, x + 15, y + 3, 18, 14, 'off', 7);
  monitor(c, x + 2, y + 6, 13, 12, 'off', 8);
  monitor(c, x + 33, y + 6, 13, 12, 'off', 9);
  stand(c, x + 24, y + 17, 4);
  stand(c, x + 8, y + 18, 3);
  stand(c, x + 39, y + 18, 3);
  keyboard(c, x + 18, y + 26, 12);
  mousePad(c, x + 31, y + 25);
  // Lamp-free desk: a mug on the left, papers on the right.
  mug(c, x + 6, y + 25, CORAL);
  rect(c, x + 39, y + 24, 6, 5, '#f6f3ea');
  hline(c, x + 40, y + 25, 4, '#b9c0cc');
  hline(c, x + 40, y + 27, 3, '#b9c0cc');
}

/** Ergonomic office chair seen from behind (the seated character faces the desk, up). */
function chair(c, x, y) {
  const back = ramp('#3f4d6e');
  // Armrests and the seat cushion, wider than the backrest.
  rounded(c, x + 1, y + 7, 14, 4, GRAPH.light);
  hline(c, x + 2, y + 7, 12, GRAPH.hi);
  hline(c, x + 1, y + 10, 14, GRAPH.base);
  rect(c, x, y + 5, 2, 4, GRAPH.base);
  rect(c, x + 14, y + 5, 2, 4, GRAPH.shade);
  hline(c, x, y + 5, 2, GRAPH.light);
  hline(c, x + 14, y + 5, 2, GRAPH.base);
  // Mesh backrest with a lit frame and the lumbar band.
  rounded(c, x + 3, y, 10, 9, back.base);
  hline(c, x + 4, y, 8, back.hi);
  hline(c, x + 3, y + 1, 10, back.light);
  for (let j = 3; j < 8; j++) {
    for (let i = 5; i < 11; i++) if ((i + j) % 2 === 0) px(c, x + i, y + j, back.mid);
  }
  hline(c, x + 4, y + 5, 8, back.shade);
  vline(c, x + 3, y + 1, 7, back.light);
  vline(c, x + 12, y + 1, 7, back.shade);
  hline(c, x + 4, y + 8, 8, back.deep);
  // Gas lift and the star base with casters.
  rect(c, x + 7, y + 11, 2, 1, METAL.shade);
  hline(c, x + 3, y + 12, 10, GRAPH.base);
  hline(c, x + 4, y + 12, 3, GRAPH.light);
  for (const k of [3, 12]) px(c, x + k, y + 13, GRAPH.deep);
  px(c, x + 8, y + 13, GRAPH.deep);
}

/** The Tech Lead's high-back leather chair (seen from behind), with a headrest. */
function chairExec(c, x, y) {
  const L = ramp('#5b3a2e');
  rounded(c, x + 1, y + 9, 14, 4, L.light);
  hline(c, x + 2, y + 9, 12, L.hi);
  hline(c, x + 1, y + 12, 14, L.shade);
  rect(c, x, y + 7, 2, 4, GRAPH.base);
  rect(c, x + 14, y + 7, 2, 4, GRAPH.shade);
  // Tall tufted backrest and headrest.
  rounded(c, x + 2, y, 12, 11, L.base);
  hline(c, x + 3, y, 10, L.hi);
  hline(c, x + 2, y + 1, 12, L.light);
  hline(c, x + 3, y + 3, 10, L.mid);
  for (const [i, j] of [
    [5, 5],
    [8, 5],
    [11, 5],
    [6, 8],
    [10, 8],
  ]) {
    px(c, x + i, y + j, L.deep);
  }
  vline(c, x + 2, y + 1, 9, L.light);
  vline(c, x + 13, y + 1, 9, L.shade);
  hline(c, x + 3, y + 10, 10, L.deep);
  rect(c, x + 7, y + 13, 2, 1, METAL.shade);
  hline(c, x + 3, y + 14, 10, GRAPH.base);
  hline(c, x + 4, y + 14, 3, METAL.base);
  for (const k of [3, 12]) px(c, x + k, y + 15, GRAPH.deep);
  px(c, x + 8, y + 15, GRAPH.deep);
}

/** Free-standing kanban board on legs: three columns of sticky notes. */
function kanban(c, x, y) {
  rect(c, x + 1, y + 2, 30, 18, METAL.base);
  hline(c, x + 1, y + 2, 30, METAL.hi);
  rect(c, x + 2, y + 3, 28, 16, '#fbfcfe');
  for (const k of [11, 20]) vline(c, x + 2 + k, y + 4, 14, '#d5dbe6');
  hline(c, x + 3, y + 4, 7, '#5aa2ff');
  hline(c, x + 14, y + 4, 5, MUSTARD.base);
  hline(c, x + 23, y + 4, 6, '#6fd38a');
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
      const ny = y + 6 + r * 4;
      rect(c, nx, ny, 5, 3, R.base);
      hline(c, nx, ny, 5, R.light);
      hline(c, nx + 1, ny + 1, 3, R.deep);
    }
  }
  hline(c, x + 2, y + 19, 28, METAL.shade);
  // Tray and legs on casters.
  rect(c, x + 6, y + 20, 20, 1, METAL.light);
  vline(c, x + 3, y + 20, 10, METAL.shade);
  vline(c, x + 28, y + 20, 10, METAL.deep);
  hline(c, x + 1, y + 30, 5, GRAPH.base);
  hline(c, x + 26, y + 30, 5, GRAPH.base);
}

function bookshelf(c, x, y) {
  // Oak carcass: top, sides, three shelves and the plinth, white back.
  rect(c, x, y + 2, 32, 36, OAK.base);
  hline(c, x, y + 2, 32, OAK.hi);
  hline(c, x, y + 3, 32, OAK.light);
  rect(c, x + 2, y + 4, 28, 32, WHITE.shade);
  vline(c, x, y + 4, 34, OAK.light);
  rect(c, x + 30, y + 4, 2, 34, OAK.shade);
  rect(c, x + 15, y + 4, 2, 32, OAK.mid);
  for (const sy of [12, 21, 30]) {
    hline(c, x + 2, sy + y, 28, OAK.light);
    hline(c, x + 2, sy + y + 1, 28, OAK.mid);
  }
  rect(c, x, y + 36, 32, 2, OAK.deep);
  // Contact shade under every shelf.
  for (const sy of [4, 14, 23, 32]) hline(c, x + 2, y + sy, 28, WHITE.deep);
  // Compartment contents: [x, y, kind] in local coordinates.
  const books = (bx, by, count, seed, h = 7) => {
    let i = bx;
    for (let k = 0; k < count; k++) {
      const n = noise(k, seed, 21);
      const bh = h - (n % 3);
      const color = BOOKS[n % BOOKS.length];
      rect(c, x + i, y + by + h - bh, 2, bh, color);
      vline(c, x + i + 1, y + by + h - bh, bh, mix(color, '#1b1d2a', 0.3));
      i += 2;
    }
    return i;
  };
  books(3, 5, 5, 1);
  // A small plant and a framed photo.
  pot(c, x + 20, y + 8, 5, 4, POT_WHITE);
  leaf(c, x + 21, y + 6, 2.4, 1.4, -0.6, LEAF);
  leaf(c, x + 24, y + 6, 2.4, 1.4, 0.6, LEAF_LIGHT);
  rect(c, x + 26, y + 6, 3, 6, GRAPH.base);
  rect(c, x + 27, y + 7, 1, 4, '#9fd0f0');
  // Middle row: leaning books and boxes.
  const end = books(3, 14, 4, 2);
  rect(c, x + end + 1, y + 16, 4, 5, LINEN.base);
  hline(c, x + end + 1, y + 16, 4, LINEN.light);
  books(18, 14, 6, 3);
  // Bottom row: storage boxes and a vase.
  rect(c, x + 3, y + 25, 5, 5, LINEN.base);
  hline(c, x + 3, y + 25, 5, LINEN.light);
  rect(c, x + 9, y + 25, 5, 5, LINEN.mid);
  hline(c, x + 9, y + 25, 5, LINEN.base);
  rect(c, x + 20, y + 25, 3, 5, CORAL.base);
  vline(c, x + 22, y + 25, 5, CORAL.shade);
  books(24, 23, 3, 4);
  rect(c, x + 3, y + 33, 26, 3, WHITE.mid);
  hline(c, x + 14, y + 34, 4, OAK.mid);
}

function plantTall(c, x, y) {
  // Monstera in a white ceramic pot.
  stem(c, x + 9, y + 22, x + 5, y + 10, LEAF_DARK.shade);
  stem(c, x + 10, y + 22, x + 14, y + 8, LEAF_DARK.shade);
  stem(c, x + 9, y + 22, x + 9, y + 5, LEAF_DARK.shade);
  leaf(c, x + 5, y + 14, 5, 3.2, 0.5, LEAF_DARK, { split: true });
  leaf(c, x + 15, y + 12, 5, 3.2, -0.4, LEAF_DARK, { split: true });
  leaf(c, x + 9, y + 6, 5.5, 3.5, -0.1, LEAF, { split: true });
  leaf(c, x + 4, y + 8, 4.5, 3, 0.9, LEAF, { split: true });
  leaf(c, x + 15, y + 18, 4.5, 2.8, 0.35, LEAF);
  leaf(c, x + 6, y + 20, 4, 2.5, -0.3, LEAF_LIGHT);
  pot(c, x + 5, y + 22, 10, 10, POT_WHITE);
}

function plantFig(c, x, y) {
  // Fiddle-leaf fig: slim trunk, big glossy leaves, charcoal planter.
  vline(c, x + 8, y + 12, 17, WALNUT.base);
  vline(c, x + 7, y + 18, 10, WALNUT.light);
  const leaves = [
    [8, 4, -1.3, LEAF],
    [4, 7, -0.6, LEAF_DARK],
    [12, 8, 0.6, LEAF],
    [5, 12, -0.4, LEAF_LIGHT],
    [11, 14, 0.5, LEAF_DARK],
    [6, 18, -0.5, LEAF],
    [11, 20, 0.6, LEAF_LIGHT],
    [8, 9, 1.4, LEAF_LIGHT],
  ];
  for (const [lx, ly, angle, R] of leaves) leaf(c, x + lx, y + ly, 3.6, 2.4, angle, R);
  pot(c, x + 3, y + 27, 10, 9, POT_COAL);
}

function plantSmall(c, x, y) {
  // Snake plant: upright blades with pale edges, terracotta pot.
  const blades = [
    [5, 4, 10],
    [7, 1, 13],
    [9, 3, 11],
    [11, 6, 8],
    [6, 7, 7],
  ];
  for (const [bx, top, h] of blades) {
    rect(c, x + bx, y + top + 1, 2, h, LEAF.base);
    vline(c, x + bx, y + top + 1, h, LEAF.light);
    px(c, x + bx, y + top, LEAF.light);
    vline(c, x + bx + 1, y + top + 3, h - 3, LEAF_DARK.shade);
    for (let k = 2; k < h; k += 3) px(c, x + bx, y + top + k, LEAF_LIGHT.hi);
  }
  pot(c, x + 4, y + 13, 9, 8, POT_TERRA);
}

/** Two-seat sofa facing the viewer, with throw pillows. */
function sofa(c, x, y) {
  const F = FABRIC;
  rounded(c, x + 3, y + 3, 28, 9, F.base);
  hline(c, x + 4, y + 3, 26, F.light);
  vline(c, x + 16, y + 5, 6, F.mid);
  hline(c, x + 3, y + 11, 28, F.shade);
  // Pillows.
  rounded(c, x + 6, y + 6, 6, 5, MUSTARD.base);
  hline(c, x + 7, y + 6, 4, MUSTARD.light);
  vline(c, x + 11, y + 7, 3, MUSTARD.shade);
  rounded(c, x + 22, y + 6, 6, 5, LINEN.base);
  hline(c, x + 23, y + 6, 4, LINEN.hi);
  vline(c, x + 27, y + 7, 3, LINEN.shade);
  // Seat cushions.
  for (const sx of [5, 17]) {
    rect(c, x + sx, y + 12, 12, 3, F.light);
    rect(c, x + sx, y + 15, 12, 3, F.base);
    hline(c, x + sx, y + 12, 12, F.hi);
    vline(c, x + sx + 11, y + 12, 6, F.mid);
  }
  // Arms (lit left, shaded right).
  rounded(c, x + 1, y + 6, 4, 15, F.base);
  hline(c, x + 2, y + 6, 2, F.hi);
  rect(c, x + 1, y + 7, 4, 2, F.light);
  rounded(c, x + 29, y + 6, 4, 15, F.mid);
  rect(c, x + 29, y + 7, 4, 2, F.base);
  vline(c, x + 32, y + 8, 12, F.shade);
  // Base and oak legs.
  rect(c, x + 5, y + 18, 24, 3, F.shade);
  hline(c, x + 1, y + 20, 32, F.deep);
  rect(c, x + 3, y + 21, 2, 2, OAK.mid);
  rect(c, x + 29, y + 21, 2, 2, OAK.shade);
}

function armchair(c, x, y) {
  const F = ramp('#c98f6a');
  rounded(c, x + 3, y + 2, 12, 9, F.base);
  hline(c, x + 4, y + 2, 10, F.light);
  hline(c, x + 3, y + 10, 12, F.shade);
  rect(c, x + 4, y + 11, 10, 3, F.light);
  rect(c, x + 4, y + 14, 10, 3, F.base);
  hline(c, x + 4, y + 11, 10, F.hi);
  rounded(c, x + 1, y + 5, 3, 14, F.base);
  rect(c, x + 1, y + 6, 3, 2, F.light);
  rounded(c, x + 14, y + 5, 3, 14, F.mid);
  vline(c, x + 16, y + 7, 11, F.shade);
  hline(c, x + 1, y + 18, 16, F.deep);
  rect(c, x + 3, y + 19, 1, 2, WALNUT.base);
  rect(c, x + 14, y + 19, 1, 2, WALNUT.shade);
}

function coffeeTable(c, x, y) {
  rounded(c, x + 1, y + 4, 30, 6, OAK.base);
  hline(c, x + 2, y + 4, 28, OAK.hi);
  hline(c, x + 1, y + 5, 30, OAK.light);
  hline(c, x + 1, y + 10, 30, OAK.shade);
  hline(c, x + 2, y + 11, 28, OAK.deep);
  for (const lx of [3, 27]) rect(c, x + lx, y + 12, 2, 2, GRAPH.base);
  // Books, a cup and a little plant.
  rect(c, x + 5, y + 5, 7, 2, BOOKS[0]);
  rect(c, x + 6, y + 4, 6, 1, BOOKS[3]);
  mug(c, x + 15, y + 5);
  succulent(c, x + 22, y + 0);
}

function sideTable(c, x, y) {
  rounded(c, x + 2, y + 7, 12, 4, WHITE.base);
  hline(c, x + 3, y + 7, 10, WHITE.hi);
  hline(c, x + 2, y + 10, 12, WHITE.shade);
  vline(c, x + 7, y + 11, 4, GRAPH.base);
  hline(c, x + 5, y + 15, 6, GRAPH.base);
  // Bud vase with a sprig.
  rect(c, x + 7, y + 4, 2, 4, CORAL.base);
  vline(c, x + 8, y + 4, 4, CORAL.shade);
  leaf(c, x + 6, y + 2, 2, 1.2, -0.7, LEAF, { rib: false });
  leaf(c, x + 10, y + 2, 2, 1.2, 0.7, LEAF_LIGHT, { rib: false });
}

function floorLamp(c, x, y) {
  // Linen drum shade, black pole, oak tripod.
  rounded(c, x + 3, y + 2, 10, 8, LINEN.light);
  hline(c, x + 4, y + 2, 8, LINEN.hi);
  vline(c, x + 11, y + 3, 6, LINEN.base);
  vline(c, x + 12, y + 3, 6, LINEN.mid);
  hline(c, x + 3, y + 9, 10, '#fff6dc');
  vline(c, x + 8, y + 10, 18, GRAPH.base);
  vline(c, x + 7, y + 10, 18, GRAPH.light);
  stem(c, x + 7, y + 27, x + 3, y + 33, OAK.mid);
  stem(c, x + 8, y + 27, x + 12, y + 33, OAK.shade);
  vline(c, x + 8, y + 28, 5, OAK.base);
}

function serverRack(c, x, y) {
  rect(c, x + 1, y + 2, 14, 32, GRAPH.deep);
  hline(c, x + 1, y + 2, 14, GRAPH.light);
  hline(c, x + 1, y + 3, 14, GRAPH.base);
  rect(c, x + 2, y + 5, 12, 27, '#1b2231');
  for (let u = 0; u < 8; u++) {
    const uy = y + 6 + u * 3;
    rect(c, x + 3, uy, 10, 2, GRAPH.shade);
    hline(c, x + 3, uy, 10, GRAPH.mid);
    const n = noise(u, 3, 31);
    px(c, x + 4, uy + 1, ['#58d36b', '#58d36b', '#5aa2ff', '#f2c94c'][n % 4]);
    px(c, x + 6, uy + 1, n % 3 === 0 ? '#5aa2ff' : '#58d36b');
    for (let k = 8; k < 12; k += 2) px(c, x + k, uy + 1, GRAPH.deep);
  }
  // Glass reflection and the handle.
  stem(c, x + 3, y + 30, x + 12, y + 8, alpha('#ffffff', 0.08));
  rect(c, x + 13, y + 15, 1, 5, METAL.base);
  rect(c, x + 2, y + 33, 3, 1, GRAPH.deep);
  rect(c, x + 11, y + 33, 3, 1, GRAPH.deep);
}

function printer(c, x, y) {
  // Cabinet.
  rect(c, x + 1, y + 13, 16, 9, WHITE.base);
  hline(c, x + 1, y + 13, 16, WHITE.light);
  vline(c, x + 16, y + 14, 8, WHITE.shade);
  hline(c, x + 1, y + 17, 16, WHITE.mid);
  hline(c, x + 7, y + 15, 4, GRAPH.light);
  hline(c, x + 7, y + 19, 4, GRAPH.light);
  // Printer body with the scanner lid, panel and output paper.
  rect(c, x + 2, y + 4, 14, 9, METAL.base);
  rect(c, x + 2, y + 3, 14, 2, METAL.light);
  hline(c, x + 2, y + 3, 14, METAL.hi);
  rect(c, x + 3, y + 7, 9, 2, GRAPH.base);
  rect(c, x + 13, y + 6, 2, 2, SCREEN.cyan);
  px(c, x + 13, y + 9, '#58d36b');
  rect(c, x + 4, y + 9, 8, 2, '#ffffff');
  hline(c, x + 5, y + 10, 5, WHITE.mid);
  vline(c, x + 15, y + 4, 9, METAL.shade);
  hline(c, x + 2, y + 12, 14, METAL.shade);
}

/** Kitchen island: quartz top, oak slatted front, espresso machine (left cell), fruit and sink. */
function kitchen(c, x, y) {
  // Top and front.
  rect(c, x, y + 11, 48, 9, QUARTZ.base);
  hline(c, x, y + 11, 48, QUARTZ.hi);
  hline(c, x, y + 12, 48, QUARTZ.light);
  hline(c, x, y + 19, 48, QUARTZ.shade);
  rect(c, x, y + 20, 48, 9, OAK.base);
  for (let k = 1; k < 48; k += 3) vline(c, x + k, y + 20, 9, OAK.mid);
  hline(c, x, y + 20, 48, OAK.shade);
  rect(c, x + 2, y + 29, 44, 1, GRAPH.deep);
  // Espresso machine.
  rect(c, x + 3, y + 1, 11, 12, METAL.base);
  hline(c, x + 3, y + 1, 11, METAL.hi);
  vline(c, x + 3, y + 2, 11, METAL.light);
  vline(c, x + 13, y + 2, 11, METAL.shade);
  rect(c, x + 5, y + 4, 7, 3, GRAPH.deep);
  px(c, x + 6, y + 5, SCREEN.cyan);
  px(c, x + 10, y + 5, SCREEN.coral);
  rect(c, x + 7, y + 7, 3, 2, GRAPH.base);
  rect(c, x + 7, y + 10, 3, 2, WHITE.light);
  hline(c, x + 7, y + 10, 3, '#5a3a24');
  // Fruit bowl.
  rounded(c, x + 19, y + 13, 9, 3, WHITE.light);
  hline(c, x + 19, y + 15, 9, WHITE.shade);
  rounded(c, x + 20, y + 11, 3, 3, CORAL.base);
  rounded(c, x + 23, y + 10, 3, 3, MUSTARD.base);
  rounded(c, x + 25, y + 11, 3, 3, ramp('#7cbf5a').base);
  px(c, x + 24, y + 10, MUSTARD.hi);
  // Sink and a tall faucet.
  rect(c, x + 33, y + 14, 10, 4, METAL.shade);
  rect(c, x + 34, y + 15, 8, 2, METAL.mid);
  hline(c, x + 33, y + 14, 10, METAL.light);
  vline(c, x + 38, y + 7, 7, METAL.base);
  rect(c, x + 36, y + 7, 3, 1, METAL.light);
  px(c, x + 36, y + 8, METAL.base);
}

function fridge(c, x, y) {
  rect(c, x + 1, y + 2, 14, 32, METAL.base);
  hline(c, x + 1, y + 2, 14, METAL.hi);
  hline(c, x + 1, y + 3, 14, METAL.light);
  vline(c, x + 1, y + 4, 30, METAL.light);
  vline(c, x + 3, y + 4, 30, METAL.light);
  rect(c, x + 13, y + 4, 2, 30, METAL.shade);
  hline(c, x + 1, y + 13, 14, METAL.deep);
  rect(c, x + 11, y + 6, 1, 5, GRAPH.base);
  rect(c, x + 11, y + 15, 1, 8, GRAPH.base);
  px(c, x + 6, y + 17, SCREEN.coral);
  px(c, x + 8, y + 19, SCREEN.yellow);
  rect(c, x + 5, y + 21, 3, 4, '#ffffff');
  hline(c, x + 1, y + 33, 14, METAL.deep);
}

function cooler(c, x, y) {
  // Water bottle.
  rounded(c, x + 4, y + 2, 8, 9, '#9fd6f2');
  vline(c, x + 5, y + 3, 7, '#d6f0ff');
  vline(c, x + 10, y + 3, 7, '#6fb6e0');
  hline(c, x + 4, y + 6, 8, '#7cc2ea');
  rect(c, x + 6, y + 11, 4, 1, '#6fb6e0');
  // Body, taps, drip tray.
  rect(c, x + 3, y + 12, 10, 16, WHITE.base);
  hline(c, x + 3, y + 12, 10, WHITE.hi);
  vline(c, x + 12, y + 13, 15, WHITE.shade);
  rect(c, x + 5, y + 15, 6, 4, GRAPH.base);
  px(c, x + 6, y + 16, '#e0584f');
  px(c, x + 9, y + 16, '#4b93d8');
  hline(c, x + 5, y + 19, 6, METAL.shade);
  hline(c, x + 3, y + 27, 10, WHITE.deep);
}

function phoneTable(c, x, y) {
  rounded(c, x + 1, y + 8, 14, 4, OAK.base);
  hline(c, x + 2, y + 8, 12, OAK.hi);
  hline(c, x + 1, y + 11, 14, OAK.shade);
  rect(c, x + 2, y + 12, 1, 5, GRAPH.base);
  rect(c, x + 13, y + 12, 1, 5, GRAPH.shade);
  // Desk phone.
  rounded(c, x + 3, y + 5, 7, 4, GRAPH.base);
  hline(c, x + 4, y + 5, 5, GRAPH.light);
  rect(c, x + 3, y + 4, 2, 2, GRAPH.light);
  px(c, x + 7, y + 7, SCREEN.cyan);
  succulent(c, x + 10, y + 2);
}

/** Reception desk: quartz ledge, oak slats, graphite logo panel, iMac and a plant. */
function reception(c, x, y) {
  // Monitor back and a small plant on the ledge.
  rounded(c, x + 44, y + 0, 12, 8, WHITE.light);
  vline(c, x + 55, y + 1, 6, WHITE.shade);
  rect(c, x + 49, y + 8, 2, 2, METAL.base);
  pot(c, x + 6, y + 6, 5, 4, POT_WHITE);
  leaf(c, x + 7, y + 3, 2.6, 1.5, -0.6, LEAF);
  leaf(c, x + 10, y + 3, 2.6, 1.5, 0.6, LEAF_LIGHT);
  // Ledge.
  rect(c, x, y + 9, 64, 5, QUARTZ.base);
  hline(c, x, y + 9, 64, QUARTZ.hi);
  hline(c, x, y + 10, 64, QUARTZ.light);
  hline(c, x, y + 13, 64, QUARTZ.shade);
  // Slatted oak front.
  rect(c, x, y + 14, 64, 13, OAK.base);
  for (let k = 1; k < 64; k += 3) vline(c, x + k, y + 14, 13, OAK.mid);
  vline(c, x, y + 14, 13, OAK.light);
  hline(c, x, y + 14, 64, OAK.shade);
  // Logo panel.
  rect(c, x + 22, y + 16, 20, 9, GRAPH.base);
  hline(c, x + 22, y + 16, 20, GRAPH.light);
  rect(c, x + 26, y + 19, 2, 3, '#f2d27a');
  rect(c, x + 29, y + 18, 2, 4, '#f2d27a');
  rect(c, x + 32, y + 20, 2, 2, '#f2d27a');
  rect(c, x + 35, y + 19, 3, 3, '#f2d27a');
  hline(c, x + 25, y + 23, 14, alpha('#f2d27a', 0.5));
  rect(c, x + 1, y + 27, 62, 1, GRAPH.deep);
}

function planter(c, x, y) {
  // Long oak planter with ferns and grasses.
  const greens = [LEAF_DARK, LEAF, LEAF_LIGHT];
  for (let k = 0; k < 9; k++) {
    const n = noise(k, 7, 41);
    leaf(c, x + 3 + k * 3.3, y + 8 + (n % 4), 3 + (n % 2), 1.8, (n % 3) - 1, greens[n % 3]);
  }
  for (let k = 0; k < 6; k++)
    stem(c, x + 5 + k * 4, y + 13, x + 4 + k * 4 + (k % 3), y + 3 + (k % 2) * 2, LEAF_LIGHT.base);
  rect(c, x + 1, y + 13, 30, 2, SOIL);
  rect(c, x + 1, y + 14, 30, 7, OAK.base);
  hline(c, x + 1, y + 14, 30, OAK.hi);
  for (let k = 4; k < 30; k += 5) vline(c, x + 1 + k, y + 15, 6, OAK.mid);
  vline(c, x + 30, y + 15, 6, OAK.shade);
  hline(c, x + 1, y + 20, 30, OAK.deep);
}

// Wall-mounted props: drawn over the face of the top wall (rows 4..12 of the wall tile).

function whiteboard(c, x, y) {
  rect(c, x + 1, y + 3, 30, 10, METAL.base);
  hline(c, x + 1, y + 3, 30, METAL.hi);
  rect(c, x + 2, y + 4, 28, 8, '#fbfcfe');
  hline(c, x + 4, y + 5, 9, '#3f7fd0');
  hline(c, x + 4, y + 7, 6, '#3f7fd0');
  hline(c, x + 4, y + 9, 8, SCREEN.coral);
  rect(c, x + 16, y + 5, 3, 3, MUSTARD.light);
  rect(c, x + 20, y + 5, 3, 3, ramp('#8fd0a8').base);
  rect(c, x + 24, y + 5, 3, 3, ramp('#f2a3b8').base);
  rect(c, x + 18, y + 9, 3, 2, ramp('#a7c4f2').base);
  stem(c, x + 23, y + 10, x + 27, y + 9, '#3d9a4a');
  hline(c, x + 2, y + 13, 28, METAL.shade);
  rect(c, x + 6, y + 12, 3, 1, SCREEN.coral);
  rect(c, x + 10, y + 12, 3, 1, '#3f7fd0');
}

function tv(c, x, y) {
  rect(c, x + 2, y + 2, 28, 11, GRAPH.deep);
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
  hline(c, x + 14, y + 13, 4, GRAPH.shade);
}

function artWide(c, x, y) {
  // Two framed prints.
  rect(c, x + 2, y + 3, 13, 10, OAK.shade);
  rect(c, x + 3, y + 4, 11, 8, '#f6f1e7');
  rounded(c, x + 5, y + 6, 5, 5, CORAL.base);
  rect(c, x + 8, y + 5, 4, 4, ramp('#3f7d8f').base);
  rect(c, x + 17, y + 3, 13, 10, GRAPH.base);
  rect(c, x + 18, y + 4, 11, 8, '#eef2f6');
  for (let k = 0; k < 11; k++)
    px(c, x + 18 + k, y + 9 - Math.round(Math.sin(k / 1.8) * 2), '#4a6fa5');
  rect(c, x + 18, y + 10, 11, 2, ramp('#8fb6d3').base);
  hline(c, x + 2, y + 13, 13, alpha(AO, 0.2));
  hline(c, x + 17, y + 13, 13, alpha(AO, 0.2));
}

/**
 * The props: art size `w`x`h`, anchor (`ax`, `ay`) = the art pixel at the bottom-left corner of
 * the footprint, the contact shadow (`shadow`: centre x, centre y, radius x, radius y) and whether
 * it hangs on a wall (`wall`: no shadow).
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
  { id: 'chair', w: 16, h: 15, ax: 0, ay: 10, draw: chair, shadow: [8, 13.5, 6, 1.4] },
  {
    id: 'chair-exec',
    w: 16,
    h: 17,
    ax: 0,
    ay: 12,
    draw: chairExec,
    shadow: [8, 15.5, 6.5, 1.4],
  },
  { id: 'kanban', w: 32, h: 32, ax: 0, ay: 32, draw: kanban, shadow: [16, 30.5, 15, 1.5] },
  { id: 'bookshelf', w: 32, h: 40, ax: 0, ay: 40, draw: bookshelf, shadow: [16, 38.5, 16, 1.5] },
  { id: 'plant-tall', w: 20, h: 34, ax: 2, ay: 34, draw: plantTall, shadow: [10, 32, 7, 1.8] },
  { id: 'plant-fig', w: 16, h: 38, ax: 0, ay: 38, draw: plantFig, shadow: [8, 36, 7, 1.6] },
  { id: 'plant', w: 16, h: 22, ax: 0, ay: 22, draw: plantSmall, shadow: [8, 21, 6, 1.4] },
  { id: 'planter', w: 32, h: 24, ax: 0, ay: 24, draw: planter, shadow: [16, 22, 16, 1.6] },
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
  { id: 'floor-lamp', w: 16, h: 36, ax: 0, ay: 36, draw: floorLamp, shadow: [8, 34, 6, 1.4] },
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

const ATLAS_WIDTH = 256;
const PAD = 1;

/**
 * Packs every prop into one atlas (shelf packing) with a 1px margin for the outline. Returns the
 * canvas and the frame of each prop in the manifest format (`x, y, w, h, ax, ay`).
 */
export function makePropsAtlas() {
  const slots = [];
  let cx = 0;
  let cy = 0;
  let rowH = 0;
  for (const prop of PROPS) {
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
    outline(c, x, y, w, h);
    if (prop.shadow) {
      const [sx, sy, rx, ry] = prop.shadow;
      shadow(c, x + PAD + sx, y + PAD + sy, rx, ry);
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
