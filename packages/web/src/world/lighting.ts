import Phaser from 'phaser';
import { type BuildingLayout, type Tile, WALL_ROWS } from './roomLayout';

const TILE = 16;
export const LIGHT_DEPTH = { ceiling: 1.55, shadow: 1.6, window: 1.8, glow: 3.5 } as const;
const WINDOW_KEY = 'light:window';
const LAMP_KEY = 'light:lamp';
const SCREEN_KEY = 'light:screen';
const CEILING_KEY = 'light:ceiling';
/** Spacing of the ceiling lights, in tiles. */
const CEILING_STEP = { x: 8, y: 6 } as const;
export const DOT_KEY = 'px:dot';
export const Z_KEY = 'px:z';

/** 1px white dot and a tiny "z" (particles: steam, confetti, sleep). */
export function ensureParticleTextures(textures: Phaser.Textures.TextureManager): void {
  if (!textures.exists(DOT_KEY)) {
    const dot = textures.createCanvas(DOT_KEY, 1, 1);
    if (dot) {
      const ctx = dot.getContext();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 1, 1);
      dot.refresh();
    }
  }
  if (!textures.exists(Z_KEY)) {
    const z = textures.createCanvas(Z_KEY, 4, 4);
    if (z) {
      const ctx = z.getContext();
      ctx.fillStyle = '#5a7bd0';
      for (const [x, y, w] of [
        [0, 0, 4],
        [2, 1, 1],
        [1, 2, 1],
        [0, 3, 4],
      ] as const) {
        ctx.fillRect(x, y, w, 1);
      }
      z.refresh();
    }
  }
}
/**
 * Rows of the soft shadow a wall casts on the floor right below it (alpha per row): 6 rows, so
 * the tall wall (slab, face, skirting) sits on the floor with some weight.
 */
const WALL_SHADOW = [0.32, 0.2, 0.12, 0.07, 0.035, 0.015] as const;
/** Walls seen from above (no face): they cast no shadow on the floor below them. */
const TOP_ONLY_WALLS = new Set(['wall-cap', 'wall-side-l', 'wall-side-r', 'wall-bottom']);
/** Same depth formula as the characters (feet line), so lights sit right on top of their prop. */
const propDepth = (bottomY: number): number => 4 + bottomY / 10_000 + 0.00002;

/**
 * Where the light sources sit, relative to their tile: the plain tiles draw the monitor, lamp
 * shade and coffee machine inside the tile; the props atlas draws them taller, above it.
 */
const OFFSETS = {
  tiles: { screen: 5, lamp: -12, steam: 2 },
  props: { screen: -9, lamp: -32, steam: -14 },
} as const;
const SIDE_SHADOW = [0.14, 0.06] as const;

/** Radial blob of `w`x`h` in `rgb`, fading from `alpha` at the centre to 0. */
function ensureGlowTexture(
  textures: Phaser.Textures.TextureManager,
  key: string,
  w: number,
  h: number,
  rgb: string,
  alpha: number,
): void {
  if (textures.exists(key)) return;
  const texture = textures.createCanvas(key, w, h);
  if (!texture) return;
  const ctx = texture.getContext();
  const r = Math.max(w, h) / 2;
  const gradient = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, r);
  gradient.addColorStop(0, `rgba(${rgb},${alpha})`);
  gradient.addColorStop(0.55, `rgba(${rgb},${alpha * 0.45})`);
  gradient.addColorStop(1, `rgba(${rgb},0)`);
  ctx.setTransform(w / (2 * r), 0, 0, h / (2 * r), 0, 0);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 2 * r, 2 * r);
  texture.refresh();
}

/** Daylight falling through a window: a trapezoid that widens and fades into the room. */
function ensureWindowTexture(textures: Phaser.Textures.TextureManager): void {
  if (textures.exists(WINDOW_KEY)) return;
  const w = 30;
  const h = 40;
  const texture = textures.createCanvas(WINDOW_KEY, w, h);
  if (!texture) return;
  const ctx = texture.getContext();
  for (let y = 0; y < h; y += 1) {
    const t = y / (h - 1);
    const half = 6 + t * 9;
    const alpha = 0.2 * (1 - t) ** 1.4;
    ctx.fillStyle = `rgba(255,248,226,${alpha.toFixed(3)})`;
    ctx.fillRect(Math.round(w / 2 - half), y, Math.round(half * 2), 1);
  }
  texture.refresh();
}

/**
 * Light and depth painted over the tilemap, rebuilt whenever the layout changes: soft shadows
 * cast by the walls, daylight under the windows, warm halos around lamps and the cool glow of the
 * monitors (pulsing while someone works at them). Everything is plain textures (no shaders), so
 * it renders the same with WebGL and Canvas.
 */
export class Lighting {
  private readonly shadows: Phaser.GameObjects.Graphics;
  private readonly lights: Phaser.GameObjects.Image[] = [];
  private readonly screens = new Map<string, Phaser.GameObjects.Image>();
  private readonly steam = new Map<string, Phaser.GameObjects.Particles.ParticleEmitter>();
  private clock = 0;

  private readonly offsets: (typeof OFFSETS)[keyof typeof OFFSETS];

  /** `props`: the skin draws the furniture from its props atlas (taller art, depth-sorted). */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly props = false,
  ) {
    this.offsets = props ? OFFSETS.props : OFFSETS.tiles;
    ensureWindowTexture(scene.textures);
    ensureGlowTexture(scene.textures, LAMP_KEY, 44, 36, '255,214,150', 0.28);
    // White, tinted per screen with the color of what it shows.
    ensureGlowTexture(scene.textures, SCREEN_KEY, 24, 18, '255,255,255', 0.42);
    ensureGlowTexture(scene.textures, CEILING_KEY, 120, 76, '255,246,226', 0.09);
    ensureParticleTextures(scene.textures);
    this.shadows = scene.add.graphics().setDepth(LIGHT_DEPTH.shadow);
  }

  sync(layout: BuildingLayout): void {
    const { walls, furniture, floor } = layout.layers;
    const g = this.shadows.clear();
    const at = (layer: typeof walls, x: number, y: number) => layer[y]?.[x] ?? null;
    for (let y = 0; y < layout.height; y += 1) {
      for (let x = 0; x < layout.width; x += 1) {
        if (!at(floor, x, y) || at(walls, x, y)) continue;
        const above = at(walls, x, y - 1);
        if (above && !TOP_ONLY_WALLS.has(above)) {
          WALL_SHADOW.forEach((alpha, i) => {
            g.fillStyle(0x0e1120, alpha).fillRect(x * TILE, y * TILE + i, TILE, 1);
          });
        }
        if (at(walls, x - 1, y) === 'wall-cap') {
          SIDE_SHADOW.forEach((alpha, i) => {
            g.fillStyle(0x0e1120, alpha).fillRect(x * TILE + i, y * TILE, 1, TILE);
          });
        }
      }
    }

    for (const light of this.lights) light.destroy();
    this.lights.length = 0;
    const glowDepth = (y: number) => (this.props ? propDepth((y + 1) * TILE) : LIGHT_DEPTH.glow);
    const add = (key: string, x: number, y: number, depth: number) => {
      this.lights.push(
        this.scene.add
          .image(x, y, key)
          .setOrigin(0.5, 0)
          .setDepth(depth)
          .setBlendMode(Phaser.BlendModes.ADD),
      );
    };
    for (let y = 0; y < layout.height; y += 1) {
      for (let x = 0; x < layout.width; x += 1) {
        const wall = at(walls, x, y);
        if (wall === 'window') {
          // The light falls on the floor right below the (tall) wall the window is in.
          let base = y + 1;
          while (at(walls, x, base)) base += 1;
          if (at(floor, x, base)) {
            add(WINDOW_KEY, x * TILE + TILE / 2, base * TILE, LIGHT_DEPTH.window);
          }
        }
        if (at(furniture, x, y) === 'lamp') {
          add(LAMP_KEY, x * TILE + TILE / 2, y * TILE + this.offsets.lamp, glowDepth(y));
        }
      }
    }

    // Soft pools of light from the ceiling over the lobby and every room.
    for (const area of [layout.lobby, ...layout.rooms.map((room) => room.bounds)]) {
      for (let ty = area.y + WALL_ROWS + 1; ty < area.y + area.h - 1; ty += CEILING_STEP.y) {
        for (const tx of [area.x + 4, area.x + 12]) {
          this.lights.push(
            this.scene.add
              .image(tx * TILE, ty * TILE, CEILING_KEY)
              .setDepth(LIGHT_DEPTH.ceiling)
              .setBlendMode(Phaser.BlendModes.ADD),
          );
        }
      }
    }

    // Monitor glows: one per computer tile, kept across rebuilds.
    const wanted = new Set<string>();
    for (let y = 0; y < layout.height; y += 1) {
      for (let x = 0; x < layout.width; x += 1) {
        if (at(furniture, x, y) !== 'computer') continue;
        const key = `${x},${y}`;
        wanted.add(key);
        if (this.screens.has(key)) continue;
        const image = this.scene.add
          .image(x * TILE + TILE / 2, y * TILE + this.offsets.screen, SCREEN_KEY)
          .setOrigin(0.5, 0.5)
          .setDepth(glowDepth(y))
          .setBlendMode(Phaser.BlendModes.ADD)
          .setAlpha(0.35);
        this.screens.set(key, image);
      }
    }
    for (const [key, image] of this.screens) {
      if (wanted.has(key)) continue;
      image.destroy();
      this.screens.delete(key);
    }

    // A wisp of steam over every coffee machine.
    const machines = new Set<string>();
    for (let y = 0; y < layout.height; y += 1) {
      for (let x = 0; x < layout.width; x += 1) {
        if (at(furniture, x, y) !== 'coffee') continue;
        const key = `${x},${y}`;
        machines.add(key);
        if (this.steam.has(key)) continue;
        const emitter = this.scene.add
          .particles(x * TILE + 8, y * TILE + this.offsets.steam, DOT_KEY, {
            speedY: { min: -9, max: -5 },
            speedX: { min: -2, max: 2 },
            lifespan: 1600,
            frequency: 380,
            alpha: { start: 0.55, end: 0 },
            scale: { start: 1, end: 2 },
            tint: 0xffffff,
          })
          .setDepth(glowDepth(y));
        this.steam.set(key, emitter);
      }
    }
    for (const [key, emitter] of this.steam) {
      if (machines.has(key)) continue;
      emitter.destroy();
      this.steam.delete(key);
    }
  }

  /**
   * Monitors in use (`glows`: seat tiles and the color of what the screen shows) cast their
   * light on the desk and flicker softly; the others stay dark.
   */
  update(delta: number, glows: readonly { tile: Tile; color: number }[]): void {
    this.clock += delta;
    const lit = new Map(glows.map((g) => [`${g.tile.x},${g.tile.y - 1}`, g.color]));
    for (const [key, image] of this.screens) {
      const [x = 0, y = 0] = key.split(',').map(Number);
      const flicker = 0.8 + 0.2 * Math.sin(this.clock / 170 + x * 1.7 + y * 0.9);
      const color = lit.get(key);
      if (color === undefined) {
        image.setAlpha(0.08).setTint(0xffffff);
      } else {
        image.setAlpha(0.85 * flicker).setTint(color);
      }
    }
  }

  setVisible(visible: boolean): void {
    this.shadows.setVisible(visible);
    for (const light of this.lights) light.setVisible(visible);
    for (const image of this.screens.values()) image.setVisible(visible);
  }

  destroy(): void {
    this.shadows.destroy();
    for (const light of this.lights) light.destroy();
    for (const image of this.screens.values()) image.destroy();
    for (const emitter of this.steam.values()) emitter.destroy();
    this.lights.length = 0;
    this.screens.clear();
    this.steam.clear();
  }
}
