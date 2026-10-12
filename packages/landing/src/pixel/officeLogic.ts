// Pure logic for the hero office scene: no React, DOM, Date or performance.
// The caller injects the time (`nowMs`) and renders the returned snapshot.
import type { Role } from '../components/roles';

export type AgentRole = Role;
export type AgentState = 'entering' | 'working' | 'reporting' | 'leaving';
export type ActivityKind = 'typing' | 'reading' | 'terminal' | 'thinking' | 'waiting';
export type Pose = 'walking' | 'seated';
export type Facing = 'up' | 'down' | 'left' | 'right';
export type RingColor = 'blue' | 'green' | 'amber' | 'grey';

export interface Tile {
  readonly x: number;
  readonly y: number;
}

export interface SceneAgent {
  readonly id: string;
  readonly role: AgentRole;
  readonly state: AgentState;
  /** Null while walking (entering/leaving). */
  readonly activity: ActivityKind | null;
  readonly pose: Pose;
  readonly facing: Facing;
  /** Position in grid tiles (integers). Multiply by `TILE_SIZE` for pixels. */
  readonly tile: Tile;
  readonly ring: RingColor;
}

export interface SceneSnapshot {
  /** `nowMs` folded into [0, CYCLE_MS). */
  readonly cycleMs: number;
  readonly agents: readonly SceneAgent[];
}

// ---- Named configuration -------------------------------------------------

export const TILE_SIZE = 16;
export const GRID_COLS = 20;
export const GRID_ROWS = 12;
export const CYCLE_MS = 30_000;
/** Time to walk one tile. */
export const STEP_MS = 220;
/** How long each activity lasts before the next one in the agent's list. */
export const ACTIVITY_SLOT_MS = 1_500;

export const DOOR: Tile = { x: 1, y: 10 };
/** Row of the corridor that agents walk along between the door and the desks. */
export const CORRIDOR_Y = 8;

export const TECH_LEAD_DESK: Tile = { x: 10, y: 3 };

export const DESKS: Readonly<Record<Exclude<AgentRole, 'tech-lead'>, Tile>> = {
  analyst: { x: 4, y: 5 },
  architect: { x: 8, y: 5 },
  developer: { x: 12, y: 5 },
  qa: { x: 16, y: 5 },
  support: { x: 18, y: 3 },
};

export const RING_COLORS: Readonly<Record<RingColor, string>> = {
  blue: '#4f9dff',
  green: '#4fd16a',
  amber: '#f2b84b',
  grey: '#8b93a1',
};

export interface ScriptEntry {
  readonly id: string;
  readonly role: AgentRole;
  readonly desk: Tile;
  /** Cycle time at which the agent appears at the door. */
  readonly enterAtMs: number;
  readonly workMs: number;
  readonly reportMs: number;
  readonly activities: readonly ActivityKind[];
}

export const TECH_LEAD_ACTIVITIES: readonly ActivityKind[] = [
  'thinking',
  'typing',
  'reading',
  'waiting',
  'terminal',
];

export const SCRIPT: readonly ScriptEntry[] = [
  {
    id: 'analyst',
    role: 'analyst',
    desk: DESKS.analyst,
    enterAtMs: 1_000,
    workMs: 7_000,
    reportMs: 1_500,
    activities: ['reading', 'thinking', 'typing'],
  },
  {
    id: 'architect',
    role: 'architect',
    desk: DESKS.architect,
    enterAtMs: 4_000,
    workMs: 7_500,
    reportMs: 1_500,
    activities: ['thinking', 'reading', 'typing'],
  },
  {
    id: 'developer',
    role: 'developer',
    desk: DESKS.developer,
    enterAtMs: 7_000,
    workMs: 8_000,
    reportMs: 1_500,
    activities: ['typing', 'terminal', 'reading', 'typing'],
  },
  {
    id: 'qa',
    role: 'qa',
    desk: DESKS.qa,
    enterAtMs: 11_000,
    workMs: 6_000,
    reportMs: 1_500,
    activities: ['terminal', 'waiting', 'reading'],
  },
  {
    id: 'support',
    role: 'support',
    desk: DESKS.support,
    enterAtMs: 12_000,
    workMs: 5_000,
    reportMs: 1_500,
    activities: ['waiting', 'typing', 'reading'],
  },
];

// ---- Paths ---------------------------------------------------------------

function range(from: number, to: number): number[] {
  const out: number[] = [];
  const step = to >= from ? 1 : -1;
  for (let v = from; v !== to + step; v += step) out.push(v);
  return out;
}

/** 4-connected path door -> corridor -> desk column -> desk (no diagonals, no jumps). */
export function pathToDesk(desk: Tile): readonly Tile[] {
  const tiles: Tile[] = [];
  for (const y of range(DOOR.y, CORRIDOR_Y)) tiles.push({ x: DOOR.x, y });
  for (const x of range(DOOR.x, desk.x).slice(1)) tiles.push({ x, y: CORRIDOR_Y });
  for (const y of range(CORRIDOR_Y, desk.y).slice(1)) tiles.push({ x: desk.x, y });
  return tiles;
}

function facingBetween(a: Tile, b: Tile): Facing {
  if (b.x > a.x) return 'right';
  if (b.x < a.x) return 'left';
  return b.y > a.y ? 'down' : 'up';
}

// ---- Scene ---------------------------------------------------------------

export function foldCycle(nowMs: number): number {
  if (!Number.isFinite(nowMs)) return 0;
  return ((nowMs % CYCLE_MS) + CYCLE_MS) % CYCLE_MS;
}

function activityAt(list: readonly ActivityKind[], elapsedMs: number): ActivityKind {
  const idx = Math.floor(elapsedMs / ACTIVITY_SLOT_MS) % list.length;
  return list[idx] ?? 'typing';
}

function ringFor(state: AgentState, activity: ActivityKind | null): RingColor {
  if (state === 'entering' || state === 'leaving') return 'blue';
  if (state === 'reporting') return 'green';
  if (activity === 'thinking') return 'amber';
  if (activity === 'waiting') return 'grey';
  return 'green';
}

function subagentAt(entry: ScriptEntry, t: number): SceneAgent | null {
  const path = pathToDesk(entry.desk);
  const walkMs = (path.length - 1) * STEP_MS;
  const local = t - entry.enterAtMs;
  if (local < 0) return null;
  const last = path.length - 1;
  const deskTile = path[last] as Tile;
  const base = { id: entry.id, role: entry.role };

  if (local < walkMs) {
    const i = Math.min(last, Math.floor(local / STEP_MS));
    const from = path[i] as Tile;
    const to = path[Math.min(last, i + 1)] as Tile;
    return {
      ...base,
      state: 'entering',
      activity: null,
      pose: 'walking',
      facing: facingBetween(from, to),
      tile: from,
      ring: ringFor('entering', null),
    };
  }
  const sinceSeat = local - walkMs;
  if (sinceSeat < entry.workMs) {
    const activity = activityAt(entry.activities, sinceSeat);
    return {
      ...base,
      state: 'working',
      activity,
      pose: 'seated',
      facing: 'up',
      tile: deskTile,
      ring: ringFor('working', activity),
    };
  }
  const sinceReport = sinceSeat - entry.workMs;
  if (sinceReport < entry.reportMs) {
    return {
      ...base,
      state: 'reporting',
      activity: 'typing',
      pose: 'seated',
      facing: 'up',
      tile: deskTile,
      ring: ringFor('reporting', 'typing'),
    };
  }
  const sinceLeave = sinceReport - entry.reportMs;
  if (sinceLeave < walkMs) {
    const i = Math.min(last, Math.floor(sinceLeave / STEP_MS));
    const from = path[last - i] as Tile;
    const to = path[Math.max(0, last - i - 1)] as Tile;
    return {
      ...base,
      state: 'leaving',
      activity: null,
      pose: 'walking',
      facing: facingBetween(from, to),
      tile: from,
      ring: ringFor('leaving', null),
    };
  }
  return null;
}

/** Total time an entry spends in the scene (enter + work + report + leave). */
export function entryDurationMs(entry: ScriptEntry): number {
  const walkMs = (pathToDesk(entry.desk).length - 1) * STEP_MS;
  return walkMs * 2 + entry.workMs + entry.reportMs;
}

export function sceneAt(nowMs: number): SceneSnapshot {
  const t = foldCycle(nowMs);
  const techLeadActivity = activityAt(TECH_LEAD_ACTIVITIES, t);
  const agents: SceneAgent[] = [
    {
      id: 'tech-lead',
      role: 'tech-lead',
      state: 'working',
      activity: techLeadActivity,
      pose: 'seated',
      facing: 'down',
      tile: TECH_LEAD_DESK,
      ring: ringFor('working', techLeadActivity),
    },
  ];
  for (const entry of SCRIPT) {
    const agent = subagentAt(entry, t);
    if (agent) agents.push(agent);
  }
  return { cycleMs: t, agents };
}
