import { randomBytes } from 'node:crypto';
import type { BrowserPick, BrowserPickEvent } from '@agents-office/shared';
import { BROWSER_SCREENSHOT_MAX_BYTES } from './browserDriver';
import type { BrowserHost } from './browserHost';

// "Selecionar elemento" (spec 084): the user points at an element of the workspace page and the
// shell collects selector, text, HTML (cut) and a capture. Everything from the page is untrusted
// data; the window shows it for review before anything reaches an agent's terminal.

export const PICK_TEXT_MAX = 2000;
export const PICK_HTML_MAX = 4000;
export const PICK_SELECTOR_MAX = 500;
export const PICK_CAPTURE_MAX_SIDE = 1600;
export const PICK_TIMEOUT_MS = 5 * 60_000;
/** CDP binding the injected script calls; payloads must carry the nonce of the running pick. */
export const PICK_BINDING = '__agentsOfficePick';

/** Removes control characters (terminal escapes included) but keeps line breaks and tabs. */
export function stripControl(text: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: that is exactly what is removed
  return text.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '');
}

function cut(value: unknown, max: number): { text: string; truncated: boolean } {
  const text = stripControl(typeof value === 'string' ? value : '');
  return text.length > max
    ? { text: text.slice(0, max), truncated: true }
    : { text, truncated: false };
}

export interface PickRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Validates what the page script sent and applies the size limits. Null when it is not a pick. */
export function normalizePick(
  raw: unknown,
): (Omit<BrowserPick, 'cwd' | 'url' | 'title'> & { rect?: PickRect }) | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const data = raw as Record<string, unknown>;
  const selector = cut(data.selector, PICK_SELECTOR_MAX).text;
  const tag = cut(data.tag, 40).text.toLowerCase();
  if (selector === '' && tag === '') return null;
  const text = cut(data.text, PICK_TEXT_MAX);
  const html = cut(data.html, PICK_HTML_MAX);
  const r = data.rect as Record<string, unknown> | undefined;
  const nums = r ? [r.x, r.y, r.width, r.height].map(Number) : [];
  const rect =
    nums.length === 4 && nums.every((n) => Number.isFinite(n))
      ? {
          x: nums[0] as number,
          y: nums[1] as number,
          width: nums[2] as number,
          height: nums[3] as number,
        }
      : undefined;
  return {
    selector,
    tag,
    text: text.text,
    html: html.text,
    textTruncated: text.truncated,
    htmlTruncated: html.truncated,
    ...(rect ? { rect } : {}),
  };
}

/** Script injected into the page: highlight under the mouse, click picks, Escape cancels. */
export function pickerScript(nonce: string): string {
  return `(() => {
  if (window.__aoPickerStop) window.__aoPickerStop();
  const NONCE = ${JSON.stringify(nonce)};
  const call = window[${JSON.stringify(PICK_BINDING)}];
  if (typeof call !== 'function') return false;
  const TEXT_MAX = ${PICK_TEXT_MAX + 1};
  const HTML_MAX = ${PICK_HTML_MAX + 1};
  const box = document.createElement('div');
  box.setAttribute('data-agents-office-picker', '');
  box.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;box-sizing:border-box;' +
    'border:2px solid #f0c040;background:rgba(240,192,64,.18);left:0;top:0;width:0;height:0;display:none';
  const tag = document.createElement('div');
  tag.style.cssText = 'position:absolute;left:-2px;top:-20px;font:11px monospace;background:#f0c040;color:#101010;padding:1px 4px;white-space:nowrap';
  box.appendChild(tag);
  document.documentElement.appendChild(box);
  const prevCursor = document.documentElement.style.cursor;
  document.documentElement.style.cursor = 'crosshair';
  let current = null;
  const esc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : s);
  const selectorOf = (el) => {
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && cur !== document.documentElement && parts.length < 8) {
      if (cur.id && document.querySelectorAll('#' + esc(cur.id)).length === 1) {
        parts.unshift('#' + esc(cur.id));
        break;
      }
      let part = cur.localName + [...cur.classList].slice(0, 2).map((c) => '.' + esc(c)).join('');
      const parent = cur.parentElement;
      if (parent) {
        const same = [...parent.children].filter((c) => c.localName === cur.localName);
        if (same.length > 1) part += ':nth-of-type(' + (same.indexOf(cur) + 1) + ')';
      }
      parts.unshift(part);
      cur = parent;
    }
    return parts.join(' > ');
  };
  const htmlOf = (el) => {
    const clone = el.cloneNode(true);
    if (clone.querySelectorAll) {
      clone.querySelectorAll('script').forEach((n) => n.remove());
      clone.querySelectorAll('input[type=password]').forEach((n) => n.removeAttribute('value'));
    }
    if (clone.localName === 'input' && clone.type === 'password') clone.removeAttribute('value');
    return clone.outerHTML || '';
  };
  const stop = () => {
    document.removeEventListener('mousemove', onMove, true);
    for (const type of ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'auxclick', 'dblclick', 'contextmenu', 'submit']) {
      document.removeEventListener(type, block, true);
    }
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKey, true);
    document.documentElement.style.cursor = prevCursor;
    box.remove();
    delete window.__aoPickerStop;
  };
  const send = (payload) => { try { call(JSON.stringify(Object.assign({ nonce: NONCE }, payload))); } catch (e) {} };
  const onMove = (event) => {
    if (!event.isTrusted) return;
    const el = document.elementFromPoint(event.clientX, event.clientY);
    if (!el || el === box || el === document.documentElement) { box.style.display = 'none'; current = null; return; }
    current = el;
    const r = el.getBoundingClientRect();
    box.style.display = 'block';
    box.style.left = r.left + 'px'; box.style.top = r.top + 'px';
    box.style.width = r.width + 'px'; box.style.height = r.height + 'px';
    tag.textContent = el.localName + (el.id ? '#' + el.id : '');
  };
  const block = (event) => {
    if (!event.isTrusted) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const onClick = (event) => {
    if (!event.isTrusted) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const el = current || document.elementFromPoint(event.clientX, event.clientY);
    if (!el || el === document.documentElement) return;
    const r = el.getBoundingClientRect();
    const data = {
      selector: selectorOf(el),
      tag: el.localName,
      text: String(el.innerText || el.textContent || '').trim().slice(0, TEXT_MAX),
      html: htmlOf(el).slice(0, HTML_MAX),
      rect: { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height },
    };
    stop();
    send({ type: 'pick', data });
  };
  const onKey = (event) => {
    if (!event.isTrusted || event.key !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    stop();
    send({ type: 'cancel' });
  };
  window.__aoPickerStop = stop;
  document.addEventListener('mousemove', onMove, true);
  for (const type of ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'auxclick', 'dblclick', 'contextmenu', 'submit']) {
    document.addEventListener(type, block, true);
  }
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKey, true);
  return true;
})()`;
}

export interface BrowserPickerDeps {
  host: Pick<BrowserHost, 'get' | 'state'>;
  /** Delivers the outcome to the window. */
  push(event: BrowserPickEvent): void;
  /** Saves the PNG (base64) of the element in a temporary file; returns its path. */
  saveScreenshot(base64: string): Promise<string | undefined>;
  newNonce?(): string;
  timeoutMs?: number;
}

interface Active {
  nonce: string;
  off: () => void;
  timer: ReturnType<typeof setTimeout>;
}

/** Runs the element picker on workspace browsers (at most one pick per workspace). */
export class BrowserPicker {
  private readonly active = new Map<string, Active>();

  constructor(private readonly deps: BrowserPickerDeps) {}

  isActive(cwd: string): boolean {
    return this.active.has(cwd);
  }

  async start(cwd: string): Promise<void> {
    await this.finish(cwd, true);
    const cdp = this.deps.host.get(cwd).cdp;
    if (!cdp?.onEvent) throw new Error('This browser cannot be driven.');
    const nonce = (this.deps.newNonce ?? (() => randomBytes(16).toString('hex')))();
    const off = cdp.onEvent((method, params) => {
      if (method !== 'Runtime.bindingCalled' || params.name !== PICK_BINDING) return;
      void this.onBinding(cwd, nonce, params.payload);
    });
    try {
      await cdp.send('Runtime.addBinding', { name: PICK_BINDING });
      const response = (await cdp.send('Runtime.evaluate', {
        expression: pickerScript(nonce),
        returnByValue: true,
      })) as { exceptionDetails?: unknown; result?: { value?: unknown } };
      if (response?.exceptionDetails || response?.result?.value === false) {
        throw new Error('The picker could not start on this page.');
      }
    } catch (error) {
      off();
      throw error;
    }
    const timer = setTimeout(
      () => void this.finish(cwd, true),
      this.deps.timeoutMs ?? PICK_TIMEOUT_MS,
    );
    timer.unref?.();
    this.active.set(cwd, { nonce, off, timer });
  }

  async cancel(cwd: string): Promise<void> {
    await this.finish(cwd, true);
  }

  /** Ends the pick; `notify` tells the window it was cancelled. */
  private async finish(cwd: string, notify: boolean): Promise<void> {
    const active = this.active.get(cwd);
    if (!active) return;
    this.active.delete(cwd);
    clearTimeout(active.timer);
    active.off();
    try {
      await this.deps.host.get(cwd).cdp?.send('Runtime.evaluate', {
        expression: 'window.__aoPickerStop && window.__aoPickerStop()',
      });
    } catch {
      // The page is gone or the view closed: nothing left to clean.
    }
    if (notify) this.deps.push({ status: 'cancelled', cwd });
  }

  private async onBinding(cwd: string, nonce: string, payload: unknown): Promise<void> {
    const active = this.active.get(cwd);
    if (!active || active.nonce !== nonce || typeof payload !== 'string') return;
    let message: { nonce?: unknown; type?: unknown; data?: unknown };
    try {
      message = JSON.parse(payload);
    } catch {
      return;
    }
    // Only the script we injected knows the nonce; anything else on the page is ignored.
    if (message.nonce !== nonce) return;
    if (message.type === 'cancel') {
      await this.finish(cwd, true);
      return;
    }
    if (message.type !== 'pick') return;
    const found = normalizePick(message.data);
    await this.finish(cwd, false);
    if (!found) {
      this.deps.push({ status: 'error', cwd, message: 'Não foi possível ler o elemento.' });
      return;
    }
    const { rect, ...rest } = found;
    const state = this.deps.host.state(cwd);
    const screenshotPath = rect ? await this.capture(cwd, rect) : undefined;
    this.deps.push({
      status: 'picked',
      cwd,
      pick: {
        cwd,
        url: stripControl(state.url).slice(0, 2000),
        title: stripControl(state.title).slice(0, 300),
        ...rest,
        ...(screenshotPath ? { screenshotPath } : {}),
      },
    });
  }

  private async capture(cwd: string, rect: PickRect): Promise<string | undefined> {
    const width = Math.min(Math.ceil(rect.width), PICK_CAPTURE_MAX_SIDE);
    const height = Math.min(Math.ceil(rect.height), PICK_CAPTURE_MAX_SIDE);
    if (width < 1 || height < 1) return undefined;
    try {
      const response = (await this.deps.host.get(cwd).cdp?.send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true,
        clip: { x: Math.max(0, rect.x), y: Math.max(0, rect.y), width, height, scale: 1 },
      })) as { data?: unknown } | undefined;
      const data = typeof response?.data === 'string' ? response.data : '';
      if (data === '' || data.length * 0.75 > BROWSER_SCREENSHOT_MAX_BYTES) return undefined;
      return await this.deps.saveScreenshot(data);
    } catch {
      return undefined;
    }
  }
}
