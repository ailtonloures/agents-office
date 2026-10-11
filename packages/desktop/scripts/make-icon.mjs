// Generates the Agents Office logo (original art released as CC0): a pixel-art office building on a
// rounded indigo tile. Its lit windows are agents at work, and the gold ring at the door is the
// status ring the characters wear in the office.
// Run `node scripts/make-icon.mjs` to regenerate; the outputs are committed:
//   resources/icon.png                 512x512 desktop app icon (electron-builder)
//   ../web/public/favicon.svg|-32.png  simplified 16-cell variant, legible at tab size
//   ../../assets/logo.svg|.png         README logo
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(root, '..', '..');

const C = {
  bgTop: 0x353a66,
  bgBottom: 0x141626,
  roof: 0x8b7cf6,
  roofShade: 0x6a5ad8,
  wall: 0xeeecf6,
  wallShade: 0xc9c5de,
  dark: 0x2a2d44,
  gold: 0xf0c040,
  goldLight: 0xffe08a,
  blue: 0x5ba8d8,
  blueLight: 0x9ad1ff,
  skin: 0xf0d2b4,
  shirt: 0x4a3cb8,
  door: 0x3b3f66,
};

/** A logo: `grid` cells per side, background corner radius in cells and pixel-art cells. */
function art(grid, radius, draw) {
  const cells = new Map();
  const rect = (x0, y0, x1, y1, color) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) cells.set(`${x},${y}`, color);
  };
  // Flattened ring around (cx, cy), drawn only where nothing is painted yet (behind the building).
  const ring = (cx, cy, rx, ry, color) => {
    for (let y = 0; y < grid; y++) {
      for (let x = 0; x < grid; x++) {
        const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
        if (d >= 0.55 && d <= 1.05 && !cells.has(`${x},${y}`)) cells.set(`${x},${y}`, color);
      }
    }
  };
  draw(rect, ring);
  return { grid, radius, cells };
}

const window4 = (rect, x, y, color, light) => {
  rect(x, y, x + 4, y + 3, color);
  if (light) rect(x, y, x + 2, y + 1, light);
};

const logo = art(32, 7.5, (rect, ring) => {
  rect(6, 6, 26, 8, C.roof); // roof slab
  rect(6, 7, 26, 8, C.roofShade);
  rect(15, 4, 17, 6, C.roof); // antenna
  rect(15, 3, 17, 4, C.gold);
  rect(7, 8, 25, 26, C.wall); // facade
  rect(23, 8, 25, 26, C.wallShade);
  window4(rect, 9, 10, C.gold, C.goldLight);
  window4(rect, 14, 10, C.blue, C.blueLight);
  window4(rect, 19, 10, C.dark);
  window4(rect, 9, 15, C.dark);
  window4(rect, 14, 15, C.gold, C.goldLight);
  window4(rect, 19, 15, C.blue, C.blueLight);
  rect(15, 11, 17, 12, C.skin); // the Tech Lead at the top window
  rect(15, 12, 17, 13, C.shirt);
  rect(13, 20, 19, 26, C.door);
  rect(14, 21, 18, 26, C.dark);
  rect(17, 23, 18, 24, C.gold); // door knob
  ring(16, 26, 11, 3, C.gold);
});

const favicon = art(16, 3.5, (rect) => {
  rect(3, 2, 13, 3, C.roof);
  rect(4, 3, 12, 13, C.wall);
  rect(11, 3, 12, 13, C.wallShade);
  rect(5, 4, 7, 6, C.gold);
  rect(9, 4, 11, 6, C.blue);
  rect(5, 7, 7, 9, C.blue);
  rect(9, 7, 11, 9, C.gold);
  rect(7, 10, 9, 13, C.dark);
  rect(2, 12, 4, 14, C.gold); // the status ring, as a plain arc at this size
  rect(12, 12, 14, 14, C.gold);
  rect(4, 13, 12, 14, C.gold);
});

const hex = (value) => [(value >> 16) & 255, (value >> 8) & 255, value & 255];
const css = (value) => `#${value.toString(16).padStart(6, '0')}`;

function toSvg({ grid, radius, cells }) {
  const rows = [];
  for (let y = 0; y < grid; y++) {
    // Merge horizontal runs of the same color to keep the file small.
    let x = 0;
    while (x < grid) {
      const color = cells.get(`${x},${y}`);
      if (color === undefined) {
        x++;
        continue;
      }
      let end = x + 1;
      while (end < grid && cells.get(`${end},${y}`) === color) end++;
      rows.push(`<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${css(color)}"/>`);
      x = end;
    }
  }
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${grid} ${grid}" width="512" height="512">`,
    '<title>Agents Office</title>',
    `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${css(C.bgTop)}"/><stop offset="1" stop-color="${css(C.bgBottom)}"/></linearGradient></defs>`,
    `<rect width="${grid}" height="${grid}" rx="${radius}" fill="url(#bg)"/>`,
    `<g shape-rendering="crispEdges">${rows.join('')}</g>`,
    '</svg>',
    '',
  ].join('\n');
}

function toPixels({ grid, radius, cells }, size) {
  const pixels = Buffer.alloc(size * size * 4);
  const cell = size / grid;
  const r = radius * cell;
  const top = hex(C.bgTop);
  const bottom = hex(C.bgBottom);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      // Signed distance to the rounded square, for an anti-aliased edge.
      const qx = Math.max(Math.abs(px + 0.5 - size / 2) - (size / 2 - r), 0);
      const qy = Math.max(Math.abs(py + 0.5 - size / 2) - (size / 2 - r), 0);
      const coverage = Math.min(Math.max(r - Math.hypot(qx, qy) + 0.5, 0), 1);
      if (coverage === 0) continue;
      const t = (py + 0.5) / size;
      let rgb = top.map((value, k) => Math.round(value + (bottom[k] - value) * t));
      const color = cells.get(`${Math.floor(px / cell)},${Math.floor(py / cell)}`);
      if (color !== undefined) rgb = hex(color);
      const i = (py * size + px) * 4;
      pixels[i] = rgb[0];
      pixels[i + 1] = rgb[1];
      pixels[i + 2] = rgb[2];
      pixels[i + 3] = Math.round(coverage * 255);
    }
  }
  return pixels;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, tail]);
}
function toPng(logoArt, size) {
  const pixels = toPixels(logoArt, size);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outputs = [
  [join(root, 'resources', 'icon.png'), () => toPng(logo, 512)],
  [join(repo, 'assets', 'logo.png'), () => toPng(logo, 512)],
  [join(repo, 'assets', 'logo.svg'), () => toSvg(logo)],
  [join(repo, 'packages', 'web', 'public', 'favicon.svg'), () => toSvg(favicon)],
  [join(repo, 'packages', 'web', 'public', 'favicon-32.png'), () => toPng(favicon, 32)],
];
for (const [path, render] of outputs) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, render());
  console.log(`wrote ${path.slice(repo.length + 1)}`);
}
