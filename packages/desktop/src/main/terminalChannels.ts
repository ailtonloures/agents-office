/** IPC channel names of the terminal bridge (shared by the main process and the preload). */
export const TERMINAL_CHANNELS = {
  start: 'agents-office:terminal:start',
  write: 'agents-office:terminal:write',
  resize: 'agents-office:terminal:resize',
  kill: 'agents-office:terminal:kill',
  list: 'agents-office:terminal:list',
  buffer: 'agents-office:terminal:buffer',
  getConfig: 'agents-office:terminal:get-config',
  setConfig: 'agents-office:terminal:set-config',
  lost: 'agents-office:terminal:lost',
  dismissLost: 'agents-office:terminal:dismiss-lost',
  noteSession: 'agents-office:terminal:note-session',
  data: 'agents-office:terminal:data',
  exit: 'agents-office:terminal:exit',
} as const;
