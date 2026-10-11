// Minimal RGBA canvas + PNG encoder (no dependencies) used by the default skin generator.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

export const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'public',
  'skins',
  'default',
);

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}
export function encodePng(canvas) {
  const { w, h, data } = canvas;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(data.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export function createCanvas(w, h) {
  return { w, h, data: new Uint8Array(w * h * 4) };
}

/** `#rrggbb` or `#rrggbbaa` -> [r, g, b, a]. */
export function hex(color) {
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
    color.length > 7 ? Number.parseInt(color.slice(7, 9), 16) : 255,
  ];
}

/** Sets one pixel. A translucent color is blended over what is already there. */
export function px(c, x, y, color) {
  if (x < 0 || y < 0 || x >= c.w || y >= c.h) return;
  const [r, g, b, a] = hex(color);
  const i = (y * c.w + x) * 4;
  if (a === 255) {
    c.data.set([r, g, b, 255], i);
    return;
  }
  const below = c.data[i + 3];
  const out = a + below * (1 - a / 255);
  if (out === 0) return;
  for (const [k, v] of [r, g, b].entries()) {
    c.data[i + k] = Math.round((v * a + c.data[i + k] * below * (1 - a / 255)) / out);
  }
  c.data[i + 3] = Math.round(out);
}

export function rect(c, x, y, w, h, color) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(c, x + i, y + j, color);
}

/**
 * Draws a pixel map: one string per row, one character per pixel, `.` is transparent and any
 * other character is looked up in `legend` (character -> `#rrggbb[aa]`).
 */
export function art(c, x, y, rows, legend) {
  rows.forEach((row, j) => {
    [...row].forEach((ch, i) => {
      if (ch === '.' || ch === ' ') return;
      const color = legend[ch];
      if (!color) throw new Error(`art: no color for "${ch}"`);
      px(c, x + i, y + j, color);
    });
  });
}

export function write(relative, buffer) {
  const path = join(OUT, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buffer);
}
export const png = (relative, canvas) => write(relative, encodePng(canvas));

/** Nearest-neighbour upscale (previews only). */
export function upscale(c, k) {
  const out = createCanvas(c.w * k, c.h * k);
  for (let y = 0; y < out.h; y++) {
    for (let x = 0; x < out.w; x++) {
      const s = (Math.floor(y / k) * c.w + Math.floor(x / k)) * 4;
      out.data.set(c.data.subarray(s, s + 4), (y * out.w + x) * 4);
    }
  }
  return out;
}
