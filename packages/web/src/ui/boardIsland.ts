import type { BoardSceneData } from '@agents-office/shared';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import {
  backgroundOf,
  changedElements,
  EXCALIDRAW_ASSET_PATH,
  isSceneElement,
  type KnownVersions,
  knownOf,
  mergeIncoming,
  replaceScene,
  type SceneElement,
} from './boardLogic';

// The React island of the whiteboard (spec 077). This module is only ever loaded through a
// dynamic import from boardOverlay.ts, so React and Excalidraw stay out of the main bundle (and
// out of the splash). It uses `createElement` so the package needs no JSX setup.

// Fonts are served by the app itself (copied at build time), never from a CDN: works offline.
(window as { EXCALIDRAW_ASSET_PATH?: string }).EXCALIDRAW_ASSET_PATH = EXCALIDRAW_ASSET_PATH;

export interface BoardIslandOptions {
  initial: BoardSceneData;
  /** Shape library items (Excalidraw `LibraryItem`s) offered in the library menu. */
  libraryItems?: unknown[];
  /** The user changed these elements (and the files they use); never called for remote updates. */
  onUserChange(elements: SceneElement[], files: Record<string, unknown>): void;
}

export interface BoardIslandHandle {
  /** Applies a scene changed by someone else (an agent) without echoing it back. */
  applyRemote(scene: BoardSceneData): void;
  /** Current scene, as a `.excalidraw` document payload. */
  getScene(): BoardSceneData | undefined;
  /** Replaces the drawing with an imported scene. */
  importScene(scene: BoardSceneData): void;
  /** Replaces the library items offered in the library menu. */
  setLibraryItems(items: unknown[]): void;
  unmount(): void;
}

const elementsOf = (scene: BoardSceneData): SceneElement[] => scene.elements.filter(isSceneElement);

export async function mountBoardIsland(
  container: HTMLElement,
  options: BoardIslandOptions,
): Promise<BoardIslandHandle> {
  // Importing the CSS here keeps it in the lazy chunk too.
  const [excalidraw] = await Promise.all([
    import('@excalidraw/excalidraw'),
    import('@excalidraw/excalidraw/index.css'),
  ]);
  const { Excalidraw, restoreElements, CaptureUpdateAction } = excalidraw;

  const initialElements = elementsOf(options.initial);
  const known: KnownVersions = knownOf(initialElements);
  let api: ExcalidrawImperativeAPI | undefined;

  const allElements = (): SceneElement[] =>
    (api?.getSceneElementsIncludingDeleted() ?? []) as unknown as SceneElement[];

  const props = {
    initialData: {
      elements: restoreElements(initialElements as never, null),
      appState: { viewBackgroundColor: backgroundOf(options.initial) },
      files: (options.initial.files ?? {}) as never,
      libraryItems: (options.libraryItems ?? []) as never,
      scrollToContent: true,
    },
    theme: 'dark' as const,
    langCode: 'pt-BR',
    excalidrawAPI: (instance: ExcalidrawImperativeAPI) => {
      api = instance;
    },
    onChange: (
      elements: readonly unknown[],
      _appState: unknown,
      files: Record<string, unknown>,
    ) => {
      const changed = changedElements(elements as readonly SceneElement[], known);
      if (changed.length === 0) return;
      for (const element of changed) known.set(element.id, element.version);
      const usedFiles: Record<string, unknown> = {};
      for (const element of changed) {
        const fileId = element.fileId;
        if (typeof fileId === 'string' && files[fileId]) usedFiles[fileId] = files[fileId];
      }
      options.onUserChange(changed, usedFiles);
    },
  };

  const root = createRoot(container);
  root.render(createElement(Excalidraw, props));

  return {
    applyRemote(scene) {
      if (!api) return;
      const incoming = elementsOf(scene);
      const merged = restoreElements(
        mergeIncoming(allElements(), incoming) as never,
        null,
      ) as unknown as SceneElement[];
      // What the shell already has must not come back as a user change.
      for (const element of incoming) {
        const winner = merged.find((candidate) => candidate.id === element.id);
        if (winner) known.set(winner.id, Math.max(winner.version, known.get(winner.id) ?? 0));
      }
      const files = Object.values(scene.files ?? {});
      if (files.length > 0) api.addFiles(files as never);
      api.updateScene({
        elements: merged as never,
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    },
    getScene() {
      if (!api) return undefined;
      return {
        elements: allElements().filter((element) => !element.isDeleted),
        appState: { viewBackgroundColor: api.getAppState().viewBackgroundColor },
        files: api.getFiles() as Record<string, unknown>,
      };
    },
    importScene(scene) {
      if (!api) return;
      const restored = restoreElements(
        elementsOf(scene) as never,
        null,
      ) as unknown as SceneElement[];
      const next = replaceScene(allElements(), restored);
      const files = Object.values(scene.files ?? {});
      if (files.length > 0) api.addFiles(files as never);
      api.updateScene({
        elements: next as never,
        appState: { viewBackgroundColor: backgroundOf(scene) },
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
    },
    setLibraryItems(items) {
      // A bad library must not break the editor: Excalidraw validates, we only guard the call.
      api?.updateLibrary({ libraryItems: items as never, merge: false }).catch(() => undefined);
    },
    unmount() {
      root.unmount();
    },
  };
}
