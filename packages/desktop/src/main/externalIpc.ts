import { isAbsolute } from 'node:path';
import type { EditorConfigResult, OpenInVSCodeResult } from '@agents-office/shared';
import { z } from 'zod';
import { EXTERNAL_CHANNELS } from './externalChannels';
import {
  type EditorPathStore,
  type OpenerDeps,
  OpenerError,
  openInVSCode,
  VSCodeNotFound,
} from './externalOpener';
import type { IpcMainLike } from './ipc';

export const externalSchemas = {
  open: z.object({ dir: z.string().min(1).max(4096) }).strict(),
  editorPath: z.object({ path: z.string().max(4096).nullable() }).strict(),
};

export interface ExternalIpcDeps<E> {
  ipcMain: IpcMainLike<E>;
  opener: OpenerDeps;
  store: EditorPathStore;
  /** Throws unless the event comes from the office window served by our own daemon. */
  trusted(event: E): void;
}

/** Registers the external channels: sender checked, payload parsed with zod, folder validated here. */
export function registerExternalIpc<E>(deps: ExternalIpcDeps<E>): void {
  const { ipcMain } = deps;
  const guarded =
    <A extends unknown[], R>(fn: (...args: A) => R) =>
    (event: E, ...args: A): R => {
      deps.trusted(event);
      return fn(...args);
    };

  ipcMain.handle(
    EXTERNAL_CHANNELS.openInVSCode,
    guarded(async (dir: unknown): Promise<OpenInVSCodeResult> => {
      const parsed = externalSchemas.open.safeParse({ dir });
      if (!parsed.success) {
        return { ok: false, code: 'invalid-request', message: 'Invalid folder.' };
      }
      try {
        await openInVSCode(deps.opener, parsed.data.dir, deps.store.get());
        return { ok: true };
      } catch (error) {
        if (error instanceof VSCodeNotFound) {
          return { ok: false, code: error.code, message: error.message };
        }
        if (error instanceof OpenerError) {
          return { ok: false, code: error.code, message: error.message };
        }
        return { ok: false, code: 'spawn-failed', message: (error as Error).message };
      }
    }),
  );
  ipcMain.handle(
    EXTERNAL_CHANNELS.getEditorPath,
    guarded((): string | null => deps.store.get()),
  );
  ipcMain.handle(
    EXTERNAL_CHANNELS.setEditorPath,
    guarded((path: unknown): EditorConfigResult => {
      const parsed = externalSchemas.editorPath.safeParse({ path });
      if (!parsed.success) return { ok: false, message: 'Invalid configuration.' };
      const value = parsed.data.path?.trim() || null;
      if (value && (!isAbsolute(value) || !deps.opener.isExecutable(value))) {
        return { ok: false, message: `"${value}" is not an executable file (use a full path).` };
      }
      deps.store.set(value);
      return { ok: true, vscodePath: value };
    }),
  );
}
