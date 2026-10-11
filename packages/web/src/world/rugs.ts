import type Phaser from 'phaser';

const mix = (a: number, b: number, t: number): number => {
  const ch = (shift: number) =>
    Math.round(((a >> shift) & 0xff) * (1 - t) + ((b >> shift) & 0xff) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};
const css = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

export const rugKey = (kind: string, w: number, h: number, accent: number): string =>
  `rug:${kind}:${w}x${h}:${accent.toString(16)}`;

/**
 * Draws (once) a rug texture of `w`x`h` pixels. Room rugs are a calm carpet barely tinted by the
 * room's accent, with a slim accent border; the lobby rug is deep slate with a warm gold trim.
 * Returns its key.
 */
export function ensureRugTexture(
  textures: Phaser.Textures.TextureManager,
  kind: 'rug' | 'lobby',
  w: number,
  h: number,
  accent: number,
): string {
  const key = rugKey(kind, w, h, accent);
  if (textures.exists(key)) return key;
  const texture = textures.createCanvas(key, w, h);
  if (!texture) return key;
  const ctx = texture.getContext();
  const lobby = kind === 'lobby';
  const base = lobby ? 0x6c7a96 : mix(0xc6cbd4, accent, 0.14);
  const weave = lobby ? 0x7685a1 : mix(base, 0xffffff, 0.1);
  const band = lobby ? 0x58657f : mix(base, accent, 0.45);
  const line = lobby ? 0xe8d6a8 : mix(accent, 0xffffff, 0.45);
  const box = (x: number, y: number, bw: number, bh: number, color: number, alpha = 1) => {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = css(color);
    ctx.fillRect(x, y, bw, bh);
    ctx.globalAlpha = 1;
  };
  // Rounded body, a fine diagonal weave, then the border band and a thin bright line inside it.
  box(1, 0, w - 2, h, base);
  box(0, 1, w, h - 2, base);
  for (let y = 3; y < h - 3; y += 1) {
    for (let x = 3; x < w - 3; x += 1) if ((x + y * 3) % 6 === 0) box(x, y, 1, 1, weave);
  }
  box(1, 0, w - 2, 2, band);
  box(1, h - 2, w - 2, 2, band);
  box(0, 1, 2, h - 2, band);
  box(w - 2, 1, 2, h - 2, band);
  const lineAlpha = lobby ? 0.8 : 0.45;
  box(3, 3, w - 6, 1, line, lineAlpha);
  box(3, h - 4, w - 6, 1, line, lineAlpha);
  box(3, 3, 1, h - 6, line, lineAlpha);
  box(w - 4, 3, 1, h - 6, line, lineAlpha);
  // Lift on the top edge, contact shade on the bottom one.
  box(2, 0, w - 4, 1, 0xffffff, 0.12);
  box(1, h - 1, w - 2, 1, 0x0e1120, 0.25);
  texture.refresh();
  return key;
}

/** Radial vignette that darkens the corners of the screen a little. */
export function ensureVignette(
  textures: Phaser.Textures.TextureManager,
  w: number,
  h: number,
): string {
  const key = `vignette:${w}x${h}`;
  if (textures.exists(key)) return key;
  const texture = textures.createCanvas(key, w, h);
  if (!texture) return key;
  const ctx = texture.getContext();
  const gradient = ctx.createRadialGradient(w / 2, h / 2, h * 0.55, w / 2, h / 2, w * 0.7);
  gradient.addColorStop(0, 'rgba(10,12,28,0)');
  gradient.addColorStop(1, 'rgba(10,12,28,0.32)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
  texture.refresh();
  return key;
}

const VIGNETTE_PREFIX = 'vignette:';

/** Removes every `vignette:*` texture except `keepKey` (the one in use). */
export function removeStaleVignettes(
  textures: Pick<Phaser.Textures.TextureManager, 'getTextureKeys' | 'remove'>,
  keepKey: string,
): void {
  for (const key of textures.getTextureKeys()) {
    if (key.startsWith(VIGNETTE_PREFIX) && key !== keepKey) textures.remove(key);
  }
}

/** Points the image at the vignette for the new size, then drops the old textures. */
export function applyVignette(
  textures: Phaser.Textures.TextureManager,
  image: { setTexture(key: string): unknown },
  w: number,
  h: number,
): void {
  const key = ensureVignette(textures, w, h);
  image.setTexture(key);
  removeStaleVignettes(textures, key);
}

export const SHADOW_KEY = 'shadow';
export const RING_KEY = 'status-ring';

/** White pixel ellipse (16x7) drawn under a character's feet, tinted by its status. */
export function ensureRing(textures: Phaser.Textures.TextureManager): string {
  if (textures.exists(RING_KEY)) return RING_KEY;
  const texture = textures.createCanvas(RING_KEY, 16, 7);
  if (!texture) return RING_KEY;
  const ctx = texture.getContext();
  const rows: readonly string[] = [
    '....######....',
    '..##......##..',
    '.#..........#.',
    '#............#',
    '.#..........#.',
    '..##......##..',
    '....######....',
  ];
  ctx.fillStyle = '#ffffff';
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === '#') ctx.fillRect(x + 1, y, 1, 1);
    });
  });
  // A faint fill so the ring reads as a glow on the floor, not just a line.
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  rows.forEach((row, y) => {
    const first = row.indexOf('#');
    const last = row.lastIndexOf('#');
    if (y > 0 && y < rows.length - 1 && last - first > 1) {
      ctx.fillRect(first + 2, y, last - first - 1, 1);
    }
  });
  texture.refresh();
  return RING_KEY;
}

/** Soft elliptical ground shadow placed under characters. */
export function ensureShadow(textures: Phaser.Textures.TextureManager): string {
  if (textures.exists(SHADOW_KEY)) return SHADOW_KEY;
  const texture = textures.createCanvas(SHADOW_KEY, 14, 6);
  if (!texture) return SHADOW_KEY;
  const ctx = texture.getContext();
  const ring = [
    [3, 0, 8],
    [1, 1, 12],
    [0, 2, 14],
    [0, 3, 14],
    [1, 4, 12],
    [3, 5, 8],
  ] as const;
  ctx.fillStyle = 'rgba(10,12,28,0.32)';
  for (const [x, y, w] of ring) ctx.fillRect(x, y, w, 1);
  texture.refresh();
  return SHADOW_KEY;
}
