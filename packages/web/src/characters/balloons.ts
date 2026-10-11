import type Phaser from 'phaser';

/**
 * Status balloons (11x9) drawn procedurally from the pixel maps below, so they need no extra skin
 * assets (original art, CC0 like the rest of the default skin). Speech bubbles for thinking,
 * sleeping and the delivered report; round badges for waiting and errors. `K` outline, `W`
 * white, `w` paper shade, `Y`/`y` amber, `R`/`r` red, `B` blue, `.` transparent.
 */
export const BALLOON_WIDTH = 11;
export const BALLOON_HEIGHT = 9;

export const BALLOON_IDS = ['think', 'wait', 'error', 'sleep', 'doc'] as const;
export type BalloonId = (typeof BALLOON_IDS)[number];

export const BALLOON_PIXELS: Readonly<Record<BalloonId, readonly string[]>> = {
  // "..." inside a speech bubble.
  think: [
    '.KKKKKKKKK.',
    'KWWWWWWWWWK',
    'KWWBWBWBWWK',
    'KWWWWWWWWWK',
    'KwwwwwwwwwK',
    '.KKKKKKKKK.',
    '..KWK......',
    '..KK.......',
    '...........',
  ],
  // Amber badge with an exclamation mark.
  wait: [
    '...KKKKK...',
    '..KYYKYYK..',
    '.KYYYKYYyK.',
    '.KYYYKYYyK.',
    '.KYYYYYYyK.',
    '.KYYYKYYyK.',
    '..KyyyyyK..',
    '...KKKKK...',
    '...........',
  ],
  // Red badge with a white cross.
  error: [
    '...KKKKK...',
    '..KRRRRRK..',
    '.KRWRRRWrK.',
    '.KRRWRWRrK.',
    '.KRRRWRRrK.',
    '.KRRWRWRrK.',
    '..KWrrrWK..',
    '...KKKKK...',
    '...........',
  ],
  // "z" inside a speech bubble.
  sleep: [
    '.KKKKKKKKK.',
    'KWWWWWWWWWK',
    'KWWBBBBWWWK',
    'KWWWWBWWWWK',
    'KWWWBWWWWWK',
    'KwwBBBBwwwK',
    '.KKKKKKKKK.',
    '..KWK......',
    '..KK.......',
  ],
  // Report document with a folded corner.
  doc: [
    '..KKKKKK...',
    '..KWWWWKK..',
    '..KWKKWWKK.',
    '..KWWWWWWK.',
    '..KWKKKKWK.',
    '..KWWWWWWK.',
    '..KwKKKKwK.',
    '..KwwwwwwK.',
    '..KKKKKKKK.',
  ],
};

const COLORS: Readonly<Record<string, string>> = {
  K: '#1b1e2b',
  W: '#ffffff',
  w: '#dfe4ee',
  Y: '#f6c945',
  y: '#d39b1f',
  R: '#e5544b',
  r: '#b8352e',
  B: '#4f8fe8',
};

export const balloonTextureKey = (id: BalloonId): string => `balloon-${id}`;

/** Registers one canvas texture per balloon (idempotent). */
export function createBalloonTextures(textures: Phaser.Textures.TextureManager): void {
  for (const id of BALLOON_IDS) {
    const key = balloonTextureKey(id);
    if (textures.exists(key)) continue;
    const texture = textures.createCanvas(key, BALLOON_WIDTH, BALLOON_HEIGHT);
    if (!texture) continue;
    const ctx = texture.getContext();
    BALLOON_PIXELS[id].forEach((row, y) => {
      Array.from(row).forEach((cell, x) => {
        const color = COLORS[cell];
        if (!color) return;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      });
    });
    texture.refresh();
  }
}
