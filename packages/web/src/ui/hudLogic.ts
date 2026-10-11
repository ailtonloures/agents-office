import { isLive, type OfficeModel, type PermissionRequest } from '@agents-office/shared';
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
  const sessions = Object.values(model.sessions).filter(isLive);
  const agents = Object.values(model.agents).filter(isLive);
  const asking = new Set(pending.map((request) => request.actorId));
  const waiting = [...sessions, ...agents].filter(
    (actor) => actor.status === 'waiting' && !asking.has(actor.id),
  ).length;
  return { sessions: sessions.length, agents: agents.length, waiting: waiting + pending.length };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The status pill: `2 sessões · 5 agentes · ! 1` (the part from `!` on blinks while someone waits). */
export function hudText(counts: HudCounts): string {
  return `${plural(counts.sessions, 'sessão', 'sessões')} · ${plural(counts.agents, 'agente', 'agentes')} · ! ${counts.waiting}`;
}

/** One key cap and what it does, for the hint bar, the prompt bar and the help panel. */
export interface KeyHint {
  keys: readonly string[];
  label: string;
}

/** The always-visible shortcuts (top right). */
export const HUD_HINTS: readonly KeyHint[] = [
  { keys: ['TAB'], label: 'Sala ativa' },
  { keys: ['SHIFT+TAB'], label: 'Quem espera' },
  { keys: ['M'], label: 'Mapa' },
  { keys: ['H'], label: 'Ajuda' },
];

/** Every control, grouped, for the help panel. */
export const HELP_CONTROLS: readonly KeyHint[] = [
  { keys: ['SETAS', 'WASD'], label: 'Andar pelo escritório' },
  { keys: ['Z', 'ENTER', 'ESPACO'], label: 'Conversar / avançar o diálogo' },
  { keys: ['X', 'ESC'], label: 'Fechar o diálogo' },
  { keys: ['TAB'], label: 'Ir para a sala com atividade mais recente' },
  { keys: ['SHIFT+TAB'], label: 'Próximo agente esperando por você' },
  { keys: ['M'], label: 'Mapa: o escritório inteiro' },
  { keys: ['H', '?'], label: 'Mostrar / ocultar esta ajuda' },
  { keys: ['MOUSE'], label: 'Clique em alguém para ver os detalhes' },
];

/** Rotating tips of the prompt bar while nothing is in front of the player. */
export const TIPS: readonly string[] = [
  'Chegue perto de um agente para ver papel, status e o que ele faz agora.',
  'Os monitores mostram a atividade: código, terminal, web, leitura...',
  'Monitor âmbar com "!" = o agente precisa da sua resposta.',
  'O asterisco laranja no monitor indica que o agente está pensando.',
  'O Tech Lead coordena a equipe da sala na mesa de três monitores.',
  'Clique em qualquer pessoa para abrir a ficha completa.',
];
/** How long each tip stays on screen. */
export const TIP_MS = 7000;

/** The tip shown `elapsedMs` after the scene started. */
export function tipAt(elapsedMs: number): string {
  const index = Math.floor(Math.max(0, elapsedMs) / TIP_MS) % TIPS.length;
  return TIPS[index] as string;
}

/** What the prompt bar offers right now. */
export type PromptContext =
  | { kind: 'dialog'; actions?: readonly KeyHint[] }
  | { kind: 'door'; name: string }
  | { kind: 'character'; name: string }
  | { kind: 'board' }
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
          { keys: ['Z'], label: 'Próximo' },
          { keys: ['X'], label: 'Fechar' },
          ...(context.actions ?? []),
        ],
      };
    case 'door':
      return { hints: [{ keys: ['Z'], label: `Iniciar sessão em ${context.name}` }] };
    case 'character':
      return { hints: [{ keys: ['Z'], label: `Conversar com ${context.name}` }] };
    case 'board':
      return { hints: [{ keys: ['Z'], label: 'Ver o Hall da Fama' }] };
    case 'idle':
      if (context.elapsedMs < TIP_MS) {
        return { hints: [{ keys: ['H'], label: 'Ver todos os controles' }] };
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

/** A rectangle in screen (game) pixels. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
