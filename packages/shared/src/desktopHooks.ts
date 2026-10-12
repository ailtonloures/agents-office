import type { BoardBridge } from './desktopBoard';
import type { BrowserBridge } from './desktopBrowser';
import type { BrowserApprovalBridge } from './desktopBrowserApproval';
import type { CommsBridge } from './desktopComms';
import type { ExternalBridge } from './desktopExternal';
import type { ManagedBridge } from './desktopManaged';
import type { ProfilesBridge } from './desktopProfiles';
import type { ProjectsBridge } from './desktopProjects';
import type { SpawnApprovalBridge } from './desktopSpawnApproval';
import type { TerminalBridge } from './desktopTerminal';
import type { UpdaterBridge } from './desktopUpdater';

// Contract of the hooks bridge that the desktop shell exposes to the web app
// (`window.agentsOfficeDesktop.hooks`). Plain types: the bridge is local IPC, not a network edge.

export interface HookEventStatus {
  event: string;
  installed: boolean;
}

export interface HooksStatus {
  /** The settings.json that is read and edited. */
  path: string;
  events: HookEventStatus[];
  installedCount: number;
  total: number;
  /** ISO time of the last hook the daemon received, or null if none (or the daemon is down). */
  hooksSeenAt: string | null;
  daemonReachable: boolean;
}

export interface HooksPreview {
  action: 'install' | 'uninstall';
  path: string;
  changed: boolean;
  /** Line diff of the settings.json (`+`, `-`, two spaces for context). Empty when nothing changes. */
  diff: string;
}

export interface HooksChangeResult {
  action: 'install' | 'uninstall';
  changed: boolean;
  /** Uninstall removed the file because agents-office had created all of it. */
  deleted: boolean;
  backupPath?: string;
  status: HooksStatus;
}

export interface HooksBridge {
  status(): Promise<HooksStatus>;
  preview(action: 'install' | 'uninstall'): Promise<HooksPreview>;
  install(): Promise<HooksChangeResult>;
  uninstall(): Promise<HooksChangeResult>;
}

export interface AgentsOfficeDesktop {
  desktop: true;
  platform: string;
  hooks: HooksBridge;
  terminal: TerminalBridge;
  projects: ProjectsBridge;
  profiles: ProfilesBridge;
  managed: ManagedBridge;
  comms: CommsBridge;
  board: BoardBridge;
  /** Absent on shells without the embedded browser. */
  browser?: BrowserBridge;
  /** Absent on shells without the embedded browser. */
  browserApproval?: BrowserApprovalBridge;
  spawnApproval: SpawnApprovalBridge;
  external: ExternalBridge;
  /** Absent on shells without auto-update. */
  updater?: UpdaterBridge;
}
