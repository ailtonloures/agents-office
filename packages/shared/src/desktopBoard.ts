// Contract of the whiteboard bridge that the desktop shell exposes to the web app
// (`window.agentsOfficeDesktop.board`). The scene is Excalidraw's `.excalidraw` JSON, kept as
// plain data: the renderer owns the Excalidraw types, the shell only stores and merges them.

export interface BoardSceneData {
  elements: unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
}

/**
 * ok: file read; empty: no file yet; recovered: the file was corrupt and the last valid copy was
 * restored; lost: corrupt without a valid copy (the board starts empty).
 */
export type BoardLoadStatus = 'ok' | 'empty' | 'recovered' | 'lost';

export interface BoardLoadResult {
  scene: BoardSceneData;
  status: BoardLoadStatus;
}

export type BoardSaveResult = { ok: true } | { ok: false; message: string };

/** A shape of a library: the elements of one `.excalidrawlib` item (Excalidraw `LibraryItem`). */
export interface BoardLibraryItem {
  id: string;
  name?: string;
  elements: unknown[];
}

/** A shape library installed in the app's libraries folder. */
export interface BoardLibrary {
  /** File-name based id, stable across restarts. */
  id: string;
  name: string;
  items: BoardLibraryItem[];
}

export type BoardLibraryResult =
  | { ok: true; library: BoardLibrary }
  | { ok: false; message: string };

/** Main -> window: convert this Mermaid source into element skeletons (needs a DOM). */
export interface BoardMermaidRequest {
  id: string;
  definition: string;
}

/** Window -> main: result of a Mermaid conversion; `elements` are simplified skeletons. */
export type BoardMermaidResponse =
  | { ok: true; elements: unknown[] }
  | { ok: false; message: string };

export interface BoardBridge {
  /** Scene of the workspace (one board per workspace). */
  load(cwd: string): Promise<BoardLoadResult>;
  /** Merges the user's edits into the stored scene (by element id/version). */
  save(cwd: string, scene: BoardSceneData): Promise<BoardSaveResult>;
  /** Scene changes that did not come from this window (agents drawing); returns the unsubscribe. */
  onChange(listener: (cwd: string, scene: BoardSceneData) => void): () => void;
  /** Shape libraries (`.excalidrawlib`) installed in the app. */
  listLibraries(): Promise<BoardLibrary[]>;
  /** Installs a library from the text of a `.excalidrawlib` file; invalid ones are refused. */
  importLibrary(name: string, text: string): Promise<BoardLibraryResult>;
  removeLibrary(id: string): Promise<boolean>;
  /**
   * Mermaid conversions asked by the shell for an agent: the handler answers with skeletons (the
   * converter needs a DOM, which only the window has). Returns the unsubscribe.
   */
  onMermaidRequest(
    handler: (request: BoardMermaidRequest) => Promise<BoardMermaidResponse>,
  ): () => void;
}
