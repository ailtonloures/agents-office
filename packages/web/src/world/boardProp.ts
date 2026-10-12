import type { PropPlacement } from './props';
import type { BuildingLayout, Rect } from './roomLayout';

/** The whiteboard prop is interactive (spec 076): one per workspace (room), opens the board overlay. */
export const BOARD_PROP_ID = 'whiteboard' as const;
/** Game event emitted when the user clicks a whiteboard; payload: {@link BoardOpenRequest}. */
export const BOARD_OPEN_EVENT = 'board-open';
export const BOARD_LABEL = 'Quadro — clique para abrir';

export interface BoardOpenRequest {
  /** The workspace (project / room id) the board belongs to. */
  roomId: string;
  /** Left tile, row and width in tiles of the prop (wall row). */
  x: number;
  y: number;
  w: number;
}

const TILE_W = 2;

const columnIn = (bounds: Rect, x: number): boolean => x >= bounds.x && x < bounds.x + bounds.w;

/**
 * The whiteboards of the building, each tied to the workspace whose column it hangs in. Never more
 * than one per workspace: extra props in the same column are ignored.
 */
export function boardSpots(layout: BuildingLayout): BoardOpenRequest[] {
  const seen = new Set<string>();
  const spots: BoardOpenRequest[] = [];
  const boards = layout.props.filter((p: PropPlacement) => p.id === BOARD_PROP_ID);
  for (const room of layout.rooms) {
    const prop = boards.find((p) => columnIn(room.bounds, p.x));
    if (!prop || seen.has(room.id)) continue;
    seen.add(room.id);
    spots.push({ roomId: room.id, x: prop.x, y: prop.y, w: TILE_W });
  }
  return spots;
}

/** The board under a world point (pixels), if any. A wall prop is one tile tall, drawn upward. */
export function boardAtPoint(
  spots: readonly BoardOpenRequest[],
  point: { x: number; y: number },
  tile: number,
): BoardOpenRequest | undefined {
  return spots.find(
    (s) =>
      point.x >= s.x * tile &&
      point.x < (s.x + s.w) * tile &&
      point.y >= (s.y - 1) * tile &&
      point.y < (s.y + 1) * tile,
  );
}
