import { contextBridge, ipcRenderer } from 'electron';
import { createHooksBridge } from './bridge';
import { createExternalBridge } from './externalBridge';
import { createProjectsBridge } from './projectsBridge';
import { createTerminalBridge } from './terminalBridge';

const invoke = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args);

// Deliberately minimal and typed: never expose ipcRenderer itself.
contextBridge.exposeInMainWorld('agentsOfficeDesktop', {
  desktop: true,
  platform: process.platform,
  hooks: createHooksBridge(invoke),
  projects: createProjectsBridge(invoke),
  external: createExternalBridge(invoke),
  terminal: createTerminalBridge(invoke, (channel, listener) => {
    const handler = (_event: unknown, payload: unknown) => listener(payload);
    ipcRenderer.on(channel, handler);
    return () => {
      ipcRenderer.removeListener(channel, handler);
    };
  }),
});
