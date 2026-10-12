import type {
  BrowserBounds,
  BrowserBridge,
  BrowserPickEvent,
  BrowserResult,
  BrowserState,
} from '@agents-office/shared';
import { t } from '../i18n/i18n';
import { formatPickContext, type PickTarget, sendPickContext } from './browserPickLogic';

// The body of the "Navegador" dock tab: a toolbar (back, forward, reload, address, clear data) and
// an empty stage. The page itself is a native view of the desktop shell, placed over the stage.

export const BROWSER_CSS = `
#ao-terminal .ao-browser{position:absolute;inset:0;display:flex;flex-direction:column;background:#0d1020}
#ao-terminal .ao-browser[hidden]{display:none}
#ao-terminal .ao-browser-bar{flex:none;display:flex;align-items:center;gap:4px;padding:4px 6px;
  background:#1b1d2a;border-bottom:1px solid #2a2d44}
#ao-terminal .ao-browser-bar button{font:12px monospace;background:#0d1020;color:#f0e6b8;
  border:1px solid #3a3f5c;cursor:pointer;padding:2px 8px}
#ao-terminal .ao-browser-bar button:disabled{opacity:.4;cursor:default}
#ao-terminal .ao-browser-bar button:not(:disabled):hover{color:#f0c040;border-color:#f0c040}
#ao-terminal .ao-browser-address{flex:1;min-width:0;font:12px monospace;background:#0d1020;color:#f0e6b8;
  border:1px solid #3a3f5c;padding:3px 6px}
#ao-terminal .ao-browser-agent{font:11px monospace;color:#f0c040;white-space:nowrap}
#ao-terminal .ao-browser-bar button[aria-pressed=true]{color:#101010;background:#f0c040;border-color:#f0c040}
#ao-terminal .ao-browser-address:focus{outline:0;border-color:#f0c040}
#ao-terminal .ao-browser-status{flex:none;padding:0 8px;color:#ff7b7b;font:11px monospace}
#ao-terminal .ao-browser-status:empty{display:none}
#ao-terminal .ao-browser-pick{position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;
  gap:6px;padding:10px;background:#0d1020;box-sizing:border-box;font:12px monospace;color:#f0e6b8}
#ao-terminal .ao-browser-pick[hidden]{display:none}
#ao-terminal .ao-browser-pick textarea{flex:1;min-height:0;resize:none;font:12px monospace;
  background:#12131c;color:#f0e6b8;border:2px solid #4a4f78;padding:6px}
#ao-terminal .ao-browser-pick select{font:12px monospace;background:#0d1020;color:#f0e6b8;
  border:1px solid #3a3f5c;padding:2px}
#ao-terminal .ao-browser-pick .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
#ao-terminal .ao-browser-pick button{font:12px monospace;background:#2a2d44;color:#f0e6b8;
  border:2px solid #f0c040;padding:3px 10px;cursor:pointer}
#ao-terminal .ao-browser-pick button:disabled{opacity:.45;cursor:default}
#ao-terminal .ao-browser-stage{flex:1;min-height:0;background:#0d1020}
`;

export interface BrowserPaneOptions {
  /** The address field gained / lost the keyboard (the office must not read keys meanwhile). */
  onFocusChange(focused: boolean): void;
  /** Agents (terminals of the user) that can receive a picked element. */
  pickTargets?(): PickTarget[];
  /** Writes bytes to a terminal (the PTY bridge). */
  writeTerminal?(id: string, data: string): Promise<void>;
  /** The element review dialog opened / closed: it hides the native page view meanwhile. */
  onPickReview?(open: boolean): void;
  /** The context was sent to this terminal. */
  onPickSent?(id: string): void;
}

export interface BrowserPane {
  readonly host: HTMLElement;
  /** Where the page goes, in window CSS pixels. */
  stageBounds(): BrowserBounds;
  /** The stage changed size (observer). Returns the unsubscribe. */
  onStageResize(listener: () => void): () => void;
  update(state: BrowserState): void;
  /** Outcome of the element picker (any workspace; other workspaces are ignored). */
  handlePick(event: BrowserPickEvent): void;
  destroy(): void;
}

function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  testId: string,
  text?: string,
  className?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.setAttribute('data-testid', testId);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export function createBrowserPane(
  bridge: BrowserBridge,
  cwd: string,
  options: BrowserPaneOptions,
): BrowserPane {
  const host = node('div', 'browser-pane', undefined, 'ao-browser');
  host.hidden = true;
  const bar = node('div', 'browser-bar', undefined, 'ao-browser-bar');
  const back = node('button', 'browser-back', '◂');
  const forward = node('button', 'browser-forward', '▸');
  const reload = node('button', 'browser-reload', '↻');
  const address = node('input', 'browser-address', undefined, 'ao-browser-address');
  const pick = node('button', 'browser-pick', t('browser.pick'));
  const pause = node('button', 'browser-pause', t('browser.pause'));
  const clear = node('button', 'browser-clear', t('browser.clear'));
  const status = node('span', 'browser-status', undefined, 'ao-browser-status');
  const agentBadge = node('span', 'browser-agent', undefined, 'ao-browser-agent');
  agentBadge.hidden = true;
  const stage = node('div', 'browser-stage', undefined, 'ao-browser-stage');
  back.title = t('browser.back');
  forward.title = t('browser.forward');
  reload.title = t('browser.reload');
  pick.title = t('browser.pick.title');
  pick.setAttribute('aria-pressed', 'false');
  pause.title = t('browser.pause.title');
  pause.setAttribute('aria-pressed', 'false');
  clear.title = t('browser.clear.title');
  back.disabled = true;
  forward.disabled = true;
  address.type = 'text';
  address.spellcheck = false;
  address.placeholder = t('browser.address.placeholder');
  address.setAttribute('aria-label', t('browser.address.label'));
  bar.append(back, forward, reload, address, agentBadge, status, pick, pause, clear);
  const review = node('div', 'browser-pick-review', undefined, 'ao-browser-pick');
  review.hidden = true;
  host.append(bar, stage, review);

  let paused = false;
  const apply = (result: BrowserResult): void => {
    if (result.ok) {
      status.textContent = '';
      update(result.state);
    } else status.textContent = result.message;
  };
  const run = (call: Promise<BrowserResult>): void => {
    void call.then(apply, () => {
      status.textContent = t('browser.noResponse');
    });
  };

  function update(state: BrowserState): void {
    if (state.cwd !== cwd) return;
    back.disabled = !state.canGoBack;
    forward.disabled = !state.canGoForward;
    reload.textContent = state.loading ? '✕' : '↻';
    reload.title = state.loading ? t('browser.stop') : t('browser.reload');
    host.dataset.loading = String(state.loading);
    paused = state.paused === true;
    pause.textContent = paused ? t('browser.resume') : t('browser.pause');
    pause.setAttribute('aria-pressed', String(paused));
    host.dataset.paused = String(paused);
    agentBadge.hidden = !state.agent;
    agentBadge.textContent = state.agent
      ? state.queued
        ? t('browser.agentUsing.queued', { agent: state.agent, n: state.queued })
        : t('browser.agentUsing', { agent: state.agent })
      : '';
    if (document.activeElement !== address) {
      address.value = state.url === 'about:blank' ? '' : state.url;
    }
  }

  let picking = false;
  const setPicking = (on: boolean): void => {
    picking = on;
    pick.setAttribute('aria-pressed', String(on));
    pick.textContent = on ? t('browser.pick.cancel') : t('browser.pick');
  };
  const closeReview = (): void => {
    review.hidden = true;
    review.replaceChildren();
    options.onFocusChange(false);
    options.onPickReview?.(false);
  };
  const openReview = (event: Extract<BrowserPickEvent, { status: 'picked' }>): void => {
    const targets = options.pickTargets?.() ?? [];
    const title = node('div', 'browser-pick-title', t('browser.pick.review'));
    const text = node('textarea', 'browser-pick-text');
    text.value = formatPickContext(event.pick);
    text.spellcheck = false;
    const select = node('select', 'browser-pick-target');
    for (const target of targets) {
      const option = document.createElement('option');
      option.value = target.id;
      option.textContent = target.label;
      select.append(option);
    }
    const note = node(
      'span',
      'browser-pick-note',
      targets.length === 0 ? t('browser.pick.noAgents') : t('browser.pick.pasteNote'),
    );
    const send = node('button', 'browser-pick-send', t('browser.pick.send'));
    send.disabled = targets.length === 0;
    const cancel = node('button', 'browser-pick-cancel', t('browser.pick.discard'));
    const row = node('div', 'browser-pick-row', undefined, 'row');
    row.append(select, send, cancel, note);
    review.replaceChildren(title, text, row);
    for (const field of [text, select]) {
      field.addEventListener('keydown', (e) => e.stopPropagation());
      field.addEventListener('keyup', (e) => e.stopPropagation());
      field.addEventListener('focus', () => options.onFocusChange(true));
      field.addEventListener('blur', () => options.onFocusChange(false));
    }
    cancel.addEventListener('click', closeReview);
    send.addEventListener('click', () => {
      const target = select.value;
      const write = options.writeTerminal;
      if (!write || !target) return;
      send.disabled = true;
      sendPickContext(write, target, text.value).then(
        () => {
          closeReview();
          options.onPickSent?.(target);
        },
        () => {
          send.disabled = false;
          note.textContent = t('browser.pick.sendFailed');
        },
      );
    });
    review.hidden = false;
    options.onPickReview?.(true);
    text.focus();
  };
  const handlePick = (event: BrowserPickEvent): void => {
    if (event.cwd !== cwd) return;
    if (event.status === 'picked') {
      setPicking(false);
      openReview(event);
    } else if (event.status === 'cancelled') setPicking(false);
    else {
      setPicking(false);
      status.textContent = event.message;
    }
  };
  pick.addEventListener('click', () => {
    if (picking) {
      setPicking(false);
      run(bridge.cancelPick(cwd));
      return;
    }
    status.textContent = '';
    void bridge.startPick(cwd).then(
      (result) => {
        if (result.ok) setPicking(true);
        else status.textContent = result.message;
      },
      () => {
        status.textContent = t('browser.noResponse');
      },
    );
  });
  back.addEventListener('click', () => run(bridge.back(cwd)));
  forward.addEventListener('click', () => run(bridge.forward(cwd)));
  reload.addEventListener('click', () => run(bridge.reload(cwd)));
  pause.addEventListener('click', () => run(bridge.setPaused(cwd, !paused)));
  clear.addEventListener('click', () => {
    if (!window.confirm(t('browser.clear.confirm'))) return;
    run(bridge.clearData(cwd));
  });
  address.addEventListener('keydown', (event) => {
    // The office (and the panel shortcuts) must not see what is typed here.
    event.stopPropagation();
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const text = address.value.trim();
    if (text) run(bridge.navigate(cwd, text));
  });
  address.addEventListener('focus', () => {
    address.select();
    options.onFocusChange(true);
  });
  address.addEventListener('blur', () => options.onFocusChange(false));

  return {
    host,
    stageBounds() {
      const rect = stage.getBoundingClientRect();
      return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
    },
    onStageResize(listener) {
      if (typeof ResizeObserver === 'undefined') return () => {};
      const observer = new ResizeObserver(() => listener());
      observer.observe(stage);
      return () => observer.disconnect();
    },
    update,
    handlePick,
    destroy() {
      if (!review.hidden) options.onPickReview?.(false);
      host.remove();
    },
  };
}
