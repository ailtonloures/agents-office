/** IPC channel names of the external-apps bridge (shared by the main process and the preload). */
export const EXTERNAL_CHANNELS = {
  openInVSCode: 'agents-office:external:open-vscode',
  getEditorPath: 'agents-office:external:get-editor-path',
  setEditorPath: 'agents-office:external:set-editor-path',
} as const;
