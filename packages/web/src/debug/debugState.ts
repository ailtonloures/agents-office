import type {
  ActorStatus,
  OfficeModel,
  PermissionDecision,
  PermissionRequest,
  Profession,
} from '@agents-office/shared';
import { createEmptyModel } from '@agents-office/shared';

export interface DebugCharacter {
  id: string;
  role: 'lead' | 'agent' | 'avatar';
  profession: Profession | undefined;
  status: ActorStatus | undefined;
  roomId: string | undefined;
  /** Position in tiles (fractional while walking). */
  x: number;
  y: number;
  /** Visual state machine phase and activity (see characterMachine). */
  phase?: string;
  activity?: string;
}

/** Summary of the scene exposed on `window.__office` for E2E tests. */
export interface DebugState {
  connected: boolean;
  model: OfficeModel;
  characters: DebugCharacter[];
  /** Rooms of the generated building (tile coordinates). */
  /** Player avatar (tile coordinates, fractional while walking). */
  player: { x: number; y: number; facing: string; moving: boolean };
  /** The HUD text and the dialog state. */
  hud: { text: string };
  dialog: { open: boolean; targetId: string | undefined; pages: readonly (readonly string[])[] };
  /** Pending permission requests (oldest first) and the state of the card. */
  permissions: {
    queue: PermissionRequest[];
    cardOpen: boolean;
    typing: boolean;
    /** Card rectangle in game pixels (screen-fixed), for click routing outside Phaser. */
    cardRect?: { x: number; y: number; width: number; height: number };
  };
  /** Helpers installed by the scene for E2E tests (teleport next to a character / the board). */
  actions?: {
    approachCharacter(id: string): boolean;
    approachBoard(): boolean;
    /** Teleports to the corridor tile facing the room's door; false when the room is unknown. */
    approachDoor(roomId: string): boolean;
    /** Sends a decision as if the card's button had been used; false when it was not sent. */
    decidePermission(id: string, decision: PermissionDecision): boolean;
  };
  rooms: { id: string; name: string; x: number; y: number; w: number; h: number; sign: string }[];
}

declare global {
  interface Window {
    __office?: DebugState;
  }
}

export function createDebugState(): DebugState {
  return {
    connected: false,
    model: createEmptyModel(),
    characters: [],
    player: { x: 0, y: 0, facing: 'down', moving: false },
    hud: { text: '' },
    dialog: { open: false, targetId: undefined, pages: [] },
    permissions: { queue: [], cardOpen: false, typing: false },
    rooms: [],
  };
}

/** Installs (or reuses) `window.__office` and returns it. */
export function installDebugState(target: { __office?: DebugState } = window): DebugState {
  target.__office ??= createDebugState();
  return target.__office;
}

/** Updates the debug state in place (the object identity is stable for test code). */
export function updateDebugState(state: DebugState, next: Partial<DebugState>): void {
  if (next.connected !== undefined) state.connected = next.connected;
  if (next.model !== undefined) state.model = next.model;
  if (next.characters !== undefined) state.characters = next.characters;
  if (next.player !== undefined) state.player = next.player;
  if (next.hud !== undefined) state.hud = next.hud;
  if (next.dialog !== undefined) state.dialog = next.dialog;
  if (next.permissions !== undefined) state.permissions = next.permissions;
  if (next.rooms !== undefined) state.rooms = next.rooms;
}
