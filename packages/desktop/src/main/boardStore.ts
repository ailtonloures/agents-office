import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';

/** Max live (not deleted) elements of a scene. */
export const BOARD_MAX_ELEMENTS = 2000;
/** Max serialized size of a scene. */
export const BOARD_MAX_BYTES = 5 * 1024 * 1024;
/** Deleted elements kept as tombstones so the merge by version does not resurrect them. */
export const BOARD_MAX_TOMBSTONES = 500;

/** Excalidraw element, as far as the main process cares (the rest is passed through). */
export interface BoardElement {
  id: string;
  type: string;
  version: number;
  versionNonce: number;
  isDeleted: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  customData?: { author?: BoardAuthor } & Record<string, unknown>;
  [key: string]: unknown;
}

export interface BoardAuthor {
  /** Roster entry id (or session id when the session has no profile). */
  id: string;
  name: string;
}

/** Content of a `.excalidraw` file. */
export interface BoardScene {
  type: 'excalidraw';
  version: 2;
  source: string;
  elements: BoardElement[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
}

export type BoardLoadStatus = 'ok' | 'empty' | 'recovered' | 'lost';

export interface BoardLoad {
  scene: BoardScene;
  /**
   * ok: file read; empty: no file yet; recovered: the file was corrupt and the last valid copy
   * was restored; lost: corrupt and no valid copy, the scene starts empty.
   */
  status: BoardLoadStatus;
}

export class BoardLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BoardLimitError';
  }
}

export type BoardChangeSource = 'agent' | 'user' | 'system';
export type BoardListener = (cwd: string, scene: BoardScene, source: BoardChangeSource) => void;

export interface BoardStoreOptions {
  /** Folder of the scene files (`userData/boards`), outside the user's repository. */
  dir: string;
  maxElements?: number;
  maxBytes?: number;
  maxTombstones?: number;
}

export const SCENE_SOURCE = 'agents-office';

export const emptyScene = (): BoardScene => ({
  type: 'excalidraw',
  version: 2,
  source: SCENE_SOURCE,
  elements: [],
  appState: {},
  files: {},
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Whether a value has the minimum an element needs to take part in the merge. */
export function isBoardElement(value: unknown): value is BoardElement {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.type === 'string' &&
    typeof value.version === 'number' &&
    typeof value.versionNonce === 'number' &&
    typeof value.x === 'number' &&
    typeof value.y === 'number'
  );
}

/** Parses the text of a `.excalidraw` file; null when it is not a valid scene. */
export function parseScene(text: string): BoardScene | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(raw) || raw.type !== 'excalidraw' || !Array.isArray(raw.elements)) return null;
  if (!raw.elements.every(isBoardElement)) return null;
  return {
    type: 'excalidraw',
    version: 2,
    source: typeof raw.source === 'string' ? raw.source : SCENE_SOURCE,
    elements: raw.elements.map((e) => ({ ...e, isDeleted: e.isDeleted === true })),
    appState: isRecord(raw.appState) ? raw.appState : {},
    files: isRecord(raw.files) ? raw.files : {},
  };
}

export const liveElements = (scene: BoardScene): BoardElement[] =>
  scene.elements.filter((e) => !e.isDeleted);

/**
 * Merge by element id, like Excalidraw's reconcile: the higher `version` wins; on a tie the lower
 * `versionNonce` wins (deterministic on both sides). Elements only on one side are kept.
 */
export function mergeElements(current: BoardElement[], incoming: BoardElement[]): BoardElement[] {
  const byId = new Map<string, BoardElement>();
  const order: string[] = [];
  for (const element of current) {
    if (!byId.has(element.id)) order.push(element.id);
    byId.set(element.id, element);
  }
  for (const element of incoming) {
    const existing = byId.get(element.id);
    if (!existing) {
      order.push(element.id);
      byId.set(element.id, element);
    } else if (
      element.version > existing.version ||
      (element.version === existing.version && element.versionNonce < existing.versionNonce)
    ) {
      byId.set(element.id, element);
    }
  }
  return order.flatMap((id) => {
    const element = byId.get(id);
    return element ? [element] : [];
  });
}

/** Scene file name: readable folder name plus a hash of the full path (distinct per project). */
export function boardFileName(cwd: string): string {
  const slug =
    basename(cwd)
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'board';
  const hash = createHash('sha256').update(cwd).digest('hex').slice(0, 12);
  return `${slug}-${hash}.excalidraw`;
}

/**
 * One whiteboard per workspace, kept by the main process as a `.excalidraw` file in the app data
 * folder. Writes are atomic (temp file + rename) and the previous valid version is kept as a
 * `.bak` copy, so a corrupt file restores the last valid scene.
 */
export class BoardStore {
  private readonly cache = new Map<string, BoardScene>();
  private readonly statuses = new Map<string, BoardLoadStatus>();
  private readonly listeners = new Set<BoardListener>();
  private readonly maxElements: number;
  private readonly maxBytes: number;
  private readonly maxTombstones: number;

  constructor(private readonly options: BoardStoreOptions) {
    this.maxElements = options.maxElements ?? BOARD_MAX_ELEMENTS;
    this.maxBytes = options.maxBytes ?? BOARD_MAX_BYTES;
    this.maxTombstones = options.maxTombstones ?? BOARD_MAX_TOMBSTONES;
  }

  pathOf(cwd: string): string {
    return join(this.options.dir, boardFileName(cwd));
  }

  onChange(listener: BoardListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Loads (and caches) the scene of a project, recovering from a corrupt file. */
  load(cwd: string): BoardLoad {
    const cached = this.cache.get(cwd);
    if (cached) return { scene: cached, status: this.statuses.get(cwd) ?? 'ok' };
    const loaded = this.read(cwd);
    this.cache.set(cwd, loaded.scene);
    this.statuses.set(cwd, loaded.status);
    return loaded;
  }

  get(cwd: string): BoardScene {
    return this.load(cwd).scene;
  }

  private read(cwd: string): BoardLoad {
    const path = this.pathOf(cwd);
    if (!existsSync(path)) {
      // The main file can be missing right after a crash between rename steps; the copy survives.
      const backup = this.readValid(`${path}.bak`);
      if (backup) {
        this.persist(cwd, backup);
        return { scene: backup, status: 'recovered' };
      }
      return { scene: emptyScene(), status: 'empty' };
    }
    const scene = this.readValid(path);
    if (scene) return { scene, status: 'ok' };
    // Corrupt: keep the broken file for inspection and restore the last valid version.
    try {
      copyFileSync(path, `${path}.corrupt`);
    } catch {
      // Best effort.
    }
    const backup = this.readValid(`${path}.bak`);
    if (backup) {
      this.persist(cwd, backup, false);
      return { scene: backup, status: 'recovered' };
    }
    return { scene: emptyScene(), status: 'lost' };
  }

  private readValid(path: string): BoardScene | null {
    try {
      return parseScene(readFileSync(path, 'utf8'));
    } catch {
      return null;
    }
  }

  /** Checks the limits of a scene; throws `BoardLimitError`. */
  assertWithinLimits(scene: BoardScene): void {
    const live = liveElements(scene).length;
    if (live > this.maxElements) {
      throw new BoardLimitError(
        `The board is limited to ${this.maxElements} elements (this would make ${live}).`,
      );
    }
    const bytes = Buffer.byteLength(JSON.stringify(scene));
    if (bytes > this.maxBytes) {
      throw new BoardLimitError(
        `The board is limited to ${Math.round(this.maxBytes / 1024)} KB (this would make ${Math.round(bytes / 1024)} KB).`,
      );
    }
  }

  private persist(cwd: string, scene: BoardScene, keepBackup = true): void {
    const path = this.pathOf(cwd);
    mkdirSync(this.options.dir, { recursive: true });
    // The backup is the last VALID version: only copy the current file when it parses.
    if (keepBackup && this.readValid(path)) {
      try {
        copyFileSync(path, `${path}.bak`);
      } catch {
        // Best effort.
      }
    }
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify(scene));
    renameSync(tmp, path);
  }

  private pruned(scene: BoardScene): BoardScene {
    const dead = scene.elements.filter((e) => e.isDeleted);
    if (dead.length <= this.maxTombstones) return scene;
    const drop = new Set(dead.slice(0, dead.length - this.maxTombstones).map((e) => e.id));
    return { ...scene, elements: scene.elements.filter((e) => !drop.has(e.id)) };
  }

  /** Replaces the scene. Throws `BoardLimitError` (nothing is written) past the limits. */
  set(cwd: string, scene: BoardScene, source: BoardChangeSource = 'system'): BoardScene {
    const next = this.pruned(scene);
    this.assertWithinLimits(next);
    this.persist(cwd, next);
    this.cache.set(cwd, next);
    this.statuses.set(cwd, 'ok');
    for (const listener of this.listeners) {
      try {
        listener(cwd, next, source);
      } catch {
        // A listener must not break the write.
      }
    }
    return next;
  }

  /** Merges elements (by id/version) into the scene, optionally replacing files/appState. */
  merge(
    cwd: string,
    incoming: BoardElement[],
    source: BoardChangeSource,
    extra?: { files?: Record<string, unknown> },
  ): BoardScene {
    const current = this.get(cwd);
    return this.set(
      cwd,
      {
        ...current,
        elements: mergeElements(current.elements, incoming),
        files: extra?.files ? { ...current.files, ...extra.files } : current.files,
      },
      source,
    );
  }

  /** Whole `.excalidraw` text (for export). */
  serialize(cwd: string): string {
    return JSON.stringify(this.get(cwd));
  }
}
