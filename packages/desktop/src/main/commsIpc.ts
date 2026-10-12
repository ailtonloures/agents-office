import { isAbsolute } from 'node:path';
import type { CommMessage } from '@agents-office/shared';
import { z } from 'zod';
import type { CommsLog } from './agentBus/commsLog';
import { COMMS_CHANNELS } from './commsChannels';
import type { EventTarget, IpcMainLike } from './ipc';

const cwd = z.string().min(1).max(4096).refine(isAbsolute, 'Invalid project path.');

export interface CommsIpcDeps<E> {
  ipcMain: IpcMainLike<E>;
  log: CommsLog;
  /** Throws unless the event comes from the office window served by our own daemon. */
  trusted(event: E): void;
  /** Where events go (the office window). */
  target(): EventTarget | undefined;
}

/** Registers the history channel and forwards every message event to the window. */
export function registerCommsIpc<E>(deps: CommsIpcDeps<E>): () => void {
  deps.ipcMain.handle(COMMS_CHANNELS.history, (event: E, ...args: unknown[]): CommMessage[] => {
    deps.trusted(event);
    return deps.log.history(cwd.parse(args[0]));
  });
  return deps.log.onEvent((commEvent) => {
    const target = deps.target();
    if (target && !target.isDestroyed()) target.send(COMMS_CHANNELS.event, commEvent);
  });
}
