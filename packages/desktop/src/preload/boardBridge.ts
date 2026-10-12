import type {
  BoardBridge,
  BoardLibrary,
  BoardLibraryResult,
  BoardLoadResult,
  BoardMermaidRequest,
  BoardSaveResult,
  BoardSceneData,
} from '@agents-office/shared';
import { BOARD_CHANNELS } from '../main/boardChannels';
import type { Invoke } from './bridge';
import type { Subscribe } from './terminalBridge';

/** Typed, minimal surface over IPC for the shared whiteboard. */
export function createBoardBridge(invoke: Invoke, subscribe: Subscribe): BoardBridge {
  return {
    load: (cwd) => invoke(BOARD_CHANNELS.load, cwd) as Promise<BoardLoadResult>,
    save: (cwd, scene) => invoke(BOARD_CHANNELS.save, cwd, scene) as Promise<BoardSaveResult>,
    onChange: (listener) =>
      subscribe(BOARD_CHANNELS.changed, (payload) => {
        const { cwd, scene } = payload as { cwd: string; scene: BoardSceneData };
        listener(cwd, scene);
      }),
    listLibraries: () => invoke(BOARD_CHANNELS.listLibraries) as Promise<BoardLibrary[]>,
    importLibrary: (name, text) =>
      invoke(BOARD_CHANNELS.importLibrary, name, text) as Promise<BoardLibraryResult>,
    removeLibrary: (id) => invoke(BOARD_CHANNELS.removeLibrary, id) as Promise<boolean>,
    onMermaidRequest: (handler) =>
      subscribe(BOARD_CHANNELS.mermaidRequest, (payload) => {
        const request = payload as BoardMermaidRequest;
        void handler(request).then(
          (response) => invoke(BOARD_CHANNELS.mermaidResponse, request.id, response),
          (error) =>
            invoke(BOARD_CHANNELS.mermaidResponse, request.id, {
              ok: false,
              message: error instanceof Error ? error.message : String(error),
            }),
        );
      }),
  };
}
