/** IPC channel names of the hooks bridge (shared by the main process and the preload). */
export const HOOKS_CHANNELS = {
  status: 'agents-office:hooks:status',
  preview: 'agents-office:hooks:preview',
  install: 'agents-office:hooks:install',
  uninstall: 'agents-office:hooks:uninstall',
} as const;
