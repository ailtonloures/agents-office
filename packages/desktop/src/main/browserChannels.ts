/** IPC channel names of the embedded browser bridge (shared by the main process and the preload). */
export const BROWSER_CHANNELS = {
  show: 'agents-office:browser:show',
  setBounds: 'agents-office:browser:set-bounds',
  hide: 'agents-office:browser:hide',
  navigate: 'agents-office:browser:navigate',
  back: 'agents-office:browser:back',
  forward: 'agents-office:browser:forward',
  reload: 'agents-office:browser:reload',
  clearData: 'agents-office:browser:clear-data',
  setPaused: 'agents-office:browser:set-paused',
  startPick: 'agents-office:browser:start-pick',
  cancelPick: 'agents-office:browser:cancel-pick',
  /** Push (main -> window): a `BrowserPickEvent`. */
  pick: 'agents-office:browser:pick',
  /** Push (main -> window): a `BrowserState`. */
  state: 'agents-office:browser:state',
} as const;
