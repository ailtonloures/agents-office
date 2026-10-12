import type {
  BrowserBridge,
  BrowserPickEvent,
  BrowserResult,
  BrowserState,
} from '@agents-office/shared';
import { BROWSER_CHANNELS } from '../main/browserChannels';
import type { Invoke } from './bridge';
import type { Subscribe } from './terminalBridge';

/** Typed, minimal surface over IPC for the embedded browser. */
export function createBrowserBridge(invoke: Invoke, subscribe: Subscribe): BrowserBridge {
  const result = (channel: string, ...args: unknown[]) =>
    invoke(channel, ...args) as Promise<BrowserResult>;
  return {
    show: (cwd, bounds) => result(BROWSER_CHANNELS.show, cwd, bounds),
    setBounds: (bounds) => invoke(BROWSER_CHANNELS.setBounds, bounds) as Promise<void>,
    hide: () => invoke(BROWSER_CHANNELS.hide) as Promise<void>,
    navigate: (cwd, address) => result(BROWSER_CHANNELS.navigate, cwd, address),
    back: (cwd) => result(BROWSER_CHANNELS.back, cwd),
    forward: (cwd) => result(BROWSER_CHANNELS.forward, cwd),
    reload: (cwd) => result(BROWSER_CHANNELS.reload, cwd),
    clearData: (cwd) => result(BROWSER_CHANNELS.clearData, cwd),
    setPaused: (cwd, paused) => result(BROWSER_CHANNELS.setPaused, cwd, paused),
    startPick: (cwd) => result(BROWSER_CHANNELS.startPick, cwd),
    cancelPick: (cwd) => result(BROWSER_CHANNELS.cancelPick, cwd),
    onPick: (listener) => subscribe(BROWSER_CHANNELS.pick, (p) => listener(p as BrowserPickEvent)),
    onState: (listener) => subscribe(BROWSER_CHANNELS.state, (p) => listener(p as BrowserState)),
  };
}
