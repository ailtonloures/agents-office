import type { BoardBridge, BoardLibrary, BoardSceneData } from '@agents-office/shared';
import { t } from '../i18n/i18n';
import {
  authorsLabel,
  boardAuthors,
  debounce,
  escapeCloses,
  exportFileName,
  isSceneElement,
  libraryItemsOf,
  libraryLabel,
  parseExcalidrawFile,
  SAVE_DEBOUNCE_MS,
  type SceneElement,
  serializeExcalidrawFile,
} from './boardLogic';
import { BUTTON_CSS } from './buttonStyles';

// Full-screen whiteboard overlay (spec 077). Excalidraw is a React component, so it runs as an
// island that is only imported (dynamic import) the first time a board is opened: neither the
// main bundle nor the splash pay for it.

const CSS = `
.ao-board{position:absolute;inset:0;z-index:30;background:#0d1020;display:flex;flex-direction:column}
.ao-board[hidden]{display:none}
.ao-board-bar{display:flex;gap:8px;align-items:center;padding:6px 10px;background:#1b1d2a;
  border-bottom:2px solid #f0c040;font:13px monospace;color:#f0e6b8;flex:0 0 auto}
.ao-board-title{font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ao-board-status{flex:1;opacity:.75;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ao-board-authors{opacity:.9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:40%}
.ao-board-status.error{color:#ff8a80;opacity:1}
.ao-board-bar button{padding:4px 10px}
.ao-board-libs{position:absolute;top:0;right:0;z-index:2;min-width:280px;max-width:420px;
  background:#1b1d2a;border:2px solid #f0c040;border-top:0;padding:8px;font:13px monospace;color:#f0e6b8}
.ao-board-libs[hidden]{display:none}
.ao-board-libs ul{list-style:none;margin:0 0 8px;padding:0;max-height:240px;overflow:auto}
.ao-board-libs li{display:flex;gap:8px;align-items:center;justify-content:space-between;padding:3px 0}
.ao-board-libs .empty{opacity:.7;padding:3px 0}
.ao-board-libs .err{color:#ff8a80;margin-top:6px}
.ao-board-body{position:relative;flex:1;min-height:0}
.ao-board-island{position:absolute;inset:0}
.ao-board-msg{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  font:14px monospace;color:#f0e6b8;pointer-events:none}
${BUTTON_CSS.replaceAll('.ao-zoom-btn', '.ao-zoom-btn,.ao-board-bar button')}`;

export interface BoardOverlayHandle {
  /** Opens the board of a workspace (one per workspace); resolves once it is on screen. */
  open(cwd: string, title?: string): Promise<void>;
  /** Saves what is pending and closes. */
  close(): void;
  isOpen(): boolean;
  /** Removes the overlay and every listener. */
  dispose(): void;
}

export interface BoardOverlayOptions {
  gameParent: HTMLElement;
  /** The game must not read keys (WASD, Z...) while the board owns the keyboard. */
  onKeyboardCapture?(captured: boolean): void;
  /** Loads the editor; injectable for tests. */
  loadIsland?: () => Promise<typeof import('./boardIsland')>;
}

declare global {
  interface Window {
    /** Entry point for E2E. */
    __boardOverlay?: BoardOverlayHandle;
  }
}

export function mountBoardOverlay(
  bridge: BoardBridge,
  options: BoardOverlayOptions,
): BoardOverlayHandle {
  const loadIsland = options.loadIsland ?? (() => import('./boardIsland'));
  const style = Object.assign(document.createElement('style'), { textContent: CSS });
  document.head.append(style);

  const root = document.createElement('div');
  root.className = 'ao-board';
  root.hidden = true;
  root.setAttribute('data-testid', 'board-overlay');
  const bar = document.createElement('div');
  bar.className = 'ao-board-bar';
  const title = document.createElement('span');
  title.className = 'ao-board-title';
  title.setAttribute('data-testid', 'board-title');
  const status = document.createElement('span');
  status.className = 'ao-board-status';
  status.setAttribute('data-testid', 'board-status');
  const authors = document.createElement('span');
  authors.className = 'ao-board-authors';
  authors.setAttribute('data-testid', 'board-authors');
  const button = (label: string, testId: string): HTMLButtonElement => {
    const element = Object.assign(document.createElement('button'), {
      textContent: label,
      type: 'button',
    });
    element.setAttribute('data-testid', testId);
    return element;
  };
  const importButton = button(t('board.import'), 'board-import');
  const exportButton = button(t('board.export'), 'board-export');
  const libsButton = button(t('board.libraries'), 'board-libraries');
  const closeButton = button(t('board.close'), 'board-close');
  const libInput = Object.assign(document.createElement('input'), {
    type: 'file',
    accept: '.excalidrawlib,application/json',
    hidden: true,
  });
  const fileInput = Object.assign(document.createElement('input'), {
    type: 'file',
    accept: '.excalidraw,application/json',
    hidden: true,
  });
  bar.append(
    title,
    authors,
    status,
    importButton,
    exportButton,
    libsButton,
    closeButton,
    fileInput,
    libInput,
  );
  const body = document.createElement('div');
  body.className = 'ao-board-body';
  const host = document.createElement('div');
  host.className = 'ao-board-island';
  host.setAttribute('data-testid', 'board-island');
  const message = document.createElement('div');
  message.className = 'ao-board-msg';
  const libsPanel = document.createElement('div');
  libsPanel.className = 'ao-board-libs';
  libsPanel.hidden = true;
  libsPanel.setAttribute('data-testid', 'board-libraries-panel');
  const libsList = document.createElement('ul');
  const libsAdd = button(t('board.libraries.add'), 'board-library-add');
  const libsError = document.createElement('div');
  libsError.className = 'err';
  libsError.setAttribute('data-testid', 'board-library-error');
  libsPanel.append(libsList, libsAdd, libsError);
  body.append(host, message, libsPanel);
  root.append(bar, body);
  // Keys typed in the board never reach the game (Phaser listens on the window).
  const stopKeys = (event: KeyboardEvent): void => event.stopPropagation();
  root.addEventListener('keydown', stopKeys);
  root.addEventListener('keyup', stopKeys);
  options.gameParent.append(root);

  let openCwd: string | undefined;
  let island: Awaited<ReturnType<typeof mountIsland>> | undefined;
  let opening: Promise<void> | undefined;
  let disposed = false;
  let pending = new Map<string, SceneElement>();
  let pendingFiles: Record<string, unknown> = {};
  let unsubscribe: (() => void) | undefined;
  // Agents' drawings by element id, for the authorship indicator (kept across partial updates).
  let authored = new Map<string, { isDeleted?: boolean; customData?: unknown }>();
  const showAuthors = (elements: readonly SceneElement[]): void => {
    for (const element of elements) authored.set(element.id, element);
    authors.textContent = authorsLabel(boardAuthors([...authored.values()]));
  };

  const setStatus = (text: string, error = false): void => {
    status.textContent = text;
    status.classList.toggle('error', error);
  };

  const persist = (): void => {
    const cwd = openCwd;
    if (!cwd || pending.size === 0) return;
    const scene: BoardSceneData = { elements: [...pending.values()], files: pendingFiles };
    pending = new Map();
    pendingFiles = {};
    setStatus(t('board.status.saving'));
    bridge.save(cwd, scene).then(
      (result) =>
        result.ok
          ? setStatus(t('board.status.saved'))
          : setStatus(t('board.status.saveFailed', { message: result.message }), true),
      () => setStatus(t('board.status.saveFailedBoard'), true),
    );
  };
  const save = debounce(persist, SAVE_DEBOUNCE_MS);

  const onUserChange = (elements: SceneElement[], files: Record<string, unknown>): void => {
    for (const element of elements) pending.set(element.id, element);
    Object.assign(pendingFiles, files);
    setStatus(t('board.status.pending'));
    save();
  };

  let libraries: BoardLibrary[] = [];
  const loadLibraries = async (): Promise<void> => {
    // A broken libraries folder must never keep the board from opening.
    libraries = await bridge.listLibraries().catch(() => []);
  };

  const renderLibraries = (): void => {
    libsList.replaceChildren();
    if (libraries.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'empty';
      empty.textContent = t('board.libraries.empty');
      libsList.append(empty);
    }
    for (const library of libraries) {
      const row = document.createElement('li');
      row.setAttribute('data-testid', 'board-library-row');
      const label = document.createElement('span');
      label.textContent = libraryLabel(library);
      const remove = button(t('board.libraries.remove'), 'board-library-remove');
      remove.onclick = () => {
        void bridge.removeLibrary(library.id).then(async () => {
          await loadLibraries();
          renderLibraries();
          island?.setLibraryItems(libraryItemsOf(libraries));
        });
      };
      row.append(label, remove);
      libsList.append(row);
    }
  };

  const mountIsland = async (initial: BoardSceneData) => {
    const module = await loadIsland();
    return module.mountBoardIsland(host, {
      initial,
      libraryItems: libraryItemsOf(libraries),
      onUserChange,
    });
  };

  const isTyping = (target: EventTarget | null): boolean =>
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

  const onKeyDown = (event: KeyboardEvent): void => {
    if (root.hidden) return;
    const dialogOpen = root.querySelector('.Modal, .Dialog, .Island.Dialog') !== null;
    if (!escapeCloses(event, { typing: isTyping(event.target), dialogOpen })) return;
    event.preventDefault();
    event.stopPropagation();
    close();
  };
  // Capture phase: runs before Excalidraw's own handlers.
  document.addEventListener('keydown', onKeyDown, true);

  const teardownIsland = (): void => {
    island?.unmount();
    island = undefined;
    host.replaceChildren();
  };

  function close(): void {
    if (root.hidden && !openCwd) return;
    save.cancel();
    persist();
    unsubscribe?.();
    unsubscribe = undefined;
    teardownIsland();
    openCwd = undefined;
    opening = undefined;
    root.hidden = true;
    libsPanel.hidden = true;
    libsError.textContent = '';
    authored = new Map();
    authors.textContent = '';
    message.textContent = '';
    options.onKeyboardCapture?.(false);
  }

  async function open(cwd: string, name?: string): Promise<void> {
    if (disposed) return;
    if (openCwd === cwd && opening) return opening;
    if (openCwd) close();
    openCwd = cwd;
    title.textContent = t('board.title', { name: name ?? cwd });
    setStatus('');
    message.textContent = t('board.loading');
    root.hidden = false;
    options.onKeyboardCapture?.(true);
    const run = (async () => {
      try {
        const loaded = await bridge.load(cwd);
        await loadLibraries();
        if (openCwd !== cwd) return;
        const mounted = await mountIsland(loaded.scene);
        if (openCwd !== cwd) {
          mounted.unmount();
          return;
        }
        island = mounted;
        showAuthors(loaded.scene.elements.filter(isSceneElement));
        message.textContent = '';
        if (loaded.status === 'recovered') {
          setStatus(t('board.recovered'), true);
        } else if (loaded.status === 'lost') {
          setStatus(t('board.lost'), true);
        }
        unsubscribe = bridge.onChange((changedCwd, scene) => {
          if (changedCwd !== openCwd) return;
          island?.applyRemote(scene);
          showAuthors(scene.elements.filter(isSceneElement));
        });
      } catch {
        if (openCwd === cwd) message.textContent = t('board.openFailed');
      }
    })();
    opening = run;
    await run;
  }

  closeButton.onclick = close;
  exportButton.onclick = () => {
    const scene = island?.getScene();
    if (!scene || !openCwd) return;
    const blob = new Blob([serializeExcalidrawFile(scene)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement('a'), {
      href: url,
      download: exportFileName(openCwd),
    });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  importButton.onclick = () => fileInput.click();
  fileInput.onchange = () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    void file.text().then((text) => {
      const scene = parseExcalidrawFile(text);
      if (!scene) {
        setStatus(t('board.invalidFile'), true);
        return;
      }
      island?.importScene(scene);
    });
  };

  libsButton.onclick = () => {
    libsPanel.hidden = !libsPanel.hidden;
    if (!libsPanel.hidden) renderLibraries();
  };
  libsAdd.onclick = () => libInput.click();
  libInput.onchange = () => {
    const file = libInput.files?.[0];
    libInput.value = '';
    if (!file) return;
    libsError.textContent = '';
    void file
      .text()
      .then((text) => bridge.importLibrary(file.name, text))
      .then(async (result) => {
        if (!result.ok) {
          libsError.textContent = t('board.libraries.invalid', { message: result.message });
          return;
        }
        await loadLibraries();
        renderLibraries();
        island?.setLibraryItems(libraryItemsOf(libraries));
      })
      .catch(() => {
        libsError.textContent = t('board.libraries.installFailed');
      });
  };

  const handle: BoardOverlayHandle = {
    open,
    close,
    isOpen: () => !root.hidden,
    dispose() {
      close();
      disposed = true;
      document.removeEventListener('keydown', onKeyDown, true);
      root.remove();
      style.remove();
      if (window.__boardOverlay === handle) window.__boardOverlay = undefined;
    },
  };
  window.__boardOverlay = handle;
  return handle;
}
