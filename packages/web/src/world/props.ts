import type { TileId } from '../skin/schema';

/**
 * Props: furniture bigger than one tile (or taller than one), drawn from the skin's props atlas and
 * depth-sorted with the characters. Each one covers a footprint of `w` tiles on one row; the
 * furniture tiles in `fallback` are written under it so collisions, lighting and skins without a
 * props atlas keep working exactly as with plain tiles.
 */
export const PROP_DEFS = {
  workstation: { w: 2, fallback: ['computer', 'desk'] },
  'workstation-b': { w: 2, fallback: ['computer', 'desk'] },
  'workstation-c': { w: 2, fallback: ['computer', 'desk'] },
  'lead-desk': { w: 3, fallback: ['desk', 'computer', 'desk'] },
  /** In front of the seated character (it covers the lower back of whoever sits on it). */
  chair: { w: 1, fallback: ['chair'], depthBias: 2 },
  /** The Tech Lead's high-back chair (same role as `chair`). */
  'chair-exec': { w: 1, fallback: ['chair'], depthBias: 2 },
  /** Free-standing kanban board next to the Tech Lead's desk. */
  kanban: { w: 2, fallback: ['bookshelf', 'bookshelf'] },
  bookshelf: { w: 2, fallback: ['bookshelf', 'bookshelf'] },
  'plant-tall': { w: 1, fallback: ['plant-tall'] },
  'plant-fig': { w: 1, fallback: ['plant-tall'] },
  plant: { w: 1, fallback: ['plant'] },
  planter: { w: 2, fallback: ['plant', 'plant'] },
  sofa: { w: 2, fallback: ['sofa-l', 'sofa-r'] },
  armchair: { w: 1, fallback: ['sofa-l'] },
  'coffee-table': { w: 2, fallback: ['table', 'table'] },
  'side-table': { w: 1, fallback: ['table'] },
  'floor-lamp': { w: 1, fallback: ['lamp'] },
  'server-rack': { w: 1, fallback: ['server-rack'] },
  printer: { w: 1, fallback: ['printer'] },
  kitchen: { w: 3, fallback: ['coffee', 'counter', 'counter'] },
  fridge: { w: 1, fallback: ['counter'] },
  cooler: { w: 1, fallback: ['cooler'] },
  'phone-table': { w: 1, fallback: ['phone'] },
  reception: { w: 4, fallback: ['counter', 'counter', 'counter', 'counter'] },
  /** Wall-mounted: drawn over the face of a top wall, no footprint on the floor. */
  whiteboard: { w: 2, fallback: [], wall: true },
  tv: { w: 2, fallback: [], wall: true },
  'art-wide': { w: 2, fallback: [], wall: true },
} as const satisfies Record<
  string,
  { w: number; fallback: readonly TileId[]; wall?: boolean; depthBias?: number }
>;

export type PropId = keyof typeof PROP_DEFS;

export interface PropPlacement {
  id: PropId;
  /** Left tile of the footprint. */
  x: number;
  /** Row of the footprint (the wall row for wall-mounted props). */
  y: number;
}

export const isWallProp = (id: PropId): boolean => 'wall' in PROP_DEFS[id];

/** Pixels added to the prop's base line when depth-sorting it against the characters. */
export const propDepthBias = (id: PropId): number => {
  const def = PROP_DEFS[id];
  return 'depthBias' in def ? def.depthBias : 0;
};
