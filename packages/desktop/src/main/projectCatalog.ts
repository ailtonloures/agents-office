import {
  closeSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import type { CatalogProject, ProjectSessionInfo, ProjectSource } from '@agents-office/shared';

export const MAX_RECENTS = 30;
const HEAD_BYTES = 64 * 1024;
const SUMMARY_CHARS = 90;
const MAX_SESSIONS_LISTED = 25;

/** Claude Code names a project folder after its cwd, every non-alphanumeric character becoming `-`. */
export function encodeSlug(cwd: string): string {
  return cwd.replace(/[^A-Za-z0-9]/g, '-');
}

/** Normalizes a path so the same folder never appears twice (`/a/b/` and `/a/b` are one). */
export function normalizeCwd(cwd: string): string {
  const trimmed = cwd.trim();
  if (trimmed === '') return '';
  const resolved = resolve(trimmed);
  return resolved.length > 1 ? resolved.replace(/[\\/]+$/, '') : resolved;
}

/**
 * Best-effort inverse of `encodeSlug` for when no transcript line carries a `cwd`. The encoding is
 * lossy (`/`, `.`, `_`, ` ` and `-` all became `-`), so the directories on disk disambiguate:
 * it walks the segments, gluing tokens back with each joiner, and keeps the first path that exists.
 * An empty token (`--`) means the next folder name starts with a dot. Returns null on no match.
 */
export function decodeSlug(slug: string, isDirectory: (path: string) => boolean): string | null {
  if (!slug.startsWith('-')) return null;
  const tokens = slug.slice(1).split('-');
  const walk = (base: string, index: number): string | null => {
    if (index >= tokens.length) return base;
    const dot = tokens[index] === '';
    const start = dot ? index + 1 : index;
    for (let end = start; end < tokens.length; end++) {
      const pieces = tokens.slice(start, end + 1);
      if (pieces.includes('')) break;
      for (const name of glue(pieces)) {
        const path = `${base === '/' ? '' : base}/${dot ? '.' : ''}${name}`;
        if (!isDirectory(path)) continue;
        const found = walk(path, end + 1);
        if (found) return found;
      }
    }
    return null;
  };
  return walk('/', 0);
}

const JOINERS = ['-', '.', '_', ' '];

/** Every way to glue name pieces back (`['a','b']` -> `a-b`, `a.b`, `a_b`, `a b`). */
function glue(pieces: string[]): string[] {
  let results = [pieces[0] ?? ''];
  const joiners = pieces.length > 4 ? ['-'] : JOINERS;
  for (const piece of pieces.slice(1)) {
    results = results.flatMap((r) => joiners.map((j) => r + j + piece));
  }
  return results;
}

interface Store {
  favorites: string[];
  recents: Array<{ cwd: string; usedAt: string }>;
  added: string[];
}

function emptyStore(): Store {
  return { favorites: [], recents: [], added: [] };
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

function loadStore(path: string): Store {
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<Store>;
    return {
      favorites: Array.isArray(raw.favorites) ? raw.favorites.filter(isString) : [],
      recents: Array.isArray(raw.recents)
        ? raw.recents.filter(
            (r): r is { cwd: string; usedAt: string } =>
              !!r &&
              isString((r as { cwd?: unknown }).cwd) &&
              isString((r as { usedAt?: unknown }).usedAt),
          )
        : [],
      added: Array.isArray(raw.added) ? raw.added.filter(isString) : [],
    };
  } catch {
    return emptyStore();
  }
}

const defaultIsDirectory = (path: string): boolean => {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
};

export interface ProjectCatalogOptions {
  /** JSON file in the app data folder (favorites, recents, folders added by hand). */
  storePath: string;
  /** Claude Code's projects folder (`~/.claude/projects`). */
  projectsDir: string;
  isDirectory?: (path: string) => boolean;
  now?: () => Date;
}

interface HistoryEntry {
  cwd: string;
  modifiedAt: string;
}

/** Folders where a session can start: office + history + manual, with favorites and recents. */
export class ProjectCatalog {
  private store: Store;
  private readonly isDirectory: (path: string) => boolean;

  constructor(private readonly options: ProjectCatalogOptions) {
    this.store = loadStore(options.storePath);
    this.isDirectory = options.isDirectory ?? defaultIsDirectory;
  }

  /** `known`: cwds that the office model already has (the daemon's projects). */
  list(known: readonly string[] = []): CatalogProject[] {
    this.store = loadStore(this.options.storePath);
    const byCwd = new Map<string, CatalogProject>();
    const touch = (raw: string, source: ProjectSource): CatalogProject | undefined => {
      const cwd = normalizeCwd(raw);
      if (cwd === '' || !this.isDirectory(cwd)) return undefined;
      let entry = byCwd.get(cwd);
      if (!entry) {
        entry = {
          cwd,
          name: basename(cwd) || cwd,
          favorite: false,
          lastUsedAt: null,
          lastActivityAt: null,
          sources: [],
        };
        byCwd.set(cwd, entry);
      }
      if (!entry.sources.includes(source)) entry.sources.push(source);
      return entry;
    };

    for (const cwd of known) touch(cwd, 'office');
    for (const item of this.readHistory()) {
      const entry = touch(item.cwd, 'history');
      if (entry && (!entry.lastActivityAt || item.modifiedAt > entry.lastActivityAt)) {
        entry.lastActivityAt = item.modifiedAt;
      }
    }
    for (const cwd of this.store.added) touch(cwd, 'added');
    for (const recent of this.store.recents) {
      const entry = touch(recent.cwd, 'added');
      if (entry) {
        // Recents that came only from the app keep the "added" source (a folder the user used).
        if (!entry.lastUsedAt || recent.usedAt > entry.lastUsedAt) entry.lastUsedAt = recent.usedAt;
      }
    }
    const favorites = new Set(this.store.favorites.map(normalizeCwd));
    for (const entry of byCwd.values()) entry.favorite = favorites.has(entry.cwd);
    return sortProjects([...byCwd.values()]);
  }

  /** Adds a folder chosen by hand; returns its catalog entry (undefined if it is not a folder). */
  add(cwd: string): CatalogProject | undefined {
    const normalized = normalizeCwd(cwd);
    if (normalized === '' || !this.isDirectory(normalized)) return undefined;
    // A folder picked by hand also counts as just used, so it shows up at the top of the list.
    const usedAt = (this.options.now?.() ?? new Date()).toISOString();
    this.mutate((store) => {
      if (!store.added.includes(normalized)) store.added.push(normalized);
      const rest = store.recents.filter((r) => normalizeCwd(r.cwd) !== normalized);
      store.recents = [{ cwd: normalized, usedAt }, ...rest].slice(0, MAX_RECENTS);
    });
    return this.list().find((p) => p.cwd === normalized);
  }

  setFavorite(cwd: string, favorite: boolean): void {
    const normalized = normalizeCwd(cwd);
    if (normalized === '') return;
    this.mutate((store) => {
      const rest = store.favorites.map(normalizeCwd).filter((c) => c !== normalized);
      store.favorites = favorite ? [...rest, normalized] : rest;
    });
  }

  markUsed(cwd: string): void {
    const normalized = normalizeCwd(cwd);
    if (normalized === '') return;
    const usedAt = (this.options.now?.() ?? new Date()).toISOString();
    this.mutate((store) => {
      const rest = store.recents.filter((r) => normalizeCwd(r.cwd) !== normalized);
      store.recents = [{ cwd: normalized, usedAt }, ...rest].slice(0, MAX_RECENTS);
    });
  }

  /** Transcripts of the project, newest first, for `claude --resume <id>`. */
  sessions(cwd: string): ProjectSessionInfo[] {
    const dir = join(this.options.projectsDir, encodeSlug(normalizeCwd(cwd)));
    const files: Array<{ id: string; mtime: number; path: string }> = [];
    try {
      for (const name of readdirSync(dir)) {
        if (!name.endsWith('.jsonl')) continue;
        const path = join(dir, name);
        try {
          files.push({ id: name.slice(0, -'.jsonl'.length), mtime: statSync(path).mtimeMs, path });
        } catch {
          // Vanished between readdir and stat.
        }
      }
    } catch {
      return [];
    }
    return files
      .filter((f) => /^[A-Za-z0-9_-]{1,100}$/.test(f.id))
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, MAX_SESSIONS_LISTED)
      .map((f) => ({
        id: f.id,
        modifiedAt: new Date(f.mtime).toISOString(),
        summary: firstPrompt(readHead(f.path)),
      }));
  }

  /** Newest transcript of every slug folder: its `cwd` (or the decoded slug) and mtime. */
  private readHistory(): HistoryEntry[] {
    const result: HistoryEntry[] = [];
    let slugs: string[];
    try {
      slugs = readdirSync(this.options.projectsDir);
    } catch {
      return result;
    }
    for (const slug of slugs) {
      const dir = join(this.options.projectsDir, slug);
      let newest: { path: string; mtime: number } | undefined;
      try {
        for (const name of readdirSync(dir)) {
          if (!name.endsWith('.jsonl')) continue;
          const path = join(dir, name);
          const mtime = statSync(path).mtimeMs;
          if (!newest || mtime > newest.mtime) newest = { path, mtime };
        }
      } catch {
        continue;
      }
      if (!newest) continue;
      const cwd = cwdFromTranscript(readHead(newest.path)) ?? decodeSlug(slug, this.isDirectory);
      if (cwd) result.push({ cwd, modifiedAt: new Date(newest.mtime).toISOString() });
    }
    return result;
  }

  private mutate(change: (store: Store) => void): void {
    // Re-read so two app instances (or a manual edit) are not overwritten with stale data.
    const store = loadStore(this.options.storePath);
    change(store);
    this.store = store;
    mkdirSync(dirname(this.options.storePath), { recursive: true });
    const tmp = `${this.options.storePath}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(store, null, 2)}\n`);
    renameSync(tmp, this.options.storePath);
  }
}

/**
 * Favorites first, then the ones used from the app (most recent first), then the rest by
 * transcript activity (most recent first), name as the tie-breaker.
 */
export function sortProjects(projects: CatalogProject[]): CatalogProject[] {
  const rank = (p: CatalogProject): number => (p.favorite ? 0 : p.lastUsedAt ? 1 : 2);
  const recency = (p: CatalogProject): string => p.lastUsedAt ?? p.lastActivityAt ?? '';
  return [...projects].sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    const byTime = recency(b).localeCompare(recency(a));
    if (byTime !== 0) return byTime;
    return a.name.localeCompare(b.name) || a.cwd.localeCompare(b.cwd);
  });
}

function readHead(path: string): string {
  let fd: number | undefined;
  try {
    fd = openSync(path, 'r');
    const buffer = Buffer.alloc(HEAD_BYTES);
    const read = readSync(fd, buffer, 0, HEAD_BYTES, 0);
    return buffer.toString('utf8', 0, read);
  } catch {
    return '';
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function* jsonLines(text: string): Generator<Record<string, unknown>> {
  // The last line may be cut by the read window: it simply fails to parse.
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    try {
      const value: unknown = JSON.parse(line);
      if (value && typeof value === 'object') yield value as Record<string, unknown>;
    } catch {
      // Not a JSON line.
    }
  }
}

/** First `cwd` string found in the first lines of a transcript. */
export function cwdFromTranscript(head: string): string | null {
  for (const line of jsonLines(head)) {
    if (isString(line.cwd)) return line.cwd;
  }
  return null;
}

/** Text of the first real user prompt of a transcript head, shortened. */
export function firstPrompt(head: string): string | null {
  for (const line of jsonLines(head)) {
    if (line.type !== 'user' || line.isMeta === true) continue;
    const message = line.message as { content?: unknown } | undefined;
    const content = message?.content;
    let text: string | undefined;
    if (typeof content === 'string') text = content;
    else if (Array.isArray(content)) {
      const part = content.find(
        (c): c is { type: 'text'; text: string } =>
          !!c &&
          (c as { type?: unknown }).type === 'text' &&
          isString((c as { text?: unknown }).text),
      );
      text = part?.text;
    }
    const flat = text?.replace(/\s+/g, ' ').trim();
    // Slash-command wrappers and tool plumbing are not a prompt.
    if (!flat || flat.startsWith('<')) continue;
    return flat.length > SUMMARY_CHARS ? `${flat.slice(0, SUMMARY_CHARS - 1)}…` : flat;
  }
  return null;
}
