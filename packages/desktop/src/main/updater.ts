export type UpdateState =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'ready'; version: string }
  | { state: 'error'; message: string };

/** The slice of electron-updater's `autoUpdater` this service uses (a fake in the tests). */
export interface AutoUpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  on(event: 'checking-for-update', listener: () => void): unknown;
  on(event: 'update-available', listener: (info: { version: string }) => void): unknown;
  on(event: 'update-not-available', listener: () => void): unknown;
  on(event: 'download-progress', listener: (progress: { percent: number }) => void): unknown;
  on(event: 'update-downloaded', listener: (info: { version: string }) => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
}

export interface UpdateDeps {
  autoUpdater: AutoUpdaterLike;
  /** `app.isPackaged`: from the sources (dev) the service does nothing. */
  isPackaged: boolean;
  /** Running from an AppImage (`APPIMAGE` set): `.deb` and others cannot self-update. */
  isAppImage: boolean;
  /** Called on every state transition. */
  emit(state: UpdateState): void;
  now(): number;
}

export interface UpdateService {
  /** False when the service is a no-op (not packaged / not an AppImage). */
  readonly enabled: boolean;
  /** Arms the first check (15 s after boot) and the periodic one (every 4 h). */
  start(): void;
  stop(): void;
  getState(): UpdateState;
  /** Epoch ms of the last check that ended (any outcome); null before the first. */
  lastCheckedAt(): number | null;
  /** Checks now; resolves to the state once the check settles (never rejects). */
  checkNow(): Promise<UpdateState>;
  /** Restarts into the downloaded version; false when none is ready. */
  install(): boolean;
}

export const FIRST_CHECK_DELAY_MS = 15_000;
export const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

/** Update state machine over electron-updater (no Electron import: all injected). */
export function createUpdateService(deps: UpdateDeps): UpdateService {
  const { autoUpdater } = deps;
  const enabled = deps.isPackaged && deps.isAppImage;
  let state: UpdateState = { state: 'idle' };
  let checkedAt: number | null = null;
  let firstTimer: ReturnType<typeof setTimeout> | undefined;
  let interval: ReturnType<typeof setInterval> | undefined;
  // Version being offered, kept across the available -> downloading -> ready steps.
  let version = '';

  const set = (next: UpdateState): void => {
    state = next;
    deps.emit(next);
  };
  const fail = (error: unknown): void => {
    // electron-updater emits 'error' and also rejects `checkForUpdates`: report once.
    if (state.state === 'ready') return;
    const message = error instanceof Error ? error.message : String(error);
    checkedAt = deps.now();
    if (state.state === 'error' && state.message === message) return;
    set({ state: 'error', message });
  };

  if (enabled) {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('checking-for-update', () => {
      if (state.state !== 'ready') set({ state: 'checking' });
    });
    autoUpdater.on('update-available', (info) => {
      version = info.version;
      set({ state: 'available', version });
    });
    autoUpdater.on('update-not-available', () => {
      checkedAt = deps.now();
      if (state.state !== 'ready') set({ state: 'idle' });
    });
    autoUpdater.on('download-progress', (progress) => {
      const percent = Math.min(100, Math.max(0, Math.round(progress.percent)));
      set({ state: 'downloading', version, percent });
    });
    autoUpdater.on('update-downloaded', (info) => {
      version = info.version;
      checkedAt = deps.now();
      set({ state: 'ready', version });
    });
    autoUpdater.on('error', fail);
  }

  const checkNow = async (): Promise<UpdateState> => {
    // Nothing to ask while a download runs or an update waits to be installed.
    const busy = state.state === 'checking' || state.state === 'downloading';
    if (!enabled || busy || state.state === 'ready') return state;
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      fail(error);
    }
    return state;
  };

  return {
    enabled,
    start() {
      if (!enabled || firstTimer || interval) return;
      firstTimer = setTimeout(() => void checkNow(), FIRST_CHECK_DELAY_MS);
      interval = setInterval(() => void checkNow(), CHECK_INTERVAL_MS);
    },
    stop() {
      clearTimeout(firstTimer);
      clearInterval(interval);
      firstTimer = undefined;
      interval = undefined;
    },
    getState: () => state,
    lastCheckedAt: () => checkedAt,
    checkNow,
    install() {
      if (!enabled || state.state !== 'ready') return false;
      // Not silent (AppImage has no installer UI anyway), relaunch the new version.
      autoUpdater.quitAndInstall(false, true);
      return true;
    },
  };
}
