// Tileset of the default skin: a light, modern tech office in a 3/4 top-down view. Calm floors
// (honey-oak herringbone in the rooms, polished concrete, pale oak in the lobby), off-white walls with a
// light slab on top, pale wood desks, graphite tech and soft contact shadows under every piece.
import { art, createCanvas, px, rect } from './canvas.mjs';
import { mix, shade } from './tone.mjs';

export const TILE = 16;

/** Tiles every skin must provide, then the optional decor tiles (a skin may omit them). */
export const CORE_TILE_IDS = [
  'floor',
  'wall',
  'door',
  'desk',
  'chair',
  'computer',
  'server-rack',
  'phone',
  'window',
  'plant',
  'sign',
  'board',
];
export const EXTRA_TILE_IDS = [
  'floor-b',
  'hall',
  'tile',
  'wall-cap',
  'whiteboard',
  'poster',
  'clock',
  'plant-tall',
  'bookshelf',
  'sofa-l',
  'sofa-r',
  'coffee',
  'cooler',
  'printer',
  'table',
  'counter',
  'lamp',
  'wood',
  'wood-b',
  'wall-side-l',
  'wall-side-r',
  'wall-bottom',
  'wall-corner-tl',
  'wall-corner-tr',
  'wall-top',
  'wall-mid',
  'window-top',
];
export const TILE_IDS = [...CORE_TILE_IDS, ...EXTRA_TILE_IDS];
export const TILE_COLUMNS = 8;

const C = {
  // slate band of the reception counter
  cap: '#646f8a',
  // polished concrete
  c0: '#d6d3cd',
  c1: '#cfccc5',
  c2: '#dfdcd7',
  cSeam: '#c3bfb7',
  // pale oak
  o0: '#5c4834',
  o1: '#e2d2b6',
  o2: '#dccaab',
  o3: '#c7b08b',
  o4: '#a08a68',
  // graphite
  g0: '#1b1f2c',
  g1: '#292f40',
  g2: '#3a4154',
  g3: '#566079',
  g4: '#8790a8',
  // white laminate
  l0: '#f6f6f3',
  l1: '#e8e8e3',
  l2: '#d0d1cb',
  l3: '#aeb0aa',
  // greens
  p0: '#1d4430',
  p1: '#2c6842',
  p2: '#3f8d57',
  p3: '#69b879',
  // pots
  pot: '#f1efea',
  potS: '#d2cec5',
  potD: '#aaa59b',
  ao: '#0e1120',
};
/** Contact shadow under furniture (ambient occlusion), strong then soft. */
const AO1 = `${C.ao}55`;
const AO2 = `${C.ao}26`;

function ao(c, x, y, x0, x1, row = 14) {
  rect(c, x + x0, y + row, x1 - x0, 1, AO1);
  rect(c, x + x0 + 1, y + row + 1, x1 - x0 - 2, 1, AO2);
}

// --------------------------------------------------------------------------- floors

/** Tiny deterministic hash for speckles. */
export const noise = (i, j, seed) => ((i * 73856093) ^ (j * 19349663) ^ (seed * 83492791)) >>> 0;

/**
 * Pale oak boards, four per tile, long enough that a tile shows at most one butt joint: low
 * contrast between boards and a hairline gap, so the floor reads as wood and not as brickwork.
 */
function planks(c, x, y, variant) {
  // Same tone per board row in both variants, so boards run on across tiles.
  const tones = ['#e3d1b0', '#ddc9a6', '#e6d5b6', '#dfcca9'];
  for (let r = 0; r < 4; r++) {
    const y0 = y + r * 4;
    rect(c, x, y0, 16, 4, tones[r]);
    for (let i = 0; i < 16; i++) {
      const n = noise(i, r, variant ? 13 : 5) % 11;
      if (n === 0) rect(c, x + i, y0 + 1 + (i % 2), Math.min(3, 16 - i), 1, '#d4bf9b');
    }
    rect(c, x, y0 + 3, 16, 1, '#d2bd98');
  }
  // One butt joint per tile, on a different board in each variant.
  const [row, at] = variant ? [3, 4] : [1, 11];
  rect(c, x + at, y + row * 4, 1, 3, '#c7b08a');
  px(c, x + at + 1, y + row * 4, '#ecdcc0');
}

/**
 * Honey-oak herringbone parquet for the work rooms: 4x8 px boards laid in a staircase (cells of
 * 4 px; a cell is part of a horizontal board when (cx - cy) mod 4 < 2, else of a vertical one).
 * The pattern repeats every 16 px, so tiles join seamlessly; `seed` only moves the grain.
 */
function herringbone(c, x, y, seed) {
  const W = 4;
  const N = 2;
  const tones = ['#d6b78c', '#d2b285', '#d9bb91', '#cfae82'];
  const seam = '#c3a274';
  for (let j = 0; j < 16; j++) {
    for (let i = 0; i < 16; i++) {
      const cx = Math.floor(i / W);
      const cy = Math.floor(j / W);
      const m = (((cx - cy) % (2 * N)) + 2 * N) % (2 * N);
      const horizontal = m < N;
      // First cell of the board and the pixel's place along/across it.
      const start = horizontal ? [cx - m, cy] : [cx, cy - (2 * N - 1 - m)];
      const along = horizontal ? i - start[0] * W : j - start[1] * W;
      const across = horizontal ? j % W : i % W;
      const tone = tones[(((start[0] * 5 + start[1] * 3) % 4) + 4) % 4];
      let color = tone;
      if (across === W - 1 || along === W * N - 1) color = seam;
      else if (noise(i, j, 29 + seed) % 19 === 0) color = tones[(tones.indexOf(tone) + 2) % 4];
      px(c, x + i, y + j, color);
    }
  }
}

const drawFloor = {
  floor: (c, x, y) => herringbone(c, x, y, 0),
  'floor-b': (c, x, y) => herringbone(c, x, y, 1),
  wood: (c, x, y) => planks(c, x, y, 0),
  'wood-b': (c, x, y) => planks(c, x, y, 1),
  hall(c, x, y) {
    rect(c, x, y, 16, 16, C.c0);
    for (let j = 0; j < 16; j++) {
      for (let i = 0; i < 16; i++) {
        const n = noise(i, j, 11) % 31;
        if (n === 0) px(c, x + i, y + j, C.c1);
        else if (n === 1) px(c, x + i, y + j, C.c2);
      }
    }
    // A soft polished sheen and the expansion joint.
    rect(c, x + 2, y + 4, 6, 1, '#e3e0db');
    rect(c, x + 9, y + 10, 4, 1, '#e3e0db');
    rect(c, x, y + 15, 16, 1, C.cSeam);
  },
  tile(c, x, y) {
    rect(c, x, y, 16, 16, '#eaeef3');
    rect(c, x + 8, y, 8, 8, '#e3e8ef');
    rect(c, x, y + 8, 8, 8, '#e3e8ef');
    rect(c, x, y, 16, 1, '#d2d9e3');
    rect(c, x, y, 1, 16, '#d2d9e3');
    rect(c, x, y + 8, 16, 1, '#d9dfe8');
    rect(c, x + 8, y, 1, 16, '#d9dfe8');
    px(c, x + 2, y + 2, '#f8fafc');
    px(c, x + 10, y + 10, '#f8fafc');
  },
};

// --------------------------------------------------------------------------- walls

/**
 * A top wall is {@link WALL_ROWS} tiles high (48 px, 1.5x a character). `v` is the pixel row across
 * the whole wall (0..47), from the top down:
 * - v0-7, the slab (the wall's thickness seen from above, in a light warm grey): a dark back edge
 *   (v0), the lit top plane (v1-4), a bright front edge (v5) and the slab's darker front face
 *   (v6-7). A dark top reads as a border; a light top with an edge reads as volume.
 * - v8-11, the slab's shadow fading on the plaster; then the plaster face, bright up high and
 *   darkening towards the chair rail (v29-31).
 * - v32-41, blue-grey wainscot panels, the last 3 rows in ambient occlusion above the skirting.
 * - v42-47, the skirting board, darkening where it meets the floor.
 */
export const WALL_ROWS = 3;
const WALL_H = WALL_ROWS * 16;
export const SLAB_H = 8;
const RAIL = 29;
const SKIRT = WALL_H - 6;
/** Slab tones, shared by the top wall, the side bands, the bottom wall and the door reveal. */
export const SLAB_BACK = '#5f5a54';
export const SLAB_TOP = '#e2dcd1';
const SLAB_SPECK = '#d6cfc3';
export const SLAB_EDGE = '#f9f6f0';
export const SLAB_FACE = '#a59e93';
export const SLAB_FACE_LO = '#8d867b';
const UNDER_SLAB = ['#a9adb7', '#c1c5ce', '#d3d6dd', '#dfe2e7'];
/** Plaster from just under the slab shadow (bright) down to the chair rail (darker). */
const PLASTER_TOP = '#eef0f3';
const PLASTER_LOW = '#d9dde4';
const PLASTER_V0 = SLAB_H + UNDER_SLAB.length;
const PLASTER = Array.from({ length: RAIL - PLASTER_V0 }, (_, k) =>
  mix(PLASTER_TOP, PLASTER_LOW, (k / (RAIL - PLASTER_V0 - 1)) ** 1.3),
);
const WAINSCOT = '#bcc5d3';
const WAINSCOT_HI = '#ccd3de';
const WAINSCOT_LO = '#a8b1c2';
/** Ambient occlusion on the 3 wainscot rows above the skirting (mixed towards `C.ao`). */
const WAINSCOT_AO = [0.08, 0.16, 0.27];
const SKIRT_TONES = ['#6a7187', '#4b5266', '#4b5266', '#40465a', '#383e51', '#2b3040'];
/** Colors that get the low-contrast speckle (one shade darker), see {@link plasterShade}. */
const SPECKLE = new Map([
  [SLAB_TOP, SLAB_SPECK],
  [WAINSCOT, '#b4bdcc'],
  ...PLASTER.map((color) => [color, shade(color, 0.972)]),
]);

/** Color of pixel (i, v) of a top wall (v = row across the whole wall, 0..47). */
export function faceColor(v, i) {
  if (v === 0) return SLAB_BACK;
  if (v <= 4) return SLAB_TOP;
  if (v === 5) return SLAB_EDGE;
  if (v === 6) return SLAB_FACE;
  if (v === 7) return SLAB_FACE_LO;
  if (v < PLASTER_V0) return UNDER_SLAB[v - SLAB_H];
  if (v < RAIL) return PLASTER[v - PLASTER_V0];
  // Chair rail at ~1 m: lit top, shadowed underside.
  if (v === RAIL) return '#f6f7f9';
  if (v === RAIL + 1) return '#d9dde4';
  if (v === RAIL + 2) return '#9ba4b6';
  // Lower wall: blue-grey wainscot panels (8 px wide, lit left edge, shaded right edge), in the
  // skirting's occlusion on the last rows.
  if (v < SKIRT) {
    const panel = i % 8 === 7 ? WAINSCOT_LO : i % 8 === 0 ? WAINSCOT_HI : WAINSCOT;
    const k = v - (SKIRT - WAINSCOT_AO.length);
    return k < 0 ? panel : mix(panel, C.ao, WAINSCOT_AO[k]);
  }
  return SKIRT_TONES[v - SKIRT];
}

/** Low-contrast speckle (one shade darker) on the slab top, plaster and wainscot only. */
export function plasterShade(color) {
  return SPECKLE.get(color) ?? color;
}

/** Row `row` (0 = top) of a top wall face, full width. */
function faceRow(c, x, y, row) {
  for (let j = 0; j < 16; j++) {
    const v = row * 16 + j;
    for (let i = 0; i < 16; i++) {
      const base = faceColor(v, i);
      const n = noise(i, v, 41) % 17;
      px(c, x + i, y + j, n === 0 ? plasterShade(base) : base);
    }
  }
}

/** Old one-row wall face (still used by tiles that are drawn on a single row). */
function wallFace(c, x, y) {
  faceRow(c, x, y, 1);
}

/** Speckled slab top: `SLAB_TOP` with a few `SLAB_SPECK` pixels (seeded by the pixel). */
const slabTop = (i, v, seed) => (noise(i, v, seed) % 13 === 0 ? SLAB_SPECK : SLAB_TOP);

/**
 * Column `k` (0..7) of a side wall's band in the slab material, lit from the top-left: the dark
 * outer edge, a 1 px lit edge on the left, the top plane and a 2 px face in shade on the right.
 */
function bandColor(k, left, i, v) {
  const outer = left ? 0 : 7;
  if (k === outer) return SLAB_BACK;
  const lit = left ? 1 : 0;
  if (k === lit) return SLAB_EDGE;
  const face = left ? 6 : 5;
  if (k === face) return SLAB_FACE;
  if (k === face + 1) return SLAB_FACE_LO;
  return slabTop(i, v, 53);
}

/**
 * Top of a side wall seen from above: an 8 px band of the slab on the tile's outer edge (left or
 * right), the rest left transparent so what is under it shows (the floor, or the top wall's face
 * on the face rows), with a soft occlusion beside it. Two neighbouring rooms make one 16 px wall.
 */
function sideBand(c, x, y, left, h = 16, y0 = 0) {
  const bx = left ? x : x + 8;
  for (let j = y0; j < y0 + h; j++) {
    for (let k = 0; k < 8; k++) px(c, bx + k, y + j, bandColor(k, left, bx - x + k, j));
  }
  const shade = [`${C.ao}38`, `${C.ao}1e`, `${C.ao}0c`];
  shade.forEach((color, i) => {
    rect(c, left ? x + 8 + i : x + 7 - i, y + y0, 1, h, color);
  });
}

/**
 * Corner of a top wall: its first row with the side wall's band running up into the slab. On the
 * slab rows the band joins the top plane (no front edge across it), so the top reads as one piece;
 * on the right corner the slab's front edge turns down into the band's lit edge.
 */
function corner(c, x, y, left) {
  faceRow(c, x, y, 0);
  sideBand(c, x, y, left, 16 - SLAB_H + 2, SLAB_H - 2);
  const bx = left ? x : x + 8;
  for (let v = 0; v < SLAB_H - 2; v++) {
    for (let k = 0; k < 8; k++) {
      const i = bx - x + k;
      let color = slabTop(i, v, 41);
      if (v === 0 || k === (left ? 0 : 7)) color = SLAB_BACK;
      else if ((left && k === 1) || (!left && k === 0 && v === SLAB_H - 3)) color = SLAB_EDGE;
      px(c, bx + k, y + v, color);
    }
  }
}

/** Glass of a window two rows high (rows 0 and 1 of the wall), `v` measured from the wall top. */
const GLASS_TOP = 10;
const GLASS_BOTTOM = 26;
function windowPart(c, x, y, row) {
  faceRow(c, x, y, row);
  const sky = ['#6aa8d8', '#78b3e0', '#86bde6', '#94c6ea', '#a2ceee', '#b0d6f1', '#bedef4'];
  for (let j = 0; j < 16; j++) {
    const v = row * 16 + j;
    if (v < GLASS_TOP - 2 || v > GLASS_BOTTOM + 3) continue;
    if (v < GLASS_TOP) {
      // Frame head with the reveal (inner shadow) under it.
      rect(c, x + 1, y + j, 14, 1, v === GLASS_TOP - 2 ? C.l1 : C.l0);
      continue;
    }
    if (v <= GLASS_BOTTOM) {
      rect(c, x + 1, y + j, 1, 1, C.l0);
      rect(c, x + 14, y + j, 1, 1, C.l1);
      const t = Math.floor(((v - GLASS_TOP) / (GLASS_BOTTOM - GLASS_TOP + 1)) * sky.length);
      rect(c, x + 2, y + j, 12, 1, sky[t]);
      // Reveal: the frame's depth throws a 1 px shadow on the glass, top and left.
      if (v === GLASS_TOP) rect(c, x + 2, y + j, 12, 1, '#4f86b4');
      px(c, x + 2, y + j, '#5d93c0');
      // Mullion.
      rect(c, x + 7, y + j, 2, 1, C.l0);
      px(c, x + 8, y + j, C.l2);
      continue;
    }
    // Sill: sticks out of the wall (lighter top, darker front) and throws a shadow.
    if (v === GLASS_BOTTOM + 1) rect(c, x, y + j, 16, 1, '#ffffff');
    else if (v === GLASS_BOTTOM + 2) rect(c, x, y + j, 16, 1, C.l2);
    else rect(c, x + 1, y + j, 14, 1, AO1);
  }
  // A hazy skyline on the lower panes and two diagonal reflections.
  if (row === 1) {
    const sv = GLASS_BOTTOM - 16 - 3;
    art(c, x + 2, y + sv, ['...##.......', '.#.##..#.##.', '##.###.####.', '############'], {
      '#': '#a3c3db',
    });
    rect(c, x + 7, y + sv, 2, 4, C.l0);
    px(c, x + 8, y + sv, C.l2);
  }
  for (let i = 0; i < 6; i++) {
    const v = GLASS_TOP + 3 + i;
    if (Math.floor(v / 16) === row) px(c, x + 9 - i + 3, y + (v % 16), '#e4f2fc');
  }
  for (let i = 0; i < 4; i++) {
    const v = GLASS_TOP + 8 + i;
    if (Math.floor(v / 16) === row) px(c, x + 6 - i, y + (v % 16), '#e4f2fc');
  }
}

const drawWall = {
  'wall-top': (c, x, y) => faceRow(c, x, y, 0),
  'wall-mid': (c, x, y) => faceRow(c, x, y, 1),
  wall: (c, x, y) => faceRow(c, x, y, 2),
  'wall-side-l': (c, x, y) => sideBand(c, x, y, true),
  'wall-side-r': (c, x, y) => sideBand(c, x, y, false),
  'wall-bottom'(c, x, y) {
    // The slab on top of the wall (same anatomy as the top wall's v0-7), then the building's outer
    // facade: in shade under the slab's lip, a vertical joint and a dark base line.
    for (let v = 0; v < SLAB_H; v++) {
      for (let i = 0; i < 16; i++)
        px(c, x + i, y + v, v >= 1 && v <= 4 ? slabTop(i, v, 59) : faceColor(v, i));
    }
    const facade = ['#5b564f', '#6f695f', '#78726a', '#7b756c', '#7d776e', '#7d776e', '#79736a'];
    facade.forEach((color, k) => {
      rect(c, x, y + SLAB_H + k, 16, 1, color);
    });
    rect(c, x + 7, y + SLAB_H + 1, 1, 6, '#655f57');
    rect(c, x + 8, y + SLAB_H + 1, 1, 6, '#878177');
    rect(c, x, y + 15, 16, 1, '#46423c');
  },
  'wall-corner-tl': (c, x, y) => corner(c, x, y, true),
  'wall-corner-tr': (c, x, y) => corner(c, x, y, false),
  'wall-cap'(c, x, y) {
    // A whole tile of slab seen from above: back edge, top plane, lit front edge, front face.
    for (let v = 0; v < 16; v++) {
      for (let i = 0; i < 16; i++) px(c, x + i, y + v, slabTop(i, v, 61));
    }
    rect(c, x, y, 16, 1, SLAB_BACK);
    rect(c, x, y + 13, 16, 1, SLAB_EDGE);
    rect(c, x, y + 14, 16, 1, SLAB_FACE);
    rect(c, x, y + 15, 16, 1, SLAB_FACE_LO);
  },
  'window-top': (c, x, y) => windowPart(c, x, y, 0),
  window: (c, x, y) => windowPart(c, x, y, 1),
  whiteboard(c, x, y) {
    wallFace(c, x, y);
    rect(c, x + 1, y + 4, 14, 9, '#a9b1c2');
    rect(c, x + 2, y + 5, 12, 7, '#fbfcfe');
    rect(c, x + 3, y + 6, 5, 1, '#3f7fd0');
    rect(c, x + 3, y + 8, 7, 1, '#3f7fd0');
    rect(c, x + 3, y + 10, 3, 1, '#d6403a');
    art(c, x + 10, y + 6, ['.#', '#.', '.#'], { '#': '#3d9a4a' });
    rect(c, x + 9, y + 10, 3, 1, '#e8b923');
    rect(c, x + 3, y + 12, 10, 1, C.g3);
    rect(c, x + 1, y + 13, 14, 1, AO2);
  },
  poster(c, x, y) {
    wallFace(c, x, y);
    // Framed abstract print.
    rect(c, x + 3, y + 4, 10, 10, C.g1);
    rect(c, x + 4, y + 5, 8, 8, '#f3efe6');
    rect(c, x + 5, y + 6, 4, 4, '#e98a5b');
    rect(c, x + 7, y + 8, 4, 4, '#3f7d8f');
    rect(c, x + 7, y + 8, 2, 2, '#2f5866');
    px(c, x + 10, y + 6, '#e8b923');
    rect(c, x + 3, y + 14, 10, 1, AO2);
  },
  clock(c, x, y) {
    wallFace(c, x, y);
    art(
      c,
      x + 4,
      y + 4,
      [
        '..####..',
        '.#wwww#.',
        '#wwwwwW#',
        '#wwwwwW#',
        '#wwwwwW#',
        '#wWwwWW#',
        '.#WWWW#.',
        '..####..',
      ],
      { '#': C.g1, w: '#fdfdfb', W: '#e3e5ea' },
    );
    rect(c, x + 8, y + 6, 1, 3, C.g1);
    rect(c, x + 8, y + 8, 2, 1, C.g1);
    px(c, x + 8, y + 8, '#e0584f');
    rect(c, x + 5, y + 12, 6, 1, AO2);
  },
  board(c, x, y) {
    wallFace(c, x, y);
    // Hall of Fame: navy panel, gold frame, trophy and a warm LED strip.
    rect(c, x, y + 3, 16, 12, '#b98a2e');
    rect(c, x + 1, y + 4, 14, 10, '#1d2742');
    rect(c, x + 1, y + 4, 14, 1, '#f2d27a');
    art(
      c,
      x + 4,
      y + 5,
      [
        '#.######.#',
        '##gggggg##',
        '.#gggggG#.',
        '..#gggG#..',
        '...#gg#...',
        '....##....',
        '...####...',
      ],
      { '#': '#7a5a12', g: '#f4c542', G: '#d9a52b' },
    );
    px(c, x + 6, y + 6, '#fff3bf');
    rect(c, x + 3, y + 12, 10, 1, '#3a4a78');
    rect(c, x, y + 15, 16, 1, AO1);
  },
  sign(c, x, y) {
    wallFace(c, x, y);
  },
  door(c, x, y) {
    rect(c, x, y, 16, 1, SLAB_BACK);
    rect(c, x, y + 1, 16, 2, SLAB_TOP);
    rect(c, x, y + 3, 16, 1, SLAB_FACE);
    // Graphite frame around a glass door with a reflection and a long handle.
    rect(c, x + 1, y + 4, 14, 12, C.g1);
    rect(c, x + 2, y + 5, 12, 11, '#a9c6da');
    rect(c, x + 2, y + 5, 12, 2, '#c3d9e8');
    for (let i = 0; i < 5; i++) px(c, x + 4 + i, y + 12 - i, '#d9e9f4');
    for (let i = 0; i < 3; i++) px(c, x + 9 + i, y + 9 - i, '#d9e9f4');
    rect(c, x + 2, y + 13, 12, 3, '#8fb0c7');
    rect(c, x + 12, y + 8, 1, 4, C.l0);
    rect(c, x + 7, y + 5, 2, 11, C.g2);
  },
};

// --------------------------------------------------------------------------- furniture

/** Pale oak desk top in 3/4 view (top surface, front edge, graphite legs). */
function deskBase(c, x, y, legLeft, legRight) {
  rect(c, x, y + 3, 16, 1, C.o0);
  rect(c, x, y + 4, 16, 1, '#f0dcb8');
  rect(c, x, y + 5, 16, 6, C.o1);
  rect(c, x, y + 10, 16, 1, C.o2);
  rect(c, x, y + 11, 16, 1, C.o3);
  rect(c, x, y + 12, 16, 1, C.o4);
  if (legLeft) rect(c, x + 1, y + 13, 2, 2, C.g2);
  if (legRight) rect(c, x + 13, y + 13, 2, 2, C.g2);
  rect(c, x, y + 13, 16, 1, `${C.ao}40`);
  ao(c, x, y, 0, 16);
}

const drawFurniture = {
  desk(c, x, y) {
    deskBase(c, x, y, false, true);
    // Notebook, mug and a small succulent.
    art(c, x + 2, y + 5, ['#####', '#wwww', '#wlww', '#wwww'], {
      '#': C.g3,
      w: '#ffffff',
      l: '#9aa3b5',
    });
    art(c, x + 9, y + 4, ['.##.', '#cc#', '#cc#', '.##.'], { '#': C.l2, c: C.l0 });
    px(c, x + 10, y + 5, '#6b4423');
    art(c, x + 13, y + 3, ['.g.', 'ggg', 'ppp'], { g: C.p2, p: C.l1 });
  },
  computer(c, x, y) {
    deskBase(c, x, y, true, false);
    // Glow of the screen on the desk.
    rect(c, x + 3, y + 9, 10, 2, '#cfe4f0');
    // Slim monitor on a stand, showing code.
    art(
      c,
      x + 2,
      y,
      [
        '############',
        '#ssssssssss#',
        '#sccsyyysss#',
        '#ssmmmsssss#',
        '#scccccssss#',
        '#ssssyysmms#',
        '#sssssssssm#',
        '############',
        '....#gg#....',
      ],
      {
        '#': C.g0,
        s: '#17263b',
        c: '#57d3c2',
        y: '#f2c94c',
        m: '#a98bff',
        g: C.g3,
      },
    );
    px(c, x + 3, y + 1, '#2b4566');
    // Keyboard and mouse.
    rect(c, x + 4, y + 10, 8, 1, C.l0);
    rect(c, x + 4, y + 11, 8, 1, C.l2);
    rect(c, x + 13, y + 10, 1, 1, C.l0);
  },
  chair(c, x, y) {
    art(
      c,
      x,
      y,
      [
        '................',
        '................',
        '................',
        '.....OOOOOO.....',
        '....OmMmMmmO....',
        '....OMmMmMmO....',
        '....OmMmMmmO....',
        '...OOOOOOOOOO...',
        '...OsssssssSO...',
        '...OsssssssSO...',
        '....OSSSSSSO....',
        '......OkkO......',
        '....OOOkkOOO....',
        '...OkO.OO.OkO...',
        '................',
        '................',
      ],
      { O: C.g0, m: C.g2, M: C.g3, s: '#4b5470', S: C.g2, k: C.g3 },
    );
    rect(c, x + 4, y + 14, 8, 1, AO1);
  },
  'server-rack'(c, x, y) {
    rect(c, x + 2, y + 1, 12, 13, C.g0);
    rect(c, x + 2, y + 1, 12, 2, C.g3);
    rect(c, x + 2, y + 1, 12, 1, C.g4);
    rect(c, x + 3, y + 3, 10, 10, '#20263a');
    for (let i = 0; i < 4; i++) {
      const yy = y + 4 + i * 2 + (i > 1 ? 1 : 0);
      rect(c, x + 3, yy, 10, 2, C.g1);
      rect(c, x + 3, yy, 10, 1, C.g2);
      px(c, x + 4, yy + 1, ['#58d36b', '#58d36b', '#f2c94c', '#58d36b'][i]);
      px(c, x + 6, yy + 1, i % 2 ? '#4b93d8' : '#58d36b');
      rect(c, x + 8, yy + 1, 4, 1, C.g0);
    }
    rect(c, x + 2, y + 13, 12, 1, C.g2);
    ao(c, x, y, 1, 15);
  },
  phone(c, x, y) {
    // White side table with a desk phone and a small lamp.
    rect(c, x + 2, y + 7, 12, 1, C.l2);
    rect(c, x + 2, y + 8, 12, 3, C.l0);
    rect(c, x + 2, y + 11, 12, 1, C.l1);
    rect(c, x + 3, y + 12, 1, 2, C.g2);
    rect(c, x + 12, y + 12, 1, 2, C.g2);
    art(c, x + 3, y + 5, ['.####.', '#dddd#', '#dkkd#', '######'], { '#': C.g0, d: C.g2, k: C.g3 });
    px(c, x + 8, y + 7, '#4fd1c1');
    art(c, x + 10, y + 2, ['.##.', '#yy#', '####', '.kk.', '.kk.', '.kk.'], {
      '#': '#e9e3d0',
      y: '#fff4cf',
      k: C.g2,
    });
    ao(c, x, y, 2, 14);
  },
  plant(c, x, y) {
    art(
      c,
      x,
      y,
      [
        '................',
        '.......g........',
        '....g..Gg..g....',
        '...GGg.GGg.GG...',
        '...GGGgGGgGGG...',
        '..gGGGGGGGGGGg..',
        '...GGGGhGGGGG...',
        '..gGGhGGGGGhG...',
        '....GGGGGGGG....',
        '.....wwwwww.....',
        '.....wwwwwW.....',
        '.....wwwwwW.....',
        '......wwwW......',
        '......WWWW......',
        '................',
        '................',
      ],
      { G: C.p1, g: C.p2, h: C.p3, w: C.pot, W: C.potS },
    );
    rect(c, x + 5, y + 9, 6, 1, C.potD);
    ao(c, x, y, 4, 12);
  },
  'plant-tall'(c, x, y) {
    art(
      c,
      x,
      y,
      [
        '......gG........',
        '...g.GGGg.g.....',
        '..GGgGGhGgGG....',
        '.gGGGhGGGGGGg...',
        '..GGGGGGGhGG....',
        '.gGhGGGGGGGGGg..',
        '..GGGGGgGGGG....',
        '...gGGGGGGg.....',
        '.....GGGG.......',
        '......tt........',
        '.....wwwwww.....',
        '.....wwwwwW.....',
        '.....wwwwwW.....',
        '......wwwW......',
        '................',
        '................',
      ],
      { G: C.p1, g: C.p2, h: C.p3, t: '#6e4a2c', w: '#8d929d', W: '#6d727d' },
    );
    rect(c, x + 5, y + 10, 6, 1, '#a9adb6');
    ao(c, x, y, 4, 12);
  },
  bookshelf(c, x, y) {
    rect(c, x + 1, y + 1, 14, 13, C.l2);
    rect(c, x + 1, y + 1, 14, 1, C.l0);
    rect(c, x + 2, y + 2, 12, 11, C.l1);
    const books = [
      ['#4a6fa5', '#d9d4c7', '#c97b5a', '#5b8f73', '#7a6aa8', '#4a6fa5'],
      ['#c97b5a', '#2f3a52', '#e2b95b', '#4a6fa5', '#9a5a5a', '#d9d4c7'],
      ['#5b8f73', '#7a6aa8', '#2f3a52', '#c97b5a', '#d9d4c7', '#4a6fa5'],
    ];
    books.forEach((row, r) => {
      const yy = y + 2 + r * 4;
      row.forEach((color, i) => {
        const h = 2 + ((i + r) % 2);
        rect(c, x + 3 + i * 2, yy + 3 - h, 2, h, color);
      });
      rect(c, x + 2, yy + 3, 12, 1, C.l0);
    });
    rect(c, x + 1, y + 13, 14, 1, C.l3);
    ao(c, x, y, 1, 15);
  },
  'sofa-l'(c, x, y) {
    sofa(c, x, y, false);
  },
  'sofa-r'(c, x, y) {
    sofa(c, x, y, true);
  },
  coffee(c, x, y) {
    // Espresso machine on a white cabinet.
    rect(c, x + 1, y + 9, 14, 5, C.l1);
    rect(c, x + 1, y + 8, 14, 1, C.l0);
    rect(c, x + 1, y + 13, 14, 1, C.l2);
    rect(c, x + 7, y + 10, 1, 3, C.l2);
    art(
      c,
      x + 3,
      y + 1,
      [
        '.########.',
        '#mmmmmmmm#',
        '#mkkkkkkm#',
        '#mkddddkm#',
        '#mkdyydkm#',
        '#mmmmmmmm#',
        '##########',
      ],
      { '#': C.g0, m: '#c7ccd6', k: C.g2, d: C.g0, y: '#4fd1c1' },
    );
    rect(c, x + 6, y + 6, 4, 1, '#6b4423');
    ao(c, x, y, 1, 15);
  },
  cooler(c, x, y) {
    art(
      c,
      x + 3,
      y,
      [
        '...####...',
        '..#bbbb#..',
        '.#bbwbbb#.',
        '.#bbwbbb#.',
        '..#bbbb#..',
        '.########.',
        '.#wwwwwW#.',
        '.#wkwwkW#.',
        '.#wwwwwW#.',
        '.#wrwwbW#.',
        '.#wwwwwW#.',
        '.#wwwwwW#.',
        '.########.',
      ],
      { '#': C.g3, b: '#8fcaf0', w: C.l0, W: C.l2, k: C.g4, r: '#e0584f' },
    );
    px(c, x + 6, y + 9, '#e0584f');
    px(c, x + 9, y + 9, '#4b93d8');
    ao(c, x, y, 3, 13, 13);
  },
  printer(c, x, y) {
    art(
      c,
      x + 1,
      y + 2,
      [
        '...########...',
        '...#wwwwww#...',
        '...#wlllww#...',
        '##############',
        '#gggggggggggg#',
        '#gddddddddggg#',
        '#ggggggggggrg#',
        '#ggkkkkkkgggg#',
        '##############',
      ],
      { '#': C.g2, w: '#ffffff', l: '#9aa3b5', g: C.l1, d: C.l3, r: '#58d36b', k: C.g1 },
    );
    rect(c, x + 2, y + 11, 12, 2, C.l2);
    rect(c, x + 2, y + 11, 12, 1, C.l0);
    ao(c, x, y, 1, 15, 13);
  },
  table(c, x, y) {
    art(
      c,
      x,
      y,
      [
        '................',
        '................',
        '................',
        '....OOOOOOOO....',
        '..OOwwwwwwwwOO..',
        '.OwwwwwwwwwwwwO.',
        '.OwwwwwwwwwwwwO.',
        '.OWwwwwwwwwwwWO.',
        '..OOWWWWWWWWOO..',
        '....OOOOOOOO....',
        '.......kk.......',
        '.......kk.......',
        '.....kkkkkk.....',
        '................',
        '................',
        '................',
      ],
      { O: C.l3, w: C.l0, W: C.l2, k: C.g2 },
    );
    art(c, x + 4, y + 4, ['.##', '#pp', '.##'], { '#': C.l3, p: '#e98a5b' });
    art(c, x + 9, y + 3, ['.gg.', 'gGGg', '.gg.', '.kk.'], { g: C.p2, G: C.p3, k: C.pot });
    ao(c, x, y, 4, 12, 13);
  },
  counter(c, x, y) {
    // Reception desk: oak top, white front with a slate band.
    rect(c, x, y + 3, 16, 1, C.o0);
    rect(c, x, y + 4, 16, 1, '#f0dcb8');
    rect(c, x, y + 5, 16, 3, C.o1);
    rect(c, x, y + 8, 16, 1, C.o3);
    rect(c, x, y + 9, 16, 5, C.l0);
    rect(c, x, y + 9, 16, 1, C.l1);
    rect(c, x, y + 11, 16, 1, C.cap);
    rect(c, x, y + 13, 16, 1, C.l2);
    ao(c, x, y, 0, 16);
  },
  lamp(c, x, y) {
    art(
      c,
      x + 4,
      y,
      [
        '..####..',
        '.#yyyy#.',
        '#yyhhyy#',
        '#yyyyyy#',
        '.######.',
        '...kk...',
        '...kk...',
        '...kk...',
        '...kk...',
        '...kk...',
        '...kk...',
        '..kkkk..',
        '.kkkkkk.',
      ],
      { '#': '#cfc5a8', y: '#f8eccb', h: '#fffaf0', k: C.g1 },
    );
    ao(c, x, y, 4, 12, 13);
  },
};

function sofa(c, x, y, mirror) {
  const rows = [
    '................',
    '................',
    '..OOOOOOOOOOOOOO',
    '.OaaBBBBBBBBBBBB',
    '.OaabbbbbbbbbbBb',
    '.Oaabbbbbbbbbbbb',
    '.Oaabbbbbbbbbbbb',
    '.Oaacccccccccccc',
    '.Oaacccccccccccc',
    '.Oaadddddddddddd',
    '.Oaadddddddddddd',
    '.OOOOOOOOOOOOOOO',
    '..k.............',
    '................',
    '................',
    '................',
  ];
  const legend = {
    O: '#2c3550',
    a: '#47577a',
    B: '#7d8fb4',
    b: '#677aa0',
    c: '#7486ac',
    d: '#55678c',
    k: C.g1,
  };
  art(c, x, y, mirror ? rows.map((row) => [...row].reverse().join('')) : rows, legend);
  rect(c, x, y + 12, 16, 1, AO1);
  rect(c, x + 1, y + 13, 14, 1, AO2);
}

// --------------------------------------------------------------------------- sheet

export function makeTileset() {
  const rows = Math.ceil(TILE_IDS.length / TILE_COLUMNS);
  const c = createCanvas(TILE_COLUMNS * TILE, rows * TILE);
  TILE_IDS.forEach((id, i) => {
    const x = (i % TILE_COLUMNS) * TILE;
    const y = Math.floor(i / TILE_COLUMNS) * TILE;
    const draw = drawFloor[id] ?? drawWall[id] ?? drawFurniture[id];
    if (!draw) throw new Error(`no art for tile ${id}`);
    draw(c, x, y);
  });
  return c;
}
