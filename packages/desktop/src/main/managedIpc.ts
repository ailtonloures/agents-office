import { isAbsolute } from 'node:path';
import type { ManagedChange, ManagedStartResult, ReopenReport } from '@agents-office/shared';
import { z } from 'zod';
import type { EventTarget, IpcMainLike } from './ipc';
import { MANAGED_CHANNELS } from './managedChannels';
import type { ManagedSessions } from './managedSessions';

const cwd = z.string().min(1).max(4096).refine(isAbsolute, 'Invalid project path.');
const entryId = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);

export const managedSchemas = {
  entry: z.object({ cwd, entryId }).strict(),
};

export interface ManagedIpcDeps<E> {
  ipcMain: IpcMainLike<E>;
  managed: ManagedSessions;
  /** Throws unless the event comes from the office window served by our own daemon. */
  trusted(event: E): void;
  /** Where change events go (the office window). */
  target(): EventTarget | undefined;
}

/** Registers the managed-session channels: sender checked, payloads parsed with zod. */
export function registerManagedIpc<E>(deps: ManagedIpcDeps<E>): () => void {
  const { ipcMain, managed } = deps;
  const guarded =
    <A extends unknown[], R>(fn: (...args: A) => R) =>
    (event: E, ...args: A): R => {
      deps.trusted(event);
      return fn(...args);
    };

  ipcMain.handle(
    MANAGED_CHANNELS.start,
    guarded(async (c: unknown, e: unknown): Promise<ManagedStartResult> => {
      const parsed = managedSchemas.entry.parse({ cwd: c, entryId: e });
      return managed.start(parsed.cwd, parsed.entryId);
    }),
  );
  ipcMain.handle(
    MANAGED_CHANNELS.stop,
    guarded(async (c: unknown, e: unknown): Promise<void> => {
      const parsed = managedSchemas.entry.parse({ cwd: c, entryId: e });
      await managed.stop(parsed.cwd, parsed.entryId);
    }),
  );
  ipcMain.handle(
    MANAGED_CHANNELS.list,
    guarded((): ManagedChange => managed.list()),
  );
  ipcMain.handle(
    MANAGED_CHANNELS.reopenReport,
    guarded((): ReopenReport | null => managed.reopenReport()),
  );

  const forward = (channel: string) => (payload: unknown) => {
    const target = deps.target();
    if (target && !target.isDestroyed()) target.send(channel, payload);
  };
  const offChange = managed.onChange(forward(MANAGED_CHANNELS.change));
  const offReopen = managed.onReopen(forward(MANAGED_CHANNELS.reopened));
  return () => {
    offChange();
    offReopen();
  };
}
