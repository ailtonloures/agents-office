import type { AgentsOfficeDesktop, BrowserBridge, TerminalBridge } from '@agents-office/shared';
// Pure model of the terminal panel (tabs, titles, focus, size). No DOM and no xterm: the view in
// `terminalPanel.ts` renders it. Tested with Vitest.

export type TabState = 'running' | 'exited';

export interface TerminalTab {
  id: string;
  cwd: string;
  state: TabState;
  /** Exit code once the process finished. */
  exitCode?: number;
  /** Office state of the session bound to this tab (`pensando`, `trabalhando`...), if any. */
  activity?: string;
  /** `browser`: the embedded browser of `cwd` (no pty behind it). Absent: a terminal. */
  kind?: 'browser';
}

export const BROWSER_TAB_PREFIX = 'browser:';

/** Id of the browser tab of a workspace (one per workspace). */
export function browserTabId(cwd: string): string {
  return `${BROWSER_TAB_PREFIX}${cwd}`;
}

export function isBrowserTab(tab: Pick<TerminalTab, 'kind'>): boolean {
  return tab.kind === 'browser';
}

/** Adds (or just activates) the browser tab of `cwd`. */
export function openBrowserTab(model: PanelModel, cwd: string): PanelModel {
  return addTab(model, { id: browserTabId(cwd), cwd, state: 'running', kind: 'browser' });
}

/** Workspace a new browser tab opens for: the active tab's, else the last tab's. */
export function browserTargetCwd(model: PanelModel): string | undefined {
  return (activeTab(model) ?? model.tabs[model.tabs.length - 1])?.cwd;
}

/**
 * The id the office should treat as the shown terminal: a browser tab is not a terminal, so the
 * scene (Tech Lead highlight, bindings) sees none while it is shown.
 */
export function shownTerminalId(model: PanelModel): string | undefined {
  if (model.tabs.length === 0 || model.collapsed) return undefined;
  const tab = activeTab(model);
  return tab && !isBrowserTab(tab) ? tab.id : undefined;
}

export type FocusOwner = 'player' | 'terminal';

export type PanelDock = 'bottom' | 'left' | 'right';

export interface PanelModel {
  tabs: readonly TerminalTab[];
  activeId: string | undefined;
  collapsed: boolean;
  /** Height of the expanded panel in CSS pixels. */
  height: number;
  /** Side of the window the panel is docked to. */
  dock: PanelDock;
  /** Width of the expanded panel in CSS pixels (used when docked left or right). */
  width: number;
  /** Who receives the keyboard: the player (Phaser canvas) or the active terminal. */
  focus: FocusOwner;
}

export const DEFAULT_PANEL_HEIGHT = 280;
export const MIN_PANEL_HEIGHT = 120;
/** The office keeps at least this many pixels of height, whatever the panel size. */
export const MIN_OFFICE_HEIGHT = 160;
export const DEFAULT_PANEL_WIDTH = 480;
export const MIN_PANEL_WIDTH = 240;
/** The office keeps at least this many pixels of width, whatever the panel size. */
export const MIN_OFFICE_WIDTH = 256;
/** Height of the tab strip, which stays visible when the panel is collapsed. */
export const TAB_BAR_HEIGHT = 30;

export function createPanelModel(
  height = DEFAULT_PANEL_HEIGHT,
  width = DEFAULT_PANEL_WIDTH,
  dock: PanelDock = 'bottom',
): PanelModel {
  return { tabs: [], activeId: undefined, collapsed: false, height, dock, width, focus: 'player' };
}

export interface StoredPanel {
  height?: number;
  width?: number;
  dock: PanelDock;
  collapsed: boolean;
}

const DOCKS: readonly PanelDock[] = ['bottom', 'left', 'right'];

function validSize(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * Reads the persisted panel state. Older values without `dock`/`width` assume `bottom` and the
 * default width (left undefined); invalid fields are discarded.
 */
export function parseStoredPanel(raw: unknown): StoredPanel {
  const value = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const dock = DOCKS.find((d) => d === value.dock) ?? 'bottom';
  const stored: StoredPanel = { dock, collapsed: value.collapsed === true };
  const height = validSize(value.height);
  const width = validSize(value.width);
  if (height !== undefined) stored.height = height;
  if (width !== undefined) stored.width = width;
  return stored;
}

/** Last path segment of the working directory (`/a/b/` -> `b`, `C:\a\b` -> `b`). */
export function projectName(cwd: string): string {
  const parts = cwd.split(/[\\/]+/).filter((part) => part.length > 0);
  return parts[parts.length - 1] ?? cwd;
}

export function stateLabel(tab: TerminalTab): string {
  return tab.state === 'running' ? 'ativa' : 'encerrada';
}

/** Tab title: `projeto · estado`, plus the office state of the bound session while running. */
export function tabTitle(tab: TerminalTab): string {
  if (isBrowserTab(tab)) return `Navegador · ${projectName(tab.cwd)}`;
  const base = `${projectName(tab.cwd)} · ${stateLabel(tab)}`;
  return tab.state === 'running' && tab.activity ? `${base} · ${tab.activity}` : base;
}

/** Sets the office activity of each tab from `activity` (by tab id); returns the same model if nothing changed. */
export function applyActivity(
  model: PanelModel,
  activity: Readonly<Record<string, string>>,
): PanelModel {
  let changed = false;
  const tabs = model.tabs.map((tab) => {
    const next = activity[tab.id];
    if (tab.activity === next) return tab;
    changed = true;
    const { activity: _old, ...rest } = tab;
    return next === undefined ? rest : { ...rest, activity: next };
  });
  return changed ? { ...model, tabs } : model;
}

/** Message of the strip shown on an ended session. */
export function exitMessage(tab: TerminalTab): string {
  const code = tab.exitCode === undefined ? '' : ` (código ${tab.exitCode})`;
  return `Processo terminou${code}`;
}

/** Adds the tab (or keeps the existing one) and makes it the active one. */
export function addTab(model: PanelModel, tab: TerminalTab, activate = true): PanelModel {
  if (model.tabs.some((t) => t.id === tab.id)) {
    return activate ? { ...model, activeId: tab.id } : model;
  }
  return {
    ...model,
    tabs: [...model.tabs, tab],
    activeId: activate || model.activeId === undefined ? tab.id : model.activeId,
  };
}

/** Removes a tab; the active one moves to its right neighbour, else the left one. */
export function removeTab(model: PanelModel, id: string): PanelModel {
  const index = model.tabs.findIndex((t) => t.id === id);
  if (index < 0) return model;
  const tabs = model.tabs.filter((t) => t.id !== id);
  const activeId = model.activeId === id ? (tabs[index] ?? tabs[index - 1])?.id : model.activeId;
  return {
    ...model,
    tabs,
    activeId,
    focus: tabs.length === 0 ? 'player' : model.focus,
  };
}

export function markExited(model: PanelModel, id: string, exitCode: number): PanelModel {
  return {
    ...model,
    tabs: model.tabs.map((t) => (t.id === id ? { ...t, state: 'exited', exitCode } : t)),
  };
}

export function setActive(model: PanelModel, id: string): PanelModel {
  return model.tabs.some((t) => t.id === id) ? { ...model, activeId: id } : model;
}

export function activeTab(model: PanelModel): TerminalTab | undefined {
  return model.tabs.find((t) => t.id === model.activeId);
}

/** Closing a live session asks first; an ended one closes at once. */
export function needsCloseConfirm(tab: TerminalTab): boolean {
  // Closing the browser tab only hides it: no session ends.
  return !isBrowserTab(tab) && tab.state === 'running';
}

export function toggleCollapsed(model: PanelModel): PanelModel {
  const collapsed = !model.collapsed;
  // A collapsed panel cannot own the keyboard.
  return { ...model, collapsed, focus: collapsed ? 'player' : model.focus };
}

export function setFocus(model: PanelModel, focus: FocusOwner): PanelModel {
  if (focus === 'terminal' && (model.collapsed || model.tabs.length === 0)) return model;
  return model.focus === focus ? model : { ...model, focus };
}

/**
 * Keeps the panel between its minimum and what leaves the office its minimum height. The maximum
 * wins over the minimum: in a very short window the panel shrinks below `MIN_PANEL_HEIGHT` rather
 * than overflowing the window.
 */
export function clampHeight(height: number, windowHeight: number): number {
  const max = Math.max(0, windowHeight - MIN_OFFICE_HEIGHT);
  return Math.round(Math.min(max, Math.max(MIN_PANEL_HEIGHT, height)));
}

export function setHeight(model: PanelModel, height: number, windowHeight: number): PanelModel {
  return { ...model, height: clampHeight(height, windowHeight) };
}

/** Same as `clampHeight`, for the side docks: the maximum wins over `MIN_PANEL_WIDTH`. */
export function clampWidth(width: number, windowWidth: number): number {
  const max = Math.max(0, windowWidth - MIN_OFFICE_WIDTH);
  return Math.round(Math.min(max, Math.max(MIN_PANEL_WIDTH, width)));
}

export function setWidth(model: PanelModel, width: number, windowWidth: number): PanelModel {
  return { ...model, width: clampWidth(width, windowWidth) };
}

export function setDock(model: PanelModel, dock: PanelDock): PanelModel {
  return model.dock === dock ? model : { ...model, dock };
}

/** Minimizes the panel (idempotent); the keyboard goes back to the player. */
export function collapse(model: PanelModel): PanelModel {
  return model.collapsed ? model : { ...model, collapsed: true, focus: 'player' };
}

export interface OccupiedSize {
  axis: 'height' | 'width';
  size: number;
}

/** Space the panel takes from the window: height when docked at the bottom, width on the sides. */
export function panelOccupiedSize(model: PanelModel): OccupiedSize {
  const axis = model.dock === 'bottom' ? 'height' : 'width';
  if (model.tabs.length === 0) return { axis, size: 0 };
  if (model.collapsed) return { axis, size: TAB_BAR_HEIGHT };
  return { axis, size: axis === 'height' ? model.height : model.width };
}

/**
 * What the office area depends on: occupied size, axis, dock and minimized state. Two models with
 * the same key leave `#game` exactly as it is, so the panel only reports a layout change when the
 * key changes (tab titles, activity and focus do not).
 */
export function layoutKey(model: PanelModel): string {
  const { axis, size } = panelOccupiedSize(model);
  return `${model.dock}|${axis}|${size}|${model.collapsed ? 'min' : 'open'}`;
}

/** Pixels of height the panel takes from the window (0 without tabs or when docked sideways). */
export function panelOccupiedHeight(model: PanelModel): number {
  const { axis, size } = panelOccupiedSize(model);
  return axis === 'height' ? size : 0;
}

/** Who gets the keys: the terminal only when it is visible and focused. */
export function keyboardOwner(model: PanelModel): FocusOwner {
  return model.focus === 'terminal' && !model.collapsed && model.tabs.length > 0
    ? 'terminal'
    : 'player';
}

/** Ctrl+` (VS Code style) collapses / expands the panel. */
export function isToggleShortcut(event: {
  key: string;
  code?: string;
  ctrlKey: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}): boolean {
  return (
    event.ctrlKey &&
    !event.altKey &&
    !event.metaKey &&
    !event.shiftKey &&
    (event.key === '`' || event.code === 'Backquote')
  );
}

export type ClipboardAction = 'copy' | 'paste';

/**
 * Terminal clipboard keys: Ctrl+Shift+C / Ctrl+Shift+V (Cmd+C / Cmd+V on macOS), and a plain
 * Ctrl+C copies only while there is a selection (otherwise it is the interrupt).
 */
export function clipboardAction(
  event: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey?: boolean },
  hasSelection: boolean,
): ClipboardAction | undefined {
  if (event.altKey) return undefined;
  const key = event.key.toLowerCase();
  if (event.metaKey && !event.ctrlKey) {
    if (key === 'c' && hasSelection) return 'copy';
    if (key === 'v') return 'paste';
    return undefined;
  }
  if (!event.ctrlKey) return undefined;
  if (event.shiftKey) {
    if (key === 'c') return 'copy';
    if (key === 'v') return 'paste';
    return undefined;
  }
  return key === 'c' && hasSelection ? 'copy' : undefined;
}

/** The terminal bridge of the desktop shell; undefined in a plain browser (panel hidden). */
export function terminalBridgeOf(win: object): TerminalBridge | undefined {
  const desktop = (win as { agentsOfficeDesktop?: unknown }).agentsOfficeDesktop as
    | Partial<AgentsOfficeDesktop>
    | undefined;
  if (desktop?.desktop !== true) return undefined;
  const terminal = desktop.terminal;
  return terminal && typeof terminal.start === 'function' ? terminal : undefined;
}

/** The browser bridge of the desktop shell; undefined in a plain browser or an older shell. */
export function browserBridgeOf(win: object): BrowserBridge | undefined {
  const desktop = (win as { agentsOfficeDesktop?: unknown }).agentsOfficeDesktop as
    | Partial<AgentsOfficeDesktop>
    | undefined;
  if (desktop?.desktop !== true) return undefined;
  const browser = desktop.browser;
  return browser && typeof browser.show === 'function' ? browser : undefined;
}

/** Turns a vertical wheel gesture into horizontal scroll; true when it consumed the event (there is overflow). */
export function wheelScrollTabs(
  el: { scrollLeft: number; scrollWidth: number; clientWidth: number },
  deltaY: number,
): boolean {
  if (deltaY === 0 || el.scrollWidth <= el.clientWidth) return false;
  el.scrollLeft += deltaY;
  return true;
}
