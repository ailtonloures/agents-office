// Preview of the props atlas for iterating on furniture art (not used by the build): every prop
// composed over the room floor (`floor`) and again over the lobby `wood`, each with a character
// standing next to it for scale, plus samples of the volume helpers, upscaled 3x.
// Run: node packages/web/scripts/skin/preview-props.mjs [out.png]  (default: <tmpdir>/preview-props.png)
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createCanvas, encodePng, upscale } from './canvas.mjs';
import { BASE_COLORS, FH, FW, layers, makeSheet, PALETTES, WALK } from './characters.mjs';
import { box, legs, makePropsAtlas, slab } from './props.mjs';
import { makeTileset, TILE, TILE_COLUMNS, TILE_IDS } from './tiles.mjs';
import { lighten, outline, ramp, rgb, shade, toHex } from './tone.mjs';

const SCALE = 3;
const WIDTH = 420;
const GAP = 6;
const out = resolve(process.argv[2] ?? join(tmpdir(), 'preview-props.png'));

/** Copies `w`x`h` from `src` (sx, sy) to `dst` (dx, dy), alpha-blended. */
function blit(dst, dx, dy, src, sx, sy, w, h) {
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = dx + i;
      const y = dy + j;
      if (x < 0 || y < 0 || x >= dst.w || y >= dst.h) continue;
      const s = ((sy + j) * src.w + sx + i) * 4;
      const a = src.data[s + 3] / 255;
      if (a === 0) continue;
      const d = (y * dst.w + x) * 4;
      for (let k = 0; k < 3; k++) {
        dst.data[d + k] = Math.round(src.data[s + k] * a + dst.data[d + k] * (1 - a));
      }
      dst.data[d + 3] = 255;
    }
  }
}

/** One standing character (body + outfit + hair), palette-swapped and outlined like the factory. */
function character() {
  const sheets = [layers.body, layers.outfit('developer'), layers.hair('short')].map(makeSheet);
  const c = createCanvas(FW + 2, FH + 2);
  const index = WALK.down[0];
  for (const sheet of sheets) {
    const cols = sheet.w / FW;
    blit(c, 1, 1, sheet, (index % cols) * FW, Math.floor(index / cols) * FH, FW, FH);
  }
  const B = BASE_COLORS;
  const [skin, hair, shirt, pants] = [
    PALETTES.skin[1],
    PALETTES.hair[1],
    PALETTES.shirt[0],
    PALETTES.pants[0],
  ];
  // Same derivation as src/characters/characterFactory.ts.
  const swap = new Map(
    [
      [B.skin, skin],
      [B.skinShade, shade(skin, 0.84)],
      [B.skinLight, lighten(skin, 0.25)],
      [B.hair, hair],
      [B.hairShade, shade(hair, 0.7)],
      [B.hairLight, lighten(hair, 0.3)],
      [B.shirt, shirt],
      [B.shirtShade, shade(shirt, 0.76)],
      [B.shirtLight, lighten(shirt, 0.2)],
      [B.pants, pants],
      [B.pantsShade, shade(pants, 0.72)],
      [B.pantsLight, lighten(pants, 0.18)],
    ].map(([from, to]) => [from, rgb(to)]),
  );
  for (let i = 0; i < c.data.length; i += 4) {
    if (c.data[i + 3] === 0) continue;
    const to = swap.get(toHex([c.data[i], c.data[i + 1], c.data[i + 2]]));
    if (to) c.data.set(to, i);
  }
  outline(c, 0, 0, c.w, c.h);
  return c;
}

/** Fills `c` from row `y0`, `h` rows, with the tileset tile `id`. */
function floor(c, tileset, id, y0, h) {
  const n = TILE_IDS.indexOf(id);
  const tx = (n % TILE_COLUMNS) * TILE;
  const ty = Math.floor(n / TILE_COLUMNS) * TILE;
  for (let y = y0; y < y0 + h; y++) {
    for (let x = 0; x < c.w; x++) {
      const s = ((ty + ((y - y0) % TILE)) * tileset.w + tx + (x % TILE)) * 4;
      c.data.set(tileset.data.subarray(s, s + 4), (y * c.w + x) * 4);
    }
  }
}

/**
 * Samples of the volume helpers (props.mjs `slab`, `box`, `legs`) with contrasted ramps, as an
 * extra cell: a table (legs, then the slab over them) and a cabinet. Same frame format as the atlas.
 */
function helperSamples() {
  const c = createCanvas(56, 30);
  const oak = ramp('#d7b98d', { contrast: 1.3 });
  const white = ramp('#eceef1', { contrast: 1.3 });
  legs(c, [3, 21], 13, 12, oak);
  slab(c, 2, 4, 22, 7, 2, oak);
  box(c, 30, 6, 22, 5, 14, white);
  outline(c, 0, 0, c.w, c.h);
  return { canvas: c, frame: { x: 0, y: 0, w: c.w, h: c.h, ax: 1, ay: 27 } };
}

const atlas = makePropsAtlas();
const tileset = makeTileset();
const person = character();
const samples = helperSamples();
const frames = [
  ...Object.entries(atlas.frames).map(([id, f]) => [id, f, atlas.canvas]),
  ['helpers', samples.frame, samples.canvas],
];

// Shelf layout of one section: each cell is the prop frame + the character, floor lines aligned
// (the prop's anchor row and the character's feet).
const cells = [];
let cx = GAP;
let rowTop = 0;
let rowBottom = 0;
const rows = [];
for (const [id, f, src] of frames) {
  const w = f.w + person.w + 2;
  if (cx + w > WIDTH - GAP) {
    rows.push({ top: rowTop, bottom: rowBottom });
    cx = GAP;
    rowTop = 0;
    rowBottom = 0;
  }
  const above = Math.max(f.ay, person.h - 1);
  const below = Math.max(f.h - f.ay, 1);
  cells.push({ id, f, src, x: cx, row: rows.length });
  rowTop = Math.max(rowTop, above);
  rowBottom = Math.max(rowBottom, below);
  cx += w + GAP;
}
rows.push({ top: rowTop, bottom: rowBottom });
let y = GAP;
const lines = rows.map((r) => {
  const line = y + r.top;
  y += r.top + r.bottom + GAP;
  return line;
});
const sectionH = Math.ceil(y / TILE) * TILE;

const c = createCanvas(WIDTH, sectionH * 2);
for (const [k, id] of ['floor', 'wood'].entries()) {
  const top = k * sectionH;
  floor(c, tileset, id, top, sectionH);
  for (const { f, src, x, row } of cells) {
    const line = top + lines[row];
    blit(c, x, line - f.ay, src, f.x, f.y, f.w, f.h);
    blit(c, x + f.w + 1, line - person.h + 1, person, 0, 0, person.w, person.h);
  }
}
writeFileSync(out, encodePng(upscale(c, SCALE)));
console.log(`props preview written to ${out}`);
