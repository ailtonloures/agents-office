import type { BrowserState } from '@agents-office/shared';
import { BrowserAddressError, type BrowserHost, type CdpTransport } from './browserHost';
import { type AxNode, buildSnapshot } from './browserSnapshot';

export type BrowserErrorCode =
  | 'invalid-address'
  | 'unsupported'
  | 'element-not-found'
  | 'timeout'
  | 'eval-failed'
  | 'invalid-input'
  | 'cdp-error';

/** Failure of a browser action, with a stable code agents can act on. */
export class BrowserToolError extends Error {
  constructor(
    readonly code: BrowserErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export const BROWSER_EVAL_MAX_CHARS = 20_000;
export const BROWSER_DEFAULT_TIMEOUT_MS = 10_000;
export const BROWSER_MAX_TIMEOUT_MS = 60_000;
const POLL_MS = 100;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface KeyInfo {
  key: string;
  code: string;
  vk: number;
  text?: string;
}

const NAMED_KEYS: Record<string, KeyInfo> = {
  enter: { key: 'Enter', code: 'Enter', vk: 13, text: '\r' },
  tab: { key: 'Tab', code: 'Tab', vk: 9 },
  escape: { key: 'Escape', code: 'Escape', vk: 27 },
  esc: { key: 'Escape', code: 'Escape', vk: 27 },
  backspace: { key: 'Backspace', code: 'Backspace', vk: 8 },
  delete: { key: 'Delete', code: 'Delete', vk: 46 },
  space: { key: ' ', code: 'Space', vk: 32, text: ' ' },
  arrowup: { key: 'ArrowUp', code: 'ArrowUp', vk: 38 },
  arrowdown: { key: 'ArrowDown', code: 'ArrowDown', vk: 40 },
  arrowleft: { key: 'ArrowLeft', code: 'ArrowLeft', vk: 37 },
  arrowright: { key: 'ArrowRight', code: 'ArrowRight', vk: 39 },
  home: { key: 'Home', code: 'Home', vk: 36 },
  end: { key: 'End', code: 'End', vk: 35 },
  pageup: { key: 'PageUp', code: 'PageUp', vk: 33 },
  pagedown: { key: 'PageDown', code: 'PageDown', vk: 34 },
};

const MODIFIER_BITS: Record<string, number> = { alt: 1, control: 2, ctrl: 2, meta: 4, shift: 8 };

/** Parses "Enter", "a", "Control+a", "Shift+Tab" into a CDP key description. */
export function parseKey(spec: string): KeyInfo & { modifiers: number } {
  const parts = spec.split('+').map((part) => part.trim());
  const last = parts.pop();
  if (!last) throw new BrowserToolError('invalid-input', 'Empty key.');
  let modifiers = 0;
  for (const part of parts) {
    const bit = MODIFIER_BITS[part.toLowerCase()];
    if (!bit) throw new BrowserToolError('invalid-input', `Unknown modifier "${part}".`);
    modifiers |= bit;
  }
  const named = NAMED_KEYS[last.toLowerCase()];
  if (named) return { ...named, modifiers };
  if ([...last].length === 1) {
    const upper = last.toUpperCase();
    const isLetter = /^[a-z]$/i.test(last);
    const isDigit = /^[0-9]$/.test(last);
    const code = isLetter ? `Key${upper}` : isDigit ? `Digit${last}` : '';
    const vk = isLetter || isDigit ? upper.charCodeAt(0) : last.charCodeAt(0);
    // Ctrl/Alt/Meta combos produce no text.
    const text = modifiers & (1 | 2 | 4) ? undefined : last;
    return { key: last, code, vk, text, modifiers };
  }
  throw new BrowserToolError('invalid-input', `Unknown key "${last}".`);
}

export interface ConsoleEntry {
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  text: string;
  /** Epoch milliseconds. */
  at: number;
  url?: string;
}

export const BROWSER_CONSOLE_MAX_ENTRIES = 200;
export const BROWSER_CONSOLE_ENTRY_MAX_CHARS = 1000;
export const BROWSER_SCREENSHOT_MAX_BYTES = 8 * 1024 * 1024;

const LEVELS: Record<string, ConsoleEntry['level']> = {
  log: 'log',
  info: 'info',
  warning: 'warn',
  warn: 'warn',
  error: 'error',
  assert: 'error',
  debug: 'debug',
  verbose: 'debug',
};

/** Turns a protocol event into a console entry; null for events that are not console output. */
export function consoleEntryFromEvent(
  method: string,
  params: Record<string, unknown>,
  now = Date.now(),
): ConsoleEntry | null {
  const cut = (text: string) => text.slice(0, BROWSER_CONSOLE_ENTRY_MAX_CHARS);
  if (method === 'Runtime.consoleAPICalled') {
    const args = Array.isArray(params.args) ? (params.args as Array<Record<string, unknown>>) : [];
    const text = args
      .map((arg) => {
        const v = arg.value ?? arg.description ?? arg.type;
        return typeof v === 'string' ? v : (JSON.stringify(v) ?? String(v));
      })
      .join(' ');
    return { level: LEVELS[String(params.type)] ?? 'log', text: cut(text), at: now };
  }
  if (method === 'Runtime.exceptionThrown') {
    const d = (params.exceptionDetails ?? {}) as {
      text?: string;
      url?: string;
      exception?: { description?: string };
    };
    return {
      level: 'error',
      text: cut(d.exception?.description ?? d.text ?? 'Uncaught exception'),
      at: now,
      ...(d.url ? { url: d.url } : {}),
    };
  }
  if (method === 'Log.entryAdded') {
    const e = (params.entry ?? {}) as { level?: string; text?: string; url?: string };
    return {
      level: LEVELS[String(e.level)] ?? 'log',
      text: cut(e.text ?? ''),
      at: now,
      ...(e.url ? { url: e.url } : {}),
    };
  }
  return null;
}

export interface PageSummary {
  url: string;
  title: string;
}

const summary = (state: BrowserState): PageSummary => ({ url: state.url, title: state.title });

export interface ClickTarget {
  selector?: string;
  /** Ref (`e3`) from the last `browser_snapshot` of the workspace. */
  ref?: string;
  x?: number;
  y?: number;
}

export interface WaitCondition {
  selector?: string;
  text?: string;
  /** Wait for the page to stop loading. */
  load?: boolean;
  timeoutMs?: number;
}

export interface BrowserDriverOptions {
  host: Pick<BrowserHost, 'get' | 'navigate' | 'state'>;
  timeoutMs?: number;
}

/**
 * Drives the workspace browser through the DevTools protocol of its `webContents`. Every method
 * throws `BrowserToolError`; callers serialize actions with `BrowserQueue`.
 */
export class BrowserDriver {
  private readonly timeoutMs: number;

  /** ref -> backend DOM node id, per workspace, replaced by every snapshot. */
  private readonly refs = new Map<string, Map<string, number>>();
  private readonly consoleLogs = new Map<string, ConsoleEntry[]>();
  private readonly consoleSubs = new Map<string, () => void>();

  constructor(private readonly options: BrowserDriverOptions) {
    this.timeoutMs = options.timeoutMs ?? BROWSER_DEFAULT_TIMEOUT_MS;
  }

  private cdp(cwd: string): CdpTransport {
    const cdp = this.options.host.get(cwd).cdp;
    if (!cdp) throw new BrowserToolError('unsupported', 'This browser cannot be driven.');
    this.collectConsole(cwd, cdp);
    return cdp;
  }

  private async send(
    cwd: string,
    method: string,
    params?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const cdp = this.cdp(cwd);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new BrowserToolError('timeout', `${method} timed out.`)),
        this.timeoutMs,
      );
    });
    try {
      const result = await Promise.race([cdp.send(method, params), timeout]);
      return (result ?? {}) as Record<string, unknown>;
    } catch (error) {
      if (error instanceof BrowserToolError) throw error;
      throw new BrowserToolError(
        'cdp-error',
        `${method} failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /** Runs `expression` in the page; returns its JSON value. */
  private async evaluate(cwd: string, expression: string, awaitPromise = false): Promise<unknown> {
    const response = await this.send(cwd, 'Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise,
      userGesture: true,
    });
    if (response.exceptionDetails) {
      throw new BrowserToolError('eval-failed', describeException(response.exceptionDetails));
    }
    const result = response.result as { value?: unknown } | undefined;
    return result?.value;
  }

  async navigate(cwd: string, address: string): Promise<PageSummary> {
    try {
      await this.options.host.navigate(cwd, address);
      await this.waitLoaded(cwd);
      return summary(this.options.host.state(cwd));
    } catch (error) {
      if (error instanceof BrowserAddressError) {
        throw new BrowserToolError('invalid-address', error.message);
      }
      throw error;
    }
  }

  private async waitLoaded(cwd: string, timeoutMs = this.timeoutMs): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (this.options.host.state(cwd).loading) {
      if (Date.now() >= deadline)
        throw new BrowserToolError('timeout', 'The page is still loading.');
      await sleep(POLL_MS);
    }
  }

  async click(cwd: string, target: ClickTarget): Promise<PageSummary & { clicked: string }> {
    let x = target.x;
    let y = target.y;
    let label = 'coordinates';
    if (target.ref !== undefined) {
      const found = (await this.callOnRef(
        cwd,
        target.ref,
        `function () {
          this.scrollIntoView({ block: 'center', inline: 'center' });
          const r = this.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
        }`,
      )) as { x: number; y: number; w: number; h: number } | undefined;
      if (!found || found.w === 0 || found.h === 0) {
        throw new BrowserToolError('element-not-found', `Ref "${target.ref}" is not visible.`);
      }
      x = found.x;
      y = found.y;
      label = `ref ${target.ref}`;
    } else if (target.selector !== undefined) {
      const found = (await this.evaluate(
        cwd,
        `(() => {
          const el = document.querySelector(${JSON.stringify(target.selector)});
          if (!el) return null;
          el.scrollIntoView({ block: 'center', inline: 'center' });
          const r = el.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
        })()`,
      ).catch((error) => {
        // An invalid selector throws inside the page.
        if (error instanceof BrowserToolError && error.code === 'eval-failed') {
          throw new BrowserToolError('invalid-input', `Invalid selector: ${error.message}`);
        }
        throw error;
      })) as { x: number; y: number; w: number; h: number } | null;
      if (!found) {
        throw new BrowserToolError('element-not-found', `No element matches "${target.selector}".`);
      }
      if (found.w === 0 || found.h === 0) {
        throw new BrowserToolError('element-not-found', `"${target.selector}" is not visible.`);
      }
      x = found.x;
      y = found.y;
      label = target.selector;
    }
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x + y)) {
      throw new BrowserToolError('invalid-input', 'Provide a selector or both x and y.');
    }
    const base = { x, y, button: 'left', clickCount: 1 };
    await this.send(cwd, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await this.send(cwd, 'Input.dispatchMouseEvent', { ...base, type: 'mousePressed' });
    await this.send(cwd, 'Input.dispatchMouseEvent', { ...base, type: 'mouseReleased' });
    return { ...summary(this.options.host.state(cwd)), clicked: label };
  }

  /** Types `text` into the focused element (or the one matching `selector`, focused first). */
  async type(
    cwd: string,
    input: { text: string; selector?: string; ref?: string; clear?: boolean },
  ): Promise<PageSummary> {
    if (input.ref !== undefined) {
      await this.callOnRef(
        cwd,
        input.ref,
        `function () {
          this.scrollIntoView({ block: 'center' });
          this.focus();
          if (${input.clear ? 'true' : 'false'}) {
            if (typeof this.select === 'function') this.select();
            else document.execCommand('selectAll');
            document.execCommand('delete');
          }
          return true;
        }`,
      );
    } else if (input.selector !== undefined) {
      const ok = await this.evaluate(
        cwd,
        `(() => {
          const el = document.querySelector(${JSON.stringify(input.selector)});
          if (!el) return false;
          el.scrollIntoView({ block: 'center' });
          el.focus();
          if (${input.clear ? 'true' : 'false'}) {
            if (typeof el.select === 'function') el.select();
            else document.execCommand('selectAll');
            document.execCommand('delete');
          }
          return true;
        })()`,
      ).catch((error) => {
        if (error instanceof BrowserToolError && error.code === 'eval-failed') {
          throw new BrowserToolError('invalid-input', `Invalid selector: ${error.message}`);
        }
        throw error;
      });
      if (!ok) {
        throw new BrowserToolError('element-not-found', `No element matches "${input.selector}".`);
      }
    }
    if (input.text !== '') await this.send(cwd, 'Input.insertText', { text: input.text });
    return summary(this.options.host.state(cwd));
  }

  async pressKey(cwd: string, spec: string): Promise<PageSummary & { key: string }> {
    const info = parseKey(spec);
    const base = {
      key: info.key,
      code: info.code,
      windowsVirtualKeyCode: info.vk,
      nativeVirtualKeyCode: info.vk,
      modifiers: info.modifiers,
    };
    await this.send(cwd, 'Input.dispatchKeyEvent', {
      ...base,
      type: info.text !== undefined ? 'keyDown' : 'rawKeyDown',
      ...(info.text !== undefined ? { text: info.text } : {}),
    });
    await this.send(cwd, 'Input.dispatchKeyEvent', { ...base, type: 'keyUp' });
    return { ...summary(this.options.host.state(cwd)), key: spec };
  }

  /** Evaluates a JavaScript expression in the page; the value is returned as JSON text. */
  async evaluateExpression(
    cwd: string,
    expression: string,
  ): Promise<PageSummary & { value: string; truncated: boolean }> {
    const value = await this.evaluate(cwd, expression, true);
    let text = value === undefined ? 'undefined' : (JSON.stringify(value) ?? 'undefined');
    const truncated = text.length > BROWSER_EVAL_MAX_CHARS;
    if (truncated) text = text.slice(0, BROWSER_EVAL_MAX_CHARS);
    return { ...summary(this.options.host.state(cwd)), value: text, truncated };
  }

  private collectConsole(cwd: string, cdp: CdpTransport): void {
    if (this.consoleSubs.has(cwd) || !cdp.onEvent) return;
    const off = cdp.onEvent((method, params) => {
      const entry = consoleEntryFromEvent(method, params);
      if (!entry) return;
      const log = this.consoleLogs.get(cwd) ?? [];
      log.push(entry);
      if (log.length > BROWSER_CONSOLE_MAX_ENTRIES)
        log.splice(0, log.length - BROWSER_CONSOLE_MAX_ENTRIES);
      this.consoleLogs.set(cwd, log);
    });
    this.consoleSubs.set(cwd, off);
  }

  /** Accessibility outline of the page with refs; replaces the workspace's previous refs. */
  async snapshot(
    cwd: string,
  ): Promise<
    PageSummary & { snapshot: string; refCount: number; nodeCount: number; truncated: boolean }
  > {
    await this.send(cwd, 'Accessibility.enable');
    const response = await this.send(cwd, 'Accessibility.getFullAXTree');
    const nodes = Array.isArray(response.nodes) ? (response.nodes as AxNode[]) : [];
    const built = buildSnapshot(nodes);
    this.refs.set(cwd, built.refs);
    return {
      ...summary(this.options.host.state(cwd)),
      snapshot: built.text,
      refCount: built.refs.size,
      nodeCount: built.nodeCount,
      truncated: built.truncated,
    };
  }

  /** Remote object of the element a snapshot ref points to. */
  private async resolveRef(cwd: string, ref: string): Promise<string> {
    const key = ref.replace(/^\[?(?:ref=)?|\]$/g, '');
    const backendNodeId = this.refs.get(cwd)?.get(key);
    if (backendNodeId === undefined) {
      throw new BrowserToolError(
        'element-not-found',
        `Unknown ref "${ref}": take a new browser_snapshot and use its refs.`,
      );
    }
    try {
      await this.send(cwd, 'DOM.enable');
      const resolved = await this.send(cwd, 'DOM.resolveNode', { backendNodeId });
      const objectId = (resolved.object as { objectId?: string } | undefined)?.objectId;
      if (objectId) return objectId;
    } catch (error) {
      if (error instanceof BrowserToolError && error.code === 'timeout') throw error;
    }
    throw new BrowserToolError(
      'element-not-found',
      `Ref "${ref}" no longer exists on the page: take a new browser_snapshot.`,
    );
  }

  private async callOnRef(cwd: string, ref: string, fn: string): Promise<unknown> {
    const objectId = await this.resolveRef(cwd, ref);
    const response = await this.send(cwd, 'Runtime.callFunctionOn', {
      objectId,
      functionDeclaration: fn,
      returnByValue: true,
    });
    if (response.exceptionDetails) {
      throw new BrowserToolError('eval-failed', describeException(response.exceptionDetails));
    }
    return (response.result as { value?: unknown } | undefined)?.value;
  }

  /** PNG or JPEG of the page (the visible area, or all of it with `fullPage`), as base64. */
  async screenshot(
    cwd: string,
    options: { fullPage?: boolean; format?: 'png' | 'jpeg' } = {},
  ): Promise<PageSummary & { data: string; mimeType: string }> {
    const format = options.format === 'jpeg' ? 'jpeg' : 'png';
    const response = await this.send(cwd, 'Page.captureScreenshot', {
      format,
      ...(format === 'jpeg' ? { quality: 80 } : {}),
      ...(options.fullPage ? { captureBeyondViewport: true } : {}),
    });
    const data = typeof response.data === 'string' ? response.data : '';
    if (data === '') throw new BrowserToolError('cdp-error', 'The browser returned no image.');
    if (data.length * 0.75 > BROWSER_SCREENSHOT_MAX_BYTES) {
      throw new BrowserToolError(
        'cdp-error',
        'The screenshot is too large: try jpeg or without fullPage.',
      );
    }
    return { ...summary(this.options.host.state(cwd)), data, mimeType: `image/${format}` };
  }

  /** Console output collected since the browser was first driven (newest last). */
  console(
    cwd: string,
    options: { clear?: boolean; level?: ConsoleEntry['level']; limit?: number } = {},
  ): PageSummary & { entries: ConsoleEntry[]; total: number } {
    this.cdp(cwd);
    const all = this.consoleLogs.get(cwd) ?? [];
    const filtered = options.level ? all.filter((e) => e.level === options.level) : all;
    const limit = Math.min(
      Math.max(Math.trunc(options.limit ?? 50), 1),
      BROWSER_CONSOLE_MAX_ENTRIES,
    );
    const entries = filtered.slice(-limit);
    if (options.clear) this.consoleLogs.set(cwd, []);
    return { ...summary(this.options.host.state(cwd)), entries, total: filtered.length };
  }

  /** Waits until the selector exists, the text appears, or the page finished loading. */
  async waitFor(cwd: string, condition: WaitCondition): Promise<PageSummary & { matched: string }> {
    const { selector, text } = condition;
    if (selector === undefined && text === undefined && !condition.load) {
      throw new BrowserToolError('invalid-input', 'Provide selector, text or load.');
    }
    const timeout = Math.min(
      Math.max(condition.timeoutMs ?? BROWSER_DEFAULT_TIMEOUT_MS, 100),
      BROWSER_MAX_TIMEOUT_MS,
    );
    const deadline = Date.now() + timeout;
    if (condition.load) await this.waitLoaded(cwd, timeout);
    if (selector === undefined && text === undefined) {
      return { ...summary(this.options.host.state(cwd)), matched: 'load' };
    }
    const probe = `(() => {
      ${selector !== undefined ? `if (document.querySelector(${JSON.stringify(selector)})) return 'selector';` : ''}
      ${text !== undefined ? `if ((document.body?.innerText ?? '').includes(${JSON.stringify(text)})) return 'text';` : ''}
      return null;
    })()`;
    for (;;) {
      const matched = await this.evaluate(cwd, probe).catch((error) => {
        if (error instanceof BrowserToolError && error.code === 'eval-failed') {
          throw new BrowserToolError('invalid-input', `Invalid selector: ${error.message}`);
        }
        throw error;
      });
      if (typeof matched === 'string') {
        return { ...summary(this.options.host.state(cwd)), matched };
      }
      if (Date.now() >= deadline) {
        throw new BrowserToolError('timeout', 'The condition was not met in time.');
      }
      await sleep(POLL_MS);
    }
  }
}

function describeException(details: unknown): string {
  const d = details as { text?: string; exception?: { description?: string } };
  return (d.exception?.description ?? d.text ?? 'Evaluation failed.').slice(0, 500);
}
