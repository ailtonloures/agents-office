import type { HooksBridge } from '@agents-office/shared';
import { HOOKS_CHANNELS } from '../main/hooksChannels';

export type Invoke = (channel: string, ...args: unknown[]) => Promise<unknown>;

/** Typed, minimal surface over `ipcRenderer.invoke`: nothing else of IPC reaches the web page. */
export function createHooksBridge(invoke: Invoke): HooksBridge {
  return {
    status: () => invoke(HOOKS_CHANNELS.status) as ReturnType<HooksBridge['status']>,
    preview: (action) => {
      if (action !== 'install' && action !== 'uninstall') {
        return Promise.reject(new Error(`Invalid hooks action "${String(action)}".`));
      }
      return invoke(HOOKS_CHANNELS.preview, action) as ReturnType<HooksBridge['preview']>;
    },
    install: () => invoke(HOOKS_CHANNELS.install) as ReturnType<HooksBridge['install']>,
    uninstall: () => invoke(HOOKS_CHANNELS.uninstall) as ReturnType<HooksBridge['uninstall']>,
  };
}
