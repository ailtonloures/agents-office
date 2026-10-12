// Pure view math for the hero office: zoom, smooth positions, sprite frame picking, monitor
// modes and the reduced-motion frame. No DOM, canvas or clock (callers inject `nowMs`), so it is
// unit-testable in node. The canvas code that consumes it lives in `officeRenderer.ts`.
import type { Role } from '../components/roles';
import {
  type ActivityKind,
  CYCLE_MS,
  type Facing,
  GRID_COLS,
  GRID_ROWS,
  pathToDesk,
  SCRIPT,
  type SceneAgent,
  STEP_MS,
  sceneAt,
  TILE_SIZE,
  type Tile,
} from './officeLogic';

export const SCENE_WIDTH = GRID_COLS * TILE_SIZE;
export const SCENE_HEIGHT = GRID_ROWS * TILE_SIZE;

/** Highest integer zoom the canvas is displayed at (a hero never needs more). */
export const MAX_ZOOM = 6;
/** Device pixel ratio above this is ignored: it only costs fill rate on a 320x192 scene. */
export const MAX_DPR = 2;

/** Integer display zoom for a container `containerWidth` CSS pixels wide (at least 1). */
export function computeZoom(containerWidth: number, maxZoom: number = MAX_ZOOM): number {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) return 1;
  return Math.max(1, Math.min(Math.floor(maxZoom), Math.floor(containerWidth / SCENE_WIDTH)));
}

/**
 * Backing store pixels per logical pixel: the CSS zoom times the (capped) device pixel ratio,
 * rounded so every logical pixel covers a whole number of backing pixels.
 */
export function computeRenderScale(zoom: number, dpr: number, maxDpr: number = MAX_DPR): number {
  const ratio = Number.isFinite(dpr) && dpr > 1 ? Math.min(dpr, maxDpr) : 1;
  return Math.max(1, Math.round(zoom * ratio));
}

// ---- Smooth positions ----------------------------------------------------

const FACING_DELTA: Readonly<Record<Facing, readonly [number, number]>> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

const SCRIPT_BY_ID = new Map(SCRIPT.map((entry) => [entry.id, entry]));

/**
 * How far (0..1) a walking agent is through its current one-tile step. `sceneAt` only reports the
 * tile the step started on, so the fraction is rebuilt from the script timing. Seated agents (and
 * unknown ids) return 0.
 */
export function stepFraction(agent: SceneAgent, cycleMs: number): number {
  if (agent.pose !== 'walking') return 0;
  const entry = SCRIPT_BY_ID.get(agent.id);
  if (!entry) return 0;
  let elapsed: number;
  if (agent.state === 'entering') {
    elapsed = cycleMs - entry.enterAtMs;
  } else {
    // Leaving starts after the entering walk, the work and the report.
    const walkMs = walkDurationMs(entry.desk);
    elapsed = cycleMs - entry.enterAtMs - walkMs - entry.workMs - entry.reportMs;
  }
  if (elapsed < 0) return 0;
  return (elapsed % STEP_MS) / STEP_MS;
}

/** Duration of one full walk (door to desk) of a scripted agent. */
function walkDurationMs(desk: Tile): number {
  return (pathToDesk(desk).length - 1) * STEP_MS;
}

export interface PixelPoint {
  x: number;
  y: number;
}

/**
 * Writes into `out` the pixel position (top-left of the agent's tile, in scene pixels) of `agent`,
 * sliding towards the next tile while it walks. Reuses `out`, so it does not allocate.
 */
export function agentPosition(agent: SceneAgent, cycleMs: number, out: PixelPoint): PixelPoint {
  const frac = stepFraction(agent, cycleMs);
  const [dx, dy] = FACING_DELTA[agent.facing];
  out.x = Math.round(agent.tile.x * TILE_SIZE + dx * TILE_SIZE * frac);
  out.y = Math.round(agent.tile.y * TILE_SIZE + dy * TILE_SIZE * frac);
  return out;
}

// ---- Sprite frames -------------------------------------------------------

export interface CharacterFrames {
  readonly walk: Readonly<Record<Facing, readonly number[]>>;
  readonly poses: Readonly<Record<string, number>>;
}

const WALK_FPS = 7;
const TYPE_FPS = 7;
/** Walk cycle over the 3 frames of a direction: stand, step, stand, other step. */
const WALK_SEQUENCE = [0, 1, 0, 2] as const;
const READ_LONG_MS = 2400;
const READ_SHORT_MS = 500;
const SIT_LONG_MS = 2600;
const SIT_SHORT_MS = 160;

/** Small stable offset per agent id so seated characters do not move in unison. */
export function phaseOf(id: string): number {
  let sum = 0;
  for (let i = 0; i < id.length; i++) sum = (sum * 31 + id.charCodeAt(i)) % 9973;
  return sum;
}

/** The frame of the character sheet to draw for `agent` at `nowMs`. */
export function characterFrame(agent: SceneAgent, nowMs: number, frames: CharacterFrames): number {
  const t = nowMs + phaseOf(agent.id);
  const { poses, walk } = frames;
  if (agent.pose === 'walking') {
    const row = walk[agent.facing];
    const step = Math.floor((t * WALK_FPS) / 1000) % WALK_SEQUENCE.length;
    return row[WALK_SEQUENCE[step] ?? 0] ?? 0;
  }
  const typeA = poses['sit-type'] ?? 0;
  const typeB = poses['sit-type-b'] ?? typeA;
  const typeC = poses['sit-type-c'] ?? typeA;
  switch (agent.activity) {
    case 'reading': {
      const phase = t % (READ_LONG_MS + READ_SHORT_MS);
      return phase < READ_LONG_MS
        ? (poses.read ?? typeA)
        : (poses['read-b'] ?? poses.read ?? typeA);
    }
    case 'thinking':
    case 'waiting': {
      const phase = t % (SIT_LONG_MS + SIT_SHORT_MS);
      return phase < SIT_LONG_MS ? typeA : typeB;
    }
    default: {
      const step = Math.floor((t * TYPE_FPS) / 1000) % 4;
      return step === 1 ? typeB : step === 3 ? typeC : typeA;
    }
  }
}

// ---- Layers and looks ----------------------------------------------------

/** Skin layers (file names without extension) composed, bottom first, for a character. */
export function layerFiles(role: Role, hairStyle: number, hairCount: number): string[] {
  const hair = ((hairStyle % hairCount) + hairCount) % hairCount;
  return ['body', `outfit-${role}`, `hair-${hair}`, `accessory-${role}`];
}

/** Indexes into the skin palettes (wrapped when the palette is shorter) plus the hair style. */
export interface LookIndexes {
  readonly hairStyle: number;
  readonly skin: number;
  readonly hair: number;
  readonly shirt: number;
  readonly pants: number;
}

/** Fixed, varied looks for the six roles (so the hero never shows two identical people). */
export const LOOKS: Readonly<Record<Role, LookIndexes>> = {
  'tech-lead': { hairStyle: 0, skin: 2, hair: 0, shirt: 0, pants: 0 },
  analyst: { hairStyle: 1, skin: 0, hair: 2, shirt: 1, pants: 1 },
  architect: { hairStyle: 2, skin: 3, hair: 1, shirt: 2, pants: 2 },
  developer: { hairStyle: 3, skin: 1, hair: 5, shirt: 5, pants: 0 },
  qa: { hairStyle: 4, skin: 4, hair: 3, shirt: 3, pants: 3 },
  support: { hairStyle: 5, skin: 5, hair: 6, shirt: 4, pants: 1 },
};

/** Picks `list[index]` wrapping around; `fallback` for an empty list. */
export function wrapPick(list: readonly string[], index: number, fallback = '#808080'): string {
  if (list.length === 0) return fallback;
  return list[((index % list.length) + list.length) % list.length] ?? fallback;
}

// ---- Monitors ------------------------------------------------------------

export type ScreenMode = 'off' | 'code' | 'terminal' | 'read' | 'think' | 'wait' | 'dashboard';

export function screenModeFor(activity: ActivityKind | null): ScreenMode {
  switch (activity) {
    case 'typing':
      return 'code';
    case 'terminal':
      return 'terminal';
    case 'reading':
      return 'read';
    case 'thinking':
      return 'think';
    case 'waiting':
      return 'wait';
    default:
      return 'off';
  }
}

/** Second monitor of a multi-screen desk: a dashboard while the main one is busy. */
export function secondaryMode(primary: ScreenMode): ScreenMode {
  return primary === 'code' || primary === 'terminal' || primary === 'read' ? 'dashboard' : primary;
}

// ---- Reduced motion ------------------------------------------------------

/** Scan step used to look for the most populated moment of the cycle. */
const STATIC_SCAN_MS = 100;

/**
 * Cycle time with the most agents seated at their desks (the earliest such moment), used as the
 * single representative frame when the visitor prefers reduced motion.
 */
export function representativeTimeMs(): number {
  let best = 0;
  let bestCount = -1;
  for (let t = 0; t < CYCLE_MS; t += STATIC_SCAN_MS) {
    const count = sceneAt(t).agents.filter((a) => a.pose === 'seated').length;
    if (count > bestCount) {
      bestCount = count;
      best = t;
    }
  }
  return best;
}
