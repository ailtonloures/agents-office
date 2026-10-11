/** IPC channel names of the projects bridge (shared by the main process and the preload). */
export const PROJECTS_CHANNELS = {
  list: 'agents-office:projects:list',
  pickFolder: 'agents-office:projects:pick-folder',
  setFavorite: 'agents-office:projects:set-favorite',
  markUsed: 'agents-office:projects:mark-used',
  sessions: 'agents-office:projects:sessions',
} as const;
