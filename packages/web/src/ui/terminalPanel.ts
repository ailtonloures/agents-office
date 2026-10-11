import type {
  TerminalBridge,
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalSessionInfo,
} from '@agents-office/shared';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import {
  activeTab,
  addTab,
  applyActivity,
  clampHeight,
  clampWidth,
  clipboardAction,
  collapse,
  createPanelModel,
  DEFAULT_PANEL_HEIGHT,
  DEFAULT_PANEL_WIDTH,
  exitMessage,
  type FocusOwner,
  isToggleShortcut,
  keyboardOwner,
  layoutKey,
  markExited,
  needsCloseConfirm,
  type PanelDock,
  type PanelModel,
  panelOccupiedHeight,
  panelOccupiedSize,
  parseStoredPanel,
  projectName,
  removeTab,
  type StoredPanel,
  setActive,
  setDock,
  setFocus,
  setHeight,
  setWidth,
  TAB_BAR_HEIGHT,
  tabTitle,
  toggleCollapsed,
  wheelScrollTabs,
} from './terminalTabs';

export const TERMINAL_PANEL_KEY = 'agents-office.terminalPanel';
const SCROLLBACK = 5000;

const CSS = `
#ao-terminal{box-sizing:border-box;flex:none;display:flex;flex-direction:column;position:relative;background:#0d1020;
  border-top:2px solid #3a3f5c;font:12px monospace;color:#f0e6b8;min-height:0;min-width:0;overflow:hidden;max-height:100%}
#ao-terminal[data-dock="left"]{border-top:0;border-right:2px solid #3a3f5c;order:-1;max-height:none;max-width:100%}
#ao-terminal[data-dock="right"]{border-top:0;border-left:2px solid #3a3f5c;max-height:none;max-width:100%}
#ao-terminal[hidden]{display:none}
#ao-terminal[data-focus="terminal"]{border-color:#f0c040}
#ao-terminal .ao-term-resizer{position:absolute;left:0;right:0;top:0;height:6px;cursor:ns-resize;z-index:2}
#ao-terminal[data-dock="left"] .ao-term-resizer{top:0;bottom:0;left:auto;right:0;width:6px;height:auto;cursor:ew-resize}
#ao-terminal[data-dock="right"] .ao-term-resizer{top:0;bottom:0;left:0;right:auto;width:6px;height:auto;cursor:ew-resize}
#ao-terminal[data-collapsed="true"] .ao-term-resizer{display:none}
#ao-terminal[data-collapsed="true"]:not([data-dock="bottom"]) .ao-term-bar>:not(.ao-term-toggle){display:none}
#ao-terminal[data-collapsed="true"]:not([data-dock="bottom"]) .ao-term-toggle{flex:1;padding:0}
#ao-terminal[data-collapsed="true"]:not([data-dock="bottom"]) .ao-term-bar{flex:1;height:auto}
#ao-terminal .ao-term-docks{display:flex;align-items:center}
#ao-terminal .ao-term-dock[data-active="true"]{color:#f0c040}
#ao-terminal .ao-term-bar{flex:none;height:${TAB_BAR_HEIGHT - 2}px;display:flex;align-items:stretch;
  background:#1b1d2a;overflow:hidden}
#ao-terminal .ao-term-tabs{display:flex;flex:1 1 0;overflow-x:auto;min-width:0;scrollbar-width:none}
#ao-terminal .ao-term-tabs::-webkit-scrollbar{display:none}
#ao-terminal .ao-term-focus,#ao-terminal .ao-term-docks,#ao-terminal .ao-term-toggle,
#ao-terminal .ao-term-bar>.ao-term-btn{flex:none}
#ao-terminal .ao-term-tab{flex:none;display:flex;align-items:center;gap:6px;padding:0 4px 0 10px;cursor:pointer;
  color:#9aa0bd;border-right:1px solid #2a2d44;white-space:nowrap;border-bottom:2px solid transparent}
#ao-terminal .ao-term-tab[data-active="true"]{color:#f0e6b8;background:#0d1020;border-bottom-color:#f0c040}
#ao-terminal .ao-term-tab[data-state="exited"] .ao-term-tab-title{opacity:.6}
#ao-terminal .ao-term-x,#ao-terminal .ao-term-btn{font:12px monospace;background:transparent;
  color:inherit;border:0;cursor:pointer;padding:0 6px}
#ao-terminal .ao-term-x:hover,#ao-terminal .ao-term-btn:hover{color:#f0c040}
#ao-terminal .ao-term-focus{align-self:center;padding:0 8px;color:#6f7594;white-space:nowrap}
#ao-terminal[data-focus="terminal"] .ao-term-focus{color:#f0c040}
#ao-terminal .ao-term-body{position:relative;flex:1;min-height:0}
#ao-terminal[data-collapsed="true"] .ao-term-body{display:none}
#ao-terminal .ao-term{position:absolute;inset:0;padding:4px 0 4px 6px;box-sizing:border-box}
#ao-terminal .ao-term[hidden]{display:none}
#ao-terminal .ao-term-ended{position:absolute;left:0;right:0;bottom:0;z-index:3;display:flex;gap:8px;
  align-items:center;padding:6px 10px;background:#2a2d44;border-top:2px solid #f0c040}
#ao-terminal .ao-term-ended span,#ao-terminal .ao-term-confirm span{flex:1}
#ao-terminal .ao-term-confirm{flex:none;display:flex;gap:8px;align-items:center;padding:6px 10px;
  background:#3a2a2a;border-bottom:2px solid #ff7b7b}
#ao-terminal .ao-term-ended button,#ao-terminal .ao-term-confirm button{font:12px monospace;
  padding:3px 10px;background:#1b1d2a;color:#f0e6b8;border:2px solid #f0c040;cursor:pointer}
body[data-dock="left"] #game,body[data-dock="right"] #game{width:auto;min-width:0}
#game::after{content:"";position:absolute;inset:0;pointer-events:none;z-index:1}
body[data-keyboard="player"][data-has-terminal="true"] #game::after{box-shadow:inset 0 0 0 2px #f0c040}
`;

const THEME = {
  background: '#0d1020',
  foreground: '#e6e6ef',
  cursor: '#f0c040',
  cursorAccent: '#0d1020',
  selectionBackground: '#3a4a7a',
};

interface View {
  term: Terminal;
  fit: FitAddon;
  host: HTMLDivElement;
  /** The history was written: live data may flow in. */
  ready: boolean;
  lastCols: number;
  lastRows: number;
  permissionMode?: TerminalSessionInfo['permissionMode'];
  banner?: HTMLElement;
}

/** Debug snapshot on `window.__terminalPanel` for E2E tests. */
export interface TerminalPanelDebug {
  tabs: { id: string; title: string; state: string }[];
  activeId: string | undefined;
  collapsed: boolean;
  height: number;
  width: number;
  dock: PanelDock;
  occupied: number;
  /** Pixels taken from the window along the dock axis (height at the bottom, width on the sides). */
  occupiedSize: number;
  focus: FocusOwner;
  keyboard: FocusOwner;
  cols: number;
  rows: number;
  /** Text of the active terminal (scrollback + screen). */
  text(): string;
  /** Types into the active terminal as the user would. */
  paste(text: string): void;
}

declare global {
  interface Window {
    __terminalPanel?: TerminalPanelDebug;
  }
}

export interface TerminalPanelOptions {
  /** The game parent: the office area that gives up space to the panel. */
  gameParent: HTMLElement;
  /** Who gets the keyboard changed (Phaser must stop reading keys while the terminal has it). */
  onKeyboardOwner(owner: FocusOwner): void;
  /** Opens the active tab's folder in VS Code; the bar shows the button only when given. */
  onOpenInVSCode?(cwd: string): void;
  /** The office area changed size (panel opened, collapsed, dragged). */
  onLayout(): void;
}

export interface TerminalPanel {
  /** Adds a session started elsewhere (also done automatically when its output arrives). */
  adopt(id: string): Promise<void>;
  toggle(): void;
  /**
   * Shows and focuses the tab of this terminal (expanding a collapsed panel). False when no such
   * tab exists (closed or never adopted).
   */
  focusSession(id: string): boolean;
  /** Gives the xterm of the active tab the keyboard, without re-rendering the panel. */
  focusTerminal(): void;
  /** Office state of the sessions bound to tabs, by terminal id (shown in the tab titles). */
  setActivity(activity: Readonly<Record<string, string>>): void;
  /** The pointer went to the office: keys go to the player again. */
  focusPlayer(): void;
  /** Minimizes the panel (keeps tabs and sessions) and gives the keyboard back to the game. */
  collapse(): void;
  /** True when the terminal owns the keyboard. */
  readonly terminalFocused: boolean;
  destroy(): void;
}

function readStored(): StoredPanel {
  try {
    const raw = localStorage.getItem(TERMINAL_PANEL_KEY);
    return parseStoredPanel(raw ? JSON.parse(raw) : undefined);
  } catch {
    return parseStoredPanel(undefined);
  }
}

function writeStored(model: PanelModel): void {
  try {
    localStorage.setItem(
      TERMINAL_PANEL_KEY,
      JSON.stringify({
        height: model.height,
        width: model.width,
        dock: model.dock,
        collapsed: model.collapsed,
      }),
    );
  } catch {
    // Not remembering the size is harmless.
  }
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  testId?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (testId) node.setAttribute('data-testid', testId);
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Mounts the docked panel next to `gameParent` (bottom, left or right). Call only when the terminal bridge exists. */
export function mountTerminalPanel(
  bridge: TerminalBridge,
  options: TerminalPanelOptions,
): TerminalPanel {
  document.head.append(Object.assign(document.createElement('style'), { textContent: CSS }));
  const stored = readStored();
  let model = createPanelModel(
    clampHeight(stored.height ?? DEFAULT_PANEL_HEIGHT, window.innerHeight),
    clampWidth(stored.width ?? DEFAULT_PANEL_WIDTH, window.innerWidth),
    stored.dock,
  );
  if (stored.collapsed) model = { ...model, collapsed: true };

  const root = el('div', undefined, 'terminal-panel');
  root.id = 'ao-terminal';
  root.hidden = true;
  const resizer = el('div', 'ao-term-resizer', 'terminal-resizer');
  const bar = el('div', 'ao-term-bar');
  const tabsEl = el('div', 'ao-term-tabs', 'terminal-tabs');
  const focusLabel = el('span', 'ao-term-focus', 'terminal-focus');
  const toggleBtn = el('button', 'ao-term-btn', 'terminal-toggle');
  toggleBtn.classList.add('ao-term-toggle');
  toggleBtn.title = 'Recolher / expandir (Ctrl+`)';
  const docksEl = el('div', 'ao-term-docks', 'terminal-docks');
  const dockButtons = new Map<PanelDock, HTMLButtonElement>();
  const DOCK_OPTIONS: readonly { dock: PanelDock; glyph: string; title: string }[] = [
    { dock: 'left', glyph: '◧', title: 'Encaixar à esquerda' },
    { dock: 'bottom', glyph: '⬓', title: 'Encaixar embaixo' },
    { dock: 'right', glyph: '◨', title: 'Encaixar à direita' },
  ];
  for (const option of DOCK_OPTIONS) {
    const button = el(
      'button',
      'ao-term-btn ao-term-dock',
      `terminal-dock-${option.dock}`,
      option.glyph,
    );
    button.title = option.title;
    button.setAttribute('aria-label', option.title);
    button.addEventListener('click', () => changeDock(option.dock));
    dockButtons.set(option.dock, button);
    docksEl.append(button);
  }
  const vscodeBtn = el('button', 'ao-term-btn', 'terminal-vscode', 'VS Code');
  vscodeBtn.title = 'Abrir a pasta da aba no VS Code';
  vscodeBtn.hidden = !options.onOpenInVSCode;
  vscodeBtn.addEventListener('click', () => {
    const tab = activeTab(model);
    if (tab) options.onOpenInVSCode?.(tab.cwd);
  });
  const confirmEl = el('div', 'ao-term-confirm', 'terminal-confirm');
  confirmEl.hidden = true;
  const body = el('div', 'ao-term-body');
  tabsEl.addEventListener('wheel', (event) => {
    if (wheelScrollTabs(tabsEl, event.deltaY)) event.preventDefault();
  });
  bar.append(tabsEl, focusLabel, vscodeBtn, docksEl, toggleBtn);
  root.append(resizer, bar, confirmEl, body);
  options.gameParent.after(root);

  const views = new Map<string, View>();
  /** Sessions closed by the user: late output of a killed process must not reopen the tab. */
  const closed = new Set<string>();
  const adopting = new Set<string>();
  let layoutFrame = 0;
  let confirmingId: string | undefined;
  let lastOwner: FocusOwner | undefined;
  let activity: Readonly<Record<string, string>> = {};

  let lastLayoutKey: string | undefined;
  let layoutPending = false;
  /**
   * `onLayout` (a canvas resize) only when the office area really changed; the terminal is fitted
   * either way, since the host can change size without the key changing (close confirmation).
   */
  const emitLayout = (): void => {
    const key = layoutKey(model);
    if (key !== lastLayoutKey) {
      lastLayoutKey = key;
      layoutPending = true;
    }
    cancelAnimationFrame(layoutFrame);
    layoutFrame = requestAnimationFrame(() => {
      if (layoutPending) {
        layoutPending = false;
        options.onLayout();
      }
      fitActive();
    });
  };

  const sendSize = (id: string, view: View): void => {
    const { cols, rows } = view.term;
    if (cols === view.lastCols && rows === view.lastRows) return;
    view.lastCols = cols;
    view.lastRows = rows;
    void bridge.resize(id, cols, rows).catch(() => {});
  };

  function fitActive(): void {
    const tab = activeTab(model);
    const view = tab ? views.get(tab.id) : undefined;
    if (!tab || !view || model.collapsed || view.host.clientWidth === 0) return;
    try {
      const size = view.fit.proposeDimensions();
      if (size && Number.isFinite(size.cols) && size.cols > 0 && size.rows > 0) {
        view.fit.fit();
        sendSize(tab.id, view);
      }
    } catch {
      // The element is not laid out yet; the next resize fits again.
    }
  }

  function applyOwner(): void {
    const owner = keyboardOwner(model);
    document.body.dataset.keyboard = owner;
    document.body.dataset.hasTerminal = String(model.tabs.length > 0);
    root.dataset.focus = owner;
    focusLabel.textContent = owner === 'terminal' ? 'teclado: terminal' : 'teclado: escritório';
    if (owner !== lastOwner) {
      lastOwner = owner;
      options.onKeyboardOwner(owner);
    }
  }

  function publishDebug(): void {
    const view = views.get(model.activeId ?? '');
    window.__terminalPanel = {
      tabs: model.tabs.map((t) => ({ id: t.id, title: tabTitle(t), state: t.state })),
      activeId: model.activeId,
      collapsed: model.collapsed,
      height: model.height,
      width: model.width,
      dock: model.dock,
      occupied: panelOccupiedHeight(model),
      occupiedSize: panelOccupiedSize(model).size,
      focus: model.focus,
      keyboard: keyboardOwner(model),
      // Live: the size changes on every fit, after the last render.
      get cols() {
        return view?.term.cols ?? 0;
      },
      get rows() {
        return view?.term.rows ?? 0;
      },
      text: () => {
        if (!view) return '';
        const buffer = view.term.buffer.active;
        const lines: string[] = [];
        for (let i = 0; i < buffer.length; i += 1) {
          lines.push(buffer.getLine(i)?.translateToString(true) ?? '');
        }
        return lines.join('\n');
      },
      paste: (text) => view?.term.paste(text),
    };
  }

  function render(): void {
    model = applyActivity(model, activity);
    root.hidden = model.tabs.length === 0;
    root.dataset.collapsed = String(model.collapsed);
    root.dataset.dock = model.dock;
    document.body.dataset.dock = model.dock;
    const occupied = panelOccupiedSize(model);
    root.style.height = occupied.axis === 'height' ? `${occupied.size}px` : '';
    root.style.width = occupied.axis === 'width' ? `${occupied.size}px` : '';
    toggleBtn.textContent = toggleGlyph();
    for (const [dock, button] of dockButtons) button.dataset.active = String(dock === model.dock);
    tabsEl.replaceChildren(
      ...model.tabs.map((tab) => {
        const node = el('div', 'ao-term-tab', `terminal-tab-${tab.id}`);
        node.dataset.active = String(tab.id === model.activeId);
        node.dataset.state = tab.state;
        const title = el('span', 'ao-term-tab-title', undefined, tabTitle(tab));
        const close = el('button', 'ao-term-x', `terminal-close-${tab.id}`, '×');
        close.title = 'Fechar aba';
        close.addEventListener('click', (event) => {
          event.stopPropagation();
          requestClose(tab.id);
        });
        node.append(title, close);
        node.addEventListener('click', () => activate(tab.id, true));
        return node;
      }),
    );
    for (const [id, view] of views) {
      view.host.hidden = id !== model.activeId || model.collapsed;
    }
    // jsdom has no scrollIntoView; real browsers keep the active tab visible without touching the page scroll.
    const activeNode = tabsEl.querySelector<HTMLElement>('.ao-term-tab[data-active="true"]');
    if (typeof activeNode?.scrollIntoView === 'function') {
      activeNode.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    }
    renderConfirm();
    applyOwner();
    publishDebug();
    emitLayout();
  }

  /** Arrow pointing where the panel goes when pressed: expands towards the office, collapses to its edge. */
  function toggleGlyph(): string {
    if (model.dock === 'bottom') return model.collapsed ? '▴' : '▾';
    const towardsEdge = model.dock === 'left' ? '◂' : '▸';
    const towardsOffice = model.dock === 'left' ? '▸' : '◂';
    return model.collapsed ? towardsOffice : towardsEdge;
  }

  function changeDock(dock: PanelDock): void {
    if (dock === model.dock) return;
    model = setDock(model, dock);
    writeStored(model);
    render();
    if (model.focus === 'terminal') focusActive();
  }

  function renderConfirm(): void {
    const tab = model.tabs.find((t) => t.id === confirmingId);
    if (!tab || !needsCloseConfirm(tab)) {
      confirmingId = undefined;
      confirmEl.hidden = true;
      return;
    }
    confirmEl.hidden = false;
    const yes = el('button', undefined, 'terminal-confirm-yes', 'Encerrar sessão');
    const no = el('button', undefined, 'terminal-confirm-no', 'Cancelar');
    yes.addEventListener('click', () => closeTab(tab.id, true));
    no.addEventListener('click', () => {
      confirmingId = undefined;
      renderConfirm();
      focusActive();
      emitLayout();
    });
    confirmEl.replaceChildren(
      el(
        'span',
        undefined,
        undefined,
        `O claude de "${projectName(tab.cwd)}" está ativo. Encerrar?`,
      ),
      yes,
      no,
    );
  }

  function focusActive(): void {
    const tab = activeTab(model);
    if (tab && !model.collapsed) views.get(tab.id)?.term.focus();
  }

  function activate(id: string, focus: boolean): void {
    model = setActive(model, id);
    render();
    if (focus) focusActive();
    else fitActive();
  }

  function requestClose(id: string): void {
    const tab = model.tabs.find((t) => t.id === id);
    if (!tab) return;
    if (needsCloseConfirm(tab)) {
      confirmingId = id;
      renderConfirm();
      emitLayout();
    } else closeTab(id, false);
  }

  function closeTab(id: string, kill: boolean): void {
    closed.add(id);
    if (kill) void bridge.kill(id).catch(() => {});
    const view = views.get(id);
    view?.term.dispose();
    view?.host.remove();
    views.delete(id);
    if (confirmingId === id) confirmingId = undefined;
    model = removeTab(model, id);
    render();
    if (model.focus === 'terminal') focusActive();
  }

  async function restart(id: string): Promise<void> {
    const tab = model.tabs.find((t) => t.id === id);
    const view = views.get(id);
    if (!tab || !view) return;
    const result = await bridge.start({
      cwd: tab.cwd,
      permissionMode: view.permissionMode,
      cols: view.term.cols,
      rows: view.term.rows,
    });
    if (!result.ok) {
      showBanner(id, `Não foi possível reiniciar: ${result.message}`, false);
      return;
    }
    closeTab(id, false);
    await adopt(result.id);
  }

  function showBanner(id: string, message: string, offerRestart: boolean): void {
    const view = views.get(id);
    if (!view) return;
    view.banner?.remove();
    const banner = el('div', 'ao-term-ended', 'terminal-ended');
    const restartBtn = el('button', undefined, 'terminal-restart', 'Reiniciar');
    const closeBtn = el('button', undefined, 'terminal-close-ended', 'Fechar');
    restartBtn.addEventListener('click', () => void restart(id));
    closeBtn.addEventListener('click', () => closeTab(id, false));
    banner.append(el('span', undefined, undefined, message));
    banner.append(...(offerRestart ? [restartBtn, closeBtn] : [closeBtn]));
    view.banner = banner;
    view.host.append(banner);
  }

  async function copySelection(view: View): Promise<void> {
    const text = view.term.getSelection();
    if (text) await navigator.clipboard.writeText(text).catch(() => {});
  }

  async function pasteInto(view: View): Promise<void> {
    const text = await navigator.clipboard.readText().catch(() => '');
    if (text) view.term.paste(text);
  }

  function createView(info: TerminalSessionInfo): View {
    const term = new Terminal({
      cursorBlink: true,
      scrollback: SCROLLBACK,
      fontFamily: 'ui-monospace, "DejaVu Sans Mono", Menlo, Consolas, monospace',
      fontSize: 13,
      theme: THEME,
      allowProposedApi: true,
      cols: info.cols,
      rows: info.rows,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(
      new WebLinksAddon((_event, url) => {
        if (/^https?:\/\//i.test(url)) window.open(url, '_blank', 'noopener');
      }),
    );
    const host = el('div', 'ao-term', `terminal-view-${info.id}`);
    host.hidden = true;
    body.append(host);
    term.open(host);
    const view: View = {
      term,
      fit,
      host,
      ready: false,
      lastCols: info.cols,
      lastRows: info.rows,
      permissionMode: info.permissionMode,
    };
    term.onData((data) => void bridge.write(info.id, data).catch(() => {}));
    term.onResize(() => sendSize(info.id, view));
    term.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') return true;
      const action = clipboardAction(event, term.hasSelection());
      if (!action) return true;
      event.preventDefault();
      if (action === 'copy') void copySelection(view);
      else void pasteInto(view);
      return false;
    });
    const textarea = term.textarea;
    textarea?.addEventListener('focus', () => {
      model = setFocus(model, 'terminal');
      applyOwner();
      publishDebug();
    });
    textarea?.addEventListener('blur', () => {
      model = setFocus(model, 'player');
      applyOwner();
      publishDebug();
    });
    return view;
  }

  async function adopt(id: string, fresh = true): Promise<void> {
    if (views.has(id) || closed.has(id) || adopting.has(id)) return;
    adopting.add(id);
    try {
      const info = (await bridge.list()).find((s) => s.id === id);
      if (!info) return; // already gone
      const view = createView(info);
      views.set(id, view);
      const first = model.tabs.length === 0;
      model = addTab(model, { id, cwd: info.cwd, state: 'running' }, fresh || first);
      if (fresh && model.collapsed) model = toggleCollapsed(model);
      render();
      // Output that arrived until the history reply is inside the history (the main process
      // appends to the buffer before it sends the event), so only later events are written.
      const history = await bridge.buffer(id);
      if (history) view.term.write(history);
      view.ready = true;
      if (history === null) markEnded(id, 0);
      fitActive();
      if (fresh) focusActive();
    } finally {
      adopting.delete(id);
    }
  }

  function markEnded(id: string, exitCode: number): void {
    const view = views.get(id);
    if (!view) return;
    model = markExited(model, id, exitCode);
    const tab = model.tabs.find((t) => t.id === id);
    if (tab) showBanner(id, exitMessage(tab), true);
    render();
  }

  const offData = bridge.onData((event: TerminalDataEvent) => {
    const view = views.get(event.id);
    if (view) {
      if (view.ready) view.term.write(event.data);
    } else if (!closed.has(event.id)) void adopt(event.id);
  });
  const offExit = bridge.onExit((event: TerminalExitEvent) => {
    const view = views.get(event.id);
    if (!view) return;
    // Wait for the data already queued in the terminal before the "ended" notice.
    view.term.write('', () => markEnded(event.id, event.exitCode));
  });

  const onKeydown = (event: KeyboardEvent): void => {
    if (!isToggleShortcut(event) || model.tabs.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    toggle();
  };
  document.addEventListener('keydown', onKeydown, true);

  function toggle(): void {
    model = toggleCollapsed(model);
    writeStored(model);
    render();
    if (!model.collapsed) focusActive();
    else (document.activeElement as HTMLElement | null)?.blur();
  }
  toggleBtn.addEventListener('click', toggle);

  // Resize by dragging the edge facing the office (vertical axis at the bottom, horizontal on the sides).
  resizer.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    resizer.setPointerCapture(event.pointerId);
    const move = (e: PointerEvent): void => {
      if (model.dock === 'bottom') {
        model = setHeight(model, window.innerHeight - e.clientY, window.innerHeight);
      } else {
        const width = model.dock === 'left' ? e.clientX : window.innerWidth - e.clientX;
        model = setWidth(model, width, window.innerWidth);
      }
      render();
    };
    const up = (): void => {
      resizer.removeEventListener('pointermove', move);
      resizer.removeEventListener('pointerup', up);
      resizer.removeEventListener('pointercancel', up);
      writeStored(model);
    };
    resizer.addEventListener('pointermove', move);
    resizer.addEventListener('pointerup', up);
    resizer.addEventListener('pointercancel', up);
  });

  const onWindowResize = (): void => {
    const height = clampHeight(model.height, window.innerHeight);
    const width = clampWidth(model.width, window.innerWidth);
    if (height !== model.height || width !== model.width) {
      model = { ...model, height, width };
      render();
    } else fitActive();
  };
  window.addEventListener('resize', onWindowResize);

  // The body can change size without a window resize (dock switch, close confirmation, layout);
  // refit once per frame so the last row is never cut.
  let observeFrame = 0;
  const bodyObserver =
    typeof ResizeObserver === 'undefined'
      ? undefined
      : new ResizeObserver(() => {
          cancelAnimationFrame(observeFrame);
          observeFrame = requestAnimationFrame(fitActive);
        });
  bodyObserver?.observe(body);

  // Rehydrate: sessions that survived a reload of the window come back with their history.
  void bridge
    .list()
    .then(async (sessions) => {
      for (const session of sessions) await adopt(session.id, false);
    })
    .catch(() => {});
  render();

  return {
    adopt: (id) => adopt(id),
    toggle,
    focusSession(id) {
      if (!model.tabs.some((tab) => tab.id === id)) return false;
      if (model.collapsed) {
        model = toggleCollapsed(model);
        writeStored(model);
      }
      activate(id, true);
      return true;
    },
    focusTerminal: focusActive,
    setActivity(next) {
      const same =
        Object.keys(next).length === Object.keys(activity).length &&
        Object.entries(next).every(([id, value]) => activity[id] === value);
      if (same) return;
      activity = next;
      render();
    },
    focusPlayer() {
      model = setFocus(model, 'player');
      (document.activeElement as HTMLElement | null)?.blur();
      applyOwner();
      publishDebug();
    },
    collapse() {
      if (model.collapsed) return;
      model = collapse(model);
      writeStored(model);
      render();
      (document.activeElement as HTMLElement | null)?.blur();
    },
    get terminalFocused() {
      return keyboardOwner(model) === 'terminal';
    },
    destroy() {
      offData();
      offExit();
      document.removeEventListener('keydown', onKeydown, true);
      window.removeEventListener('resize', onWindowResize);
      bodyObserver?.disconnect();
      cancelAnimationFrame(observeFrame);
      for (const view of views.values()) view.term.dispose();
      root.remove();
    },
  };
}
