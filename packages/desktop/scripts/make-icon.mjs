// Generates resources/icon.png (512x512): a pixel-art office window, original art released as CC0.
// Run `node scripts/make-icon.mjs` to regenerate; the PNG is committed.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SIZE = 512;
const GRID = 32; // art grid, each cell is 16x16 pixels
const CELL = SIZE / GRID;
const pixels = Buffer.alloc(SIZE * SIZE * 4);

const hex = (value) => [(value >> 16) & 255, (value >> 8) & 255, value & 255];
function rect(x0, y0, x1, y1, color) {
  const [r, g, b] = hex(color);
  for (let y = y0 * CELL; y < y1 * CELL; y++) {
    for (let x = x0 * CELL; x < x1 * CELL; x++) {
      const i = (y * SIZE + x) * 4;
      pixels[i] = r;
      pixels[i + 1] = g;
      pixels[i + 2] = b;
      pixels[i + 3] = 255;
    }
  }
}

const frame = 0x2b2f4a;
rect(2, 3, 30, 29, frame);
rect(4, 5, 28, 27, 0xe8e6f0); // wall
rect(6, 7, 14, 15, 0x5ba8d8); // windows
rect(18, 7, 26, 15, 0x5ba8d8);
rect(14, 7, 18, 15, 0xe8e6f0);
rect(6, 10, 26, 11, 0xe8e6f0);
rect(6, 19, 26, 22, 0x8a5a3c); // desk
rect(8, 22, 10, 26, 0x6b4429);
rect(22, 22, 24, 26, 0x6b4429);
rect(12, 15, 16, 19, 0xf2c14e); // a worker
rect(12, 13, 16, 15, 0xf0d2b4);
rect(21, 16, 25, 19, 0x4a3cb8); // monitor-side stack
rect(23, 25, 28, 29, 0xf2c14e); // gold "pending" dot, as on the tray icon
rect(25, 24, 28, 27, 0xf2c14e);

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
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;
ihdr[9] = 6; // RGBA
const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0;
  pixels.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);
mkdirSync(join(root, 'resources'), { recursive: true });
writeFileSync(join(root, 'resources', 'icon.png'), png);
console.log('wrote resources/icon.png');
