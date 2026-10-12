import type {
  AgentsOfficeDesktop,
  BoardBridge,
  BoardLibrary,
  BoardSceneData,
} from '@agents-office/shared';

// Pure helpers of the whiteboard overlay (spec 077): no DOM, no React, no Excalidraw, so the main
// bundle can import them without pulling the editor in.

/** The board bridge exposed by the desktop shell; undefined in a plain browser (no overlay). */
export function boardBridgeOf(win: object): BoardBridge | undefined {
  const desktop = (win as { agentsOfficeDesktop?: unknown }).agentsOfficeDesktop as
    | Partial<AgentsOfficeDesktop>
    | undefined;
  const board = desktop?.board;
  return board &&
    typeof board.load === 'function' &&
    typeof board.save === 'function' &&
    typeof board.onChange === 'function' &&
    typeof board.listLibraries === 'function'
    ? board
    : undefined;
}

/** Where the fonts bundled with the app are served (offline); see `excalidrawAssets` in vite.config. */
export const EXCALIDRAW_ASSET_PATH = '/excalidraw-assets/';
/** Time without edits before the scene is sent to the shell. */
export const SAVE_DEBOUNCE_MS = 500;

/** Minimal shape of an Excalidraw element for merging. */
export interface SceneElement {
  id: string;
  version: number;
  versionNonce: number;
  isDeleted?: boolean;
  [key: string]: unknown;
}

export const isSceneElement = (value: unknown): value is SceneElement => {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    v.id.length > 0 &&
    typeof v.type === 'string' &&
    typeof v.version === 'number' &&
    typeof v.versionNonce === 'number'
  );
};

/** Versions of the elements as last seen by the shell (saved, loaded or received). */
export type KnownVersions = Map<string, number>;

export const knownOf = (elements: readonly SceneElement[]): KnownVersions =>
  new Map(elements.map((element) => [element.id, element.version]));

/** Elements whose version differs from what the shell has: the only ones worth saving. */
export function changedElements<T extends SceneElement>(
  elements: readonly T[],
  known: KnownVersions,
): T[] {
  return elements.filter((element) => known.get(element.id) !== element.version);
}

/**
 * Merges elements arriving from an agent into the local ones, by id: the higher version wins; a
 * tie goes to the lower `versionNonce` (what Excalidraw itself does). Local order is kept, new
 * elements go on top.
 */
export function mergeIncoming<T extends SceneElement>(
  local: readonly T[],
  incoming: readonly T[],
): T[] {
  const incomingById = new Map(incoming.map((element) => [element.id, element]));
  const merged: T[] = local.map((element) => {
    const other = incomingById.get(element.id);
    incomingById.delete(element.id);
    if (!other) return element;
    if (other.version !== element.version) return other.version > element.version ? other : element;
    return other.versionNonce < element.versionNonce ? other : element;
  });
  for (const element of incomingById.values()) merged.push(element);
  return merged;
}

/**
 * Scene that results from importing a `.excalidraw`: the current drawing is deleted (tombstones
 * with a newer version, so it stays deleted everywhere) and the imported elements take its place.
 */
export function replaceScene<T extends SceneElement>(
  current: readonly T[],
  imported: readonly T[],
): T[] {
  const importedIds = new Set(imported.map((element) => element.id));
  const currentById = new Map(current.map((element) => [element.id, element]));
  const dropped = current
    .filter((element) => !element.isDeleted && !importedIds.has(element.id))
    .map((element) => ({
      ...element,
      isDeleted: true,
      version: element.version + 1,
      versionNonce: nonce(),
    }));
  const incoming = imported.map((element) => {
    const existing = currentById.get(element.id);
    // Same id as something already there: stay above its version so the import wins everywhere.
    return existing && element.version <= existing.version
      ? { ...element, version: existing.version + 1, versionNonce: nonce() }
      : element;
  });
  return [...dropped, ...incoming];
}

const nonce = (): number => Math.floor(Math.random() * 2 ** 31);

/** Parses the text of a `.excalidraw` file; null when it is not one. */
export function parseExcalidrawFile(text: string): BoardSceneData | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const file = raw as Record<string, unknown>;
  if (file.type !== 'excalidraw' || !Array.isArray(file.elements)) return null;
  if (!file.elements.every(isSceneElement)) return null;
  const files =
    typeof file.files === 'object' && file.files !== null
      ? (file.files as Record<string, unknown>)
      : {};
  const appState =
    typeof file.appState === 'object' && file.appState !== null
      ? (file.appState as Record<string, unknown>)
      : {};
  return { elements: file.elements, appState, files };
}

/** Text of a `.excalidraw` file for a scene. */
export function serializeExcalidrawFile(scene: BoardSceneData): string {
  return JSON.stringify(
    {
      type: 'excalidraw',
      version: 2,
      source: 'agents-office',
      elements: scene.elements,
      appState: { viewBackgroundColor: backgroundOf(scene) },
      files: scene.files ?? {},
    },
    null,
    2,
  );
}

/** The only piece of the stored `appState` that is restored (the rest is session state). */
export function backgroundOf(scene: BoardSceneData): string {
  const color = scene.appState?.viewBackgroundColor;
  return typeof color === 'string' && /^#[0-9a-fA-F]{3,8}$|^transparent$/.test(color)
    ? color
    : '#ffffff';
}

/** File name of an exported board: `quadro-<project>.excalidraw`. */
export function exportFileName(cwd: string): string {
  const base = cwd.split(/[\\/]/).filter(Boolean).pop() ?? 'quadro';
  const slug = base.replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 40) || 'quadro';
  return `quadro-${slug}.excalidraw`;
}

export interface Debounced {
  (): void;
  /** Runs now if something is pending. */
  flush(): void;
  cancel(): void;
}

export function debounce(
  fn: () => void,
  ms: number,
  timers: {
    set(callback: () => void, ms: number): unknown;
    clear(handle: unknown): void;
  } = {
    set: (callback, delay) => setTimeout(callback, delay),
    clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  },
): Debounced {
  let handle: unknown;
  let pending = false;
  const run = (): void => {
    pending = false;
    handle = undefined;
    fn();
  };
  const debounced = (() => {
    pending = true;
    if (handle !== undefined) timers.clear(handle);
    handle = timers.set(run, ms);
  }) as Debounced;
  debounced.flush = () => {
    if (!pending) return;
    if (handle !== undefined) timers.clear(handle);
    run();
  };
  debounced.cancel = () => {
    if (handle !== undefined) timers.clear(handle);
    handle = undefined;
    pending = false;
  };
  return debounced;
}

/** Whether Esc should close the overlay: not while typing, nor while an Excalidraw dialog is open. */
export function escapeCloses(
  event: { key: string; defaultPrevented?: boolean },
  context: { typing: boolean; dialogOpen: boolean },
): boolean {
  return (
    event.key === 'Escape' && !event.defaultPrevented && !context.typing && !context.dialogOpen
  );
}

/** Names of the agents that drew on the board (`customData.author`), in order of first appearance. */
export function boardAuthors(
  elements: readonly { isDeleted?: boolean; customData?: unknown }[],
): string[] {
  const names = new Set<string>();
  for (const element of elements) {
    if (element.isDeleted) continue;
    const data = element.customData;
    if (typeof data !== 'object' || data === null) continue;
    const author = (data as { author?: unknown }).author;
    const name =
      typeof author === 'object' && author !== null
        ? (author as { name?: unknown }).name
        : undefined;
    if (typeof name === 'string' && name) names.add(name);
  }
  return [...names];
}

/** Text of the authorship indicator ("" when no agent drew anything). */
export const authorsLabel = (names: readonly string[]): string =>
  names.length === 0 ? '' : `Desenhado por: ${names.join(', ')}`;

/** Excalidraw `LibraryItem`s of the installed libraries (ids prefixed with the library id). */
export function libraryItemsOf(libraries: readonly BoardLibrary[]): unknown[] {
  return libraries.flatMap((library) =>
    library.items.map((item) => ({
      id: `${library.id}:${item.id}`,
      status: 'published',
      created: 0,
      ...(item.name ? { name: item.name } : {}),
      elements: item.elements,
    })),
  );
}

/** One line for the libraries panel: "Name (3 formas)". */
export const libraryLabel = (library: BoardLibrary): string =>
  `${library.name} (${library.items.length} ${library.items.length === 1 ? 'forma' : 'formas'})`;
