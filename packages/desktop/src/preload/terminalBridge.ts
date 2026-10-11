import type {
  LostTerminalSession,
  TerminalBridge,
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalSessionInfo,
  TerminalStartResult,
} from '@agents-office/shared';
import { TERMINAL_CHANNELS } from '../main/terminalChannels';
import type { Invoke } from './bridge';

export type Subscribe = (channel: string, listener: (payload: unknown) => void) => () => void;

/** Typed, minimal surface over IPC for the terminal: ids and bytes only, nothing else leaks. */
export function createTerminalBridge(invoke: Invoke, subscribe: Subscribe): TerminalBridge {
  return {
    start: (options) => invoke(TERMINAL_CHANNELS.start, options) as Promise<TerminalStartResult>,
    write: (id, data) => invoke(TERMINAL_CHANNELS.write, id, data) as Promise<void>,
    resize: (id, cols, rows) => invoke(TERMINAL_CHANNELS.resize, id, cols, rows) as Promise<void>,
    kill: (id) => invoke(TERMINAL_CHANNELS.kill, id) as Promise<void>,
    list: () => invoke(TERMINAL_CHANNELS.list) as Promise<TerminalSessionInfo[]>,
    buffer: (id) => invoke(TERMINAL_CHANNELS.buffer, id) as Promise<string | null>,
    getConfig: () => invoke(TERMINAL_CHANNELS.getConfig) as ReturnType<TerminalBridge['getConfig']>,
    setConfig: (patch) =>
      invoke(TERMINAL_CHANNELS.setConfig, patch) as ReturnType<TerminalBridge['setConfig']>,
    lostSessions: () => invoke(TERMINAL_CHANNELS.lost) as Promise<LostTerminalSession[]>,
    dismissLost: (id) => invoke(TERMINAL_CHANNELS.dismissLost, id) as Promise<void>,
    noteSession: (id, claudeSessionId) =>
      invoke(TERMINAL_CHANNELS.noteSession, id, claudeSessionId) as Promise<void>,
    onData: (listener) =>
      subscribe(TERMINAL_CHANNELS.data, (payload) => listener(payload as TerminalDataEvent)),
    onExit: (listener) =>
      subscribe(TERMINAL_CHANNELS.exit, (payload) => listener(payload as TerminalExitEvent)),
  };
}
