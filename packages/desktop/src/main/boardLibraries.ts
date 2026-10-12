import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import type { BoardLibrary, BoardLibraryItem } from '@agents-office/shared';
import { type BoardElement, isBoardElement } from './boardStore';

/** Max size of a `.excalidrawlib` file. */
export const LIBRARY_MAX_BYTES = 2 * 1024 * 1024;
export const LIBRARY_MAX_ITEMS = 500;
export const LIBRARY_MAX_ELEMENTS_PER_ITEM = 500;
/** Max libraries installed at once. */
export const LIBRARY_MAX_FILES = 50;
export const LIBRARY_EXTENSION = '.excalidrawlib';
const LIBRARY_NAME_MAX = 60;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export class LibraryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LibraryError';
  }
}

/** Display name from a file name: no folder, no extension, no control characters. */
export function libraryName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? '';
  let cleaned = base.replace(/\.(excalidrawlib|json)$/i, '');
  cleaned = [...cleaned]
    .filter((ch) => ch.charCodeAt(0) > 31 && ch.charCodeAt(0) !== 127)
    .join('')
    .trim()
    .slice(0, LIBRARY_NAME_MAX);
  return cleaned || 'biblioteca';
}

/** Stable id of a library: slug of the name (+ short hash when the slug alone would be empty). */
export function libraryId(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || `lib-${createHash('sha256').update(name).digest('hex').slice(0, 8)}`;
}

const validElements = (value: unknown): BoardElement[] | undefined =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.length <= LIBRARY_MAX_ELEMENTS_PER_ITEM &&
  value.every(isBoardElement)
    ? (value as BoardElement[])
    : undefined;

/**
 * Parses the text of a `.excalidrawlib` (format v1 `library: [[...]]` or v2 `libraryItems`).
 * Throws `LibraryError` for anything that is not a valid library; items with broken elements are
 * skipped, a library without any valid item is refused.
 */
export function parseLibrary(text: string): BoardLibraryItem[] {
  if (text.length > LIBRARY_MAX_BYTES) throw new LibraryError('The library file is too large.');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new LibraryError('The file is not valid JSON.');
  }
  if (!isRecord(raw) || raw.type !== 'excalidrawlib') {
    throw new LibraryError('The file is not an Excalidraw library (.excalidrawlib).');
  }
  const items: BoardLibraryItem[] = [];
  if (Array.isArray(raw.libraryItems)) {
    for (const [i, item] of raw.libraryItems.entries()) {
      // v2 items are objects; some files hold bare element arrays (v1 style): accept both.
      const elements = validElements(isRecord(item) ? item.elements : item);
      if (!elements) continue;
      const name =
        isRecord(item) && typeof item.name === 'string' && item.name.trim()
          ? item.name.trim().slice(0, 80)
          : undefined;
      const id = isRecord(item) && typeof item.id === 'string' && item.id ? item.id : `item-${i}`;
      items.push({ id: id.slice(0, 80), ...(name ? { name } : {}), elements });
    }
  } else if (Array.isArray(raw.library)) {
    for (const [i, item] of raw.library.entries()) {
      const elements = validElements(item);
      if (elements) items.push({ id: `item-${i}`, elements });
    }
  } else {
    throw new LibraryError('The library has no items.');
  }
  if (items.length === 0) throw new LibraryError('The library has no valid items.');
  if (items.length > LIBRARY_MAX_ITEMS) {
    throw new LibraryError(`The library has too many items (max ${LIBRARY_MAX_ITEMS}).`);
  }
  // Unique item ids (files in the wild repeat them).
  const seen = new Set<string>();
  return items.map((item, i) => {
    let id = item.id;
    if (seen.has(id)) id = `${id}-${i}`;
    seen.add(id);
    return { ...item, id };
  });
}

export interface LibraryStoreOptions {
  /** Libraries folder (`userData/board-libraries`). */
  dir: string;
}

/**
 * Shape libraries installed in the app's data folder, one `.excalidrawlib` per library. Broken
 * files in the folder are skipped (never thrown), so a bad library cannot take the board down.
 */
export class LibraryStore {
  constructor(private readonly options: LibraryStoreOptions) {}

  private fileOf(id: string): string {
    return join(this.options.dir, `${id}${LIBRARY_EXTENSION}`);
  }

  /** Installed libraries, by name. */
  list(): BoardLibrary[] {
    let files: string[];
    try {
      files = readdirSync(this.options.dir).filter((f) => f.endsWith(LIBRARY_EXTENSION));
    } catch {
      return [];
    }
    const out: BoardLibrary[] = [];
    for (const file of files.slice(0, LIBRARY_MAX_FILES)) {
      const id = file.slice(0, -LIBRARY_EXTENSION.length);
      try {
        const text = readFileSync(join(this.options.dir, file), 'utf8');
        const items = parseLibrary(text);
        const stored = JSON.parse(text) as { name?: unknown };
        const name = typeof stored.name === 'string' && stored.name ? stored.name : id;
        out.push({ id, name, items });
      } catch {
        // Skipped: unreadable or invalid file.
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Installs (or replaces, same name) a library from the text of a `.excalidrawlib`. */
  import(fileName: string, text: string): BoardLibrary {
    const items = parseLibrary(text);
    const name = libraryName(fileName);
    const id = libraryId(name);
    if (!existsSync(this.fileOf(id)) && this.list().length >= LIBRARY_MAX_FILES) {
      throw new LibraryError(`At most ${LIBRARY_MAX_FILES} libraries can be installed.`);
    }
    mkdirSync(this.options.dir, { recursive: true });
    const normalized = {
      type: 'excalidrawlib',
      version: 2,
      source: 'agents-office',
      name,
      libraryItems: items.map((item) => ({
        id: item.id,
        status: 'published',
        ...(item.name ? { name: item.name } : {}),
        created: Date.now(),
        elements: item.elements,
      })),
    };
    const target = this.fileOf(id);
    const tmp = `${target}.tmp`;
    writeFileSync(tmp, JSON.stringify(normalized));
    renameSync(tmp, target);
    return { id, name, items };
  }

  remove(id: string): boolean {
    if (!/^[a-z0-9-]+$/.test(id)) return false;
    const file = this.fileOf(id);
    if (!existsSync(file)) return false;
    rmSync(file, { force: true });
    return true;
  }

  /** Library by id or (case-insensitive) name. */
  find(ref: string): BoardLibrary | undefined {
    const wanted = ref.trim().toLowerCase();
    return this.list().find((lib) => lib.id === wanted || lib.name.toLowerCase() === wanted);
  }
}

/** Item of a library by name (case-insensitive), id, or zero-based index. */
export function findLibraryItem(
  library: BoardLibrary,
  ref: string | number,
): BoardLibraryItem | undefined {
  if (typeof ref === 'number') return library.items[ref];
  const wanted = ref.trim().toLowerCase();
  return (
    library.items.find((item) => item.name?.toLowerCase() === wanted) ??
    library.items.find((item) => item.id.toLowerCase() === wanted)
  );
}
