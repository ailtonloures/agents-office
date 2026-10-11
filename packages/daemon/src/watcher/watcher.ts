import { open, readFile, stat } from 'node:fs/promises';
import { type FSWatcher, watch } from 'chokidar';
import type { NormalizerInput } from '../normalizer';
import { classifyPath, type WatchedPath } from './classify';

export interface TranscriptWatcherOptions {
  /** Usually `~/.claude/projects`. */
  projectsDir: string;
  /** On the initial load, files not modified within this window are ignored. */
  initialWindowMs: number;
  onInput: (input: NormalizerInput) => void;
  /** Use stat polling instead of native fs events (fallback for filesystems without inotify). */
  usePolling?: boolean;
  /** Polling interval when `usePolling` is on. Default 100 ms. */
  pollIntervalMs?: number;
  /** Per-file read coalescing delay. Default 50 ms. */
  debounceMs?: number;
  /** Log sink for I/O errors and debug traces. Default `console.error`. */
  log?: (message: string, error?: unknown) => void;
  /** Debug traces; defaults to `AGENTS_OFFICE_DEBUG=1`. */
  debug?: boolean;
}

export interface TranscriptWatcher {
  /** Resolves once the initial scan is done (all initial reads delivered). */
  start(): Promise<void>;
  /** Stops watching and releases every handle. Idempotent. */
  stop(): Promise<void>;
}

interface FileState {
  info: WatchedPath;
  path: string;
  /** Bytes consumed so far (complete lines + buffered partial one). */
  offset: number;
  /** Trailing bytes of an unterminated line. */
  partial: Buffer;
  timer: NodeJS.Timeout | undefined;
  running: Promise<void> | undefined;
  dirty: boolean;
}

const NEWLINE = 0x0a;

export function createTranscriptWatcher(options: TranscriptWatcherOptions): TranscriptWatcher {
  const { projectsDir, initialWindowMs, onInput } = options;
  const debounceMs = options.debounceMs ?? 50;
  const debug = options.debug ?? process.env.AGENTS_OFFICE_DEBUG === '1';
  const logSink =
    options.log ??
    ((message: string, error?: unknown) => {
      if (error === undefined) console.error(`[watcher] ${message}`);
      else console.error(`[watcher] ${message}`, error);
    });
  const trace = (message: string): void => {
    if (debug) logSink(message);
  };

  const files = new Map<string, FileState>();
  const emittedMetas = new Set<string>();
  const metaInFlight = new Map<string, Promise<void>>();
  let watcher: FSWatcher | undefined;
  let stopped = false;
  let ready = false;
  let startPromise: Promise<void> | undefined;
  const initialTasks: Promise<void>[] = [];

  function emit(input: NormalizerInput): void {
    try {
      onInput(input);
    } catch (error) {
      logSink('onInput threw', error);
    }
  }

  const metaKey = (info: { sessionId: string; agentId: string }): string =>
    `${info.sessionId}/${info.agentId}`;

  function metaPathFor(agentPath: string): string {
    return agentPath.replace(/\.jsonl$/, '.meta.json');
  }

  /** Reads and emits an agent's meta once; a partial/missing file is retried on later triggers. */
  function ensureMeta(info: { sessionId: string; agentId: string }, path: string): Promise<void> {
    const key = metaKey(info);
    if (emittedMetas.has(key)) return Promise.resolve();
    const inFlight = metaInFlight.get(key);
    if (inFlight !== undefined) return inFlight;
    const task = (async () => {
      try {
        const text = await readFile(path, 'utf8');
        const meta: unknown = JSON.parse(text);
        if (stopped || emittedMetas.has(key)) return;
        emittedMetas.add(key);
        emit({ kind: 'agent-meta', sessionId: info.sessionId, agentId: info.agentId, meta });
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'ENOENT') trace(`meta not readable yet: ${path} (${String(error)})`);
      }
    })().finally(() => {
      metaInFlight.delete(key);
    });
    metaInFlight.set(key, task);
    return task;
  }

  function emitLine(info: WatchedPath, line: string): void {
    if (line.trim() === '') return;
    if (info.kind === 'session') {
      emit({
        kind: 'session-line',
        sessionId: info.sessionId,
        projectSlug: info.projectSlug,
        line,
      });
    } else if (info.kind === 'agent') {
      emit({ kind: 'agent-line', sessionId: info.sessionId, agentId: info.agentId, line });
    }
  }

  async function readDelta(state: FileState): Promise<void> {
    let size: number;
    try {
      size = (await stat(state.path)).size;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        logSink(`stat failed: ${state.path}`, error);
      return;
    }
    if (size < state.offset) {
      trace(`truncated, re-reading: ${state.path}`);
      state.offset = 0;
      state.partial = Buffer.alloc(0);
    }
    if (state.info.kind === 'agent') await ensureMeta(state.info, metaPathFor(state.path));
    if (stopped || size === state.offset) return;

    const length = size - state.offset;
    const chunk = Buffer.alloc(length);
    const handle = await open(state.path, 'r');
    let read = 0;
    try {
      while (read < length) {
        const { bytesRead } = await handle.read(chunk, read, length - read, state.offset + read);
        if (bytesRead === 0) break;
        read += bytesRead;
      }
    } finally {
      await handle.close();
    }
    if (stopped) return;
    state.offset += read;

    let data = Buffer.concat([state.partial, chunk.subarray(0, read)]);
    let newline = data.indexOf(NEWLINE);
    while (newline !== -1) {
      const line = data.subarray(0, newline).toString('utf8').replace(/\r$/, '');
      data = data.subarray(newline + 1);
      emitLine(state.info, line);
      newline = data.indexOf(NEWLINE);
    }
    state.partial = Buffer.from(data);
  }

  function runner(state: FileState): Promise<void> {
    if (state.running !== undefined) {
      state.dirty = true;
      return state.running;
    }
    state.running = (async () => {
      try {
        do {
          state.dirty = false;
          await readDelta(state);
        } while (state.dirty && !stopped);
      } catch (error) {
        logSink(`read failed: ${state.path}`, error);
      } finally {
        state.running = undefined;
      }
    })();
    return state.running;
  }

  function schedule(state: FileState, immediate = false): Promise<void> {
    if (stopped) return Promise.resolve();
    if (immediate) {
      if (state.timer !== undefined) clearTimeout(state.timer);
      state.timer = undefined;
      return runner(state);
    }
    if (state.timer === undefined) {
      state.timer = setTimeout(() => {
        state.timer = undefined;
        void runner(state);
      }, debounceMs);
    }
    return Promise.resolve();
  }

  async function handleAdd(path: string): Promise<void> {
    const info = classifyPath(projectsDir, path);
    if (info === undefined || stopped) return;
    if (!ready) {
      try {
        const { mtimeMs } = await stat(path);
        if (Date.now() - mtimeMs > initialWindowMs) {
          trace(`old file ignored at initial load: ${path}`);
          return;
        }
      } catch (error) {
        logSink(`stat failed: ${path}`, error);
        return;
      }
    }
    if (info.kind === 'meta') {
      await ensureMeta(info, path);
      return;
    }
    let state = files.get(path);
    if (state === undefined) {
      state = {
        info,
        path,
        offset: 0,
        partial: Buffer.alloc(0),
        timer: undefined,
        running: undefined,
        dirty: false,
      };
      files.set(path, state);
    }
    await schedule(state, !ready);
  }

  function handleChange(path: string): void {
    const info = classifyPath(projectsDir, path);
    if (info === undefined || stopped) return;
    if (info.kind === 'meta') {
      void ensureMeta(info, path);
      return;
    }
    const state = files.get(path);
    if (state === undefined) {
      void handleAdd(path);
      return;
    }
    void schedule(state);
  }

  function isIgnored(path: string, stats?: { isFile(): boolean }): boolean {
    if (stats?.isFile() !== true) return false;
    return classifyPath(projectsDir, path) === undefined;
  }

  return {
    start(): Promise<void> {
      if (startPromise !== undefined) return startPromise;
      startPromise = new Promise<void>((resolve) => {
        const w = watch(projectsDir, {
          ignoreInitial: false,
          persistent: true,
          usePolling: options.usePolling ?? false,
          interval: options.pollIntervalMs ?? 100,
          awaitWriteFinish: false,
          depth: 3,
          ignored: isIgnored,
        });
        watcher = w;
        w.on('add', (path) => {
          initialTasks.push(
            handleAdd(path).catch((error) => logSink(`add failed: ${path}`, error)),
          );
        });
        w.on('change', handleChange);
        w.on('error', (error) => logSink('chokidar error', error));
        w.on('ready', () => {
          void Promise.all(initialTasks).then(() => {
            ready = true;
            resolve();
          });
        });
      });
      return startPromise;
    },

    async stop(): Promise<void> {
      if (stopped) return;
      stopped = true;
      for (const state of files.values()) {
        if (state.timer !== undefined) clearTimeout(state.timer);
        state.timer = undefined;
      }
      const w = watcher;
      watcher = undefined;
      if (w !== undefined) await w.close();
      await Promise.all([...files.values()].map((state) => state.running));
      await Promise.all(metaInFlight.values());
    },
  };
}
