import { describe, expect, it } from 'vitest';
import {
  CYCLE_MS,
  GRID_COLS,
  type SceneAgent,
  STEP_MS,
  sceneAt,
  TILE_SIZE,
} from '../src/pixel/officeLogic';
import {
  agentPosition,
  type CharacterFrames,
  characterFrame,
  computeRenderScale,
  computeZoom,
  LOOKS,
  layerFiles,
  MAX_ZOOM,
  type PixelPoint,
  representativeTimeMs,
  SCENE_WIDTH,
  screenModeFor,
  secondaryMode,
  stepFraction,
  wrapPick,
} from '../src/pixel/sceneView';
import {
  applyPaletteSwap,
  frameRects,
  hexToRgb,
  outlineFrames,
  type SkinColors,
  swapTableFor,
} from '../src/pixel/spriteTint';

const FRAMES: CharacterFrames = {
  walk: { down: [0, 1, 2], left: [6, 7, 8], right: [12, 13, 14], up: [18, 19, 20] },
  poses: { 'sit-type': 24, 'sit-type-b': 25, 'sit-type-c': 26, read: 27, 'read-b': 28 },
};

describe('computeZoom', () => {
  it('is floor(width / 320), at least 1 and at most the cap', () => {
    expect(SCENE_WIDTH).toBe(GRID_COLS * TILE_SIZE);
    expect(computeZoom(0)).toBe(1);
    expect(computeZoom(Number.NaN)).toBe(1);
    expect(computeZoom(200)).toBe(1);
    expect(computeZoom(639)).toBe(1);
    expect(computeZoom(640)).toBe(2);
    expect(computeZoom(1000)).toBe(3);
    expect(computeZoom(10_000)).toBe(MAX_ZOOM);
    expect(computeZoom(10_000, 4)).toBe(4);
  });

  it('caps the device pixel ratio and keeps whole backing pixels', () => {
    expect(computeRenderScale(3, 1)).toBe(3);
    expect(computeRenderScale(3, 2)).toBe(6);
    expect(computeRenderScale(3, 4)).toBe(6);
    expect(computeRenderScale(1, 1.5)).toBe(2);
    expect(computeRenderScale(2, 0)).toBe(2);
  });
});

describe('agentPosition', () => {
  const out: PixelPoint = { x: 0, y: 0 };

  it('moves smoothly between tiles while walking and stays on the grid', () => {
    let previous: PixelPoint | null = null;
    for (let t = 0; t < CYCLE_MS; t += 20) {
      const snap = sceneAt(t);
      for (const a of snap.agents.filter((x) => x.id === 'developer')) {
        const p = { ...agentPosition(a, snap.cycleMs, out) };
        if (a.pose === 'walking' && previous) {
          // At most one tile of travel per 220 ms step, never a jump.
          expect(Math.abs(p.x - previous.x) + Math.abs(p.y - previous.y)).toBeLessThanOrEqual(
            Math.ceil((TILE_SIZE * 20) / STEP_MS) + 1,
          );
        }
        previous = p;
      }
    }
  });

  it('sits exactly on the desk tile and has a zero step fraction when seated', () => {
    const snap = sceneAt(0);
    const lead = snap.agents.find((a) => a.id === 'tech-lead') as SceneAgent;
    expect(stepFraction(lead, snap.cycleMs)).toBe(0);
    agentPosition(lead, snap.cycleMs, out);
    expect(out).toEqual({ x: lead.tile.x * TILE_SIZE, y: lead.tile.y * TILE_SIZE });
  });

  it('reaches the next tile at the end of a step (fraction in [0, 1))', () => {
    for (let t = 0; t < CYCLE_MS; t += 40) {
      const snap = sceneAt(t);
      for (const a of snap.agents) {
        const f = stepFraction(a, snap.cycleMs);
        expect(f).toBeGreaterThanOrEqual(0);
        expect(f).toBeLessThan(1);
      }
    }
  });

  it('is continuous across a tile boundary for entering and leaving agents', () => {
    for (const id of ['analyst', 'support']) {
      let last: PixelPoint | null = null;
      for (let t = 0; t < CYCLE_MS; t += 10) {
        const snap = sceneAt(t);
        const a = snap.agents.find((x) => x.id === id);
        if (a?.pose !== 'walking') {
          last = null;
          continue;
        }
        const p = { ...agentPosition(a, snap.cycleMs, out) };
        if (last) expect(Math.abs(p.x - last.x) + Math.abs(p.y - last.y)).toBeLessThanOrEqual(2);
        last = p;
      }
    }
  });
});

describe('characterFrame', () => {
  const agent = (over: Partial<SceneAgent>): SceneAgent => ({
    id: 'x',
    role: 'developer',
    state: 'working',
    activity: 'typing',
    pose: 'seated',
    facing: 'up',
    tile: { x: 0, y: 0 },
    ring: 'green',
    ...over,
  });

  it('walks through the facing row of the sheet', () => {
    for (let t = 0; t < 2000; t += 50) {
      const f = characterFrame(
        agent({ pose: 'walking', facing: 'left', activity: null }),
        t,
        FRAMES,
      );
      expect(FRAMES.walk.left).toContain(f);
    }
  });

  it('uses typing frames when typing and the read pose when reading', () => {
    const typing = new Set<number>();
    for (let t = 0; t < 2000; t += 20) typing.add(characterFrame(agent({}), t, FRAMES));
    expect([...typing].every((f) => [24, 25, 26].includes(f))).toBe(true);
    expect(typing.size).toBeGreaterThan(1);
    const reading = new Set<number>();
    for (let t = 0; t < 6000; t += 20) {
      reading.add(characterFrame(agent({ activity: 'reading' }), t, FRAMES));
    }
    expect([...reading].every((f) => [27, 28].includes(f))).toBe(true);
  });

  it('falls back to the typing pose when a sheet has fewer poses', () => {
    const sparse: CharacterFrames = { walk: FRAMES.walk, poses: { 'sit-type': 5 } };
    expect(characterFrame(agent({ activity: 'reading' }), 100, sparse)).toBe(5);
    expect(characterFrame(agent({ activity: 'thinking' }), 100, sparse)).toBe(5);
  });
});

describe('looks and layers', () => {
  it('lists the layers bottom first and wraps the hair style', () => {
    expect(layerFiles('qa', 4, 6)).toEqual(['body', 'outfit-qa', 'hair-4', 'accessory-qa']);
    expect(layerFiles('qa', 8, 6)[2]).toBe('hair-2');
    expect(layerFiles('qa', -1, 6)[2]).toBe('hair-5');
  });

  it('gives every role a distinct look', () => {
    const keys = Object.values(LOOKS).map((l) => JSON.stringify(l));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('wraps palette picks', () => {
    expect(wrapPick(['a', 'b'], 3)).toBe('b');
    expect(wrapPick(['a', 'b'], -1)).toBe('b');
    expect(wrapPick([], 0, '#111111')).toBe('#111111');
  });
});

describe('monitors', () => {
  it('maps activities to modes', () => {
    expect(screenModeFor('typing')).toBe('code');
    expect(screenModeFor('terminal')).toBe('terminal');
    expect(screenModeFor('reading')).toBe('read');
    expect(screenModeFor('thinking')).toBe('think');
    expect(screenModeFor('waiting')).toBe('wait');
    expect(screenModeFor(null)).toBe('off');
    expect(secondaryMode('code')).toBe('dashboard');
    expect(secondaryMode('off')).toBe('off');
  });
});

describe('representativeTimeMs', () => {
  it('picks a moment with most agents seated', () => {
    const t = representativeTimeMs();
    expect(t).toBeGreaterThanOrEqual(0);
    expect(t).toBeLessThan(CYCLE_MS);
    const seated = sceneAt(t).agents.filter((a) => a.pose === 'seated').length;
    expect(seated).toBeGreaterThanOrEqual(4);
  });
});

describe('spriteTint', () => {
  const base: SkinColors = {
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
  const look = { skin: '#f7d9c4', hair: '#26211f', shirt: '#3b5b92', pants: '#2b303d' };

  it('swaps key colors, keeps other and transparent pixels', () => {
    const [sr, sg, sb] = hexToRgb(look.skin);
    const data = new Uint8ClampedArray([
      0xff,
      0x00,
      0xff,
      255, // skin key
      1,
      2,
      3,
      255, // unrelated
      0xff,
      0x00,
      0xff,
      0, // transparent key: untouched
    ]);
    applyPaletteSwap(data, swapTableFor(base, look));
    expect([...data.slice(0, 4)]).toEqual([sr, sg, sb, 255]);
    expect([...data.slice(4, 8)]).toEqual([1, 2, 3, 255]);
    expect([...data.slice(8, 12)]).toEqual([0xff, 0x00, 0xff, 0]);
  });

  it('outlines inside each frame without bleeding into the next', () => {
    // Two 3x1 frames side by side: [., X, .] [X, ., .]. The first frame's right edge must not
    // be outlined by the second frame's opaque pixel.
    const w = 6;
    const data = new Uint8ClampedArray(w * 4);
    data.set([200, 100, 50, 255], 1 * 4);
    data.set([200, 100, 50, 255], 3 * 4);
    outlineFrames(data, w, frameRects(2, 2, 3, 1));
    const alpha = (x: number) => data[x * 4 + 3];
    expect([alpha(0), alpha(1), alpha(2)]).toEqual([255, 255, 255]);
    expect([alpha(3), alpha(4), alpha(5)]).toEqual([255, 255, 0]);
  });
});
