import type {
  AgentsOfficeDesktop,
  ExternalBridge,
  OpenInVSCodeResult,
} from '@agents-office/shared';
import { t } from '../i18n/i18n';
// "Open in VS Code": the bridge lookup, the user-facing message of each failure and the toast
// shown in the DOM (the game, the project picker and the terminal bar share them). Spec 024.

/** The external-apps bridge of the desktop shell; undefined in a plain browser (no buttons). */
export function externalBridgeOf(win: object): ExternalBridge | undefined {
  const desktop = (win as { agentsOfficeDesktop?: unknown }).agentsOfficeDesktop as
    | Partial<AgentsOfficeDesktop>
    | undefined;
  if (desktop?.desktop !== true) return undefined;
  const external = desktop.external;
  return external && typeof external.openInVSCode === 'function' ? external : undefined;
}

/** Text of the toast for a failed attempt (the main process already words it for the user). */
export function openFailureMessage(result: Extract<OpenInVSCodeResult, { ok: false }>): string {
  switch (result.code) {
    case 'vscode-not-found':
      return result.message;
    case 'invalid-dir':
      return t('external.failedWith', { message: result.message });
    default:
      return result.message || t('external.failed');
  }
}

export interface VSCodeOpenOutcome {
  ok: boolean;
  message?: string;
}

/** Calls the bridge and never throws: a failure becomes a message. */
export async function openInVSCode(
  bridge: ExternalBridge,
  dir: string,
): Promise<VSCodeOpenOutcome> {
  try {
    const result = await bridge.openInVSCode(dir);
    return result.ok ? { ok: true } : { ok: false, message: openFailureMessage(result) };
  } catch (error) {
    return {
      ok: false,
      message: t('external.failedWith', { message: (error as Error).message }),
    };
  }
}

const TOAST_CSS = `
.ao-toast{position:fixed;left:50%;bottom:48px;transform:translateX(-50%);z-index:60;max-width:min(560px,90vw);
  padding:8px 12px;font:13px monospace;background:#3a2a2a;color:#f0e6b8;border:2px solid #ff7b7b;
  box-shadow:0 2px 10px rgba(0,0,0,.5)}
`;

/** A transient message at the bottom of the window (role=alert). Returns the element. */
export function showToast(message: string, ms = 7000): HTMLElement {
  if (!document.getElementById('ao-toast-style')) {
    const style = Object.assign(document.createElement('style'), { textContent: TOAST_CSS });
    style.id = 'ao-toast-style';
    document.head.append(style);
  }
  for (const old of document.querySelectorAll('[data-testid="toast"]')) old.remove();
  const node = document.createElement('div');
  node.className = 'ao-toast';
  node.setAttribute('role', 'alert');
  node.setAttribute('data-testid', 'toast');
  node.textContent = message;
  node.addEventListener('click', () => node.remove());
  document.body.append(node);
  setTimeout(() => node.remove(), ms);
  return node;
}

/** Opens `dir` in VS Code and toasts the failure, if any. */
export async function openInVSCodeWithToast(bridge: ExternalBridge, dir: string): Promise<void> {
  const outcome = await openInVSCode(bridge, dir);
  if (!outcome.ok && outcome.message) showToast(outcome.message);
}
