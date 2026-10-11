import type {
  ActorStatus,
  OfficeModel,
  PermissionRequest,
  Profession,
} from '@agents-office/shared';
import { createEmptyModel } from '@agents-office/shared';
import type { Rect } from '../ui/hudLogic';

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
  /** Office camera zoom chosen by the user (the overview does not change it). */
  zoom: number;
  /** True while the overview (M) is showing the whole building. */
  overview: boolean;
  /** The HUD text and the dialog state. */
  hud: { text: string };
  /** Screen-fixed UI: rectangles in game pixels and the cameras that draw it (spec 037). */
  ui: {
    screen: { width: number; height: number };
    /** Zoom of the UI camera; it must stay 1 whatever the office zoom is. */
    cameraZoom: number;
    /** True if the zoomed main camera would draw any UI object (must be false). */
    mainCameraDrawsUi: boolean;
    hud: Rect;
    hints: Rect;
    dialog: Rect;
  };
  dialog: { open: boolean; targetId: string | undefined; pages: readonly (readonly string[])[] };
  /** Pending permission requests (oldest first). */
  permissions: { queue: PermissionRequest[] };
  /** Helpers installed by the scene for E2E tests (teleport next to a character / the board). */
  actions?: {
    approachCharacter(id: string): boolean;
    approachBoard(): boolean;
    /** Page (client) coordinates of the centre of a character, to click on it. */
    clientPointOf(id: string): { x: number; y: number } | undefined;
    /** Teleports to the corridor tile facing the room's door; false when the room is unknown. */
    approachDoor(roomId: string): boolean;
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
    zoom: 1,
    overview: false,
    hud: { text: '' },
    ui: {
      screen: { width: 0, height: 0 },
      cameraZoom: 1,
      mainCameraDrawsUi: false,
      hud: { x: 0, y: 0, width: 0, height: 0 },
      hints: { x: 0, y: 0, width: 0, height: 0 },
      dialog: { x: 0, y: 0, width: 0, height: 0 },
    },
    dialog: { open: false, targetId: undefined, pages: [] },
    permissions: { queue: [] },
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
  if (next.zoom !== undefined) state.zoom = next.zoom;
  if (next.overview !== undefined) state.overview = next.overview;
  if (next.hud !== undefined) state.hud = next.hud;
  if (next.ui !== undefined) state.ui = next.ui;
  if (next.dialog !== undefined) state.dialog = next.dialog;
  if (next.permissions !== undefined) state.permissions = next.permissions;
  if (next.rooms !== undefined) state.rooms = next.rooms;
}
