// Tileset of the default skin: a light, modern tech office in a 3/4 top-down view. Calm floors
// (honey-oak herringbone in the rooms, polished concrete, pale oak in the lobby), off-white walls with a
// slate top, pale wood desks, graphite tech and soft contact shadows under every piece.
import { art, createCanvas, px, rect } from './canvas.mjs';

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
];
export const TILE_IDS = [...CORE_TILE_IDS, ...EXTRA_TILE_IDS];
export const TILE_COLUMNS = 8;

const C = {
  // walls: off-white face, slate top
  wall: '#eceef2',
  wallS: '#e0e3e9',
  wallD: '#cdd2db',
  wallHi: '#f8f9fb',
  capTop: '#6f7a95',
  cap: '#646f8a',
  capLo: '#4b546d',
  capHi: '#8b95ad',
  skirt: '#4b5266',
  skirtHi: '#666e84',
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
const noise = (i, j, seed) => ((i * 73856093) ^ (j * 19349663) ^ (seed * 83492791)) >>> 0;

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

function wallFace(c, x, y) {
  rect(c, x, y, 16, 1, C.capHi);
  rect(c, x, y + 1, 16, 2, C.capTop);
  rect(c, x, y + 3, 16, 1, C.capLo);
  // Off-white face, darker right under the slab (ambient occlusion).
  rect(c, x, y + 4, 16, 1, C.wallD);
  rect(c, x, y + 5, 16, 1, C.wallS);
  rect(c, x, y + 6, 16, 7, C.wall);
  rect(c, x, y + 9, 16, 1, C.wallHi);
  // Skirting board.
  rect(c, x, y + 13, 16, 1, C.wallS);
  rect(c, x, y + 14, 16, 1, C.skirtHi);
  rect(c, x, y + 15, 16, 1, C.skirt);
}

/**
 * Top of a side wall seen from above: a slim slate band on the tile's outer edge (left or right),
 * the rest left transparent so the floor shows, with a soft occlusion on the floor beside it.
 */
function sideBand(c, x, y, left, h = 16) {
  const bx = left ? x : x + 10;
  rect(c, bx, y, 6, h, C.cap);
  rect(c, bx + 1, y, 4, h, C.capTop);
  rect(c, left ? bx : bx + 5, y, 1, h, C.capLo);
  rect(c, left ? bx + 5 : bx, y, 1, h, C.capHi);
  const ao = [`${C.ao}30`, `${C.ao}18`, `${C.ao}0a`];
  ao.forEach((color, i) => {
    rect(c, left ? x + 6 + i : x + 9 - i, y, 1, h, color);
  });
}

const drawWall = {
  wall: wallFace,
  'wall-side-l': (c, x, y) => sideBand(c, x, y, true),
  'wall-side-r': (c, x, y) => sideBand(c, x, y, false),
  'wall-bottom'(c, x, y) {
    // Top of the wall (same slate as the sides), then the building's outer facade.
    rect(c, x, y, 16, 6, C.capTop);
    rect(c, x, y, 16, 1, C.capHi);
    rect(c, x, y + 5, 16, 1, C.capLo);
    rect(c, x, y + 6, 16, 10, '#3d4459');
    rect(c, x, y + 6, 16, 1, '#2c3245');
    rect(c, x, y + 7, 16, 1, '#353c50');
    rect(c, x + 7, y + 8, 1, 8, '#363d51');
    rect(c, x, y + 15, 16, 1, '#2c3245');
  },
  'wall-corner-tl'(c, x, y) {
    wallFace(c, x, y);
    sideBand(c, x, y + 4, true, 12);
    rect(c, x, y, 6, 4, C.capTop);
    rect(c, x, y, 6, 1, C.capHi);
  },
  'wall-corner-tr'(c, x, y) {
    wallFace(c, x, y);
    sideBand(c, x, y + 4, false, 12);
    rect(c, x + 10, y, 6, 4, C.capTop);
    rect(c, x + 10, y, 6, 1, C.capHi);
  },
  'wall-cap'(c, x, y) {
    rect(c, x, y, 16, 16, C.cap);
    rect(c, x, y, 16, 1, C.capHi);
    rect(c, x, y + 1, 16, 1, C.capTop);
    rect(c, x, y + 15, 16, 1, C.capLo);
  },
  window(c, x, y) {
    wallFace(c, x, y);
    // Slim white frame, a sky gradient with a hazy skyline, two reflections and a sill.
    rect(c, x + 1, y + 4, 14, 10, C.l0);
    const sky = [
      '#7dbbe6',
      '#8ac3ea',
      '#98cbee',
      '#a7d3f1',
      '#b5daf3',
      '#c2e1f5',
      '#cde6f6',
      '#d6ebf7',
    ];
    sky.forEach((color, j) => {
      rect(c, x + 2, y + 5 + j, 12, 1, color);
    });
    art(c, x + 2, y + 9, ['...##.......', '.#.##..#.##.', '##.###.####.', '############'], {
      '#': '#a9c8de',
    });
    for (let i = 0; i < 4; i++) px(c, x + 3 + i, y + 9 - i, '#eaf6ff');
    for (let i = 0; i < 3; i++) px(c, x + 10 + i, y + 11 - i, '#eaf6ff');
    rect(c, x + 7, y + 5, 2, 8, C.l0);
    rect(c, x + 8, y + 5, 1, 8, C.l1);
    rect(c, x + 2, y + 5, 12, 1, '#6aa6d4');
    rect(c, x, y + 13, 16, 1, C.l0);
    rect(c, x + 1, y + 14, 14, 1, AO1);
  },
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
    rect(c, x, y, 16, 1, C.capHi);
    rect(c, x, y + 1, 16, 2, C.capTop);
    rect(c, x, y + 3, 16, 1, C.capLo);
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
