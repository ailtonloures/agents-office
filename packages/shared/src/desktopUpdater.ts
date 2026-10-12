// Contract of the auto-update bridge that the desktop shell exposes to the web app
// (`window.agentsOfficeDesktop.updater`). Mirrors `UpdateState` of the desktop main process.

export type UpdateState =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'ready'; version: string }
  | { state: 'error'; message: string };

export interface UpdaterBridge {
  /** Current state of the update service. */
  getState(): Promise<UpdateState>;
  /** Checks for an update now; resolves to the state once the check settles. */
  checkNow(): Promise<UpdateState>;
  /** Restarts into the downloaded version; false when none is ready. */
  install(): Promise<boolean>;
  /** Subscribes to state transitions; returns the unsubscribe function. */
  onStatus(listener: (state: UpdateState) => void): () => void;
}
