import { describe, expect, it } from 'vitest';
import { applyVignette, removeStaleVignettes } from '../src/world/rugs';

/** Minimal stand-in for Phaser's TextureManager, tracking only the keys. */
function fakeTextures() {
  const keys = new Set<string>(['__DEFAULT', 'shadow']);
  const textures = {
    exists: (k: string) => keys.has(k),
    createCanvas: (k: string) => {
      keys.add(k);
      return { getContext: () => fakeCtx, refresh: () => {} };
    },
    getTextureKeys: () => [...keys],
    remove: (k: string) => keys.delete(k),
  };
  return { keys, textures: textures as unknown as Phaser.Textures.TextureManager };
}

const fakeCtx = {
  createRadialGradient: () => ({ addColorStop: () => {} }),
  fillRect: () => {},
  fillStyle: '',
};

describe('vignette textures', () => {
  it('keeps only the current vignette after several size changes', () => {
    const { keys, textures } = fakeTextures();
    const image = {
      key: '',
      setTexture(k: string) {
        this.key = k;
        return this;
      },
    };
    const sizes: [number, number][] = [
      [800, 600],
      [900, 600],
      [1000, 700],
      [900, 600],
      [1200, 800],
    ];
    for (const [w, h] of sizes) {
      applyVignette(textures, image, w, h);
      expect(image.key).toBe(`vignette:${w}x${h}`);
    }
    expect([...keys].filter((k) => k.startsWith('vignette:'))).toEqual(['vignette:1200x800']);
    expect(keys.has('shadow')).toBe(true);
  });

  it('never removes the texture in use', () => {
    const { keys, textures } = fakeTextures();
    keys.add('vignette:1x1');
    keys.add('vignette:2x2');
    removeStaleVignettes(textures, 'vignette:2x2');
    expect([...keys].filter((k) => k.startsWith('vignette:'))).toEqual(['vignette:2x2']);
  });
});
