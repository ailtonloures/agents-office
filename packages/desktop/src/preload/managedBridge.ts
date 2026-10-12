import type {
  ManagedBridge,
  ManagedChange,
  ManagedStartResult,
  ReopenReport,
} from '@agents-office/shared';
import { MANAGED_CHANNELS } from '../main/managedChannels';
import type { Invoke } from './bridge';
import type { Subscribe } from './terminalBridge';

/** Typed, minimal surface over IPC for the managed sessions of the roster. */
export function createManagedBridge(invoke: Invoke, subscribe: Subscribe): ManagedBridge {
  return {
    start: (cwd, entryId) =>
      invoke(MANAGED_CHANNELS.start, cwd, entryId) as Promise<ManagedStartResult>,
    stop: (cwd, entryId) => invoke(MANAGED_CHANNELS.stop, cwd, entryId) as Promise<void>,
    list: () => invoke(MANAGED_CHANNELS.list) as Promise<ManagedChange>,
    reopenReport: () => invoke(MANAGED_CHANNELS.reopenReport) as Promise<ReopenReport | null>,
    onChange: (listener) =>
      subscribe(MANAGED_CHANNELS.change, (payload) => listener(payload as ManagedChange)),
    onReopen: (listener) =>
      subscribe(MANAGED_CHANNELS.reopened, (payload) => listener(payload as ReopenReport)),
  };
}
