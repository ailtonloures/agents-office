import { liveActors, type OfficeModel, type PermissionRequest } from '@agents-office/shared';
import { type MessageKey, t } from '../i18n/i18n';
import { DIRECTION_DELTA, directionBetween } from '../player/playerMotion';
import type { Direction } from '../skin';
import type { BuildingLayout, Tile } from '../world/roomLayout';

export interface HudCounts {
  /** Same definition as `/health`: live sessions (not `ended`). */
  sessions: number;
  /** Same definition as `/health`: live agents (not `finished`/`ended`). */
  agents: number;
  /**
   * Things waiting for the user: pending permission requests plus the actors that wait for
   * something else (an actor with a pending request is not counted twice).
   */
  waiting: number;
}

export function hudCounts(
  model: OfficeModel,
  pending: readonly PermissionRequest[] = [],
): HudCounts {
  const { sessions, agents } = liveActors(model);
  const asking = new Set(pending.map((request) => request.actorId));
  const waiting = [...sessions, ...agents].filter(
    (actor) => actor.status === 'waiting' && !asking.has(actor.id),
  ).length;
  return { sessions: sessions.length, agents: agents.length, waiting: waiting + pending.length };
}

/** The status pill: `2 sessions · 5 agents · ! 1` (the part from `!` on blinks while someone waits). */
export function hudText(counts: HudCounts): string {
  const sessions = t(counts.sessions === 1 ? 'hud.sessions.one' : 'hud.sessions.other', {
    n: counts.sessions,
  });
  const agents = t(counts.agents === 1 ? 'hud.agents.one' : 'hud.agents.other', {
    n: counts.agents,
  });
  return `${sessions} · ${agents} · ! ${counts.waiting}`;
}

/** One key cap and what it does, for the hint bar, the prompt bar and the help panel. */
export interface KeyHint {
  keys: readonly string[];
  label: string;
}

/** The always-visible shortcuts (top right), in the active language. */
export function hudHints(): KeyHint[] {
  return [
    { keys: ['TAB'], label: t('hud.hint.activeRoom') },
    { keys: ['SHIFT+TAB'], label: t('hud.hint.waiting') },
    { keys: ['M'], label: t('hud.hint.map') },
    { keys: ['H'], label: t('hud.hint.help') },
  ];
}

/** Every control, grouped, for the help panel, in the active language. */
export function helpControls(): KeyHint[] {
  return [
    { keys: [t('help.key.arrows'), 'WASD'], label: t('help.control.walk') },
    { keys: ['Z', 'ENTER', t('help.key.space')], label: t('help.control.talk') },
    { keys: ['X', 'ESC'], label: t('help.control.closeDialog') },
    { keys: ['TAB'], label: t('help.control.activeRoom') },
    { keys: ['SHIFT+TAB'], label: t('help.control.waiting') },
    { keys: ['M'], label: t('help.control.map') },
    { keys: ['H', '?'], label: t('help.control.toggleHelp') },
    { keys: [t('help.key.mouse')], label: t('help.control.click') },
  ];
}

/** Keys of the rotating tips of the prompt bar (resolved at call time, in the active language). */
export const TIP_KEYS = [
  'tip.approach',
  'tip.monitors',
  'tip.amber',
  'tip.thinking',
  'tip.techLead',
  'tip.click',
] as const satisfies readonly MessageKey[];

/** The tips in the active language. */
export function tips(): string[] {
  return TIP_KEYS.map((key) => t(key));
}
/** How long each tip stays on screen. */
export const TIP_MS = 7000;

/** The tip shown `elapsedMs` after the scene started. */
export function tipAt(elapsedMs: number): string {
  const index = Math.floor(Math.max(0, elapsedMs) / TIP_MS) % TIP_KEYS.length;
  return t(TIP_KEYS[index] as MessageKey);
}

/** What the prompt bar offers right now (`board` = Hall of Fame mural, `whiteboard` = Excalidraw). */
export type PromptContext =
  | { kind: 'dialog'; actions?: readonly KeyHint[] }
  | { kind: 'door'; name: string }
  | { kind: 'character'; name: string }
  | { kind: 'board' }
  | { kind: 'whiteboard' }
  | { kind: 'idle'; elapsedMs: number };

export interface Prompt {
  hints: readonly KeyHint[];
  /** Free text after the hints (a tip). */
  text?: string;
}

/** The contextual prompt: the action at hand first, otherwise a tip (and the help key early on). */
export function promptFor(context: PromptContext): Prompt {
  switch (context.kind) {
    case 'dialog':
      return {
        hints: [
          { keys: ['Z'], label: t('prompt.next') },
          { keys: ['X'], label: t('prompt.close') },
          ...(context.actions ?? []),
        ],
      };
    case 'door':
      return { hints: [{ keys: ['Z'], label: t('prompt.door', { name: context.name }) }] };
    case 'character':
      return { hints: [{ keys: ['Z'], label: t('prompt.character', { name: context.name }) }] };
    case 'board':
      return { hints: [{ keys: ['Z'], label: t('prompt.board') }] };
    case 'whiteboard':
      return { hints: [{ keys: ['Z'], label: t('prompt.whiteboard') }] };
    case 'idle':
      if (context.elapsedMs < TIP_MS) {
        return { hints: [{ keys: ['H'], label: t('prompt.allControls') }] };
      }
      return { hints: [], text: tipAt(context.elapsedMs - TIP_MS) };
  }
}

/** The project (room) whose sessions or agents had the most recent activity, if any. */
export function mostRecentRoom(model: OfficeModel): string | undefined {
  let best: { projectId: string; ts: string } | undefined;
  const consider = (projectId: string | undefined, ts: string | undefined) => {
    if (!projectId || !model.projects[projectId] || !ts) return;
    if (!best || ts > best.ts) best = { projectId, ts };
  };
  for (const project of Object.values(model.projects)) consider(project.id, project.lastActivityTs);
  for (const session of Object.values(model.sessions)) {
    consider(session.projectId, session.lastActivityTs);
  }
  for (const agent of Object.values(model.agents)) {
    consider(model.sessions[agent.sessionId]?.projectId, agent.lastActivityTs);
  }
  return (best as { projectId: string } | undefined)?.projectId;
}

/** Where Tab drops the player: the corridor tile in front of the room's door, facing it. */
export function roomFront(
  layout: BuildingLayout,
  roomId: string,
): { tile: Tile; facing: Direction } | undefined {
  const door = layout.doors.find((d) => d.roomId === roomId);
  if (!door) return undefined;
  return { tile: door.outside, facing: directionBetween(door.outside, door.tile) ?? 'down' };
}

export interface WaitingActor {
  id: string;
  ts: string;
}

/** Waiting actors, oldest wait first (id breaks ties) so the cycle order is stable. */
export function waitingActors(model: OfficeModel): WaitingActor[] {
  return [...Object.values(model.sessions), ...Object.values(model.agents)]
    .filter((actor) => actor.status === 'waiting')
    .map((actor) => ({ id: actor.id, ts: actor.lastActivityTs ?? '' }))
    .sort((a, b) => a.ts.localeCompare(b.ts) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** The waiting actor after `currentId` in the cycle (the first one when none/unknown). */
export function nextWaiting(model: OfficeModel, currentId?: string): string | undefined {
  const list = waitingActors(model);
  if (list.length === 0) return undefined;
  const index = list.findIndex((actor) => actor.id === currentId);
  return (list[(index + 1) % list.length] as WaitingActor).id;
}

const APPROACH_ORDER: readonly Direction[] = ['down', 'left', 'right', 'up'];

/** A free walkable tile next to `target`, with the direction the player must face to look at it. */
export function approachTile(
  layout: BuildingLayout,
  target: Tile,
  isOccupied: (tile: Tile) => boolean,
): { tile: Tile; facing: Direction } | undefined {
  for (const side of APPROACH_ORDER) {
    const d = DIRECTION_DELTA[side];
    const tile = { x: Math.round(target.x) + d.x, y: Math.round(target.y) + d.y };
    if (layout.collision[tile.y]?.[tile.x] !== false || isOccupied(tile)) continue;
    const facing = directionBetween(tile, target);
    if (facing) return { tile, facing };
  }
  return undefined;
}

/** `tile` when it is walkable and free, otherwise the closest free walkable tile within 2 steps. */
export function freeTileNear(
  layout: BuildingLayout,
  tile: Tile,
  isOccupied: (tile: Tile) => boolean,
): Tile | undefined {
  const free = (t: Tile) => layout.collision[t.y]?.[t.x] === false && !isOccupied(t);
  const candidates: Tile[] = [];
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) candidates.push({ x: tile.x + dx, y: tile.y + dy });
  }
  const distance = (t: Tile) => Math.abs(t.x - tile.x) + Math.abs(t.y - tile.y);
  return candidates.filter(free).sort((a, b) => distance(a) - distance(b))[0];
}

/** Left edge of the right-aligned shortcuts panel: against the right margin, never past the left one. */
export function hintPanelX(screenWidth: number, panelWidth: number, margin: number): number {
  return Math.max(margin, screenWidth - margin - panelWidth);
}

/** Whether the shortcuts panel at `x0` clears the status pill; otherwise it is hidden. */
export function hintsFit(x0: number, statusWidth: number, margin: number): boolean {
  return x0 > margin + statusWidth + 8;
}

/** A rectangle in screen (game) pixels. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
