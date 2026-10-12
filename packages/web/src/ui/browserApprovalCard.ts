import type { BrowserApprovalBridge, BrowserApprovalRequest } from '@agents-office/shared';
import { t } from '../i18n/i18n';
import { approvalHeading, approvalHintKey, dequeue } from './browserApprovalLogic';

const CSS = `
.ao-bro-card{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:40;
  font:13px monospace;background:#1b1d2a;color:#f0e6b8;border:2px solid #f0c040;padding:12px;
  width:min(520px,calc(100% - 16px));max-height:calc(100% - 16px);overflow:auto;
  box-sizing:border-box;display:flex;flex-direction:column;gap:8px;box-shadow:0 6px 0 #000a}
.ao-bro-card[hidden]{display:none}
.ao-bro-card h3{margin:0;font-size:14px}
.ao-bro-card pre{margin:0;white-space:pre-wrap;word-break:break-all;background:#12131c;
  border:2px solid #4a4f78;padding:6px;max-height:200px;overflow:auto;font:12px monospace}
.ao-bro-card .hint{opacity:.7;font-size:11px}
.ao-bro-card .row{display:flex;gap:8px}
.ao-bro-card button{font:12px monospace;background:#2a2d44;color:#f0e6b8;border:2px solid #f0c040;
  padding:4px 10px;cursor:pointer;box-shadow:0 3px 0 #000a}
.ao-bro-card button:disabled{opacity:.45;cursor:default}
.ao-bro-card button.deny{border-color:#e07070}
`;

/**
 * Mounts the confirmation card of the embedded browser (download, site permission, browser_eval)
 * inside `gameParent`: one card at a time, with "Allow" and "Deny". Returns the cleanup.
 */
export function mountBrowserApprovalCard(
  bridge: BrowserApprovalBridge,
  gameParent: HTMLElement,
): () => void {
  const style = Object.assign(document.createElement('style'), { textContent: CSS });
  document.head.append(style);
  const card = document.createElement('div');
  card.className = 'ao-bro-card';
  card.setAttribute('data-testid', 'browser-approval');
  card.hidden = true;
  const stopKeys = (event: KeyboardEvent): void => event.stopPropagation();
  card.addEventListener('keydown', stopKeys);
  card.addEventListener('keyup', stopKeys);
  gameParent.append(card);

  let queue: BrowserApprovalRequest[] = [];
  let shownId: string | null = null;
  let disposed = false;

  const field = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    testid: string,
    text?: string,
  ): HTMLElementTagNameMap[K] => {
    const node = document.createElement(tag);
    node.setAttribute('data-testid', testid);
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const render = (): void => {
    const request = queue[0];
    if (!request) {
      shownId = null;
      card.hidden = true;
      card.replaceChildren();
      return;
    }
    if (shownId === request.id) return;
    shownId = request.id;
    card.hidden = false;
    card.dataset.kind = request.kind;
    const title = field('h3', 'browser-approval-title', approvalHeading(request, queue.length));
    const detail = field('pre', 'browser-approval-detail', request.detail);
    const hint = field('div', 'browser-approval-hint', t(approvalHintKey(request.kind)));
    hint.className = 'hint';
    const allow = field('button', 'browser-allow', t('approval.allow'));
    const deny = field('button', 'browser-deny', t('approval.deny'));
    deny.className = 'deny';
    const buttons = document.createElement('div');
    buttons.className = 'row';
    buttons.append(allow, deny);
    const answer = (value: boolean): void => {
      allow.disabled = true;
      deny.disabled = true;
      bridge
        .respond({ id: request.id, allow: value })
        .catch(() => false)
        .then(() => {
          if (disposed) return;
          queue = dequeue(queue, request.id);
          render();
        });
    };
    allow.onclick = () => answer(true);
    deny.onclick = () => answer(false);
    card.replaceChildren(title, detail, hint, buttons);
  };

  const add = (request: BrowserApprovalRequest): void => {
    if (disposed || queue.some((r) => r.id === request.id)) return;
    queue = [...queue, request];
    render();
  };
  const unsubscribeRequest = bridge.onRequest(add);
  const unsubscribeResolved = bridge.onResolved((id) => {
    if (disposed) return;
    queue = dequeue(queue, id);
    if (shownId === id) shownId = null;
    render();
  });
  void bridge
    .pending()
    .then((requests) => {
      for (const request of requests) add(request);
    })
    .catch(() => {});

  return () => {
    disposed = true;
    unsubscribeRequest();
    unsubscribeResolved();
    card.remove();
    style.remove();
  };
}
