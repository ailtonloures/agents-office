import { isAbsolute } from 'node:path';
import {
  type LostTerminalSession,
  TERMINAL_PERMISSION_MODES,
  type TerminalConfig,
  type TerminalConfigResult,
  type TerminalSessionInfo,
  type TerminalStartResult,
} from '@agents-office/shared';
import { z } from 'zod';
import type { AppConfigStore } from './appConfig';
import { MAX_SESSIONS_CEILING } from './appConfig';
import type { BinaryResolver } from './binaries';
import { type SessionManager, toStartError } from './sessionManager';
import type { SessionRegistry } from './sessionRegistry';
import { TERMINAL_CHANNELS } from './terminalChannels';

const idSchema = z.string().min(1).max(100);
const dim = z.number().int().min(1).max(1000);

export const terminalSchemas = {
  start: z
    .object({
      cwd: z.string().min(1).max(4096),
      resume: z
        .string()
        .regex(/^[A-Za-z0-9_-]{1,100}$/)
        .optional(),
      continueLast: z.boolean().optional(),
      permissionMode: z.enum(TERMINAL_PERMISSION_MODES).optional(),
      cols: dim.optional(),
      rows: dim.optional(),
    })
    .strict(),
  write: z.object({ id: idSchema, data: z.string().max(1024 * 1024) }).strict(),
  resize: z.object({ id: idSchema, cols: dim, rows: dim }).strict(),
  id: z.object({ id: idSchema }).strict(),
  note: z
    .object({ id: idSchema, claudeSessionId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/) })
    .strict(),
  setConfig: z
    .object({
      claudePath: z.string().max(4096).nullable().optional(),
      maxSessions: z.number().int().min(1).max(MAX_SESSIONS_CEILING).optional(),
    })
    .strict(),
};

export interface IpcMainLike<E> {
  handle(channel: string, listener: (event: E, ...args: unknown[]) => unknown): void;
}

export interface EventTarget {
  isDestroyed(): boolean;
  send(channel: string, payload: unknown): void;
}

export interface TerminalIpcDeps<E> {
  ipcMain: IpcMainLike<E>;
  manager: SessionManager;
  config: AppConfigStore;
  registry: SessionRegistry;
  resolver: BinaryResolver;
  isExecutable(path: string): boolean;
  /** Throws unless the event comes from the office window served by our own daemon. */
  trusted(event: E): void;
  /** Where `terminal.data|exit` events go (the office window). */
  target(): EventTarget | undefined;
  /** Called with the terminal id whenever the renderer writes to a terminal (user input). */
  onUserInput?(id: string, data: string): void;
}

/**
 * Registers the terminal channels. Every call checks the sender and parses its payload with zod;
 * the renderer only ever sees ids and bytes, never `node-pty`. Terminal data is not logged.
 */
export function registerTerminalIpc<E>(deps: TerminalIpcDeps<E>): () => void {
  const { ipcMain, manager } = deps;
  const guarded =
    <A extends unknown[], R>(fn: (...args: A) => R) =>
    (event: E, ...args: A): R => {
      deps.trusted(event);
      return fn(...args);
    };

  ipcMain.handle(
    TERMINAL_CHANNELS.start,
    guarded(async (payload: unknown): Promise<TerminalStartResult> => {
      const parsed = terminalSchemas.start.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, code: 'invalid-request', message: 'Invalid terminal start request.' };
      }
      try {
        const { id } = await manager.start(parsed.data);
        return { ok: true, id };
      } catch (error) {
        return { ok: false, ...toStartError(error) };
      }
    }),
  );
  ipcMain.handle(
    TERMINAL_CHANNELS.write,
    guarded((id: unknown, data: unknown): void => {
      const parsed = terminalSchemas.write.parse({ id, data });
      manager.write(parsed.id, parsed.data);
      deps.onUserInput?.(parsed.id, parsed.data);
    }),
  );
  ipcMain.handle(
    TERMINAL_CHANNELS.resize,
    guarded((id: unknown, cols: unknown, rows: unknown): void => {
      const parsed = terminalSchemas.resize.parse({ id, cols, rows });
      manager.resize(parsed.id, parsed.cols, parsed.rows);
    }),
  );
  ipcMain.handle(
    TERMINAL_CHANNELS.kill,
    guarded((id: unknown): Promise<void> => manager.kill(terminalSchemas.id.parse({ id }).id)),
  );
  ipcMain.handle(
    TERMINAL_CHANNELS.list,
    guarded((): TerminalSessionInfo[] => manager.list()),
  );
  ipcMain.handle(
    TERMINAL_CHANNELS.buffer,
    guarded((id: unknown): string | null => manager.getBuffer(terminalSchemas.id.parse({ id }).id)),
  );
  ipcMain.handle(
    TERMINAL_CHANNELS.lost,
    guarded((): LostTerminalSession[] => deps.registry.lostSessions()),
  );
  ipcMain.handle(
    TERMINAL_CHANNELS.dismissLost,
    guarded((id: unknown): void => deps.registry.dismissLost(terminalSchemas.id.parse({ id }).id)),
  );
  ipcMain.handle(
    TERMINAL_CHANNELS.noteSession,
    guarded((id: unknown, claudeSessionId: unknown): void => {
      const parsed = terminalSchemas.note.safeParse({ id, claudeSessionId });
      if (parsed.success) deps.registry.bind(parsed.data.id, parsed.data.claudeSessionId);
    }),
  );
  ipcMain.handle(
    TERMINAL_CHANNELS.getConfig,
    guarded((): TerminalConfig => deps.config.get()),
  );
  ipcMain.handle(
    TERMINAL_CHANNELS.setConfig,
    guarded((patch: unknown): TerminalConfigResult => {
      const parsed = terminalSchemas.setConfig.safeParse(patch);
      if (!parsed.success) return { ok: false, message: 'Invalid configuration.' };
      const { claudePath, maxSessions } = parsed.data;
      if (claudePath) {
        if (!isAbsolute(claudePath) || !deps.isExecutable(claudePath)) {
          return {
            ok: false,
            message: `"${claudePath}" is not an executable file (use a full path).`,
          };
        }
      }
      const next: Partial<TerminalConfig> = {};
      if (claudePath !== undefined) next.claudePath = claudePath === '' ? null : claudePath;
      if (maxSessions !== undefined) next.maxSessions = maxSessions;
      const config = deps.config.update(next);
      deps.resolver.invalidate();
      return { ok: true, config };
    }),
  );

  const forward = (channel: string) => (payload: unknown) => {
    const target = deps.target();
    if (target && !target.isDestroyed()) target.send(channel, payload);
  };
  const offData = manager.onData(forward(TERMINAL_CHANNELS.data));
  const offExit = manager.onExit(forward(TERMINAL_CHANNELS.exit));
  return () => {
    offData();
    offExit();
  };
}
