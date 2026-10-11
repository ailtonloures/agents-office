import type { ExternalBridge } from './desktopExternal';
import type { ProjectsBridge } from './desktopProjects';
import type { TerminalBridge } from './desktopTerminal';

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
  external: ExternalBridge;
}
