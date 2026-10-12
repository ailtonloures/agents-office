/** IPC channel names of the updater bridge (shared by the main process and the preload). */
export const UPDATER_CHANNELS = {
  getState: 'agents-office:updater:get-state',
  checkNow: 'agents-office:updater:check-now',
  install: 'agents-office:updater:install',
  /** Push (main -> window): the new `UpdateState` on every transition. */
  status: 'agents-office:updater:status',
} as const;
