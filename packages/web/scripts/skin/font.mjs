import { createCanvas, px } from './canvas.mjs';

const GLYPHS = {
  A: '.###./#...#/#...#/#####/#...#/#...#/#...#',
  B: '####./#...#/#...#/####./#...#/#...#/####.',
  C: '.####/#..../#..../#..../#..../#..../.####',
  D: '####./#...#/#...#/#...#/#...#/#...#/####.',
  E: '#####/#..../#..../####./#..../#..../#####',
  F: '#####/#..../#..../####./#..../#..../#....',
  G: '.####/#..../#..../#.###/#...#/#...#/.####',
  H: '#...#/#...#/#...#/#####/#...#/#...#/#...#',
  I: '.###./..#../..#../..#../..#../..#../.###.',
  J: '..###/...#./...#./...#./...#./#..#./.##..',
  K: '#...#/#..#./#.#../##.../#.#../#..#./#...#',
  L: '#..../#..../#..../#..../#..../#..../#####',
  M: '#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#',
  N: '#...#/##..#/#.#.#/#..##/#...#/#...#/#...#',
  O: '.###./#...#/#...#/#...#/#...#/#...#/.###.',
  P: '####./#...#/#...#/####./#..../#..../#....',
  Q: '.###./#...#/#...#/#...#/#.#.#/#..#./.##.#',
  R: '####./#...#/#...#/####./#.#../#..#./#...#',
  S: '.####/#..../#..../.###./....#/....#/####.',
  T: '#####/..#../..#../..#../..#../..#../..#..',
  U: '#...#/#...#/#...#/#...#/#...#/#...#/.###.',
  V: '#...#/#...#/#...#/#...#/#...#/.#.#./..#..',
  W: '#...#/#...#/#...#/#.#.#/#.#.#/##.##/#...#',
  X: '#...#/#...#/.#.#./..#../.#.#./#...#/#...#',
  Y: '#...#/#...#/.#.#./..#../..#../..#../..#..',
  Z: '#####/....#/...#./..#../.#.../#..../#####',
  0: '.###./#...#/#..##/#.#.#/##..#/#...#/.###.',
  1: '..#../.##../#.#../..#../..#../..#../#####',
  2: '.###./#...#/....#/...#./..#../.#.../#####',
  3: '####./....#/....#/.###./....#/....#/####.',
  4: '#...#/#...#/#...#/#####/....#/....#/....#',
  5: '#####/#..../####./....#/....#/#...#/.###.',
  6: '.###./#..../#..../####./#...#/#...#/.###.',
  7: '#####/....#/...#./..#../.#.../.#.../.#...',
  8: '.###./#...#/#...#/.###./#...#/#...#/.###.',
  9: '.###./#...#/#...#/.####/....#/....#/.###.',
  '.': '...../...../...../...../...../.##../.##..',
  ',': '...../...../...../...../.##../..#../.#...',
  ':': '...../.##../.##../...../.##../.##../.....',
  ';': '...../.##../.##../...../.##../..#../.#...',
  '!': '..#../..#../..#../..#../..#../...../..#..',
  '?': '.###./#...#/....#/...#./..#../...../..#..',
  '-': '...../...../...../#####/...../...../.....',
  '+': '...../..#../..#../#####/..#../..#../.....',
  '/': '....#/....#/...#./..#../.#.../#..../#....',
  '(': '...#./..#../.#.../.#.../.#.../..#../...#.',
  ')': '.#.../..#../...#./...#./...#./..#../.#...',
  "'": '..#../..#../...../...../...../...../.....',
  '"': '.#.#./.#.#./...../...../...../...../.....',
  _: '...../...../...../...../...../...../#####',
  '=': '...../...../#####/...../#####/...../.....',
  '%': '##..#/##..#/...#./..#../.#.../#..##/#..##',
  '#': '.#.#./.#.#./#####/.#.#./#####/.#.#./.#.#.',
  '*': '...../#.#.#/.###./#####/.###./#.#.#/.....',
  '<': '...#./..#../.#.../#..../.#.../..#../...#.',
  '>': '.#.../..#../...#./....#/...#./..#../.#...',
  '[': '.###./.#.../.#.../.#.../.#.../.#.../.###.',
  ']': '.###./...#./...#./...#./...#./...#./.###.',
  '▼': '...../#####/.###./..#../...../...../.....',
  '·': '...../...../...../..#../...../...../.....',
  '…': '...../...../...../...../...../...../#.#.#',
};
const ACCENTS = {
  acute: ['...#.', '..#..'],
  grave: ['.#...', '..#..'],
  circumflex: ['..#..', '.#.#.'],
  tilde: ['.##.#', '#..#.'],
};
/** char -> [base glyph, accent | 'cedilla'] */
const ACCENTED = {
  Á: ['A', 'acute'],
  À: ['A', 'grave'],
  Â: ['A', 'circumflex'],
  Ã: ['A', 'tilde'],
  É: ['E', 'acute'],
  Ê: ['E', 'circumflex'],
  Í: ['I', 'acute'],
  Ó: ['O', 'acute'],
  Ô: ['O', 'circumflex'],
  Õ: ['O', 'tilde'],
  Ú: ['U', 'acute'],
  Ç: ['C', 'cedilla'],
};
/** Lowercase glyphs: 7 rows (ascenders in the first two) plus up to 2 descender rows. */
const LOWER = {
  a: '...../...../.###./....#/.####/#...#/.####',
  b: '#..../#..../####./#...#/#...#/#...#/####.',
  c: '...../...../.####/#..../#..../#..../.####',
  d: '....#/....#/.####/#...#/#...#/#...#/.####',
  e: '...../...../.###./#...#/#####/#..../.####',
  f: '..##/.#../####/.#../.#../.#../.#..',
  g: '...../...../.####/#...#/#...#/#...#/.####/....#/.###.',
  h: '#..../#..../####./#...#/#...#/#...#/#...#',
  i: '.#./.../##./.#./.#./.#./###',
  j: '..#/.../.##/..#/..#/..#/..#/..#/##.',
  k: '#.../#.../#..#/#.#./##../#.#./#..#',
  l: '#./#./#./#./#./#./.#',
  m: '...../...../##.#./#.#.#/#.#.#/#.#.#/#.#.#',
  n: '...../...../####./#...#/#...#/#...#/#...#',
  o: '...../...../.###./#...#/#...#/#...#/.###.',
  p: '...../...../####./#...#/#...#/#...#/####./#..../#....',
  q: '...../...../.####/#...#/#...#/#...#/.####/....#/....#',
  r: '..../..../#.##/##../#.../#.../#...',
  s: '...../...../.####/#..../.###./....#/####.',
  t: '.#../.#../####/.#../.#../.#../..##',
  u: '...../...../#...#/#...#/#...#/#...#/.####',
  v: '...../...../#...#/#...#/#...#/.#.#./..#..',
  w: '...../...../#...#/#.#.#/#.#.#/#.#.#/.#.#.',
  x: '...../...../#...#/.#.#./..#../.#.#./#...#',
  y: '...../...../#...#/#...#/#...#/#...#/.####/....#/.###.',
  z: '...../...../#####/...#./..#../.#.../#####',
  ı: '.../.../##./.#./.#./.#./###',
};
/** Lowercase accents sit in the ascender rows of the glyph. */
const LOWER_ACCENTED = {
  á: ['a', 'acute'],
  à: ['a', 'grave'],
  â: ['a', 'circumflex'],
  ã: ['a', 'tilde'],
  é: ['e', 'acute'],
  ê: ['e', 'circumflex'],
  í: ['ı', 'acute'],
  ó: ['o', 'acute'],
  ô: ['o', 'circumflex'],
  õ: ['o', 'tilde'],
  ú: ['u', 'acute'],
  ç: ['c', 'cedilla'],
};
const CELL_W = 8;
const CELL_H = 13;
const FONT_LINE_HEIGHT = 11;
/** Rows above the cap height reserved for the accents of capitals. */
const ACCENT_ROWS = 2;

/** Glyph pixels as [x, y] pairs (y from the top of the cell, below the 1px margin). */
function glyphPixels(entry) {
  const pixels = [];
  const add = (rows, dy) =>
    rows.forEach((row, j) => {
      [...row].forEach((ch, i) => {
        if (ch === '#') pixels.push([i, dy + j]);
      });
    });
  const lower = LOWER[entry.base] !== undefined;
  add((lower ? LOWER : GLYPHS)[entry.base].split('/'), ACCENT_ROWS);
  if (entry.accent === 'cedilla') {
    pixels.push([2, ACCENT_ROWS + 7]);
  } else if (entry.accent) {
    // Capitals take the accent above; lowercase letters in their (empty) ascender rows.
    add(ACCENTS[entry.accent], lower ? ACCENT_ROWS : 0);
  }
  return pixels;
}

export function makeFont() {
  const entries = [
    ...Object.keys(GLYPHS).map((ch) => ({ ch, base: ch })),
    ...Object.entries(ACCENTED).map(([ch, [base, accent]]) => ({ ch, base, accent })),
    ...Object.keys(LOWER).map((ch) => ({ ch, base: ch })),
    ...Object.entries(LOWER_ACCENTED).map(([ch, [base, accent]]) => ({ ch, base, accent })),
  ];
  const cols = 16;
  const rows = Math.ceil(entries.length / cols);
  const c = createCanvas(cols * CELL_W, rows * CELL_H);
  const chars = [];
  entries.forEach((entry, i) => {
    const x = (i % cols) * CELL_W;
    const y = Math.floor(i / cols) * CELL_H;
    const pixels = glyphPixels(entry);
    for (const [gx, gy] of pixels) px(c, x + 1 + gx, y + 1 + gy, '#ffffff');
    // Proportional: trim the empty columns on both sides, 1px of spacing after the glyph.
    const minX = Math.min(...pixels.map(([gx]) => gx));
    const maxX = Math.max(...pixels.map(([gx]) => gx));
    const width = maxX - minX + 1;
    chars.push({ code: entry.ch.codePointAt(0), x: x + 1 + minX, y: y + 1, width });
  });
  const lines = chars.map(
    (g) =>
      `    <char id="${g.code}" x="${g.x}" y="${g.y}" width="${g.width}" height="${FONT_LINE_HEIGHT}" xoffset="0" yoffset="0" xadvance="${g.width + 1}" page="0" chnl="0"/>`,
  );
  lines.unshift(
    '    <char id="32" x="0" y="0" width="0" height="0" xoffset="0" yoffset="0" xadvance="3" page="0" chnl="0"/>',
  );
  const xml = `<?xml version="1.0"?>
<font>
  <info face="agents-office-pixel" size="${FONT_LINE_HEIGHT}" bold="0" italic="0" charset="" unicode="1" stretchH="100" smooth="0" aa="1" padding="0,0,0,0" spacing="0,0"/>
  <common lineHeight="${FONT_LINE_HEIGHT}" base="9" scaleW="${c.w}" scaleH="${c.h}" pages="1" packed="0"/>
  <pages>
    <page id="0" file="pixel.png"/>
  </pages>
  <chars count="${lines.length}">
${lines.join('\n')}
  </chars>
</font>
`;
  return { canvas: c, xml };
}

// Compact 3x5 face for name tags (uppercase only, 4px advance).
const TINY = {
  A: '.#./#.#/###/#.#/#.#',
  B: '##./#.#/##./#.#/##.',
  C: '.##/#../#../#../.##',
  D: '##./#.#/#.#/#.#/##.',
  E: '###/#../##./#../###',
  F: '###/#../##./#../#..',
  G: '.##/#../#.#/#.#/.##',
  H: '#.#/#.#/###/#.#/#.#',
  I: '###/.#./.#./.#./###',
  J: '..#/..#/..#/#.#/.#.',
  K: '#.#/#.#/##./#.#/#.#',
  L: '#../#../#../#../###',
  M: '#.#/###/###/#.#/#.#',
  N: '##./#.#/#.#/#.#/#.#',
  O: '.#./#.#/#.#/#.#/.#.',
  P: '##./#.#/##./#../#..',
  Q: '.#./#.#/#.#/##./.##',
  R: '##./#.#/##./#.#/#.#',
  S: '.##/#../.#./..#/##.',
  T: '###/.#./.#./.#./.#.',
  U: '#.#/#.#/#.#/#.#/###',
  V: '#.#/#.#/#.#/#.#/.#.',
  W: '#.#/#.#/###/###/#.#',
  X: '#.#/#.#/.#./#.#/#.#',
  Y: '#.#/#.#/.#./.#./.#.',
  Z: '###/..#/.#./#../###',
  0: '###/#.#/#.#/#.#/###',
  1: '.#./##./.#./.#./###',
  2: '##./..#/.#./#../###',
  3: '##./..#/.#./..#/##.',
  4: '#.#/#.#/###/..#/..#',
  5: '###/#../##./..#/##.',
  6: '.##/#../###/#.#/###',
  7: '###/..#/.#./.#./.#.',
  8: '###/#.#/###/#.#/###',
  9: '###/#.#/###/..#/##.',
  '.': '.../.../.../.../.#.',
  ',': '.../.../.../.#./#..',
  ':': '.../.#./.../.#./...',
  '-': '.../.../###/.../...',
  '/': '..#/..#/.#./#../#..',
  '!': '.#./.#./.#./.../.#.',
  '?': '##./..#/.#./.../.#.',
  '+': '.../.#./###/.#./...',
  _: '.../.../.../.../###',
  '(': '.#./#../#../#../.#.',
  ')': '.#./..#/..#/..#/.#.',
  "'": '.#./.#./.../.../...',
  '#': '#.#/###/#.#/###/#.#',
  '%': '#.#/..#/.#./#../#.#',
  '&': '.#./#.#/.#./#.#/.##',
  '*': '.../#.#/.#./#.#/...',
  '=': '.../###/.../###/...',
  '"': '#.#/#.#/.../.../...',
  '>': '#../.#./..#/.#./#..',
  '<': '..#/.#./#../.#./..#',
  '[': '##./#../#../#../##.',
  ']': '.##/..#/..#/..#/.##',
  '·': '.../.../.#./.../...',
};

export function makeTinyFont() {
  const cell = 5;
  const keys = Object.keys(TINY);
  const cols = 16;
  const rows = Math.ceil(keys.length / cols);
  const c = createCanvas(cols * cell, rows * 7);
  const chars = [];
  keys.forEach((ch, i) => {
    const x = (i % cols) * cell;
    const y = Math.floor(i / cols) * 7;
    TINY[ch].split('/').forEach((row, j) => {
      [...row].forEach((v, k) => {
        if (v === '#') px(c, x + k, y + j, '#ffffff');
      });
    });
    chars.push({ code: ch.codePointAt(0), x, y });
    const lower = ch.toLowerCase();
    if (lower !== ch) chars.push({ code: lower.codePointAt(0), x, y });
  });
  const lines = chars.map(
    (g) =>
      `    <char id="${g.code}" x="${g.x}" y="${g.y}" width="3" height="5" xoffset="0" yoffset="0" xadvance="4" page="0" chnl="0"/>`,
  );
  lines.unshift(
    '    <char id="32" x="0" y="0" width="0" height="0" xoffset="0" yoffset="0" xadvance="3" page="0" chnl="0"/>',
  );
  const xml = `<?xml version="1.0"?>
<font>
  <info face="agents-office-tiny" size="5" bold="0" italic="0" charset="" unicode="1" stretchH="100" smooth="0" aa="1" padding="0,0,0,0" spacing="0,0"/>
  <common lineHeight="6" base="5" scaleW="${c.w}" scaleH="${c.h}" pages="1" packed="0"/>
  <pages>
    <page id="0" file="tiny.png"/>
  </pages>
  <chars count="${lines.length}">
${lines.join('\n')}
  </chars>
</font>
`;
  return { canvas: c, xml };
}

// Label face for name tags: proportional, 5 px capitals, 4 px lowercase with a 1 px ascender and
// 2 px descenders. Maps below are 5 cap rows + 2 descender rows (`/` separates rows); the font adds
// an accent row on top, so an accent never touches the lowercase letter under it (8 rows total).
// Elegant mixed case that stays narrow enough to sit under a 16 px character.
const LABEL_UPPER = {
  A: '.##./#..#/####/#..#/#..#',
  B: '###./#..#/###./#..#/###.',
  C: '.###/#.../#.../#.../.###',
  D: '###./#..#/#..#/#..#/###.',
  E: '###/#../##./#../###',
  F: '###/#../##./#../#..',
  G: '.###/#.../#.##/#..#/.###',
  H: '#..#/#..#/####/#..#/#..#',
  I: '###/.#./.#./.#./###',
  J: '..#/..#/..#/#.#/.#.',
  K: '#..#/#.#./##../#.#./#..#',
  L: '#../#../#../#../###',
  M: '#...#/##.##/#.#.#/#...#/#...#',
  N: '#..#/##.#/#.##/#..#/#..#',
  O: '.##./#..#/#..#/#..#/.##.',
  P: '###./#..#/###./#.../#...',
  Q: '.##./#..#/#..#/#.#./.#.#',
  R: '###./#..#/###./#.#./#..#',
  S: '.###/#.../.##./...#/###.',
  T: '###/.#./.#./.#./.#.',
  U: '#..#/#..#/#..#/#..#/.##.',
  V: '#...#/#...#/.#.#./.#.#./..#..',
  W: '#...#/#...#/#.#.#/##.##/#...#',
  X: '#..#/#..#/.##./#..#/#..#',
  Y: '#.#/#.#/.#./.#./.#.',
  Z: '####/...#/.##./#.../####',
};
const LABEL_LOWER = {
  a: '.../.##/#.#/#.#/.##',
  b: '#../##./#.#/#.#/##.',
  c: '.../.##/#../#../.##',
  d: '..#/.##/#.#/#.#/.##',
  e: '.../.#./###/#../.##',
  f: '.##/#../##./#../#..',
  g: '.../.##/#.#/#.#/.##/..#/##.',
  h: '#../##./#.#/#.#/#.#',
  i: '#/./#/#/#',
  j: '.#/../.#/.#/.#/.#/#.',
  k: '#../#.#/##./#.#/#.#',
  l: '#./#./#./#./.#',
  m: '...../####./#.#.#/#.#.#/#.#.#',
  n: '.../##./#.#/#.#/#.#',
  o: '.../.#./#.#/#.#/.#.',
  p: '.../##./#.#/#.#/##./#../#..',
  q: '.../.##/#.#/#.#/.##/..#/..#',
  r: '.../#.#/##./#../#..',
  s: '.../.##/#../..#/##.',
  t: '.#./###/.#./.#./..#',
  u: '.../#.#/#.#/#.#/.##',
  v: '.../#.#/#.#/#.#/.#.',
  w: '...../#...#/#...#/#.#.#/.#.#.',
  x: '.../#.#/.#./.#./#.#',
  y: '.../#.#/#.#/#.#/.##/..#/##.',
  z: '.../###/..#/.#./###',
};
/** Accents sit on the accent row, one blank row above the lowercase letters. */
const LABEL_ACCENTED = {
  á: ['a', '..#'],
  à: ['a', '#..'],
  â: ['a', '.#.'],
  ã: ['a', '##.'],
  é: ['e', '..#'],
  ê: ['e', '.#.'],
  í: ['i', '#'],
  ó: ['o', '..#'],
  ô: ['o', '.#.'],
  õ: ['o', '##.'],
  ú: ['u', '..#'],
};
const LABEL_LINE_HEIGHT = 9;

export function makeLabelFont() {
  const glyphs = [];
  // Row 0 is the accent row: blank for every plain glyph.
  const add = (ch, rows, accent = '') => glyphs.push({ ch, rows: [accent, ...rows.split('/')] });
  for (const [ch, rows] of Object.entries(LABEL_UPPER)) add(ch, rows);
  for (const [ch, rows] of Object.entries(LABEL_LOWER)) add(ch, rows);
  for (const [ch, [base, accent]] of Object.entries(LABEL_ACCENTED)) {
    const rows = LABEL_LOWER[base].split('/');
    // The accent replaces the dot of the i.
    if (base === 'i') rows[0] = '.';
    add(ch, rows.join('/'), accent);
  }
  add('ç', `${LABEL_LOWER.c}/.#.`);
  // Capitals with accents fall back to the plain letter (no room above the cap line).
  for (const [ch, plain] of Object.entries({
    Á: 'A',
    À: 'A',
    Â: 'A',
    Ã: 'A',
    É: 'E',
    Ê: 'E',
    Í: 'I',
    Ó: 'O',
    Ô: 'O',
    Õ: 'O',
    Ú: 'U',
    Ç: 'C',
  })) {
    add(ch, LABEL_UPPER[plain]);
  }
  for (const [ch, rows] of Object.entries(TINY)) {
    if (/[A-Z]/.test(ch)) continue;
    add(ch, rows);
  }
  add('…', '...../...../...../...../#.#.#');

  const cell = 6;
  const cols = 16;
  const c = createCanvas(cols * cell, Math.ceil(glyphs.length / cols) * LABEL_LINE_HEIGHT);
  const lines = glyphs.map(({ ch, rows }, i) => {
    const x = (i % cols) * cell;
    const y = Math.floor(i / cols) * LABEL_LINE_HEIGHT;
    rows.forEach((row, j) => {
      [...row].forEach((v, k) => {
        if (v === '#') px(c, x + k, y + j, '#ffffff');
      });
    });
    const width = Math.max(...rows.map((row) => row.length));
    return `    <char id="${ch.codePointAt(0)}" x="${x}" y="${y}" width="${width}" height="8" xoffset="0" yoffset="0" xadvance="${width + 1}" page="0" chnl="0"/>`;
  });
  lines.unshift(
    '    <char id="32" x="0" y="0" width="0" height="0" xoffset="0" yoffset="0" xadvance="3" page="0" chnl="0"/>',
  );
  const xml = `<?xml version="1.0"?>
<font>
  <info face="agents-office-label" size="7" bold="0" italic="0" charset="" unicode="1" stretchH="100" smooth="0" aa="1" padding="0,0,0,0" spacing="0,0"/>
  <common lineHeight="${LABEL_LINE_HEIGHT}" base="6" scaleW="${c.w}" scaleH="${c.h}" pages="1" packed="0"/>
  <pages>
    <page id="0" file="label.png"/>
  </pages>
  <chars count="${lines.length}">
${lines.join('\n')}
  </chars>
</font>
`;
  return { canvas: c, xml };
}
