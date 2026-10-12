/** IPC channel names of the managed-sessions bridge (shared by the main process and the preload). */
export const MANAGED_CHANNELS = {
  start: 'agents-office:managed:start',
  stop: 'agents-office:managed:stop',
  list: 'agents-office:managed:list',
  reopenReport: 'agents-office:managed:reopen-report',
  change: 'agents-office:managed:change',
  reopened: 'agents-office:managed:reopened',
} as const;
