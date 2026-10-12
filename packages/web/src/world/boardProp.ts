import { t } from '../i18n/i18n';
import type { PropPlacement } from './props';
import type { BuildingLayout, Rect } from './roomLayout';

/** The whiteboard prop is interactive (spec 076): one per workspace (room), opens the board overlay. */
export const BOARD_PROP_ID = 'whiteboard' as const;
/** Game event emitted when the user clicks a whiteboard; payload: {@link BoardOpenRequest}. */
export const BOARD_OPEN_EVENT = 'board-open';
/** Game event emitted when the whiteboard overlay opens (`true`) or closes (`false`). */
export const BOARD_OVERLAY_EVENT = 'board-overlay';
export const boardLabel = (): string => t('board.label');

export interface BoardOpenRequest {
  /** The workspace (project / room id) the board belongs to. */
  roomId: string;
  /** Left tile, row and width in tiles of the prop (wall row). */
  x: number;
  y: number;
  w: number;
}

const TILE_W = 2;

const inside = (bounds: Rect, x: number, y: number): boolean =>
  x >= bounds.x && x < bounds.x + bounds.w && y >= bounds.y && y < bounds.y + bounds.h;

/**
 * The whiteboards of the building, each tied to the workspace whose room it hangs in (top wall of the room, spec 092). Never more
 * than one per workspace: extra props in the same room are ignored.
 */
export function boardSpots(layout: BuildingLayout): BoardOpenRequest[] {
  const seen = new Set<string>();
  const spots: BoardOpenRequest[] = [];
  const boards = layout.props.filter((p: PropPlacement) => p.id === BOARD_PROP_ID);
  for (const room of layout.rooms) {
    const prop = boards.find((p) => inside(room.bounds, p.x, p.y));
    if (!prop || seen.has(room.id)) continue;
    seen.add(room.id);
    spots.push({ roomId: room.id, x: prop.x, y: prop.y, w: TILE_W });
  }
  return spots;
}

/**
 * The board whose drawing spot (the whiteboard POI, on the floor under it) holds `tile`: the player
 * standing there can open it with the action key (spec 093). The board is `w` tiles wide, so the
 * row under either of its tiles counts.
 */
export function boardAtPoi(
  layout: BuildingLayout,
  spots: readonly BoardOpenRequest[],
  tile: { x: number; y: number },
): BoardOpenRequest | undefined {
  return spots.find((s) =>
    layout.pois.some(
      (poi) =>
        poi.type === 'whiteboard' &&
        poi.roomId === s.roomId &&
        poi.tile.y === tile.y &&
        tile.x >= s.x &&
        tile.x < s.x + s.w &&
        poi.tile.x >= s.x &&
        poi.tile.x < s.x + s.w,
    ),
  );
}

/** World pixels above the prop that the floating badge may reach (part of the clickable area). */
export const BADGE_REACH_PX = 14;

/**
 * The board under a world point (pixels), if any. A wall prop is one tile tall, drawn upward; the
 * floating badge above it counts as the board (spec 093).
 */
export function boardAtPoint(
  spots: readonly BoardOpenRequest[],
  point: { x: number; y: number },
  tile: number,
): BoardOpenRequest | undefined {
  return spots.find(
    (s) =>
      point.x >= s.x * tile &&
      point.x < (s.x + s.w) * tile &&
      point.y >= (s.y - 1) * tile - BADGE_REACH_PX &&
      point.y < (s.y + 1) * tile,
  );
}
