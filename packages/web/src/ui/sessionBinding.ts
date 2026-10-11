import type { OfficeModel } from '@agents-office/shared';
import { type BuildingLayout, type Door, type Tile, WALL_ROWS } from '../world/roomLayout';
import { STATUS_LABEL } from './dialogContent';

// Pure helpers that tie the office model to the desktop shell: which terminal tab runs which
// session (spec 023) and which room door starts a new one.

/** The room door at `tile` (the tile an avatar faces from the corridor or from inside). */
export function doorAt(layout: BuildingLayout, tile: Tile): Door | undefined {
  return layout.doors.find(
    (door) => door.tile.x === tile.x && tile.y <= door.tile.y && tile.y > door.tile.y - WALL_ROWS,
  );
}

/** Working directory of the room's project, for the picker (undefined when not known yet). */
export function roomCwd(model: OfficeModel, roomId: string): string | undefined {
  const cwd = model.projects[roomId]?.cwd;
  return cwd ? cwd : undefined;
}

/** Office state of each session started by the app, by terminal tab id (for the tab title). */
export function activityByTerminal(model: OfficeModel): Record<string, string> {
  const result: Record<string, string> = {};
  for (const session of Object.values(model.sessions)) {
    if (session.terminalId !== undefined) result[session.terminalId] = STATUS_LABEL[session.status];
  }
  return result;
}

/** Claude session id of each app tab, so the shell can resume it with `--resume` after a crash. */
export function claudeSessionByTerminal(model: OfficeModel): Record<string, string> {
  const result: Record<string, string> = {};
  for (const session of Object.values(model.sessions)) {
    if (session.terminalId !== undefined) result[session.terminalId] = session.id;
  }
  return result;
}

/** Id of the session (the Tech Lead) running in the terminal tab `terminalId`, if any. */
export function sessionIdByTerminal(
  model: OfficeModel,
  terminalId: string | undefined,
): string | undefined {
  if (terminalId === undefined) return undefined;
  return Object.values(model.sessions).find((session) => session.terminalId === terminalId)?.id;
}
