import type { ManagedSessionInfo, OfficeModel } from '@agents-office/shared';
import Phaser from 'phaser';
import type { Appearance } from '../characters/appearance';
import { CharacterController } from '../characters/characterController';
import { CharacterFactory } from '../characters/characterFactory';
import { type DebugState, installDebugState, updateDebugState } from '../debug/debugState';
import type { OfficeClient } from '../net/officeClient';
import { PlayerAvatar } from '../player/player';
import { DirectionInput, directionBetween } from '../player/playerMotion';
import { logicalSizeOf, renderScaleOf } from '../renderScale';
import { type Direction, type LoadedSkin, SKIN_KEYS, tileFrame } from '../skin';
import { decideClick } from '../ui/clickDecision';
import { commsBridgeOf } from '../ui/commsBinding';
import { DialogBox } from '../ui/dialogBox';
import {
  type DialogAction,
  type DialogContext,
  pagesFor,
  sessionActions,
} from '../ui/dialogContent';
import { hallOfFamePages } from '../ui/hallOfFame';
import { HelpPanel } from '../ui/helpPanel';
import { Hud } from '../ui/hud';
import {
  approachTile,
  freeTileNear,
  hudCounts,
  mostRecentRoom,
  nextWaiting,
  type Prompt,
  promptFor,
  roomFront,
} from '../ui/hudLogic';
import { type ManagedLook, managedLooks, REGISTRY_MANAGED } from '../ui/managedBinding';
import { ROLE_COLOR, STATUS_COLOR } from '../ui/nameTag';
import { DARK_PANEL, drawPanel } from '../ui/panel';
import { pendingActorIds } from '../ui/permissionLogic';
import { PromptBar } from '../ui/promptBar';
import { doorAt, roomCwd, sessionIdByTerminal } from '../ui/sessionBinding';
import { UiOverlay } from '../ui/uiOverlay';
import { boardAffordanceFrame } from '../world/boardAffordanceLogic';
import {
  BOARD_OPEN_EVENT,
  BOARD_OVERLAY_EVENT,
  type BoardOpenRequest,
  boardAtPoi,
  boardAtPoint,
  boardLabel,
  boardSpots,
} from '../world/boardProp';
import { DeskScreens } from '../world/deskScreens';
import { DoorAnimator } from '../world/doors';
import { LayoutInputBuilder } from '../world/layoutInput';
import { Lighting } from '../world/lighting';
import { isWallProp, PROP_DEFS, type PropPlacement, propDepthBias } from '../world/props';
import { RoomDecor } from '../world/roomDecor';
import { type BuildingLayout, CHUNK, type Layer, layoutBuilding } from '../world/roomLayout';
import { applyVignette, ensureVignette } from '../world/rugs';
import {
  REGISTRY_ACTIVE_TERMINAL,
  readStoredZoom,
  snapZoom,
  stepZoomCrisp,
  TERMINAL_ACTIVE_EVENT,
  textureFilterFor,
  wheelDirection,
  writeStoredZoom,
  ZOOM_CHANGED_EVENT,
  ZOOM_STEP_EVENT,
  type ZoomDirection,
} from '../zoom';
import { EVENT_SCENE_READY, REGISTRY_SKIN, REGISTRY_SKIN_WARNING } from './BootScene';

export const REGISTRY_CLIENT = 'officeClient';

const BACKGROUND = 0x0d1020;
const TILE = 16;
const LAYER_NAMES = ['floor', 'walls', 'furniture'] as const;
type LayerName = (typeof LAYER_NAMES)[number];
/** Camera follow smoothing (Phaser lerp factor per frame) and the sprite's visual centre. */
const FOLLOW_LERP = 0.14;
const FOLLOW_OFFSET_Y = -14;
/** World pixels the camera may show above the building (room for the HUD over the top wall). */
const TOP_MARGIN = 22;

const DEPTH = {
  floor: 0,
  walls: 2,
  wallProps: 2.5,
  furniture: 3,
  /** Props share the characters' formula: 4 + feet line / 10000. */
  props: 4,
  vignette: 900,
  ui: 1000,
} as const;
/** Construction wave: a new tile fades in this long, starting later the farther it is. */
const REVEAL_MS = 280;
const REVEAL_DELAY_PER_TILE_MS = 26;
const REVEAL_MAX_DELAY_MS = 900;
const TOAST_MS = 2800;

interface Reveal {
  layer: Phaser.Tilemaps.TilemapLayer;
  x: number;
  y: number;
  at: number;
}

/**
 * The office: renders the generated building (lobby, corridor and one room per project), keeps it
 * in sync with the model by diffing layouts, and hosts the player avatar (arrows/WASD, Z/Enter/Space
 * to talk, X/Esc to close, Tab / Shift+Tab to jump), the dialog box and the HUD.
 */
export class OfficeScene extends Phaser.Scene {
  private client!: OfficeClient;
  /** Second camera at zoom 1 that draws every screen-fixed UI object (see UiOverlay). */
  private ui!: UiOverlay;
  private hud!: Hud;
  private dialog!: DialogBox;
  private prompt!: PromptBar;
  private help!: HelpPanel;
  private player!: PlayerAvatar;
  private dialogTarget: string | undefined;
  /** Actions of the open dialog (keys that run while it is shown); empty outside the app. */
  private dialogActions: DialogAction[] = [];
  private waitingCursor: string | undefined;
  private readonly directionInput = new DirectionInput();
  private connected = false;
  private skin!: LoadedSkin['skin'];
  private layout: BuildingLayout = layoutBuilding([]);
  private layoutKey = '';
  private dirty = true;
  private readonly layoutInputs = new LayoutInputBuilder();
  private factory!: CharacterFactory;
  private controller!: CharacterController;
  private activeTerminal: string | undefined;
  private map: Phaser.Tilemaps.Tilemap | undefined;
  private layers = new Map<LayerName, Phaser.Tilemaps.TilemapLayer>();
  /** Tile index currently painted per layer (-1 = empty), to apply only the differences. */
  private painted = new Map<LayerName, number[][]>();
  /** What the previous tilemap showed, while a bigger one is being painted. */
  private carried = new Map<LayerName, number[][]>();
  private decor!: RoomDecor;
  private lighting!: Lighting;
  private screens!: DeskScreens;
  private doors!: DoorAnimator;
  private reveals: Reveal[] = [];
  /** Props on screen, by `id@x,y`. */
  private props = new Map<string, Phaser.GameObjects.Image>();
  /** The whiteboard under the pointer (highlighted, hand cursor, label). */
  private hoveredBoard: BoardOpenRequest | undefined;
  private boardLabel: Phaser.GameObjects.Text | undefined;
  /** Floating badge, glow and hover outline of each whiteboard, by `x,y` (spec 093). */
  private boardSignals = new Map<
    string,
    {
      badge: Phaser.GameObjects.Graphics;
      glow: Phaser.GameObjects.Graphics;
      outline: Phaser.GameObjects.Graphics;
      /** Rectangle the signals were drawn for (`left,top,width,height`): redrawn when the art moves. */
      rect: string;
    }
  >();
  /** The whiteboard overlay (Excalidraw) is open: the signals would compete with it. */
  private boardOverlayOpen = false;
  /** Whether the skin has a props atlas (else the furniture tiles are drawn). */
  private propsActive = false;
  /** Furniture cells hidden because a prop is drawn over them (`x,y`). */
  private propCells = new Set<string>();
  private clock = 0;
  private built = false;
  private knownRooms = new Set<string>();
  private toast: Phaser.GameObjects.Container | undefined;
  private overview = false;
  /** Camera zoom chosen by the user (Ctrl + wheel / buttons); the overview ignores it. */
  private userZoom = readStoredZoom();
  private textureMode = Phaser.Textures.FilterMode.NEAREST;
  private vignette!: Phaser.GameObjects.Image;
  private warningText: Phaser.GameObjects.BitmapText | undefined;
  private keys!: {
    cursors: Phaser.Types.Input.Keyboard.CursorKeys;
    w: Phaser.Input.Keyboard.Key;
    a: Phaser.Input.Keyboard.Key;
    s: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
  };

  constructor() {
    super('OfficeScene');
  }

  create(): void {
    this.events.once(Phaser.Scenes.Events.CREATE, () => this.game.events.emit(EVENT_SCENE_READY));
    this.client = this.registry.get(REGISTRY_CLIENT) as OfficeClient;
    this.cameras.main.setBackgroundColor(BACKGROUND);

    this.skin = (this.registry.get(REGISTRY_SKIN) as LoadedSkin).skin;
    this.propsActive = this.skin.props !== undefined && this.textures.exists(SKIN_KEYS.props);

    this.ui = new UiOverlay(this);
    this.decor = new RoomDecor(this);
    this.lighting = new Lighting(this, this.propsActive);
    this.screens = new DeskScreens(this);
    this.doors = new DoorAnimator(this, SKIN_KEYS.props, DEPTH.wallProps);
    const { width, height } = logicalSizeOf(this);
    this.vignette = this.add
      .image(0, 0, ensureVignette(this.textures, width, height))
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(DEPTH.vignette);
    this.ui.add(this.vignette);
    this.hud = new Hud(this, this.ui);
    this.dialog = new DialogBox(this, this.ui);
    this.prompt = new PromptBar(this, this.ui);
    this.help = new HelpPanel(this, ROLE_COLOR, STATUS_COLOR, this.ui);

    const warning = this.registry.get(REGISTRY_SKIN_WARNING) as string | undefined;
    if (warning) {
      this.warningText = this.add
        .bitmapText(4, height - 12, SKIN_KEYS.font, warning)
        .setTint(0xe8c14a)
        .setMaxWidth(width - 8)
        .setDepth(DEPTH.ui)
        .setScrollFactor(0);
      this.ui.add(this.warningText);
      console.warn(`[skin] ${warning}`);
    }
    const onResize = () => {
      const logical = logicalSizeOf(this);
      this.onResize(logical.width, logical.height);
    };
    this.scale.on(Phaser.Scale.Events.RESIZE, onResize);

    this.connected = this.client.isConnected();
    const offConnection = this.client.on('connection', (connected) => {
      this.connected = connected;
    });
    const offModel = this.client.on('model', () => {
      this.dirty = true;
    });
    this.factory = new CharacterFactory(this.textures, this.anims, this.skin);
    // A room whose characters are still walking out is kept alive; re-evaluate once one is gone.
    this.controller = new CharacterController(this, this.factory, () => {
      this.dirty = true;
    });
    const offEvent = this.client.on('event', (event) => this.controller.noteEvent(event));
    // Messages between agents: the sender walks to the recipient's desk (desktop shell only).
    const offComms = commsBridgeOf(window)?.onEvent((event) => this.controller.noteComm(event));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, onResize);
      offConnection();
      offModel();
      offEvent();
      offComms?.();
      this.game.events.off(ZOOM_STEP_EVENT, this.zoomBy, this);
      this.game.events.off(TERMINAL_ACTIVE_EVENT, this.onTerminalActive, this);
      this.game.events.off(BOARD_OVERLAY_EVENT, this.onBoardOverlay, this);
      this.clearBoardSignals();
      this.controller.destroy();
      this.player.destroy();
      this.hud.destroy();
      this.ui.destroy();
      this.prompt.destroy();
      this.help.destroy();
      this.dialog.destroy();
      this.decor.destroy();
      this.lighting.destroy();
      this.screens.destroy();
      for (const image of this.props.values()) image.destroy();
      this.props.clear();
      this.factory.releaseAll();
    });

    this.setupInput();
    this.refreshLayout();
    this.built = true;
    this.player = new PlayerAvatar(this, this.factory, this.layout.spawn);
    const camera = this.cameras.main;
    camera.startFollow(this.player.sprite, true, FOLLOW_LERP, FOLLOW_LERP, 0, FOLLOW_OFFSET_Y);
    this.applyZoom(this.userZoom);
    this.centerCameraOnPlayer();
    const debug = installDebugState();
    // Test helpers (E2E): walk-less moves to the neighbourhood of a character or the board.
    debug.actions = {
      approachCharacter: (id) => {
        const tile = this.controller.tileOf(id);
        if (!tile) return false;
        const spot = approachTile(
          this.layout,
          tile,
          (t) => this.controller.characterAtTile(t) !== undefined,
        );
        if (!spot) return false;
        this.jumpTo(spot.tile, spot.facing);
        return true;
      },
      clientPointOf: (id) => {
        const world = this.controller.centerOf(id);
        if (!world) return undefined;
        const camera = this.cameras.main;
        const box = this.game.canvas.getBoundingClientRect();
        return {
          x:
            box.left +
            ((world.x - camera.worldView.x) * camera.zoom * box.width) / this.scale.width,
          y:
            box.top +
            ((world.y - camera.worldView.y) * camera.zoom * box.height) / this.scale.height,
        };
      },
      approachDoor: (roomId) => {
        const front = roomFront(this.layout, roomId);
        if (!front) return false;
        this.jumpTo(front.tile, front.facing);
        return true;
      },
      approachBoard: () => {
        const poi = this.layout.pois.find((p) => p.type === 'hall-of-fame');
        if (!poi) return false;
        this.jumpTo(poi.tile, 'up');
        return true;
      },
    };
  }

  /** The window was resized: lay out every screen-fixed object again. */
  private onResize(width: number, height: number): void {
    this.ui.resize(width, height);
    applyVignette(this.textures, this.vignette, width, height);
    this.hud.layout(width);
    this.dialog.layout(width, height);
    this.prompt.layout(width, height);
    this.help.layout(width, height);
    this.toast?.setX(Math.round(width / 2));
    this.warningText?.setPosition(4, height - 12).setMaxWidth(width - 8);
    if (this.overview) this.fitOverview();
    else {
      // The render scale may have changed with the window: the effective zoom depends on it.
      this.setWorldZoom(this.userZoom * renderScaleOf(this));
      this.centerCameraOnPlayer();
    }
  }

  /** Current generated building (desk ids are stable across regenerations). */
  getLayout(): BuildingLayout {
    return this.layout;
  }

  private setupInput(): void {
    const keyboard = this.input.keyboard;
    if (keyboard) {
      this.keys = {
        cursors: keyboard.createCursorKeys(),
        w: keyboard.addKey('W'),
        a: keyboard.addKey('A'),
        s: keyboard.addKey('S'),
        d: keyboard.addKey('D'),
      };
      // Phaser replays a queued keydown when the frame loop lags behind the input (e.g. a key
      // pressed and released within one frame): the same DOM event must act only once.
      let lastEvent: Event | undefined;
      const press = (names: string[], handler: (event: KeyboardEvent) => void) => {
        for (const name of names) {
          keyboard.on(`keydown-${name}`, (event: KeyboardEvent) => {
            if (event === lastEvent) return;
            lastEvent = event;
            handler(event);
          });
        }
      };
      // While the help is open, any of its keys (or A/B) just closes it.
      const unlessHelp = (handler: (event: KeyboardEvent) => void) => (event: KeyboardEvent) => {
        if (this.help.isOpen) {
          this.help.setOpen(false);
          return;
        }
        handler(event);
      };
      // A button: Z / Enter / Space (the A key walks). B button: X / Esc.
      press(
        ['Z', 'ENTER', 'SPACE'],
        unlessHelp(() => this.onAction()),
      );
      press(
        ['X', 'ESC'],
        unlessHelp(() => this.dialog.close()),
      );
      press(
        ['T'],
        unlessHelp(() => this.runDialogAction('T')),
      );
      press(
        ['V'],
        unlessHelp(() => this.runDialogAction('V')),
      );
      press(
        ['TAB'],
        unlessHelp((event) => this.onTab(event.shiftKey)),
      );
      press(
        ['M'],
        unlessHelp(() => this.toggleOverview()),
      );
      press(['H'], () => this.toggleHelp());
      keyboard.on('keydown', (event: KeyboardEvent) => {
        if (event.key === '?') this.toggleHelp();
      });
    }
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.onPointer(pointer));
    // Ctrl + wheel zooms the office (the page's own zoom is cancelled in main.ts).
    this.input.on(
      'wheel',
      (pointer: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number) => {
        const event = pointer.event as WheelEvent | undefined;
        if (!event?.ctrlKey || this.overview) return;
        event.preventDefault();
        this.zoomBy(wheelDirection(dy));
      },
    );
    this.game.events.on(ZOOM_STEP_EVENT, this.zoomBy, this);
    this.activeTerminal = this.registry.get(REGISTRY_ACTIVE_TERMINAL) as string | undefined;
    this.game.events.on(TERMINAL_ACTIVE_EVENT, this.onTerminalActive, this);
    this.game.events.on(BOARD_OVERLAY_EVENT, this.onBoardOverlay, this);
  }

  /** One zoom step closer (1) or farther (-1); ignored in the overview. */
  private managedCache:
    | { model: OfficeModel; list: unknown; looks: ReadonlyMap<string, ManagedLook> }
    | undefined;

  /** Looks of the managed sessions, recomputed only when the model or the list changes. */
  private managedLooksFor(model: OfficeModel): ReadonlyMap<string, ManagedLook> {
    const list = (this.registry.get(REGISTRY_MANAGED) as ManagedSessionInfo[] | undefined) ?? [];
    const cache = this.managedCache;
    if (cache && cache.model === model && cache.list === list) return cache.looks;
    const looks = managedLooks(model, list);
    this.managedCache = { model, list, looks };
    return looks;
  }

  private onBoardOverlay(open: boolean): void {
    this.boardOverlayOpen = open;
  }

  private onTerminalActive(terminalId: string | undefined): void {
    this.activeTerminal = terminalId;
  }

  private zoomBy(direction: ZoomDirection): void {
    if (this.overview) return;
    this.applyZoom(stepZoomCrisp(this.userZoom, direction, renderScaleOf(this)));
  }

  /** Sets the main camera zoom (canvas pixels per texel) and the matching texture filter. */
  private setWorldZoom(effective: number): void {
    this.cameras.main.setZoom(effective);
    const mode =
      textureFilterFor(effective) === 'linear'
        ? Phaser.Textures.FilterMode.LINEAR
        : Phaser.Textures.FilterMode.NEAREST;
    if (mode === this.textureMode) return;
    this.textureMode = mode;
    for (const key of this.textures.getTextureKeys()) {
      if (key.startsWith('__')) continue;
      this.textures.get(key).setFilter(mode);
    }
  }

  private applyZoom(zoom: number): void {
    this.userZoom = snapZoom(zoom, renderScaleOf(this));
    this.setWorldZoom(this.userZoom * renderScaleOf(this));
    writeStoredZoom(zoom);
    this.publishZoom();
  }

  /** Tells the debug state and the zoom buttons the current level and overview mode. */
  private publishZoom(): void {
    const debug = installDebugState();
    debug.zoom = this.userZoom;
    debug.overview = this.overview;
    this.game.events.emit(ZOOM_CHANGED_EVENT, { zoom: this.userZoom, overview: this.overview });
  }

  /** H / ?: the controls and legends overlay (not over the zoomed-out map). */
  private toggleHelp(): void {
    if (this.overview) this.toggleOverview();
    this.help.toggle();
  }

  private heldDirection(): Direction | undefined {
    if (this.help?.isOpen) return undefined;
    const { cursors, w, a, s, d } = this.keys ?? {};
    if (!cursors || !w || !a || !s || !d) return undefined;
    return this.directionInput.update({
      up: cursors.up.isDown || w.isDown,
      down: cursors.down.isDown || s.isDown,
      left: cursors.left.isDown || a.isDown,
      right: cursors.right.isDown || d.isDown,
    });
  }

  private motionWorld() {
    return {
      collision: this.layout.collision,
      isOccupied: (tile: { x: number; y: number }) =>
        this.controller.characterAtTile(tile) !== undefined,
    };
  }

  private centerCameraOnPlayer(): void {
    const { x, y } = this.player.worldPosition();
    this.cameras.main.centerOn(x, y + FOLLOW_OFFSET_Y);
  }

  /** A / Enter / Space: advance the open dialog, or talk to whoever is on the tile in front. */
  private onAction(): void {
    if (this.dialog.isOpen) {
      this.dialog.advance();
      return;
    }
    const front = this.player.frontTile();
    const target = this.controller.characterAtTile(front);
    if (target) this.openDialog(target);
    else if (this.isBoardTile(front)) this.openHallOfFame();
    else if (this.boardToOpen()) this.game.events.emit(BOARD_OPEN_EVENT, this.boardToOpen());
    else this.startSessionAtDoor(front);
  }

  /** The desktop shell's actions; undefined in the browser, where the game has none. */
  /** Draws an avatar look (profile editor preview) onto `canvas`. */
  drawAvatarPreview(look: Appearance, canvas: HTMLCanvasElement): void {
    this.factory?.drawPreview(look, canvas);
  }

  private desktopActions() {
    return window.__desktopActions;
  }

  /** The whiteboard whose drawing spot the player stands on (inside the app only). */
  private boardToOpen(): BoardOpenRequest | undefined {
    if (!this.desktopActions() || this.boardOverlayOpen) return undefined;
    return boardAtPoi(this.layout, boardSpots(this.layout), this.player.tile);
  }

  /** The room door in front of the player (inside the app only): the entry point of a new session. */
  private doorToStart(tile: { x: number; y: number }) {
    if (!this.desktopActions()) return undefined;
    return doorAt(this.layout, tile);
  }

  private startSessionAtDoor(front: { x: number; y: number }): void {
    const door = this.doorToStart(front);
    if (!door) return;
    this.desktopActions()?.openProjectPicker(roomCwd(this.client.getModel(), door.roomId));
  }

  /** Runs the open dialog's action bound to `key` (e.g. T = open the session's terminal). */
  private runDialogAction(key: string): void {
    if (!this.dialog.isOpen) return;
    const action = this.dialogActions.find((candidate) => candidate.key === key);
    if (!action) return;
    if (action.id === 'open-vscode') {
      this.dialog.close();
      void this.desktopActions()?.openInVSCode(action.cwd);
      return;
    }
    const opened = this.desktopActions()?.openTerminal(action.terminalId) ?? false;
    this.dialog.close();
    if (!opened) this.showToast('TERMINAL FECHADO', 0xe8c14a);
  }

  /** The Hall of Fame mural hangs on the wall right above the lobby's `hall-of-fame` spot. */
  private isBoardTile(tile: { x: number; y: number }): boolean {
    return this.layout.pois.some(
      (poi) => poi.type === 'hall-of-fame' && poi.tile.x === tile.x && poi.tile.y - 1 === tile.y,
    );
  }

  private openHallOfFame(): void {
    this.dialogTarget = 'hall-of-fame';
    this.dialog.open(hallOfFamePages(this.client.getModel()), () => {
      this.dialogTarget = undefined;
    });
  }

  private onPointer(pointer: Phaser.Input.Pointer): void {
    if (this.help.isOpen) {
      this.help.setOpen(false);
      return;
    }
    if (this.dialog.isOpen) {
      this.dialog.advance();
      return;
    }
    const desktop = this.desktopActions();
    // pointer.worldX/Y follow the topmost camera (the UI one, zoom 1): project through the main one.
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const target = this.controller.characterAtPoint(world.x, world.y);
    const session = target ? this.client.getModel().sessions[target] : undefined;
    const board = target ? undefined : boardAtPoint(boardSpots(this.layout), world, TILE);
    const decision = decideClick({
      target: session ? 'tech-lead' : target ? 'other' : board ? 'board' : 'empty',
      session,
      desktop: desktop !== undefined,
      // The scene cannot see the tabs: openTerminal() answers false for a closed one.
      tabExists: true,
      overlayOpen: false,
    });
    if (decision === 'open-board' && board) this.game.events.emit(BOARD_OPEN_EVENT, board);
    else if (decision === 'collapse') desktop?.collapseTerminal();
    else if (target && decision === 'open-terminal' && session?.terminalId) {
      if (!desktop?.openTerminal(session.terminalId)) {
        this.openDialog(target);
        this.showToast('TERMINAL FECHADO', 0xe8c14a);
      }
    } else if (target && decision === 'open-dialog') this.openDialog(target);
  }

  /** Highlights the whiteboard under the pointer, with a hand cursor and an explicit label. */
  private updateBoardHover(world: { x: number; y: number } | undefined): void {
    const blocked =
      this.help.isOpen || this.dialog.isOpen || this.overview || this.boardOverlayOpen;
    const hit =
      world &&
      !blocked &&
      this.desktopActions() &&
      !this.controller.characterAtPoint(world.x, world.y)
        ? boardAtPoint(boardSpots(this.layout), world, TILE)
        : undefined;
    if (hit?.roomId === this.hoveredBoard?.roomId && hit?.x === this.hoveredBoard?.x) return;
    if (this.hoveredBoard) this.setBoardHighlight(this.hoveredBoard, false);
    this.hoveredBoard = hit;
    if (hit) this.setBoardHighlight(hit, true);
    this.input.setDefaultCursor(hit ? 'pointer' : '');
    if (!hit) {
      this.boardLabel?.setVisible(false);
      return;
    }
    if (!this.boardLabel) {
      this.boardLabel = this.add
        .text(0, 0, boardLabel(), {
          fontFamily: 'monospace',
          fontSize: '8px',
          color: '#ffffff',
          backgroundColor: '#1d2433',
          padding: { x: 3, y: 2 },
        })
        .setOrigin(0.5, 1)
        .setDepth(DEPTH.vignette - 1);
    }
    this.boardLabel
      .setPosition((hit.x + hit.w / 2) * TILE, (hit.y - 1) * TILE - 2)
      .setVisible(true);
  }

  /** Badge, glow and hover outline of every whiteboard, redrawn each frame from the pure logic. */
  private updateBoardAffordance(): void {
    const frame = boardAffordanceFrame(
      {
        desktop: this.desktopActions() !== undefined,
        boardOpen: this.boardOverlayOpen,
        helpOpen: this.help.isOpen,
        dialogOpen: this.dialog.isOpen,
        overview: this.overview,
      },
      this.hoveredBoard !== undefined,
      this.clock,
    );
    const spots = boardSpots(this.layout);
    const live = new Set(spots.map((spot) => `${spot.x},${spot.y}`));
    for (const [key, signal] of this.boardSignals) {
      if (live.has(key)) continue;
      this.destroyBoardSignal(signal);
      this.boardSignals.delete(key);
    }
    for (const spot of spots) {
      const key = `${spot.x},${spot.y}`;
      const rect = this.boardRect(spot);
      const rectKey = `${rect.left},${rect.top},${rect.width},${rect.height}`;
      let signal = this.boardSignals.get(key);
      if (signal && signal.rect !== rectKey) {
        this.destroyBoardSignal(signal);
        signal = undefined;
      }
      if (!signal) {
        signal = { ...this.createBoardSignal(rect), rect: rectKey };
        this.boardSignals.set(key, signal);
      }
      const hovered = this.hoveredBoard?.x === spot.x && this.hoveredBoard.roomId === spot.roomId;
      signal.badge.setVisible(frame.badge).setY(frame.badgeOffset);
      signal.glow.setVisible(frame.glow).setAlpha(frame.glowAlpha);
      signal.outline.setVisible(hovered && frame.badge);
    }
  }

  /** The three world-space overlays of one whiteboard, above the wall props and below characters. */
  private createBoardSignal(rect: { left: number; top: number; width: number; height: number }) {
    const { left, top, width, height } = rect;
    const depth = DEPTH.wallProps + 0.2;
    const glow = this.add
      .graphics()
      .setDepth(depth)
      .fillStyle(0xfff2b0, 1)
      .fillRect(left, top, width, height);
    const outline = this.add
      .graphics()
      .setDepth(depth)
      .lineStyle(1, 0xfff2b0, 1)
      .strokeRect(left + 0.5, top + 0.5, width - 1, height - 1)
      .setVisible(false);
    // Badge: a small speech bubble with a pencil, centred above the board (drawn at y = 0, bobbed by setY).
    const cx = left + width / 2;
    const by = top - 11;
    const badge = this.add.graphics().setDepth(depth + 0.1);
    badge.fillStyle(0x1d2433, 1).fillRect(cx - 6, by, 12, 10);
    badge.fillRect(cx - 1, by + 10, 2, 2);
    badge.lineStyle(1, 0xfff2b0, 1).strokeRect(cx - 5.5, by + 0.5, 11, 9);
    badge.fillStyle(0xfff2b0, 1);
    for (let i = 0; i < 5; i += 1) badge.fillRect(cx - 3 + i, by + 7 - i, 2, 1);
    badge.fillStyle(0xe8c14a, 1).fillRect(cx + 1, by + 2, 2, 1);
    return { badge, glow, outline };
  }

  /** Where the board art really is (its image bounds), else the footprint of the prop. */
  private boardRect(spot: BoardOpenRequest) {
    const bounds = this.props.get(`whiteboard@${spot.x},${spot.y}`)?.getBounds();
    if (bounds) {
      return {
        left: Math.round(bounds.x),
        top: Math.round(bounds.y),
        width: Math.round(bounds.width),
        height: Math.round(bounds.height),
      };
    }
    return { left: spot.x * TILE, top: (spot.y - 1) * TILE, width: spot.w * TILE, height: TILE };
  }

  private destroyBoardSignal(signal: {
    badge: Phaser.GameObjects.Graphics;
    glow: Phaser.GameObjects.Graphics;
    outline: Phaser.GameObjects.Graphics;
  }): void {
    signal.badge.destroy();
    signal.glow.destroy();
    signal.outline.destroy();
  }

  private clearBoardSignals(): void {
    for (const signal of this.boardSignals.values()) this.destroyBoardSignal(signal);
    this.boardSignals.clear();
  }

  private setBoardHighlight(board: BoardOpenRequest, on: boolean): void {
    const image = this.props.get(`whiteboard@${board.x},${board.y}`);
    if (!image) return;
    if (on) image.setTint(0xfff2b0);
    else image.clearTint();
  }

  private openDialog(id: string): void {
    const model = this.client.getModel();
    const look = this.managedLooksFor(model).get(id);
    const context: DialogContext = {
      desktop: this.desktopActions() !== undefined,
      managedName: look?.name,
      managedProfession: look?.profession,
    };
    const pages = pagesFor(model, id, Date.now(), context);
    if (!pages) return;
    const session = model.sessions[id];
    this.dialogActions = session
      ? sessionActions(session, context, model.projects[session.projectId]?.cwd)
      : [];
    const tile = this.controller.tileOf(id);
    if (tile) {
      this.controller.faceToward(id, this.player.tile);
      const facing = directionBetween(this.player.tile, tile);
      // Look at the character when it is next to the player (click from afar keeps the facing).
      if (
        facing &&
        Math.abs(tile.x - this.player.tile.x) + Math.abs(tile.y - this.player.tile.y) === 1
      )
        this.player.motion.facing = facing;
    }
    this.dialogTarget = id;
    this.dialog.open(pages, () => {
      this.controller.releaseFacing(id);
      this.dialogTarget = undefined;
      this.dialogActions = [];
    });
  }

  /** Tab: the room with the latest activity. Shift+Tab: the next waiting agent. */
  private onTab(backwards: boolean): void {
    if (this.dialog.isOpen) return;
    const model = this.client.getModel();
    const isOccupied = (tile: { x: number; y: number }) =>
      this.controller.characterAtTile(tile) !== undefined;
    if (backwards) {
      const id = nextWaiting(model, this.waitingCursor);
      const tile = id ? this.controller.tileOf(id) : undefined;
      if (!id || !tile) return;
      this.waitingCursor = id;
      const spot = approachTile(this.layout, tile, isOccupied);
      if (spot) this.jumpTo(spot.tile, spot.facing);
      return;
    }
    const roomId = mostRecentRoom(model);
    const front = roomId ? roomFront(this.layout, roomId) : undefined;
    const tile = front ? freeTileNear(this.layout, front.tile, isOccupied) : undefined;
    if (front && tile) this.jumpTo(tile, front.facing);
  }

  private jumpTo(tile: { x: number; y: number }, facing: Direction): void {
    this.player.teleport(tile, facing);
    this.centerCameraOnPlayer();
  }

  /** Regenerates the layout when its inputs changed and applies the difference to the scene. */
  private refreshLayout(): void {
    const input = this.layoutInputs.build(
      this.client.getModel(),
      this.controller.sessionsInUse(),
      this.controller.agentsInUse(),
    );
    const key = JSON.stringify(input);
    if (key === this.layoutKey) return;
    this.layoutKey = key;
    this.layout = layoutBuilding(input);
    this.applyLayout(this.layout);
  }

  private tileIndex(layer: Layer, x: number, y: number): number {
    const id = layer[y]?.[x];
    return id ? tileFrame(this.skin, id) : -1;
  }

  /** Whether the skin draws this prop (it has a frame for it in its props atlas). */
  private hasProp(prop: PropPlacement): boolean {
    return this.propsActive && this.skin.props?.frames[prop.id] !== undefined;
  }

  /** Furniture cells covered by a drawn prop: their fallback tiles are not painted. */
  private coveredCells(layout: BuildingLayout): Set<string> {
    const cells = new Set<string>();
    for (const prop of layout.props) {
      if (!this.hasProp(prop) || isWallProp(prop.id)) continue;
      for (let i = 0; i < PROP_DEFS[prop.id].w; i += 1) cells.add(`${prop.x + i},${prop.y}`);
    }
    // The animated doors replace the `door` tile.
    if (this.propsActive && DoorAnimator.frameCount(this.skin.props?.frames) > 0) {
      for (const door of layout.doors) cells.add(`${door.tile.x},${door.tile.y}`);
    }
    return cells;
  }

  /**
   * Creates the props that appeared and destroys the ones that left. Floor props are depth-sorted
   * with the characters by their footprint's bottom edge (a character behind a plant is hidden by
   * it); wall props hang on the wall, under everything that stands on the floor.
   */
  private syncProps(layout: BuildingLayout): void {
    const wanted = new Set<string>();
    const added: { image: Phaser.GameObjects.Image; x: number; y: number }[] = [];
    for (const prop of layout.props) {
      const frame = this.skin.props?.frames[prop.id];
      if (!frame || !this.hasProp(prop)) continue;
      const key = `${prop.id}@${prop.x},${prop.y}`;
      wanted.add(key);
      if (this.props.has(key)) continue;
      const bottom = (prop.y + 1) * TILE;
      const depth = isWallProp(prop.id)
        ? DEPTH.wallProps
        : DEPTH.props + (bottom - 0.5 + propDepthBias(prop.id)) / 10_000;
      const image = this.add
        .image(prop.x * TILE, bottom, SKIN_KEYS.props, prop.id)
        .setOrigin(frame.ax / frame.w, frame.ay / frame.h)
        .setDepth(depth);
      this.props.set(key, image);
      added.push({ image, x: prop.x, y: prop.y });
    }
    for (const [key, image] of this.props) {
      if (wanted.has(key)) continue;
      image.destroy();
      this.props.delete(key);
    }
    if (!this.built || added.length === 0) return;
    // Same construction wave as the tiles.
    const cx = added.reduce((sum, p) => sum + p.x, 0) / added.length;
    const cy = added.reduce((sum, p) => sum + p.y, 0) / added.length;
    for (const { image, x, y } of added) {
      const distance = Math.hypot(x - cx, (y - cy) * 0.6);
      image.setAlpha(0);
      this.tweens.add({
        targets: image,
        alpha: 1,
        duration: REVEAL_MS,
        delay: Math.min(REVEAL_MAX_DELAY_MS, distance * REVEAL_DELAY_PER_TILE_MS),
      });
    }
  }

  private ensureMap(width: number, height: number): void {
    const map = this.map;
    if (map && map.width >= width && map.height >= height) return;
    map?.destroy();
    // Fades pending on the destroyed layers would throw in `updateReveals` on every frame.
    this.reveals = [];
    // Tiles that were already on screen must not fade in again on the recreated map.
    this.carried = new Map(this.painted);
    // Grow-only capacity (rounded to whole chunks) so the tilemap is rarely recreated.
    const w = Math.ceil(width / CHUNK) * CHUNK;
    const h = Math.ceil(height / CHUNK) * CHUNK;
    this.map = this.make.tilemap({ tileWidth: TILE, tileHeight: TILE, width: w, height: h });
    const tileset = this.map.addTilesetImage('tiles', SKIN_KEYS.tileset, TILE, TILE, 0, 0);
    this.layers.clear();
    this.painted.clear();
    for (const name of LAYER_NAMES) {
      const layer = tileset ? this.map.createBlankLayer(name, tileset, 0, 0, w, h) : null;
      if (!layer) continue;
      layer.setDepth(DEPTH[name]);
      this.layers.set(name, layer);
      this.painted.set(
        name,
        Array.from({ length: h }, () => Array.from({ length: w }, () => -1)),
      );
    }
  }

  private applyLayout(layout: BuildingLayout): void {
    this.ensureMap(layout.width, layout.height);
    this.propCells = this.coveredCells(layout);
    const added: { name: LayerName; x: number; y: number }[] = [];
    for (const name of LAYER_NAMES) {
      const layer = this.layers.get(name);
      const painted = this.painted.get(name);
      if (!layer || !painted) continue;
      painted.forEach((row, y) => {
        row.forEach((current, x) => {
          const hidden = name === 'furniture' && this.propCells.has(`${x},${y}`);
          const want = hidden ? -1 : this.tileIndex(layout.layers[name], x, y);
          if (current === want) return;
          if (want < 0) layer.removeTileAt(x, y);
          else {
            layer.putTileAt(want, x, y);
            const before = this.carried.get(name)?.[y]?.[x] ?? -1;
            if (current < 0 && before < 0) added.push({ name, x, y });
          }
          row[x] = want;
        });
      });
    }
    this.carried.clear();
    if (this.built) this.scheduleReveal(added);

    this.syncProps(layout);
    this.decor.sync(layout, this.built);
    this.lighting.sync(layout);
    this.screens.sync(layout, this.propsActive ? this.skin.props?.frames : undefined);
    this.doors.sync(layout, this.propsActive ? this.skin.props?.frames : undefined);

    const rooms = new Set(layout.rooms.map((room) => room.id));
    if (this.built) {
      const fresh = layout.rooms.filter((room) => !this.knownRooms.has(room.id)).pop();
      if (fresh) this.showToast(`NOVA SALA  ${fresh.name}`, fresh.accent);
    }
    this.knownRooms = rooms;

    // The camera never leaves the building (except in the overview, which centres it).
    if (this.overview) this.fitOverview();
    else this.setCameraBounds();
  }

  /** New tiles fade in as a wave that spreads from the middle of what was just built. */
  private scheduleReveal(added: { name: LayerName; x: number; y: number }[]): void {
    if (added.length === 0) return;
    const cx = added.reduce((sum, t) => sum + t.x, 0) / added.length;
    const cy = added.reduce((sum, t) => sum + t.y, 0) / added.length;
    for (const { name, x, y } of added) {
      const layer = this.layers.get(name);
      const tile = layer?.getTileAt(x, y);
      if (!layer || !tile) continue;
      tile.alpha = 0;
      const distance = Math.hypot(x - cx, (y - cy) * 0.6);
      const delay = Math.min(REVEAL_MAX_DELAY_MS, distance * REVEAL_DELAY_PER_TILE_MS);
      this.reveals.push({ layer, x, y, at: this.clock + delay });
    }
  }

  private updateReveals(): void {
    if (this.reveals.length === 0) return;
    this.reveals = this.reveals.filter(({ layer, x, y, at }) => {
      const tile = layer.getTileAt(x, y);
      if (!tile) return false;
      const t = Math.min(1, Math.max(0, (this.clock - at) / REVEAL_MS));
      tile.alpha = t;
      return t < 1;
    });
  }

  private showToast(message: string, accent: number): void {
    this.toast?.destroy();
    const text = this.add
      .bitmapText(0, 0, SKIN_KEYS.font, message)
      .setOrigin(0.5, 0)
      .setTint(0xffffff);
    const w = Math.round(text.width + 24);
    const box = this.add.graphics();
    const left = -Math.round(w / 2);
    drawPanel(box, left, 0, w, 17, DARK_PANEL);
    box.fillStyle(accent, 1).fillRect(left + 5, 5, 4, 7);
    box.fillStyle(0xffffff, 0.4).fillRect(left + 5, 5, 4, 1);
    box.fillStyle(accent, 0.6).fillRect(left + 2, 16, w - 4, 1);
    text.setPosition(5, 2);
    const container = this.add
      .container(Math.round(logicalSizeOf(this).width / 2), 26, [box, text])
      .setScrollFactor(0)
      .setDepth(DEPTH.ui + 600)
      .setAlpha(0);
    this.ui.add(container);
    this.toast = container;
    this.tweens.add({ targets: container, alpha: 1, y: 28, duration: 220 });
    this.tweens.add({
      targets: container,
      alpha: 0,
      delay: TOAST_MS,
      duration: 400,
      onComplete: () => {
        container.destroy();
        if (this.toast === container) this.toast = undefined;
      },
    });
  }

  /** M: zoom out to see the whole building, or back to following the avatar. */
  private toggleOverview(): void {
    const camera = this.cameras.main;
    this.overview = !this.overview;
    this.controller.setTagsVisible(!this.overview);
    this.hud.setVisible(!this.overview);
    this.prompt.setVisible(!this.overview);
    this.vignette.setVisible(!this.overview);
    this.toast?.setVisible(!this.overview);
    if (this.overview) this.dialog.close();
    this.player.setTagVisible(!this.overview);
    if (this.overview) {
      camera.stopFollow();
      this.fitOverview();
    } else {
      this.setWorldZoom(this.userZoom * renderScaleOf(this));
      this.setCameraBounds();
      camera.startFollow(this.player.sprite, true, FOLLOW_LERP, FOLLOW_LERP, 0, FOLLOW_OFFSET_Y);
      this.centerCameraOnPlayer();
    }
    this.publishZoom();
  }

  /**
   * The camera never leaves the building, except for a margin above it so the top wall (windows,
   * Hall of Fame, wall art) is not hidden under the HUD.
   */
  private setCameraBounds(): void {
    const { width, height } = this.layout;
    this.cameras.main.setBounds(0, -TOP_MARGIN, width * TILE, height * TILE + TOP_MARGIN);
  }

  /** Zooms the camera out (in 1/8 steps) until the whole building fits on screen. */
  private fitOverview(): void {
    const camera = this.cameras.main;
    const view = logicalSizeOf(this);
    const fit = Math.min(
      view.width / (this.layout.width * TILE),
      view.height / (this.layout.height * TILE),
      1,
    );
    this.setWorldZoom(Math.max(0.125, Math.floor(fit * 8) / 8) * renderScaleOf(this));
    // The bounds would pin a view bigger than the building to its top-left corner.
    camera.removeBounds();
    camera.centerOn((this.layout.width * TILE) / 2, (this.layout.height * TILE) / 2);
  }

  /** The contextual prompt: dialog keys, the character in front, the board, or a tip. */
  private currentPrompt(facingId: string | undefined, model: OfficeModel): Prompt | undefined {
    if (this.help.isOpen) return undefined;
    if (this.dialog.isOpen) {
      return promptFor({
        kind: 'dialog',
        actions: this.dialogActions.map((a) => ({ keys: [a.key], label: a.label })),
      });
    }
    if (facingId) {
      return promptFor({ kind: 'character', name: this.controller.displayName(facingId, model) });
    }
    if (this.isBoardTile(this.player.frontTile())) return promptFor({ kind: 'board' });
    if (this.boardToOpen()) return promptFor({ kind: 'whiteboard' });
    const door = this.doorToStart(this.player.frontTile());
    if (door) {
      return promptFor({ kind: 'door', name: model.projects[door.roomId]?.name ?? door.roomId });
    }
    return promptFor({ kind: 'idle', elapsedMs: this.clock });
  }

  override update(_time: number, delta: number): void {
    this.clock += delta;
    this.updateReveals();
    if (this.overview && this.heldDirection()) this.toggleOverview();
    if (this.dirty) {
      this.dirty = false;
      this.refreshLayout();
    }
    const model = this.client.getModel();
    const player = this.player;
    // A regenerated layout may have put furniture under the player: go back to the lobby.
    if (this.layout.collision[player.tile.y]?.[player.tile.x] !== false) {
      this.jumpTo(this.layout.spawn, 'down');
    }
    this.controller.setExternalBlockers(player.motion.occupiedTiles());
    const pointer = this.input.activePointer;
    const world =
      pointer.wasTouch || this.overview
        ? undefined
        : this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    this.controller.setFocus(player.tile, world && { x: world.x, y: world.y });
    const facingId = this.controller.characterAtTile(player.frontTile());
    const hoveredId = world ? this.controller.characterAtPoint(world.x, world.y) : undefined;
    this.updateBoardHover(world);
    this.updateBoardAffordance();
    this.controller.setManaged(this.managedLooksFor(model));
    this.controller.setActiveLead(sessionIdByTerminal(model, this.activeTerminal));
    this.controller.setHighlight(this.overview ? undefined : (hoveredId ?? facingId));
    const permissions = this.client.getPermissions();
    this.controller.setAsking(pendingActorIds(permissions));
    this.controller.update(model, this.layout, delta);
    const glows = this.screens.update(delta, this.controller.seatedWorkers());
    this.lighting.update(delta, glows);
    // Characters never step onto the player (they queue), so the player only checks furniture/NPCs.
    player.update(delta, this.heldDirection(), this.motionWorld(), this.dialog.isOpen);
    this.doors.update(delta, [...this.controller.positions(), player.motion.position()]);
    this.dialog.update(delta);
    this.prompt.show(this.currentPrompt(facingId, model));
    // Facing someone, the prompt names them: the player's own tag would only cover their card.
    this.player.setTagVisible(!this.overview && facingId === undefined);
    this.prompt.update(delta);
    const counts = hudCounts(model, permissions);
    this.hud.update(delta, counts, this.connected);
    const position = player.motion.position();
    updateDebugState(installDebugState(), {
      connected: this.connected,
      model,
      characters: this.controller.debugCharacters(model),
      player: {
        x: Math.round(position.x * 100) / 100,
        y: Math.round(position.y * 100) / 100,
        facing: player.facing,
        moving: player.motion.moving,
      },
      hud: { text: this.hud.shownText },
      ui: this.debugUi(),
      dialog: {
        open: this.dialog.isOpen,
        targetId: this.dialogTarget,
        pages: this.dialog.openPages,
      },
      permissions: { queue: [...permissions] },
      rooms: this.layout.rooms.map((room) => ({
        id: room.id,
        name: room.name,
        ...room.bounds,
        sign: this.layout.signs.find((sign) => sign.roomId === room.id)?.text ?? '',
      })),
      doors: this.doors.states(),
    });
  }

  /** Where the UI really is on screen and which cameras draw it, for the E2E debug state. */
  private debugUi(): DebugState['ui'] {
    const hud = this.hud.bounds;
    const main = this.cameras.main;
    const parts = this.ui.layer.list;
    return {
      screen: logicalSizeOf(this),
      cameraZoom: this.ui.camera.zoom / renderScaleOf(this),
      mainCameraDrawsUi: parts.some((part) => this.ui.isDrawnBy(main, part)),
      hud: hud.status,
      hints: hud.hints,
      dialog: this.dialog.bounds,
    };
  }
}
