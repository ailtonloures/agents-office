import type {
  BoardLibraryResult,
  BoardLoadResult,
  BoardSaveResult,
  BoardSceneData,
} from '@agents-office/shared';
import { z } from 'zod';
import { BOARD_CHANNELS } from './boardChannels';
import { LIBRARY_MAX_BYTES, LibraryError, type LibraryStore } from './boardLibraries';
import {
  BOARD_MAX_BYTES,
  type BoardElement,
  BoardLimitError,
  type BoardScene,
  type BoardStore,
  isBoardElement,
} from './boardStore';
import type { EventTarget, IpcMainLike } from './ipc';

const cwdSchema = z.string().min(1).max(4096);
const sceneSchema = z
  .object({
    elements: z.array(z.custom<BoardElement>(isBoardElement)).max(20000),
    files: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export interface BoardIpcDeps<E> {
  ipcMain: IpcMainLike<E>;
  store: Pick<BoardStore, 'load' | 'merge' | 'onChange'>;
  /** Shape libraries (spec 079). Absent: the library channels are not registered. */
  libraries?: Pick<LibraryStore, 'list' | 'import' | 'remove'>;
  /** Throws unless the event comes from the office window served by our own daemon. */
  trusted(event: E): void;
  /** Where `board.changed` goes (the office window). */
  target(): EventTarget | undefined;
}

/**
 * Registers the whiteboard channels: sender checked, payloads parsed with zod. The user's saves
 * are merged into the store (never echoed back); changes by agents are pushed to the window.
 */
export function registerBoardIpc<E>(deps: BoardIpcDeps<E>): () => void {
  const { ipcMain, store } = deps;
  ipcMain.handle(BOARD_CHANNELS.load, (event, cwd) => {
    deps.trusted(event);
    const { scene, status } = store.load(cwdSchema.parse(cwd));
    const data: BoardSceneData = {
      elements: scene.elements,
      appState: scene.appState,
      files: scene.files,
    };
    return { scene: data, status } satisfies BoardLoadResult;
  });
  ipcMain.handle(BOARD_CHANNELS.save, (event, cwd, scene): BoardSaveResult => {
    deps.trusted(event);
    const path = cwdSchema.safeParse(cwd);
    const parsed = sceneSchema.safeParse(scene);
    if (!path.success || !parsed.success) return { ok: false, message: 'Invalid board scene.' };
    if (JSON.stringify(parsed.data).length > BOARD_MAX_BYTES) {
      return { ok: false, message: 'The board is too large to save.' };
    }
    try {
      const merged = store.merge(path.data, parsed.data.elements, 'user', {
        files: parsed.data.files,
      });
      // An agent edit that won the merge (newer version) is not in the window yet: send it back, so
      // the window converges on the stored scene and no change is silently dropped.
      const lost = rejectedElements(parsed.data.elements, merged.elements);
      if (lost.length > 0) {
        pushChanged(path.data, { ...merged, elements: lost });
      }
      return { ok: true };
    } catch (error) {
      if (error instanceof BoardLimitError) return { ok: false, message: error.message };
      return { ok: false, message: 'Could not save the board.' };
    }
  });
  const libraries = deps.libraries;
  if (libraries) {
    ipcMain.handle(BOARD_CHANNELS.listLibraries, (event) => {
      deps.trusted(event);
      return libraries.list();
    });
    ipcMain.handle(BOARD_CHANNELS.importLibrary, (event, name, text): BoardLibraryResult => {
      deps.trusted(event);
      const parsedName = z.string().min(1).max(300).safeParse(name);
      const parsedText = z.string().max(LIBRARY_MAX_BYTES).safeParse(text);
      if (!parsedName.success || !parsedText.success) {
        return { ok: false, message: 'Invalid library file.' };
      }
      try {
        return { ok: true, library: libraries.import(parsedName.data, parsedText.data) };
      } catch (error) {
        if (error instanceof LibraryError) return { ok: false, message: error.message };
        return { ok: false, message: 'Could not install the library.' };
      }
    });
    ipcMain.handle(BOARD_CHANNELS.removeLibrary, (event, id) => {
      deps.trusted(event);
      const parsed = z.string().min(1).max(100).safeParse(id);
      return parsed.success ? libraries.remove(parsed.data) : false;
    });
  }
  function pushChanged(cwd: string, scene: BoardScene): void {
    const target = deps.target();
    if (!target || target.isDestroyed()) return;
    target.send(BOARD_CHANNELS.changed, {
      cwd,
      scene: { elements: scene.elements, appState: scene.appState, files: scene.files },
    });
  }
  return store.onChange((cwd, scene, source) => {
    if (source === 'user') return;
    pushChanged(cwd, scene);
  });
}

/**
 * Stored elements that beat the ones the user just sent (same id, the stored copy is not the
 * incoming one): concurrent edits of one element where the other side had the newer version.
 */
export function rejectedElements(
  incoming: readonly BoardElement[],
  stored: readonly BoardElement[],
): BoardElement[] {
  const byId = new Map(stored.map((element) => [element.id, element]));
  return incoming.flatMap((element) => {
    const winner = byId.get(element.id);
    return winner &&
      (winner.version !== element.version || winner.versionNonce !== element.versionNonce)
      ? [winner]
      : [];
  });
}
