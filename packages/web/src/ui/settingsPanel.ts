import type { HooksBridge, HooksStatus } from '@agents-office/shared';
import { BUTTON_CSS } from './buttonStyles';
import { getCornerBar } from './cornerBar';
import {
  classifyDiffLine,
  HOOKS_PROMPT_KEY,
  hooksSeenLabel,
  shouldPromptInstall,
  summaryLabel,
} from './settingsLogic';

const CSS = `
.ao-hooks-btn{padding:4px 8px}
.ao-hooks-banner{position:absolute;left:50%;bottom:44px;transform:translateX(-50%);z-index:20;
  font:13px monospace;background:#1b1d2a;color:#f0e6b8;border:2px solid #f0c040;padding:8px 12px;
  display:flex;gap:8px;align-items:center;max-width:calc(100% - 16px);box-sizing:border-box}
.ao-hooks-panel{position:fixed;inset:0;z-index:30;background:rgba(5,6,12,.8);display:flex;
  align-items:center;justify-content:center;font:13px monospace;color:#f0e6b8}
.ao-hooks-box{background:#1b1d2a;border:3px solid #f0c040;padding:20px 24px;width:min(720px,92vw);
  max-height:88vh;overflow:auto}
.ao-hooks-box h2{margin:0 0 12px;font-size:16px}
.ao-hooks-box ul{list-style:none;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));
  gap:6px 16px;padding:0;margin:12px 0}
.ao-hooks-box li{padding:6px 10px;background:#0d1020;border-left:3px solid #4a4f70;
  word-spacing:.25em}
.ao-hooks-info{margin:6px 0}
.ao-hooks-path{margin:6px 0;color:#8a8fa8;overflow-wrap:anywhere}
.ao-hooks-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
@media (max-width:520px){.ao-hooks-box ul{grid-template-columns:minmax(0,1fr)}}
.ao-hooks-box button,.ao-hooks-banner button{padding:4px 10px}
.ao-hooks-diff{background:#0d1020;padding:8px;margin:8px 0;max-height:40vh;overflow:auto;
  white-space:pre;font-size:12px}
.ao-diff-add{color:#7ddc7d}.ao-diff-del{color:#ff7b7b}.ao-diff-ctx{color:#8a8fa8}
.ao-hooks-msg{margin:8px 0;color:#9ad1ff}
${BUTTON_CSS}`;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  testId?: string,
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  if (testId) node.setAttribute('data-testid', testId);
  return node;
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(HOOKS_PROMPT_KEY) === '1';
  } catch {
    return false;
  }
}

function writeDismissed(): void {
  try {
    localStorage.setItem(HOOKS_PROMPT_KEY, '1');
  } catch {
    // Not remembering the choice is harmless.
  }
}

/**
 * Mounts the "Hooks" screen and the first-run notice. The button and the notice live inside
 * `gameParent` (the office area); the modal stays on `document.body`. Call only when the bridge exists.
 */
export function mountSettingsPanel(bridge: HooksBridge, gameParent: HTMLElement): void {
  document.head.append(el('style', { textContent: CSS }));
  let panel: HTMLElement | undefined;
  let banner: HTMLElement | undefined;

  const closePanel = (): void => {
    panel?.remove();
    panel = undefined;
    document.removeEventListener('keydown', onKey, true);
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') closePanel();
    event.stopPropagation();
  };

  const closeBanner = (): void => {
    banner?.remove();
    banner = undefined;
  };

  async function openPanel(): Promise<void> {
    closeBanner();
    closePanel();
    const overlay = el('div', {}, 'hooks-panel');
    overlay.className = 'ao-hooks-panel';
    const box = el('div');
    box.className = 'ao-hooks-box';
    overlay.append(box);
    overlay.addEventListener('mousedown', (event) => {
      if (event.target === overlay) closePanel();
    });
    document.body.append(overlay);
    document.addEventListener('keydown', onKey, true);
    panel = overlay;
    let message = '';

    const render = async (): Promise<void> => {
      let status: HooksStatus;
      try {
        status = await bridge.status();
      } catch (error) {
        box.replaceChildren(
          el('p', { textContent: `Falha ao ler os hooks: ${(error as Error).message}` }),
        );
        return;
      }
      showStatus(status);
    };

    const showStatus = (status: HooksStatus): void => {
      const list = el('ul', {}, 'hooks-events');
      for (const item of status.events) {
        list.append(
          el(
            'li',
            { textContent: `${item.installed ? '[x]' : '[ ]'} ${item.event}` },
            `hook-${item.event}`,
          ),
        );
      }
      const actions = el('div', { className: 'ao-hooks-actions' });
      const install = el('button', { textContent: 'Instalar hooks' }, 'hooks-install');
      const remove = el('button', { textContent: 'Remover hooks' }, 'hooks-uninstall');
      const close = el('button', { textContent: 'Fechar' }, 'hooks-close');
      install.disabled = status.installedCount === status.total;
      remove.disabled = status.installedCount === 0;
      install.onclick = () => void confirmChange('install', status);
      remove.onclick = () => void confirmChange('uninstall', status);
      close.onclick = closePanel;
      actions.append(install, remove, close);
      box.replaceChildren(
        el('h2', { textContent: 'Hooks do Claude Code' }),
        el(
          'div',
          { textContent: summaryLabel(status), className: 'ao-hooks-info' },
          'hooks-summary',
        ),
        el(
          'div',
          { textContent: hooksSeenLabel(status, new Date()), className: 'ao-hooks-info' },
          'hooks-seen',
        ),
        el('div', { textContent: status.path, className: 'ao-hooks-path' }),
        list,
        el('div', { textContent: message, className: 'ao-hooks-msg' }, 'hooks-message'),
        actions,
      );
    };

    const confirmChange = async (
      action: 'install' | 'uninstall',
      status: HooksStatus,
    ): Promise<void> => {
      let preview: Awaited<ReturnType<HooksBridge['preview']>>;
      try {
        preview = await bridge.preview(action);
      } catch (error) {
        message = `Falha na prévia: ${(error as Error).message}`;
        showStatus(status);
        return;
      }
      if (!preview.changed) {
        message = 'Nada a alterar.';
        showStatus(status);
        return;
      }
      const diff = el('div', {}, 'hooks-diff');
      diff.className = 'ao-hooks-diff';
      for (const line of preview.diff.split('\n')) {
        const { kind, text } = classifyDiffLine(line);
        const row = el('div', { textContent: text });
        row.className = `ao-diff-${kind}`;
        diff.append(row);
      }
      const confirm = el(
        'button',
        { textContent: action === 'install' ? 'Confirmar instalação' : 'Confirmar remoção' },
        'hooks-confirm',
      );
      const cancel = el('button', { textContent: 'Cancelar' }, 'hooks-cancel');
      const actions = el('div', { className: 'ao-hooks-actions' });
      actions.append(confirm, cancel);
      cancel.onclick = () => showStatus(status);
      confirm.onclick = async () => {
        try {
          const result = await (action === 'install' ? bridge.install() : bridge.uninstall());
          message =
            action === 'install'
              ? 'Hooks instalados. Reinicie as sessões do Claude Code já abertas.'
              : result.deleted
                ? 'Hooks removidos (o settings.json criado por nós foi apagado).'
                : 'Hooks removidos.';
          showStatus(result.status);
        } catch (error) {
          message = `Falha: ${(error as Error).message}`;
          await render();
        }
      };
      box.replaceChildren(
        el('h2', {
          textContent: action === 'install' ? 'Prévia da instalação' : 'Prévia da remoção',
        }),
        el('div', { textContent: preview.path, className: 'ao-hooks-path' }),
        diff,
        actions,
      );
    };

    await render();
  }

  const button = el('button', { textContent: 'Hooks' }, 'hooks-open');
  button.className = 'ao-hooks-btn';
  button.onclick = () => void openPanel();
  getCornerBar(gameParent).append(button);

  void bridge
    .status()
    .then((status) => {
      if (!shouldPromptInstall(status, readDismissed())) return;
      const note = el('div', {}, 'hooks-banner');
      note.className = 'ao-hooks-banner';
      const open = el('button', { textContent: 'Instalar hooks' }, 'hooks-banner-open');
      const dismiss = el('button', { textContent: 'Agora não' }, 'hooks-banner-dismiss');
      open.onclick = () => {
        writeDismissed();
        void openPanel();
      };
      dismiss.onclick = () => {
        writeDismissed();
        closeBanner();
      };
      note.append(
        el('span', {
          textContent:
            'Os hooks do Claude Code não estão instalados: o escritório não verá suas sessões.',
        }),
        open,
        dismiss,
      );
      gameParent.append(note);
      banner = note;
    })
    .catch(() => {
      // Status unavailable: the Hooks button still works and shows the error.
    });
}
