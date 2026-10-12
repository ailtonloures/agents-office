/** IPC channel names of the whiteboard bridge (shared by the main process and the preload). */
export const BOARD_CHANNELS = {
  load: 'agents-office:board:load',
  save: 'agents-office:board:save',
  /** Push (main -> window): `{ cwd, scene }` when an agent (not the window) changed a board. */
  changed: 'agents-office:board:changed',
  listLibraries: 'agents-office:board:libraries:list',
  importLibrary: 'agents-office:board:libraries:import',
  removeLibrary: 'agents-office:board:libraries:remove',
  /** Push (main -> window): `{ id, definition }`, a Mermaid diagram to convert. */
  mermaidRequest: 'agents-office:board:mermaid:request',
  /** Invoke (window -> main): `(id, response)`, the answer to a Mermaid request. */
  mermaidResponse: 'agents-office:board:mermaid:response',
} as const;
