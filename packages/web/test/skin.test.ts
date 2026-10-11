import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { planSkinAssets, registerPropFrames } from '../src/skin/assets';
import { loadSkinManifest } from '../src/skin/loader';
import { EXTRA_POSE_IDS, parseSkin, tileFrame } from '../src/skin/schema';
import { PROP_DEFS } from '../src/world/props';

// biome-ignore lint/suspicious/noExplicitAny: loose JSON so tests can mutate arbitrary fields
type Json = any;

const defaultJson: Json = JSON.parse(
  readFileSync(join(import.meta.dirname, '../public/skins/default/skin.json'), 'utf8'),
);

function fakeFetch(routes: Record<string, unknown | 'invalid-json'>): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (!(url in routes)) return new Response('not found', { status: 404 });
    const body = routes[url];
    return new Response(body === 'invalid-json' ? '{oops' : JSON.stringify(body), { status: 200 });
  }) as unknown as typeof fetch;
}

describe('parseSkin', () => {
  it('accepts the bundled default skin', () => {
    const result = parseSkin(defaultJson);
    expect(result.ok).toBe(true);
  });

  it.each([
    ['missing tile', (s: Json) => delete s.tileset.tiles.desk],
    [
      'wrong tile size',
      (s: Json) => {
        s.tileSize = 8;
      },
    ],
    ['missing outfit', (s: Json) => delete s.characters.outfit.qa],
    [
      'no hair',
      (s: Json) => {
        s.characters.hair = [];
      },
    ],
    [
      'path traversal',
      (s: Json) => {
        s.tileset.image = '../x.png';
      },
    ],
    [
      'absolute url',
      (s: Json) => {
        s.font.image = 'https://evil.test/f.png';
      },
    ],
    [
      'bad walk',
      (s: Json) => {
        s.characters.walk.up = [1, 2];
      },
    ],
  ])('rejects: %s', (_name, mutate) => {
    const copy = structuredClone(defaultJson);
    mutate(copy);
    const result = parseSkin(copy);
    expect(result.ok).toBe(false);
  });

  it('exposes base colors and palettes of the default skin', () => {
    const result = parseSkin(defaultJson);
    if (!result.ok) throw new Error(result.error);
    expect(result.skin.characters.baseColors.skin).toBe('#ff00ff');
    expect(result.skin.characters.palettes.shirt.length).toBeGreaterThan(1);
  });

  it('stays backwards compatible: skins without palettes get the defaults', () => {
    const copy = structuredClone(defaultJson);
    delete copy.characters.baseColors;
    delete copy.characters.palettes;
    const result = parseSkin(copy);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.skin.characters.palettes.skin.length).toBeGreaterThan(0);
  });

  it('describes the v4 default skin: 16x32 frames, idle frames, extra poses and head anchors', () => {
    const result = parseSkin(defaultJson);
    if (!result.ok) throw new Error(result.error);
    const { characters } = result.skin;
    expect(result.skin.version).toBe(4);
    expect(characters.frame).toEqual({ width: 16, height: 32 });
    for (const dir of ['down', 'left', 'right', 'up'] as const) {
      expect(characters.idle?.[dir].length).toBeGreaterThan(0);
    }
    for (const pose of EXTRA_POSE_IDS) expect(characters.poses[pose]).toBeTypeOf('number');
    expect(characters.head.seatedTop).toBeGreaterThan(characters.head.top);
    expect(characters.baseColors.skinLight).toBe('#ff80ff');
  });

  it('has a props atlas with a frame for every prop the layout places', () => {
    const result = parseSkin(defaultJson);
    if (!result.ok) throw new Error(result.error);
    const frames = result.skin.props?.frames ?? {};
    for (const id of Object.keys(PROP_DEFS)) {
      const frame = frames[id];
      expect(frame, id).toBeDefined();
      if (!frame) continue;
      // The anchor (bottom-left of the footprint) lies inside the frame.
      expect(frame.ax).toBeGreaterThanOrEqual(0);
      expect(frame.ax).toBeLessThan(frame.w);
      expect(frame.ay).toBeLessThanOrEqual(frame.h);
    }
  });

  it('still accepts a v3-style skin (no props atlas, no oriented walls)', () => {
    const v3 = structuredClone(defaultJson);
    v3.version = 3;
    delete v3.props;
    for (const id of [
      'wall-side-l',
      'wall-side-r',
      'wall-bottom',
      'wall-corner-tl',
      'wall-corner-tr',
    ])
      delete v3.tileset.tiles[id];
    const result = parseSkin(v3);
    if (!result.ok) throw new Error(result.error);
    expect(result.skin.props).toBeUndefined();
    // Side walls fall back to the slab, which is there; corners to the wall face.
    expect(tileFrame(result.skin, 'wall-side-l')).toBe(tileFrame(result.skin, 'wall-cap'));
    expect(tileFrame(result.skin, 'wall-corner-tl')).toBe(tileFrame(result.skin, 'wall'));
    delete v3.tileset.tiles['wall-cap'];
    const bare = parseSkin(v3);
    if (!bare.ok) throw new Error(bare.error);
    // ...and, two steps down the chain, to the core wall.
    expect(tileFrame(bare.skin, 'wall-bottom')).toBe(tileFrame(bare.skin, 'wall'));
    expect(planSkinAssets(bare.skin, '/').some((a) => a.key === 'skin.props')).toBe(false);
  });

  it('still accepts a v2-style skin (16x24, no idle, no extra poses, no wood tiles)', () => {
    const v2 = structuredClone(defaultJson);
    v2.version = 2;
    v2.characters.frame = { width: 16, height: 24 };
    v2.characters.columns = 4;
    delete v2.characters.idle;
    delete v2.characters.head;
    for (const pose of EXTRA_POSE_IDS) delete v2.characters.poses[pose];
    for (const key of ['skinLight', 'shirtLight', 'pantsLight'])
      delete v2.characters.baseColors[key];
    delete v2.tileset.tiles.wood;
    delete v2.tileset.tiles['wood-b'];
    const result = parseSkin(v2);
    if (!result.ok) throw new Error(result.error);
    expect(result.skin.characters.idle).toBeUndefined();
    expect(result.skin.characters.head).toEqual({ top: 1, seatedTop: 1 });
    expect(result.skin.characters.baseColors.shirtLight).toBe('#80ffff');
    // The lobby's wood falls back to the core floor tile.
    expect(tileFrame(result.skin, 'wood')).toBe(tileFrame(result.skin, 'floor'));
  });

  it('rejects malformed palette colors', () => {
    const copy = structuredClone(defaultJson);
    copy.characters.palettes.skin = ['red'];
    expect(parseSkin(copy).ok).toBe(false);
  });

  it('rejects non-objects without throwing', () => {
    expect(parseSkin(null).ok).toBe(false);
    expect(parseSkin('x').ok).toBe(false);
  });
});

describe('loadSkinManifest', () => {
  const ext = '/skin/skin.json';
  const def = '/skins/default/skin.json';

  it('uses the default when no external skin exists', async () => {
    const loaded = await loadSkinManifest({ fetch: fakeFetch({ [def]: defaultJson }) });
    expect(loaded.source).toBe('default');
    expect(loaded.baseUrl).toBe('/skins/default/');
    expect(loaded.warning).toBeUndefined();
  });

  it('prefers a valid external skin', async () => {
    const external = { ...structuredClone(defaultJson), name: 'Custom' };
    const loaded = await loadSkinManifest({
      fetch: fakeFetch({ [ext]: external, [def]: defaultJson }),
    });
    expect(loaded.source).toBe('external');
    expect(loaded.skin.name).toBe('Custom');
    expect(loaded.baseUrl).toBe('/skin/');
  });

  it('falls back to the default with a warning on an invalid external skin', async () => {
    const bad = structuredClone(defaultJson);
    delete bad.tileset.tiles.floor;
    const loaded = await loadSkinManifest({ fetch: fakeFetch({ [ext]: bad, [def]: defaultJson }) });
    expect(loaded.source).toBe('default');
    expect(loaded.warning).toMatch(/Invalid external skin/);

    const broken = await loadSkinManifest({
      fetch: fakeFetch({ [ext]: 'invalid-json', [def]: defaultJson }),
    });
    expect(broken.source).toBe('default');
    expect(broken.warning).toMatch(/not valid JSON/);
  });

  it('treats network errors on the external skin as absent', async () => {
    const doFetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === ext) throw new TypeError('network');
      return new Response(JSON.stringify(defaultJson));
    }) as unknown as typeof fetch;
    const loaded = await loadSkinManifest({ fetch: doFetch });
    expect(loaded.source).toBe('default');
    expect(loaded.warning).toBeUndefined();
  });

  it('throws when the default skin is unavailable', async () => {
    await expect(loadSkinManifest({ fetch: fakeFetch({}) })).rejects.toThrow(
      /default skin not found/,
    );
  });
});

describe('planSkinAssets', () => {
  it('lists tileset, body, hair, outfits, accessories and the font with absolute urls', () => {
    const parsed = parseSkin(defaultJson);
    if (!parsed.ok) throw new Error(parsed.error);
    const assets = planSkinAssets(parsed.skin, '/skins/default/');
    const keys = assets.map((a) => a.key);
    expect(keys).toContain('skin.tileset');
    expect(keys).toContain('skin.outfit.tech-lead');
    expect(keys).toContain('skin.accessory.qa');
    expect(keys).toContain('skin.font');
    expect(assets.every((a) => a.url.startsWith('/skins/default/'))).toBe(true);
    expect(keys).toContain('skin.props');
    // Tileset, body, 7 hair styles, 6 outfits, 6 accessories, 3 fonts, props.
    expect(assets).toHaveLength(1 + 1 + 7 + 6 + 6 + 3 + 1);
  });
});

describe('registerPropFrames', () => {
  it('names one frame per prop in the loaded atlas, once', () => {
    const parsed = parseSkin(defaultJson);
    if (!parsed.ok) throw new Error(parsed.error);
    const added = new Map<string, number[]>();
    const textures = {
      exists: (key: string) => key === 'skin.props',
      get: () => ({
        has: (name: string) => added.has(name),
        add: (name: string, _source: number, x: number, y: number, w: number, h: number) =>
          added.set(name, [x, y, w, h]),
      }),
    };
    registerPropFrames(textures, parsed.skin);
    registerPropFrames(textures, parsed.skin);
    const frames = parsed.skin.props?.frames ?? {};
    expect(added.size).toBe(Object.keys(frames).length);
    const desk = frames.workstation;
    expect(added.get('workstation')).toEqual([desk?.x, desk?.y, desk?.w, desk?.h]);
  });
});
