// Character layers of the default skin (body, hair, outfit, accessory), drawn in loud key colors
// that CharacterFactory palette-swaps per character. 16x32 frames (a 2-tile tall chibi with a big
// head), 3 tones per material (light, base, shade). A 1px selective outline is added at runtime,
// so the art keeps a 1px transparent margin on every side of the frame.
import { createCanvas, px } from './canvas.mjs';

export const FW = 16;
export const FH = 32;
export const COLUMNS = 6;
export const DIRS = ['down', 'left', 'right', 'up'];
/** Per direction row: stand, step (left foot), step (right foot), breathe, blink. */
export const WALK = Object.fromEntries(
  DIRS.map((d, row) => [d, [0, 1, 2].map((i) => row * COLUMNS + i)]),
);
export const IDLE = Object.fromEntries(
  DIRS.map((d, row) => [d, [3, 4].map((i) => row * COLUMNS + i)]),
);
export const POSES = {
  'sit-type': 24,
  'sit-type-b': 25,
  'sit-type-c': 26,
  read: 27,
  'read-b': 28,
  phone: 29,
  sleep: 30,
  'sleep-b': 31,
  celebrate: 32,
  'celebrate-b': 33,
};
export const FRAME_COUNT = 34;

/** Key colors the layers are drawn in; the factory swaps them (see skin.json `baseColors`). */
export const BASE_COLORS = {
  skin: '#ff00ff',
  skinShade: '#b800b8',
  skinLight: '#ff80ff',
  hair: '#ff0080',
  hairShade: '#a8005a',
  hairLight: '#ff80bf',
  shirt: '#00ffff',
  shirtShade: '#00a0a0',
  shirtLight: '#80ffff',
  pants: '#80ff00',
  pantsShade: '#489000',
  pantsLight: '#c0ff80',
};
/** Sober, modern tones (the player's red/blue stay out of these lists). */
export const PALETTES = {
  skin: ['#f7d9c4', '#efc4a4', '#dca681', '#c08660', '#9a6544', '#6e4630'],
  hair: ['#26211f', '#4a3326', '#7a5232', '#b07a45', '#d8b26a', '#a8483a', '#a3a8b4'],
  shirt: ['#3b5b92', '#2e8a85', '#6a58a8', '#4f8a5b', '#c98a3c', '#4a86c8', '#a84a4a', '#5a6378'],
  pants: ['#2b303d', '#34476b', '#4c5162', '#5e4e3f'],
};

export const PROFESSIONS = {
  'tech-lead': { accessory: 'tie' },
  analyst: { accessory: 'glasses' },
  architect: { accessory: 'cap' },
  developer: { accessory: 'headphones' },
  qa: { accessory: 'badge' },
  support: { accessory: 'headset' },
};

export const HAIRS = ['short', 'long', 'bun', 'curly', 'ponytail', 'spiky', 'bob'];

const B = BASE_COLORS;
/** Legend shared by every map. Lowercase/uppercase pairs are base/shade; `l k L q` are lights. */
const LEGEND = {
  s: B.skin,
  S: B.skinShade,
  l: B.skinLight,
  h: B.hair,
  H: B.hairShade,
  L: B.hairLight,
  c: B.shirt,
  C: B.shirtShade,
  k: B.shirtLight,
  p: B.pants,
  P: B.pantsShade,
  q: B.pantsLight,
  e: '#1d2030', // eyes
  E: '#7a3341', // open mouth
  o: '#23262f', // shoes
  O: '#4d546a', // shoe highlight
  b: '#2b2e3b', // belt
  w: '#f3f5f9', // white cloth
  W: '#c9d0dc',
  V: '#9aa3b5',
  // accessories
  t: '#c8423b', // tie
  T: '#8e2c27',
  g: '#2a2733', // glasses / headphones frame
  G: '#bfe6f8', // lens glint
  a: '#5b62c9', // cap
  A: '#3d4396',
  z: '#8f96ef',
  y: '#4fd1c1', // headphone led
  Y: '#e2b93b', // badge / phone screen
  n: '#43a85a', // badge
  r: '#e0584f', // mic tip
  f: '#3a4052', // device grey
  F: '#596079',
};

// Vertical landmarks (standing).
const HEAD_Y = 5; // head rows 5..15
const TORSO_Y = 16; // torso rows 16..22, belt 23, legs 24..28, shoes 29..30
/** Seated poses are drawn this much lower (the chair hides the legs, the monitor stays visible). */
const SEAT_DY = 7;

function check(name, rows) {
  const w = rows[0].length;
  for (const row of rows) {
    if (row.length !== w) throw new Error(`map ${name}: row "${row}" is not ${w} wide`);
  }
  return rows;
}

/** Pixel map drawn at (x, y) of a frame; mirrored horizontally when `g.flip`. */
function put(c, ox, oy, g, x, y, rows) {
  rows.forEach((row, j) => {
    const chars = [...row];
    const w = chars.length;
    chars.forEach((ch, i) => {
      if (ch === '.' || ch === ' ') return;
      const color = LEGEND[ch];
      if (!color) throw new Error(`no color for "${ch}"`);
      const fx = g.flip ? FW - x - w + (w - 1 - i) : x + i;
      px(c, ox + fx, oy + y + j, color);
    });
  });
}

// --------------------------------------------------------------------------- head (body layer)

const HEAD = {
  front: check('head-front', [
    '..llssssss..',
    '.lssssssssS.',
    '.lssssssssS.',
    '.sssssssssS.',
    '.sssssssssS.',
    'sssessssesSS',
    'sssessssesSS',
    '.sssssssssS.',
    '.ssssSSsssS.',
    '..ssssssSS..',
    '...SSSSSS...',
  ]),
  blink: check('head-blink', [
    '..llssssss..',
    '.lssssssssS.',
    '.lssssssssS.',
    '.sssssssssS.',
    '.sssssssssS.',
    'ssssssssssSS',
    'sssessssesSS',
    '.sssssssssS.',
    '.ssssSSsssS.',
    '..ssssssSS..',
    '...SSSSSS...',
  ]),
  happy: check('head-happy', [
    '..llssssss..',
    '.lssssssssS.',
    '.lssssssssS.',
    '.sssssssssS.',
    '.sssssssssS.',
    'sssessssesSS',
    'sssessssesSS',
    '.sssssssssS.',
    '.ssssEEsssS.',
    '..sssEEsSS..',
    '...SSSSSS...',
  ]),
  back: check('head-back', [
    '..ssssssss..',
    '.ssssssssss.',
    '.ssssssssss.',
    '.ssssssssss.',
    '.sssssssssS.',
    'SsssssssssSS',
    'SsssssssssSS',
    '.sssssssssS.',
    '.sssssssssS.',
    '..ssssssSS..',
    '...SSSSSS...',
  ]),
  side: check('head-side', [
    '...ssssss..',
    '..lsssssss.',
    '.lssssssssS',
    '.ssssssssss',
    '.sssssssssS',
    '.sesssSSssS',
    'ssesssSSssS',
    '.sssssssssS',
    '.SsssssssS.',
    '..sssssSS..',
    '...SSSSS...',
  ]),
  sideBlink: check('head-side-blink', [
    '...ssssss..',
    '..lsssssss.',
    '.lssssssssS',
    '.ssssssssss',
    '.sssssssssS',
    '.ssssssSssS',
    'ssesssSSssS',
    '.sssssssssS',
    '.SsssssssS.',
    '..sssssSS..',
    '...SSSSS...',
  ]),
};

function drawHead(c, ox, oy, g) {
  const y = HEAD_Y + g.headDy;
  if (g.view === 'side') {
    put(c, ox, oy, g, 2, y, g.blink ? HEAD.sideBlink : HEAD.side);
    return;
  }
  const map =
    g.view === 'back' ? HEAD.back : g.happy ? HEAD.happy : g.blink ? HEAD.blink : HEAD.front;
  put(c, ox, oy, g, 2, y, map);
}

/** Hands are skin, so they belong to the body layer (sleeves are drawn by the outfit). */
function drawBody(c, ox, oy, g) {
  if (g.pose === 'sleep') {
    // Head down on the folded arms (seen from behind).
    put(c, ox, oy, g, 2, HEAD_Y + g.headDy, HEAD.back);
    return;
  }
  drawHead(c, ox, oy, g);
  if (g.seated) return;
  const ty = TORSO_Y + g.bodyDy;
  if (g.pose === 'celebrate') {
    put(c, ox, oy, g, 1, ty - 9 - g.armL, check('hands-up-l', ['ls', 'sS']));
    put(c, ox, oy, g, 13, ty - 9 - g.armR, check('hands-up-r', ['ls', 'sS']));
    return;
  }
  if (g.view === 'side') {
    put(c, ox, oy, g, 7 + g.armSide, ty + 6, check('hand-side', ['ls', 'sS']));
    return;
  }
  if (g.pose === 'phone') {
    put(c, ox, oy, g, 2, ty + 6 + g.armL, check('hand-l', ['ls', 'sS']));
    put(c, ox, oy, g, 12, ty - 3, check('hand-phone', ['ls', 'sS']));
    return;
  }
  put(c, ox, oy, g, 2, ty + 6 + g.armL, check('hand-l', ['ls', 'sS']));
  put(c, ox, oy, g, 12, ty + 6 + g.armR, check('hand-r', ['sS', 'SS']));
}

// --------------------------------------------------------------------------- hair

/** Hair maps start 4 rows above the head (room for buns and curls), 14 wide at x=1. */
const HAIR_Y = HEAD_Y - 4;
const HAIR = {
  short: {
    front: check('short-front', [
      '..............',
      '..............',
      '..............',
      '....hhhhhh....',
      '..hhLLLhhhhh..',
      '.hhLLhhhhhhhH.',
      '.hhLhhhhhhhHH.',
      '.hhhhhhhhhhHH.',
      '.hhH.hhh.HhHH.',
    ]),
    back: check('short-back', [
      '..............',
      '..............',
      '..............',
      '....hhhhhh....',
      '..hhhLLhhhhh..',
      '.hhhLLhhhhhhH.',
      '.hhhhhhhhhhhH.',
      '.hhhhhhhhhhhH.',
      '.hhhhhhhhhhHH.',
      '.hhhhhhhhhhHH.',
      '.HhhhhhhhhhHH.',
      '..HhhhhhhhHH..',
      '...HHHHHHHH...',
    ]),
    side: check('short-side', [
      '............',
      '............',
      '............',
      '....hhhhhh..',
      '..hhLLhhhhh.',
      '.hhLhhhhhhhH',
      '.hhhhhhhhhhH',
      '.hHhhhhhhhhH',
      '..H.hhhhhhHH',
      '.........hHH',
      '.........hHH',
      '........HHH.',
    ]),
  },
  long: {
    front: check('long-front', [
      '..............',
      '..............',
      '..............',
      '....hhhhhh....',
      '..hhLLLhhhhh..',
      '.hhLLhhhhhhhH.',
      '.hhLhhhhhhhHH.',
      '.hhhhhhhhhhHH.',
      '.hhhhhhhhhhHH.',
      '.hh........HH.',
      '.hh........HH.',
      '.hh........HH.',
      '.hH........HH.',
      '.hH........HH.',
      '.hH........HH.',
      '.hH........HH.',
      '.HH........HH.',
      '..H........H..',
    ]),
    back: check('long-back', [
      '..............',
      '..............',
      '..............',
      '....hhhhhh....',
      '..hhhLLhhhhh..',
      '.hhhLLhhhhhhH.',
      '.hhhhhhhhhhhH.',
      '.hhhhhhhhhhhH.',
      '.hhhhhhhhhhHH.',
      '.hhhhhhhhhhHH.',
      '.hhhhhhhhhhHH.',
      '.hhhLhhhhhhHH.',
      '.hhhLhhhhhhHH.',
      '.hhhhhhhhhhHH.',
      '.hhhhhhhhhhHH.',
      '.hhhhhhhhhhHH.',
      '..hhhhhhhhHH..',
      '..HHhhhhhHHH..',
      '....HHHHHH....',
    ]),
    side: check('long-side', [
      '............',
      '............',
      '............',
      '....hhhhhh..',
      '..hhLLhhhhh.',
      '.hhLhhhhhhhH',
      '.hhhhhhhhhhH',
      '.hHhhhhhhhhH',
      '..H.hhhhhhHH',
      '.........hHH',
      '.........hHH',
      '........hhHH',
      '........hhHH',
      '........hhHH',
      '........hhHH',
      '........hhHH',
      '........hHH.',
      '........HH..',
    ]),
  },
  curly: {
    front: check('curly-front', [
      '..............',
      '....hhh.hhh...',
      '..hhhLhhhhhhh.',
      '.hhLLhhhhhhhH.',
      'hhLLhhhhhhhhHH',
      'hhLhhhhhhhhhHH',
      'hhhhhhhhhhhhHH',
      'hhhhhhhhhhhhHH',
      'hHhhHhhhhHhHHH',
      'hH.........HHH',
      'hH..........HH',
      '.H..........H.',
    ]),
    back: check('curly-back', [
      '..............',
      '....hhh.hhh...',
      '..hhhLhhhhhhh.',
      '.hhLLhhhhhhhH.',
      'hhLLhhhhhhhhHH',
      'hhLhhhhhhhhhHH',
      'hhhhhhhhhhhhHH',
      'hhhhhhhhhhhhHH',
      'hhhhhLhhhhhhHH',
      'hhhhLhhhhhhhHH',
      'hHhhhhhhhhhHHH',
      '.hHhhhhhhhhHH.',
      '..HHhHHhHHHH..',
    ]),
    side: check('curly-side', [
      '............',
      '...hhh.hhh..',
      '.hhhLhhhhhh.',
      '.hhLLhhhhhhH',
      'hhLhhhhhhhhH',
      'hhhhhhhhhhhH',
      'hhhhhhhhhhHH',
      'hHhhhhhhhhHH',
      '.HHhhhhhhhHH',
      '.......hhhHH',
      '.......hhhHH',
      '........HHH.',
    ]),
  },
};
HAIR.bun = {
  front: [...HAIR.short.front],
  back: [...HAIR.short.back],
  side: [...HAIR.short.side],
};
// Ponytail: the short cut with a tail tied at the nape (seen from behind and from the side).
HAIR.ponytail = {
  front: check('ponytail-front', [
    '..............',
    '..............',
    '..............',
    '....hhhhhh....',
    '..hhhhhLLLhh..',
    '.hhhhhhhLLhhH.',
    '.hhhhhhhhhLHH.',
    '.hhhhhhhhhhHH.',
    '.hhH..hhhhhHH.',
    '.hH........HH.',
  ]),
  back: check('ponytail-back', [
    '..............',
    '..............',
    '..............',
    '....hhhhhh....',
    '..hhhLLhhhhh..',
    '.hhhLLhhhhhhH.',
    '.hhhhhhhhhhhH.',
    '.hhhhhhhhhhhH.',
    '.hhhhhLhhhhHH.',
    '.hhhhhhhhhhHH.',
    '.HhhhYYYhhhHH.',
    '..HhhhLhhhHH..',
    '...HHhhhHHH...',
    '.....hLhH.....',
    '.....hhhH.....',
    '......hHH.....',
    '......hH......',
  ]),
  side: check('ponytail-side', [
    '............',
    '............',
    '............',
    '....hhhhhh..',
    '..hhLLhhhhh.',
    '.hhLhhhhhhhH',
    '.hhhhhhhhhhH',
    '.hHhhhhhhhhH',
    '..H.hhhhhYHH',
    '.........hHH',
    '.........hhH',
    '..........hH',
    '..........hH',
    '..........H.',
  ]),
};
// Spiky: short sides, a crown of points on top.
HAIR.spiky = {
  front: check('spiky-front', [
    '..............',
    '...h..h...h...',
    '...hh.hh.hh.h.',
    '..hhhhhhhhhhh.',
    '..hhLLhhhLhhh.',
    '.hhLLhhhhhhhH.',
    '.hhLhhhhhhhHH.',
    '.hhhhhhhhhhHH.',
    '.hH..h..h..HH.',
  ]),
  back: check('spiky-back', [
    '..............',
    '...h..h...h...',
    '...hh.hh.hh.h.',
    '..hhhhhhhhhhh.',
    '..hhhLLhhhhhh.',
    '.hhhLLhhhhhhH.',
    '.hhhhhhhhhhhH.',
    '.hhhhhhhhhhhH.',
    '.hhhhhhhhhhHH.',
    '.HhhhhhhhhhHH.',
    '..HhhhhhhhHH..',
    '...HHHHHHHH...',
  ]),
  side: check('spiky-side', [
    '............',
    '...h..h..h..',
    '...hh.hh.hh.',
    '..hhhhhhhhh.',
    '..hhLLhhhhhH',
    '.hhLhhhhhhhH',
    '.hhhhhhhhhhH',
    '.hHhhhhhhhhH',
    '..H..hhhhhHH',
    '.........hHH',
    '........HHH.',
  ]),
};
// Bob: chin-length, ends turned in.
HAIR.bob = {
  front: check('bob-front', [
    '..............',
    '..............',
    '..............',
    '....hhhhhh....',
    '..hhLLLhhhhh..',
    '.hhLLhhhhhhhH.',
    '.hhLhhhhhhhHH.',
    '.hhhhhhhhhhHH.',
    '.hhhhhhhhhhHH.',
    '.hh........HH.',
    '.hh........HH.',
    '.hH........HH.',
    '.hHH......HHH.',
    '..H........H..',
  ]),
  back: check('bob-back', [
    '..............',
    '..............',
    '..............',
    '....hhhhhh....',
    '..hhhLLhhhhh..',
    '.hhhLLhhhhhhH.',
    '.hhhhhhhhhhhH.',
    '.hhhhhhhhhhhH.',
    '.hhhhhhhhhhHH.',
    '.hhhLhhhhhhHH.',
    '.hhhLhhhhhhHH.',
    '.hhhhhhhhhhHH.',
    '.HhhhhhhhhhHH.',
    '..HHHHHHHHHH..',
  ]),
  side: check('bob-side', [
    '............',
    '............',
    '............',
    '....hhhhhh..',
    '..hhLLhhhhh.',
    '.hhLhhhhhhhH',
    '.hhhhhhhhhhH',
    '.hHhhhhhhhhH',
    '..H.hhhhhhHH',
    '.........hHH',
    '........hhHH',
    '........hhHH',
    '........HHH.',
  ]),
};
const BUN = check('bun', ['.hLhH.', 'hLhhHH', 'hhhhHH', '.HHHH.']);

function drawHair(c, ox, oy, g, style) {
  const y = HAIR_Y + g.headDy;
  const view = g.view;
  const maps = HAIR[style];
  if (view === 'side') put(c, ox, oy, g, 2, y, maps.side);
  else put(c, ox, oy, g, 1, y, view === 'back' || g.pose === 'sleep' ? maps.back : maps.front);
  if (style === 'bun') {
    if (view === 'side') put(c, ox, oy, g, 8, y + 1, BUN);
    else put(c, ox, oy, g, 5, y, BUN);
  }
}

// --------------------------------------------------------------------------- outfit

const TORSO = {
  front: check('torso-front', [
    'kccSSccC',
    'kccccccC',
    'kccccccC',
    'kccccccC',
    'kccccccC',
    'kccccccC',
    'CCCCCCCC',
  ]),
  back: check('torso-back', [
    'kccccccC',
    'kccccccC',
    'kccccccC',
    'kccccccC',
    'kccccccC',
    'kccccccC',
    'CCCCCCCC',
  ]),
  side: check('torso-side', ['kcccC.', 'kccccC', 'kccccC', 'kccccC', 'kccccC', 'kccccC', 'CCCCCC']),
};
const ARM_L = check('arm-l', ['.k', 'kc', 'kc', 'kc', 'kc', 'kC']);
const ARM_R = check('arm-r', ['C.', 'cC', 'cC', 'cC', 'cC', 'CC']);
const ARM_SIDE = check('arm-side', ['kc', 'kc', 'kC', 'kC', 'kC', 'CC']);
const ARM_UP_L = check('arm-up-l', ['kc', 'kc', 'kc', 'kC', 'kC', 'kc', '.k']);
const ARM_UP_R = check('arm-up-r', ['cC', 'cC', 'cC', 'CC', 'CC', 'cC', 'C.']);
const ARM_PHONE = check('arm-phone', ['cC', 'cC', 'CC', 'Cc', 'cC', 'C.']);

/** Legs and shoes, 8 wide at x=4, rows 23..30. `lift` raises one foot by 1px. */
function legsFront(liftL, liftR) {
  const rows = [
    'bbbbbbbb',
    'qpppppPP',
    'qpP..pPP',
    'qpP..pPP',
    'qpP..pPP',
    'ppP..pPP',
    'Ooo..Ooo',
    'ooo..ooo',
  ];
  const leg = (r, side) => (side === 'L' ? r.slice(0, 3) : r.slice(5));
  const lift = (side, amount) => {
    if (!amount) return rows.map((r) => leg(r, side));
    const legRows = rows.slice(0, 2).map((r) => leg(r, side));
    const rest = rows.slice(3).map((r) => leg(r, side));
    return [...legRows, ...rest, '...'];
  };
  const L = lift('L', liftL);
  const R = lift('R', liftR);
  return rows.map((r, i) => `${L[i]}${r.slice(3, 5)}${R[i]}`);
}

/** Side legs (facing left), 8 wide at x=4: `stride` 0 = together, 1/-1 = mid step. */
function legsSide(stride) {
  if (stride === 0) {
    return check('legs-side-0', [
      '..bbbbb.',
      '..qppPP.',
      '..qppPP.',
      '..qppPP.',
      '..qppPP.',
      '..qppPP.',
      '.OooooO.',
      '.oooooo.',
    ]);
  }
  if (stride > 0) {
    return check('legs-side-1', [
      '..bbbbb.',
      '..qpppPP',
      '.qpP.PPP',
      '.qpP..PP',
      'qpP...PP',
      'qpP...oo',
      'Ooo...oo',
      'ooo.....',
    ]);
  }
  return check('legs-side-2', [
    '..bbbbb.',
    '..qppPP.',
    '..qpPPP.',
    '..qppPP.',
    '.qpPPP..',
    '.qpPPP..',
    '.Oooooo.',
    '.oooooo.',
  ]);
}

/** Profession details drawn over the front torso (8 wide at x=4). */
const FRONT_DETAIL = {
  'tech-lead': check('lead-front', [
    'kCwSSwCC',
    'kcCwwCcC',
    'kccwwccC',
    'kccwwccC',
    'kccwwccC',
    'kccwwccC',
    'CCCCCCCC',
  ]),
  analyst: check('analyst-front', [
    'kwwSSwwC',
    'kccwwccC',
    'kcccCccC',
    'kccccccC',
    'kccccccC',
    'kkkkkkkC',
    'CCCCCCCC',
  ]),
  architect: check('architect-front', [
    'kkkkkkCC',
    'kcccccCC',
    'kccccccC',
    'kccccccC',
    'kccccccC',
    'kccccccC',
    'CCCCCCCC',
  ]),
  developer: check('dev-front', [
    'CkcSScCC',
    'kcwccwcC',
    'kcwccwcC',
    'kccccccC',
    'kcCCCCcC',
    'kcCccCcC',
    'CCCCCCCC',
  ]),
  qa: check('qa-front', [
    'wwcSScWW',
    'wwkcccWW',
    'wwkcccWW',
    'wwwkcWWW',
    'wwwWWWWW',
    'wwwWWWVW',
    'wwwWWWWW',
  ]),
  support: check('support-front', [
    'kkcSSckC',
    'kcckccCC',
    'kccWccCC',
    'kccWcccC',
    'kccccccC',
    'kccccccC',
    'CCCCCCCC',
  ]),
};
const BACK_DETAIL = {
  developer: check('dev-back', [
    'CkkkkkCC',
    'kCkkkCCC',
    'kcCCCccC',
    'kccccccC',
    'kccccccC',
    'kccccccC',
    'CCCCCCCC',
  ]),
  qa: check('qa-back', [
    'wwwwwwWW',
    'wwwwwwWW',
    'wwwwwwWW',
    'wwwwwwWW',
    'wwwWwwWW',
    'wwwWwwWW',
    'wwwWwwWW',
  ]),
};
const SIDE_DETAIL = {
  developer: check('dev-side', [
    'Ckkkk.',
    'kCccC.',
    'kccccC',
    'kccccC',
    'kccccC',
    'kccccC',
    'CCCCCC',
  ]),
  qa: check('qa-side', ['wwwwW.', 'wwwwWW', 'wwwwWW', 'wwwwWW', 'wwwwWW', 'wwwwWW', 'wwwwWW']),
};
const SLEEVE = {
  qa: { l: 'w', L: 'W' },
};

/** Recolors a map's sleeve tones for coats (qa). */
function sleeves(rows, profession) {
  const s = SLEEVE[profession];
  if (!s) return rows;
  return rows.map((r) => r.replace(/[kc]/g, s.l).replace(/C/g, s.L));
}

function drawOutfit(c, ox, oy, g, profession) {
  const coat = profession === 'qa';
  const ty = TORSO_Y + g.bodyDy;
  if (g.pose === 'sleep') {
    // Back hunched over the desk, arms folded under the head.
    const torso = coat ? BACK_DETAIL.qa : TORSO.back;
    put(c, ox, oy, g, 4, ty + SEAT_DY + 1, torso.slice(0, 6));
    put(
      c,
      ox,
      oy,
      g,
      1,
      ty + SEAT_DY - 1,
      sleeves(check('fold', ['.kccccccccccC.', 'kccccccccccccC', 'CCCCCCCCCCCCCC']), profession),
    );
    return;
  }
  if (g.seated) {
    const sy = ty + SEAT_DY;
    const torso = BACK_DETAIL[profession] ?? TORSO.back;
    put(c, ox, oy, g, 4, sy, torso.slice(0, 6));
    // Upper arms reaching forward to the keyboard (hands hidden by the body).
    const armL = sleeves(check('seat-arm-l', ['.k', 'kc', 'kc', 'kC', '.C']), profession);
    const armR = sleeves(check('seat-arm-r', ['C.', 'cC', 'cC', 'CC', 'C.']), profession);
    put(c, ox, oy, g, 2, sy + 1 - g.armL, armL);
    put(c, ox, oy, g, 12, sy + 1 - g.armR, armR);
    if (g.pose === 'read') {
      // A sheet of paper held up on the right.
      put(c, ox, oy, g, 12, sy - 3 - g.armR, check('paper', ['wwW', 'wVW', 'wwW', 'wVW']));
    }
    return;
  }

  const view = g.view;
  if (view === 'side') {
    put(c, ox, oy, g, 5, ty, SIDE_DETAIL[profession] ?? TORSO.side);
    put(c, ox, oy, g, 4, ty + 7, legsSide(g.stride));
    if (coat) put(c, ox, oy, g, 5, ty + 7, check('coat-tail', ['wwwwWW', '.wwwW.']));
    put(c, ox, oy, g, 7 + g.armSide, ty, sleeves(ARM_SIDE, profession));
    return;
  }
  const torso =
    view === 'back'
      ? (BACK_DETAIL[profession] ?? TORSO.back)
      : (FRONT_DETAIL[profession] ?? TORSO.front);
  put(c, ox, oy, g, 4, ty, torso);
  put(c, ox, oy, g, 4, ty + 7, legsFront(g.legL, g.legR));
  if (coat) put(c, ox, oy, g, 4, ty + 7, check('coat-hem', ['wwwWWWWW', 'ww....WW']));
  if (g.pose === 'celebrate') {
    put(c, ox, oy, g, 1, ty - 7 - g.armL, sleeves(ARM_UP_L, profession));
    put(c, ox, oy, g, 13, ty - 7 - g.armR, sleeves(ARM_UP_R, profession));
    return;
  }
  put(c, ox, oy, g, 2, ty + g.armL, sleeves(ARM_L, profession));
  if (g.pose === 'phone') put(c, ox, oy, g, 12, ty - 3, sleeves(ARM_PHONE, profession));
  else put(c, ox, oy, g, 12, ty + g.armR, sleeves(ARM_R, profession));
}

// --------------------------------------------------------------------------- accessories

function drawAccessory(c, ox, oy, g, kind) {
  const hy = HEAD_Y + g.headDy;
  const ty = TORSO_Y + g.bodyDy;
  const view = g.view;
  if (g.pose === 'sleep') return;
  switch (kind) {
    case 'tie':
      if (view === 'front' && !g.seated)
        put(c, ox, oy, g, 7, ty, check('tie', ['TT', 'tT', 'tT', 'tT', 'tT', '.T']));
      else if (view === 'side') put(c, ox, oy, g, 5, ty + 1, check('tie-side', ['t', 't', 'T']));
      break;
    case 'glasses':
      if (view === 'front')
        put(c, ox, oy, g, 4, hy + 4, check('glasses', ['ggg..ggg', 'g.gggg.g', 'gGg..gGg']));
      else if (view === 'side')
        put(c, ox, oy, g, 2, hy + 4, check('glasses-side', ['ggg.....', 'g.gggggg', 'gGg.....']));
      break;
    case 'cap':
      if (view === 'side') {
        put(
          c,
          ox,
          oy,
          g,
          3,
          hy - 2,
          check('cap-side', ['...aaaaa..', '.azzaaaaA.', '.zaaaaaaAA', 'AAAAAAAAAA', 'AAA.......']),
        );
      } else {
        put(
          c,
          ox,
          oy,
          g,
          2,
          hy - 2,
          check('cap', ['...aaaaaa...', '.aazzaaaaaA.', '.azaaaaaaaAA', 'aaaaaaaaaaAA']),
        );
        if (view === 'front') put(c, ox, oy, g, 1, hy + 2, check('cap-brim', ['AAAAAAAAAAAAAA']));
        else put(c, ox, oy, g, 2, hy + 2, check('cap-strap', ['AAAAAAAAAAAA', '....AAAA....']));
      }
      break;
    case 'headphones':
      if (view === 'side') {
        put(c, ox, oy, g, 4, hy - 2, check('hp-side', ['..gggggg', '.g......']));
        put(
          c,
          ox,
          oy,
          g,
          8,
          hy + 4,
          check('hp-cup-side', ['.gg.', 'gfFg', 'gyfg', 'gffg', '.gg.']),
        );
      } else {
        put(
          c,
          ox,
          oy,
          g,
          2,
          hy - 2,
          check('hp-band', ['..gggggggg..', '.g........g.', 'g..........g']),
        );
        put(c, ox, oy, g, 0, hy + 3, check('hp-cup-l', ['.g', 'gf', 'yf', 'gf', '.g']));
        put(c, ox, oy, g, 14, hy + 3, check('hp-cup-r', ['g.', 'Fg', 'fy', 'fg', 'g.']));
      }
      break;
    case 'badge':
      if (g.seated) break;
      if (view === 'front')
        put(c, ox, oy, g, 9, ty, check('badge', ['V.', '.V', 'nn', 'Yn', 'nn']));
      else if (view === 'side') put(c, ox, oy, g, 6, ty + 2, check('badge-side', ['n', 'Y']));
      break;
    case 'headset':
      if (view === 'side') {
        put(c, ox, oy, g, 4, hy - 2, check('hs-side', ['..gggggg', '.g......']));
        put(c, ox, oy, g, 8, hy + 4, check('hs-cup', ['gg', 'fg', 'gg']));
        put(c, ox, oy, g, 2, hy + 7, check('hs-mic', ['r.....g.', '.ggggg..']));
      } else {
        put(
          c,
          ox,
          oy,
          g,
          2,
          hy - 2,
          check('hs-band', ['..gggggggg..', '.g........g.', 'g..........g']),
        );
        put(c, ox, oy, g, 0, hy + 3, check('hs-cup-l', ['.g', 'gF', 'gf', '.g']));
        put(c, ox, oy, g, 14, hy + 4, check('hs-cup-r', ['g.', 'g.']));
        if (view === 'front') put(c, ox, oy, g, 1, hy + 7, check('hs-mic', ['g...', '.ggr']));
      }
      break;
    default:
      break;
  }
}

// --------------------------------------------------------------------------- frames

function geometry(dir, kind, pose) {
  const g = {
    view: dir === 'up' ? 'back' : dir === 'down' ? 'front' : 'side',
    flip: dir === 'right',
    pose,
    seated: false,
    headDy: 0,
    bodyDy: 0,
    legL: 0,
    legR: 0,
    armL: 0,
    armR: 0,
    armSide: 0,
    stride: 0,
    blink: false,
    happy: false,
  };
  if (kind === 'step1') {
    g.legL = 1;
    g.armL = 1;
    g.armR = -1;
    g.stride = 1;
    g.armSide = -1;
    g.headDy = -1;
  } else if (kind === 'step2') {
    g.legR = 1;
    g.armL = -1;
    g.armR = 1;
    g.stride = -1;
    g.armSide = 1;
    g.headDy = -1;
  } else if (kind === 'breathe') {
    g.headDy = 1;
  } else if (kind === 'blink') {
    g.blink = true;
  }
  return g;
}

function poseGeometry(name) {
  const g = geometry('up', 'stand', null);
  switch (name) {
    case 'sit-type':
    case 'sit-type-b':
    case 'sit-type-c':
      g.pose = 'sit-type';
      g.seated = true;
      g.headDy = SEAT_DY;
      if (name === 'sit-type-b') g.armL = 1;
      if (name === 'sit-type-c') {
        g.armR = 1;
        g.headDy = SEAT_DY + 1;
      }
      break;
    case 'read':
    case 'read-b':
      g.pose = 'read';
      g.seated = true;
      g.headDy = SEAT_DY + 1;
      if (name === 'read-b') g.armR = 1;
      break;
    case 'phone':
      g.pose = 'phone';
      break;
    case 'sleep':
    case 'sleep-b':
      g.pose = 'sleep';
      g.seated = true;
      g.headDy = SEAT_DY + 4 + (name === 'sleep-b' ? 1 : 0);
      g.bodyDy = name === 'sleep-b' ? 1 : 0;
      break;
    case 'celebrate':
    case 'celebrate-b': {
      const front = geometry('down', 'stand', 'celebrate');
      front.happy = true;
      if (name === 'celebrate-b') {
        front.headDy = -1;
        front.bodyDy = -1;
        front.armL = 1;
        front.armR = 1;
      }
      return front;
    }
    default:
      break;
  }
  return g;
}

export function makeSheet(drawLayer) {
  const rows = Math.ceil(FRAME_COUNT / COLUMNS);
  const c = createCanvas(COLUMNS * FW, rows * FH);
  const frame = (index, g) =>
    drawLayer(c, (index % COLUMNS) * FW, Math.floor(index / COLUMNS) * FH, g);
  const kinds = ['stand', 'step1', 'step2'];
  for (const dir of DIRS) {
    for (const [i, index] of WALK[dir].entries()) frame(index, geometry(dir, kinds[i], null));
    frame(IDLE[dir][0], geometry(dir, 'breathe', null));
    frame(IDLE[dir][1], geometry(dir, dir === 'up' ? 'stand' : 'blink', null));
  }
  for (const [name, index] of Object.entries(POSES)) frame(index, poseGeometry(name));
  return c;
}

export const layers = {
  body: (c, ox, oy, g) => drawBody(c, ox, oy, g),
  hair: (style) => (c, ox, oy, g) => drawHair(c, ox, oy, g, style),
  outfit: (profession) => (c, ox, oy, g) => drawOutfit(c, ox, oy, g, profession),
  accessory: (kind) => (c, ox, oy, g) => drawAccessory(c, ox, oy, g, kind),
};
