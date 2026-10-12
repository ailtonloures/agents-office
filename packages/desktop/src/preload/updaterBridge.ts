import type { UpdaterBridge, UpdateState } from '@agents-office/shared';
import { UPDATER_CHANNELS } from '../main/updaterChannels';
import type { Invoke } from './bridge';
import type { Subscribe } from './terminalBridge';

/** Typed, minimal surface over IPC for the auto-updater: state in, check/install out. */
export function createUpdaterBridge(invoke: Invoke, subscribe: Subscribe): UpdaterBridge {
  return {
    getState: () => invoke(UPDATER_CHANNELS.getState) as Promise<UpdateState>,
    checkNow: () => invoke(UPDATER_CHANNELS.checkNow) as Promise<UpdateState>,
    install: () => invoke(UPDATER_CHANNELS.install) as Promise<boolean>,
    onStatus: (listener) =>
      subscribe(UPDATER_CHANNELS.status, (payload) => listener(payload as UpdateState)),
  };
}
