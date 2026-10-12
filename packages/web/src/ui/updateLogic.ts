import type { AgentsOfficeDesktop, UpdaterBridge, UpdateState } from '@agents-office/shared';

/** The updater bridge exposed by the desktop shell; undefined in a plain browser (no banner). */
export function updaterBridgeOf(win: object): UpdaterBridge | undefined {
  const desktop = (win as { agentsOfficeDesktop?: unknown }).agentsOfficeDesktop as
    | Partial<AgentsOfficeDesktop>
    | undefined;
  const updater = desktop?.updater;
  return updater &&
    typeof updater.getState === 'function' &&
    typeof updater.onStatus === 'function' &&
    typeof updater.install === 'function'
    ? updater
    : undefined;
}

export interface UpdateBannerModel {
  visible: boolean;
  text: string;
  /** Download progress 0-100, only while downloading. */
  percent: number | null;
  showInstall: boolean;
  showLater: boolean;
}

const HIDDEN: UpdateBannerModel = {
  visible: false,
  text: '',
  percent: null,
  showInstall: false,
  showLater: false,
};

/** Version the banner is about, when the state carries one. */
export function versionOf(state: UpdateState): string | null {
  return 'version' in state ? state.version : null;
}

/**
 * Maps the update state to what the banner shows. `dismissedVersion` is the version the user
 * chose "Depois" for: the banner stays hidden for it and returns for a newer one.
 */
export function bannerModel(
  state: UpdateState,
  dismissedVersion: string | null,
): UpdateBannerModel {
  const version = versionOf(state);
  if (version === null || version === dismissedVersion) return HIDDEN;
  switch (state.state) {
    case 'available':
      return {
        visible: true,
        text: `Nova versão ${version} disponível — baixando…`,
        percent: null,
        showInstall: false,
        showLater: true,
      };
    case 'downloading': {
      const percent = Math.max(0, Math.min(100, Math.round(state.percent)));
      return {
        visible: true,
        text: `Nova versão ${version} disponível — baixando… ${percent}%`,
        percent,
        showInstall: false,
        showLater: true,
      };
    }
    case 'ready':
      return {
        visible: true,
        text: `Nova versão ${version} pronta para instalar.`,
        percent: null,
        showInstall: true,
        showLater: true,
      };
    default:
      return HIDDEN;
  }
}
