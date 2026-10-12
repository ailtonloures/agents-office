import type {
  LostTerminalSession,
  TerminalBridge,
  TerminalStartOptions,
} from '@agents-office/shared';
import { t } from '../i18n/i18n';
import { showToast } from './externalOpen';

// Sessions whose tab existed when the app died (crash, kill, shutdown): offered for resuming
// (spec 025). The shell keeps the record; this module only shows it.

/** `--resume <id>` when the office had bound the Claude session, otherwise `--continue`. */
export function resumeOptions(lost: LostTerminalSession): TerminalStartOptions {
  return {
    cwd: lost.cwd,
    ...(lost.permissionMode ? { permissionMode: lost.permissionMode } : {}),
    ...(lost.claudeSessionId ? { resume: lost.claudeSessionId } : { continueLast: true }),
  };
}

export function lostLabel(lost: LostTerminalSession): string {
  const name = lost.cwd.split(/[\\/]/).filter(Boolean).pop() ?? lost.cwd;
  return `${name} - ${lost.claudeSessionId ? t('lost.resumesSession') : t('lost.resumesLast')}`;
}

const CSS = `
#ao-lost{position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:55;max-width:min(640px,92vw);
  background:#1b1d2a;color:#f0e6b8;border:2px solid #f0c040;font:13px monospace;padding:8px 10px;
  box-shadow:0 2px 10px rgba(0,0,0,.5)}
#ao-lost[hidden]{display:none}
#ao-lost .ao-lost-title{margin-bottom:6px}
#ao-lost .ao-lost-row{display:flex;gap:8px;align-items:center;margin:4px 0}
#ao-lost .ao-lost-row span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#ao-lost button{font:12px monospace;color:#f0e6b8;background:#2b2f45;border:1px solid #f0c040;padding:3px 8px;cursor:pointer}
`;

export interface LostSessionsView {
  refresh(): Promise<void>;
}

/** Mounts the "resume" bar; it stays hidden while there is nothing to recover. */
export function mountLostSessions(bridge: TerminalBridge): LostSessionsView {
  const style = Object.assign(document.createElement('style'), { textContent: CSS });
  document.head.append(style);
  const root = document.createElement('div');
  root.id = 'ao-lost';
  root.setAttribute('data-testid', 'lost-sessions');
  root.setAttribute('role', 'alert');
  root.hidden = true;
  document.body.append(root);

  const render = (list: LostTerminalSession[]): void => {
    root.replaceChildren();
    root.hidden = list.length === 0;
    if (list.length === 0) return;
    const title = document.createElement('div');
    title.className = 'ao-lost-title';
    title.textContent =
      list.length === 1 ? t('lost.title.one') : t('lost.title.other', { n: list.length });
    root.append(title);
    for (const lost of list) {
      const row = document.createElement('div');
      row.className = 'ao-lost-row';
      row.setAttribute('data-testid', 'lost-row');
      const label = document.createElement('span');
      label.textContent = lostLabel(lost);
      label.title = lost.cwd;
      const resume = button(t('lost.resume'), 'lost-resume', async () => {
        const result = await bridge.start(resumeOptions(lost));
        if (!result.ok) {
          showToast(t('lost.resumeFailed', { message: result.message }));
          return;
        }
        await bridge.dismissLost(lost.id);
        await refresh();
      });
      const dismiss = button(t('lost.dismiss'), 'lost-dismiss', async () => {
        await bridge.dismissLost(lost.id);
        await refresh();
      });
      row.append(label, resume, dismiss);
      root.append(row);
    }
  };

  const refresh = async (): Promise<void> => {
    try {
      render(await bridge.lostSessions());
    } catch {
      render([]);
    }
  };
  void refresh();
  return { refresh };
}

function button(text: string, testId: string, onClick: () => Promise<void>): HTMLButtonElement {
  const node = document.createElement('button');
  node.type = 'button';
  node.textContent = text;
  node.setAttribute('data-testid', testId);
  node.addEventListener('click', () => void onClick());
  return node;
}
