import { contextBridge, ipcRenderer } from 'electron';
import { createBoardBridge } from './boardBridge';
import { createHooksBridge } from './bridge';
import { createBrowserApprovalBridge } from './browserApprovalBridge';
import { createBrowserBridge } from './browserBridge';
import { createCommsBridge } from './commsBridge';
import { createExternalBridge } from './externalBridge';
import { createManagedBridge } from './managedBridge';
import { createProfilesBridge } from './profilesBridge';
import { createProjectsBridge } from './projectsBridge';
import { createSpawnApprovalBridge } from './spawnApprovalBridge';
import { createTerminalBridge } from './terminalBridge';
import { createUpdaterBridge } from './updaterBridge';

const subscribe = (channel: string, listener: (payload: unknown) => void) => {
  const handler = (_event: unknown, payload: unknown) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
};

const invoke = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args);

// Deliberately minimal and typed: never expose ipcRenderer itself.
contextBridge.exposeInMainWorld('agentsOfficeDesktop', {
  desktop: true,
  platform: process.platform,
  hooks: createHooksBridge(invoke),
  projects: createProjectsBridge(invoke),
  profiles: createProfilesBridge(invoke),
  managed: createManagedBridge(invoke, subscribe),
  comms: createCommsBridge(invoke, subscribe),
  board: createBoardBridge(invoke, subscribe),
  browser: createBrowserBridge(invoke, subscribe),
  browserApproval: createBrowserApprovalBridge(invoke, subscribe),
  spawnApproval: createSpawnApprovalBridge(invoke, subscribe),
  external: createExternalBridge(invoke),
  terminal: createTerminalBridge(invoke, subscribe),
  updater: createUpdaterBridge(invoke, subscribe),
});
