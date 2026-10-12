import type { Direction, TileId } from '../skin/schema';
import { isWallProp, PROP_DEFS, type PropId, type PropPlacement } from './props';

/** Width of a room (and of the lobby), in tiles. */
export const CHUNK = 16;
/**
 * Rows a top (north) wall takes: its face is seen from the front, so it is drawn this many tiles
 * high (48 px, 1.5x a character) - `wall-top` (cap + face), `wall-mid`, then `wall` (skirting).
 */
export const WALL_ROWS = 3;
/** Extra rows a top wall takes compared with a one-row wall. */
const WALL_EXTRA = WALL_ROWS - 1;
/** Height of each kind of chunk, in tiles. A room is its chunks stacked top to bottom. */
export const CHUNK_HEIGHT = {
  entrance: 7 + WALL_EXTRA,
  'lead-desk': 8,
  'cubicles-4': 5,
  utility: 8,
} as const;
/** Height of the corridor band above the rooms (its top wall and 3 floor rows). */
export const CORRIDOR_HEIGHT = WALL_ROWS + 3;
/** Tiles of a top wall, from its top row down to the row on the floor line. */
export const TOP_WALL_ROWS = ['wall-top', 'wall-mid', 'wall'] as const satisfies readonly TileId[];
/** Max characters shown on a room sign. */
export const SIGN_MAX_CHARS = 14;
/** Number of desks in a `cubicles-*` chunk (one row of three workstations). */
export const CUBICLES_PER_CHUNK = 3;
/** Tech Lead desks side by side in a `lead-desk` chunk. */
export const LEADS_PER_CHUNK = 2;

export type ChunkKind = keyof typeof CHUNK_HEIGHT;

export interface LayoutSessionInput {
  id: string;
  /** Active agents (subagents) of the session. */
  agentCount: number;
}

export interface LayoutProjectInput {
  id: string;
  name: string;
  /** Stable ordering key (timestamp or sequence of when the project was first seen). */
  firstSeen: number;
  sessions: LayoutSessionInput[];
}

export interface Tile {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Layer = (TileId | null)[][];

export interface Desk {
  /** Stable across regenerations: `<project>:lead:<session>` or `<project>:cubicle:<n>`. */
  id: string;
  roomId: string;
  sessionId?: string;
  /** The seat tile (walkable): where the character sits. */
  tile: Tile;
  /** Direction the seated character faces (towards the desk). */
  facing: Direction;
}

export type PoiType = 'server-rack' | 'phone' | 'window' | 'hall-of-fame' | 'whiteboard';

export interface Poi {
  type: PoiType;
  /** Walkable tile from which the point of interest is used. */
  tile: Tile;
  roomId?: string;
}

export interface Door {
  roomId: string;
  /** The door tile (walkable): the bottom row of the room's top wall, open on all its rows. */
  tile: Tile;
  /** Corridor tile right outside the door (just above the wall). */
  outside: Tile;
}

export interface Sign {
  roomId: string;
  /** Project name truncated to {@link SIGN_MAX_CHARS}. */
  text: string;
  /** Tile at the centre of the sign. */
  tile: Tile;
}

/** A decorative patch of floor drawn by the scene under the furniture. */
export interface Zone {
  /** `rug` is the room's accent color; `lobby` the golden reception rug. */
  kind: 'rug' | 'lobby';
  roomId?: string;
  rect: Rect;
}

export interface RoomInfo {
  id: string;
  name: string;
  bounds: Rect;
  chunks: ChunkKind[];
  /** Accent color of the room (0xRRGGBB): rugs, plaque and sofas, deterministic by project id. */
  accent: number;
  cubicleCapacity: number;
}

export interface BuildingLayout {
  width: number;
  height: number;
  layers: { floor: Layer; walls: Layer; furniture: Layer };
  /** Big furniture drawn from the props atlas (its fallback tiles are in `layers.furniture`). */
  props: PropPlacement[];
  /** `collision[y][x]`: true when the tile cannot be walked on. */
  collision: boolean[][];
  rooms: RoomInfo[];
  doors: Door[];
  desks: Desk[];
  pois: Poi[];
  roomBounds: Record<string, Rect>;
  signs: Sign[];
  zones: Zone[];
  lobby: Rect;
  spawn: Tile;
}

const BLOCKING_FURNITURE: ReadonlySet<TileId> = new Set([
  'desk',
  'computer',
  'server-rack',
  'phone',
  'plant',
  'plant-tall',
  'bookshelf',
  'sofa-l',
  'sofa-r',
  'coffee',
  'cooler',
  'printer',
  'table',
  'counter',
  'lamp',
]);

/** Accent colors rooms pick from (sky, coral, mint, lilac, gold, rose, teal, periwinkle). */
export const ACCENTS = [
  0x4aa8d8, 0xe0875a, 0x6cc08b, 0xb48ae0, 0xe3b94a, 0xe0708f, 0x58c4c0, 0x8fa0e8,
];

/** FNV-1a 32-bit hash. */
export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function truncateSign(name: string): string {
  return Array.from(name.trim()).slice(0, SIGN_MAX_CHARS).join('');
}

/** Cubicle chunks needed for `agents` agents: one desk per agent, so none without agents. */
export function cubicleChunksFor(agents: number): number {
  return Math.ceil(Math.max(0, agents) / CUBICLES_PER_CHUNK);
}

/** Chunk sequence of a room, top to bottom. */
export function roomChunks(sessionCount: number, agentCount: number): ChunkKind[] {
  return [
    'entrance',
    ...Array.from(
      { length: Math.ceil(sessionCount / LEADS_PER_CHUNK) },
      () => 'lead-desk' as const,
    ),
    ...Array.from({ length: cubicleChunksFor(agentCount) }, () => 'cubicles-4' as const),
    'utility',
  ];
}

export const roomHeight = (chunks: readonly ChunkKind[]): number =>
  chunks.reduce((sum, kind) => sum + CHUNK_HEIGHT[kind], 0);

function grid<T>(width: number, height: number, value: T): T[][] {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => value));
}

function setCell<T>(cells: T[][], x: number, y: number, value: T): void {
  const row = cells[y];
  if (row) row[x] = value;
}

/** Two distinct indexes in [0, count) derived from `hash`. */
function pickTwo(hash: number, count: number): [number, number] {
  const a = hash % count;
  const b = (a + 1 + (Math.floor(hash / count) % (count - 1))) % count;
  return [a, b];
}

class Builder {
  readonly floor: Layer;
  readonly walls: Layer;
  readonly furniture: Layer;
  readonly desks: Desk[] = [];
  readonly pois: Poi[] = [];
  readonly zones: Zone[] = [];
  readonly props: PropPlacement[] = [];

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.floor = grid<TileId | null>(width, height, null);
    this.walls = grid<TileId | null>(width, height, null);
    this.furniture = grid<TileId | null>(width, height, null);
  }

  /** Floor of `base`, with the alternate tiles mixed in (carpet checkerboard, wood seams). */
  fillFloor(rect: Rect, base: TileId = 'floor'): void {
    for (let y = rect.y; y < rect.y + rect.h; y += 1) {
      for (let x = rect.x; x < rect.x + rect.w; x += 1) {
        // Carpet tiles are laid quarter-turned (checkerboard); wood planks get a scatter of the
        // alternate seams so the floor never looks tiled.
        if (base === 'floor') setCell(this.floor, x, y, (x + y) % 2 === 0 ? 'floor' : 'floor-b');
        else if (base === 'wood') {
          const alt = (x * 7 + y * 13 + ((x * y) % 5)) % 3 === 0;
          setCell(this.floor, x, y, alt ? 'wood-b' : 'wood');
        } else setCell(this.floor, x, y, base);
      }
    }
  }

  /** A top wall face {@link WALL_ROWS} high over columns `x0..x1`, starting at row `y`. */
  topWall(x0: number, x1: number, y: number): void {
    for (let x = x0; x <= x1; x += 1) {
      TOP_WALL_ROWS.forEach((tile, i) => {
        setCell(this.walls, x, y + i, tile);
      });
    }
  }

  /**
   * Paints the top wall face on the floor layer under the side wall at column `x`, on the face rows
   * below the top row `y`: the side wall's band is drawn over it and leaves the face showing.
   */
  faceUnderSide(x: number, y: number): void {
    for (let i = 1; i < WALL_ROWS; i += 1) setCell(this.floor, x, y + i, TOP_WALL_ROWS[i] ?? null);
  }

  /**
   * Wall ring around `rect`: the top {@link WALL_ROWS} rows show the wall face (corners framed by
   * the side walls), the sides and the bottom show the top of the wall.
   */
  wallRing(rect: Rect): void {
    const right = rect.x + rect.w - 1;
    const bottom = rect.y + rect.h - 1;
    this.topWall(rect.x, right, rect.y);
    for (let x = rect.x; x <= right; x += 1) setCell(this.walls, x, bottom, 'wall-bottom');
    setCell(this.walls, rect.x, rect.y, 'wall-corner-tl');
    setCell(this.walls, right, rect.y, 'wall-corner-tr');
    for (let y = rect.y + 1; y < bottom; y += 1) {
      setCell(this.walls, rect.x, y, 'wall-side-l');
      setCell(this.walls, right, y, 'wall-side-r');
    }
    this.faceUnderSide(rect.x, rect.y);
    this.faceUnderSide(right, rect.y);
  }

  /** Places a prop with its left tile at (x, y) and writes its fallback tiles under it. */
  prop(id: PropId, x: number, y: number): void {
    this.props.push({ id, x, y });
    if (isWallProp(id)) return;
    PROP_DEFS[id].fallback.forEach((tile, i) => {
      setCell(this.furniture, x + i, y, tile);
    });
  }

  collision(): boolean[][] {
    return this.walls.map((row, y) =>
      row.map((wall, x) => {
        if (wall !== null) return true;
        const ground = this.floor[y]?.[x];
        if (ground === null || ground === undefined) return true;
        const item = this.furniture[y]?.[x];
        return item !== null && item !== undefined && BLOCKING_FURNITURE.has(item);
      }),
    );
  }
}

function buildRoom(
  b: Builder,
  project: LayoutProjectInput,
  x0: number,
  y0: number,
  doors: Door[],
  signs: Sign[],
): RoomInfo {
  const agents = project.sessions.reduce((sum, s) => sum + Math.max(0, s.agentCount), 0);
  const chunks = roomChunks(project.sessions.length, agents);
  const height = roomHeight(chunks);
  const bounds: Rect = { x: x0, y: y0, w: CHUNK, h: height };
  const hash = hashString(project.id);

  b.fillFloor(bounds);
  b.wallRing(bounds);

  let cubicleIndex = 0;
  let sessionIndex = 0;
  let cy = y0;
  for (const kind of chunks) {
    const top = cy;
    cy += CHUNK_HEIGHT[kind];
    const at = (lx: number, ly: number): Tile => ({ x: x0 + lx, y: top + ly });
    const put = (layer: Layer, lx: number, ly: number, tile: TileId): void => {
      setCell(layer, x0 + lx, top + ly, tile);
    };

    const prop = (id: PropId, lx: number, ly: number): void => b.prop(id, x0 + lx, top + ly);

    if (kind === 'entrance') {
      // Door through the whole top wall, the plaque (drawn by the scene) to its left, decor to its
      // right at eye level (the middle row of the wall). `in_` maps a row under a one-row wall to
      // the row under the taller wall.
      const in_ = (ly: number): number => ly + WALL_EXTRA;
      for (let i = 0; i < WALL_ROWS; i += 1) setCell(b.walls, x0 + 8, top + i, null);
      put(b.furniture, 8, WALL_EXTRA, 'door');
      prop('art-wide', 10, 1);
      put(b.walls, 12, 0, 'window-top');
      put(b.walls, 13, 0, 'window-top');
      put(b.walls, 12, 1, 'window');
      put(b.walls, 13, 1, 'window');
      const door = at(8, WALL_EXTRA);
      doors.push({ roomId: project.id, tile: door, outside: { x: door.x, y: top - 1 } });
      signs.push({ roomId: project.id, text: truncateSign(project.name), tile: at(4, 1) });
      b.pois.push({ type: 'window', tile: at(12, in_(1)), roomId: project.id });
      prop('plant-tall', 1, in_(1));
      prop('plant-fig', 14, in_(1));
      // Lounge nook on the left (sofa, armchair, coffee table), shelving on the right.
      prop('floor-lamp', 1, in_(3));
      prop('sofa', 2, in_(3));
      prop('armchair', 4, in_(3));
      prop('side-table', 5, in_(3));
      prop('coffee-table', 2, in_(4));
      prop('bookshelf', 11, in_(4));
      prop('bookshelf', 13, in_(4));
      b.zones.push({
        kind: 'rug',
        roomId: project.id,
        rect: { x: x0 + 1, y: top + in_(3), w: 6, h: 3 },
      });
    } else if (kind === 'lead-desk') {
      // Executive desks side by side: each Tech Lead sits below the monitors, on an accent rug.
      const slots = [
        { desk: 2, chair: 3, rug: 1, shelf: 1, kanban: 5, plant: ['plant-fig', 1] },
        { desk: 11, chair: 12, rug: 9, shelf: 9, kanban: 13, plant: ['plant', 14] },
      ] as const;
      for (const slot of slots) {
        const session = project.sessions[sessionIndex];
        sessionIndex += 1;
        if (!session) break;
        prop('lead-desk', slot.desk, 3);
        prop('chair-exec', slot.chair, 4);
        b.desks.push({
          id: `${project.id}:lead:${session.id}`,
          roomId: project.id,
          sessionId: session.id,
          tile: at(slot.chair, 4),
          facing: 'up',
        });
        b.zones.push({
          kind: 'rug',
          roomId: project.id,
          rect: { x: x0 + slot.rug, y: top + 1, w: 6, h: 6 },
        });
        prop('bookshelf', slot.shelf, 1);
        prop('kanban', slot.kanban, 1);
        prop(slot.plant[0], slot.plant[1], 6);
      }
    } else if (kind === 'cubicles-4') {
      const looks = ['workstation', 'workstation-b', 'workstation-c'] as const;
      const sy = 2;
      const deskCount = Math.min(CUBICLES_PER_CHUNK, agents - cubicleIndex);
      for (const sx of [3, 7, 11].slice(0, deskCount)) {
        prop(looks[(hash + cubicleIndex * 7) % looks.length] ?? 'workstation', sx, sy);
        prop('chair', sx, sy + 1);
        b.desks.push({
          id: `${project.id}:cubicle:${cubicleIndex}`,
          roomId: project.id,
          tile: at(sx, sy + 1),
          facing: 'up',
        });
        cubicleIndex += 1;
      }
      b.zones.push({
        kind: 'rug',
        roomId: project.id,
        rect: { x: x0 + 2, y: top + 1, w: 4 * deskCount, h: 3 },
      });
      const plants = ['plant', 'plant-tall', 'plant-fig'] as const;
      for (const [k, index] of pickTwo(hash >>> 3, 4).entries()) {
        const [lx, ly] = (
          [
            [1, 4],
            [14, 4],
            [1, 1],
            [14, 1],
          ] as const
        )[index] ?? [1, 4];
        prop(plants[(hash + k + cubicleIndex) % plants.length] ?? 'plant', lx, ly);
      }
    } else {
      // Utility: server racks, printer, kitchen island, fridge, water cooler and the phone.
      b.fillFloor({ x: x0 + 1, y: top, w: CHUNK - 2, h: CHUNK_HEIGHT.utility - 1 }, 'tile');
      prop('server-rack', 2, 1);
      prop('server-rack', 3, 1);
      b.pois.push({ type: 'server-rack', tile: at(2, 2), roomId: project.id });
      prop('printer', 5, 1);
      prop('kitchen', 7, 1);
      prop('fridge', 10, 1);
      prop('cooler', 11, 1);
      prop('phone-table', 13, 1);
      b.pois.push({ type: 'phone', tile: at(13, 2), roomId: project.id });
      prop('plant', 1, 6);
      prop(hash % 2 === 0 ? 'plant-tall' : 'plant-fig', 14, 6);
    }
  }

  return {
    id: project.id,
    name: project.name,
    bounds,
    chunks,
    accent: ACCENTS[hash % ACCENTS.length] ?? ACCENTS[0] ?? 0xffffff,
    cubicleCapacity: cubicleIndex,
  };
}

/**
 * Generates the whole building. Pure and deterministic: rooms are ordered by `firstSeen` (then
 * id) and placed left to right after the fixed lobby, one `CHUNK` wide each, growing downwards, so
 * adding a project or a desk never moves another room horizontally.
 */
export function layoutBuilding(projects: readonly LayoutProjectInput[]): BuildingLayout {
  const ordered = [...projects].sort(
    (a, b) => a.firstSeen - b.firstSeen || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const roomHeights = ordered.map((p) =>
    roomHeight(
      roomChunks(
        p.sessions.length,
        p.sessions.reduce((sum, s) => sum + Math.max(0, s.agentCount), 0),
      ),
    ),
  );
  const lobbyHeight = CORRIDOR_HEIGHT + CHUNK;
  const width = CHUNK * (1 + ordered.length);
  const height = Math.max(lobbyHeight, CORRIDOR_HEIGHT + Math.max(0, ...roomHeights));
  const b = new Builder(width, height);

  // Lobby: x 0..15, with the Hall of Fame board, a reception counter and the spawn. Its content
  // sits under the tall top wall (`ly` rows below a one-row wall).
  const lobby: Rect = { x: 0, y: 0, w: CHUNK, h: lobbyHeight };
  const ly = (y: number): number => y + WALL_EXTRA;
  b.fillFloor(lobby, 'wood');
  b.wallRing(lobby);
  setCell(b.walls, 8, 1, 'board');
  b.pois.push({ type: 'hall-of-fame', tile: { x: 8, y: WALL_ROWS } });
  for (const x of [2, 3, 12, 13]) {
    setCell(b.walls, x, 0, 'window-top');
    setCell(b.walls, x, 1, 'window');
  }
  b.prop('art-wide', 5, 1);
  b.prop('tv', 10, 1);
  for (const [id, x, y] of [
    ['reception', 3, 6],
    ['plant-fig', 2, 6],
    ['plant', 7, 6],
    ['bookshelf', 12, 6],
    ['plant-tall', 1, 1],
    ['plant-tall', 14, 1],
    ['plant-tall', 1, 18],
    ['plant-fig', 14, 18],
    ['floor-lamp', 1, 13],
    ['sofa', 2, 13],
    ['coffee-table', 2, 14],
    ['sofa', 12, 13],
    ['coffee-table', 12, 14],
    ['floor-lamp', 14, 13],
    ['side-table', 4, 18],
    ['side-table', 11, 18],
  ] as const) {
    b.prop(id, x, ly(y));
  }
  b.zones.push({ kind: 'lobby', rect: { x: 4, y: ly(8), w: 8, h: 8 } });

  const doors: Door[] = [];
  const signs: Sign[] = [];
  const rooms: RoomInfo[] = [];

  if (ordered.length > 0) {
    // Corridor: a tall top wall, then floor rows from the lobby to the last room; the rooms' top
    // walls close it.
    b.fillFloor(
      { x: CHUNK, y: WALL_ROWS, w: width - CHUNK, h: CORRIDOR_HEIGHT - WALL_ROWS },
      'hall',
    );
    b.topWall(CHUNK - 1, width - 1, 0);
    setCell(b.walls, width - 1, 0, 'wall-corner-tr');
    for (let y = 1; y < CORRIDOR_HEIGHT; y += 1) setCell(b.walls, width - 1, y, 'wall-side-r');
    b.faceUnderSide(width - 1, 0);
    // The segment of the lobby's right wall that opens on the corridor keeps its floor.
    for (let y = WALL_ROWS; y < CORRIDOR_HEIGHT; y += 1) setCell(b.walls, CHUNK - 1, y, null);
  }

  ordered.forEach((project, index) => {
    const x0 = CHUNK * (1 + index);
    rooms.push(buildRoom(b, project, x0, CORRIDOR_HEIGHT, doors, signs));
    // Corridor decor in front of the room, at eye level on the corridor's top wall.
    for (const x of [x0 + 3, x0 + 4]) {
      setCell(b.walls, x, 0, 'window-top');
      setCell(b.walls, x, 1, 'window');
    }
    // Exactly one interactive whiteboard per workspace (spec 076).
    b.prop('whiteboard', x0 + 10, 1);
    // Where an agent stands to draw on it (spec 078): the corridor tile just below the board.
    b.pois.push({ type: 'whiteboard', tile: { x: x0 + 10, y: WALL_ROWS }, roomId: project.id });
    setCell(b.walls, x0 + 13, 1, index % 2 === 0 ? 'clock' : 'poster');
    b.prop('plant-tall', x0 + 1, WALL_ROWS);
    b.prop(index % 2 === 0 ? 'plant' : 'plant-fig', x0 + 14, WALL_ROWS);
  });

  const roomBounds: Record<string, Rect> = {};
  for (const room of rooms) roomBounds[room.id] = room.bounds;

  return {
    width,
    height,
    layers: { floor: b.floor, walls: b.walls, furniture: b.furniture },
    props: b.props,
    collision: b.collision(),
    rooms,
    doors,
    desks: b.desks,
    pois: b.pois,
    roomBounds,
    signs,
    zones: b.zones,
    lobby,
    spawn: { x: 8, y: 9 + WALL_EXTRA },
  };
}
