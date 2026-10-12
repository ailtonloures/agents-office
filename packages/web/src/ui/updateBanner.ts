import type { UpdaterBridge, UpdateState } from '@agents-office/shared';
import { t } from '../i18n/i18n';
import { BUTTON_CSS } from './buttonStyles';
import { bannerModel, versionOf } from './updateLogic';

const CSS = `
.ao-update-banner{position:absolute;left:50%;top:8px;transform:translateX(-50%);z-index:20;
  font:13px monospace;background:#1b1d2a;color:#f0e6b8;border:2px solid #f0c040;padding:8px 12px;
  display:flex;gap:8px;align-items:center;max-width:calc(100% - 16px);box-sizing:border-box;
  flex-wrap:wrap}
.ao-update-banner[hidden]{display:none}
.ao-update-banner button{padding:4px 10px}
${BUTTON_CSS}`;

/**
 * Mounts the update banner inside `gameParent`. Call only when the bridge exists. Returns the
 * cleanup (unsubscribes from the bridge and removes the banner).
 */
export function mountUpdateBanner(bridge: UpdaterBridge, gameParent: HTMLElement): () => void {
  const style = Object.assign(document.createElement('style'), { textContent: CSS });
  document.head.append(style);

  const banner = document.createElement('div');
  banner.className = 'ao-update-banner';
  banner.setAttribute('data-testid', 'update-banner');
  banner.hidden = true;
  const text = document.createElement('span');
  text.setAttribute('data-testid', 'update-text');
  const install = Object.assign(document.createElement('button'), {
    textContent: t('update.install'),
  });
  install.setAttribute('data-testid', 'update-install');
  const later = Object.assign(document.createElement('button'), { textContent: t('update.later') });
  later.setAttribute('data-testid', 'update-later');
  banner.append(text, install, later);
  // Keys typed while a banner button has focus must not reach Phaser (WASD, Z, Tab...), like the settings panel.
  const stopKeys = (event: KeyboardEvent): void => event.stopPropagation();
  banner.addEventListener('keydown', stopKeys);
  banner.addEventListener('keyup', stopKeys);
  gameParent.append(banner);

  let current: UpdateState = { state: 'idle' };
  let dismissedVersion: string | null = null;
  let disposed = false;

  const render = (): void => {
    const model = bannerModel(current, dismissedVersion);
    banner.hidden = !model.visible;
    text.textContent = model.text;
    install.hidden = !model.showInstall;
    later.hidden = !model.showLater;
  };
  const apply = (state: UpdateState): void => {
    if (disposed) return;
    current = state;
    render();
  };

  later.onclick = () => {
    dismissedVersion = versionOf(current);
    render();
  };
  install.onclick = () => {
    install.disabled = true;
    bridge
      .install()
      .catch(() => false)
      .then((started) => {
        if (!started) install.disabled = false;
      });
  };

  // Subscribe first so a transition between getState() and its answer is not lost.
  const unsubscribe = bridge.onStatus(apply);
  void bridge
    .getState()
    .then((state) => {
      // A push that already arrived is newer than this snapshot.
      if (current.state === 'idle') apply(state);
    })
    .catch(() => {
      // No state yet: the banner stays hidden until the first push.
    });

  return () => {
    disposed = true;
    unsubscribe();
    banner.remove();
    style.remove();
  };
}
