import type { CommEvent, CommMessage, CommsBridge } from '@agents-office/shared';
import { COMMS_CHANNELS } from '../main/commsChannels';
import type { Invoke } from './bridge';
import type { Subscribe } from './terminalBridge';

/** Typed, minimal surface over IPC for the agent communication events and history. */
export function createCommsBridge(invoke: Invoke, subscribe: Subscribe): CommsBridge {
  return {
    history: (cwd) => invoke(COMMS_CHANNELS.history, cwd) as Promise<CommMessage[]>,
    onEvent: (listener) =>
      subscribe(COMMS_CHANNELS.event, (payload) => listener(payload as CommEvent)),
  };
}
