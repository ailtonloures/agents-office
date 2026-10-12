import { z } from 'zod';
import type { IpcMainLike } from './ipc';
import type { UpdateService, UpdateState } from './updater';
import { UPDATER_CHANNELS } from './updaterChannels';

/** The updater channels take no payload: anything extra is rejected. */
const noArgs = z.tuple([]);

export interface UpdaterIpcDeps<E> {
  ipcMain: IpcMainLike<E>;
  service: Pick<UpdateService, 'getState' | 'checkNow'>;
  /** Starts the restart into the downloaded version (spec 059 routes it through the quit flow). */
  install(): boolean;
  /** Throws unless the event comes from the office window served by our own daemon. */
  trusted(event: E): void;
}

/** Registers the updater channels: sender checked, arguments parsed with zod. */
export function registerUpdaterIpc<E>(deps: UpdaterIpcDeps<E>): void {
  const guarded =
    <R>(fn: () => R) =>
    (event: E, ...args: unknown[]): R => {
      deps.trusted(event);
      if (!noArgs.safeParse(args).success) throw new Error('Invalid updater request.');
      return fn();
    };
  deps.ipcMain.handle(
    UPDATER_CHANNELS.getState,
    guarded((): UpdateState => deps.service.getState()),
  );
  deps.ipcMain.handle(
    UPDATER_CHANNELS.checkNow,
    guarded((): Promise<UpdateState> => deps.service.checkNow()),
  );
  deps.ipcMain.handle(
    UPDATER_CHANNELS.install,
    guarded((): boolean => deps.install()),
  );
}

/** Push side: sends each state to the window (nothing when there is none or it is gone). */
export function createUpdateStatusPusher(
  target: () =>
    | { send(channel: string, ...args: unknown[]): void; isDestroyed?(): boolean }
    | undefined,
): (state: UpdateState) => void {
  return (state) => {
    const contents = target();
    if (!contents || contents.isDestroyed?.()) return;
    contents.send(UPDATER_CHANNELS.status, state);
  };
}
