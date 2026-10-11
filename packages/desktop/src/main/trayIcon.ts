export interface TrayIcon {
  width: number;
  height: number;
  /** BGRA, premultiplied alpha is not needed (pixels are either opaque or transparent). */
  bitmap: Buffer;
}

const SIZE = 32;

/**
 * Draws the tray icon (a little office window) without image assets. When requests are pending a
 * gold dot appears in the corner, which is the "state" of the icon.
 */
export function renderTrayIcon(pending: number, size = SIZE): TrayIcon {
  const bitmap = Buffer.alloc(size * size * 4);
  const put = (x: number, y: number, [r, g, b]: readonly [number, number, number]): void => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    bitmap[i] = b;
    bitmap[i + 1] = g;
    bitmap[i + 2] = r;
    bitmap[i + 3] = 255;
  };
  const u = size / 16;
  const rect = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    color: readonly [number, number, number],
  ) => {
    for (let y = Math.round(y0 * u); y < Math.round(y1 * u); y++)
      for (let x = Math.round(x0 * u); x < Math.round(x1 * u); x++) put(x, y, color);
  };
  const frame = [0x2b, 0x2f, 0x4a] as const;
  const wall = [0xe8, 0xe6, 0xf0] as const;
  const glass = [0x5b, 0xa8, 0xd8] as const;
  rect(1, 2, 15, 14, frame);
  rect(2, 3, 14, 13, wall);
  rect(3, 4, 7, 8, glass);
  rect(9, 4, 13, 8, glass);
  rect(3, 9, 13, 12, [0xc9, 0x8b, 0x4b]);
  if (pending > 0) {
    const cx = 12 * u;
    const cy = 4 * u;
    const radius = 3.6 * u;
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++)
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= radius ** 2) put(x, y, [0xff, 0xc8, 0x3d]);
  }
  return { width: size, height: size, bitmap };
}
