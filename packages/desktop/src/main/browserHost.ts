import { createHash } from 'node:crypto';
import type { BrowserBounds, BrowserState } from '@agents-office/shared';

/**
 * What the host needs from one native browser view (an Electron `WebContentsView` in production,
 * a fake in tests). Every view is bound to its own persistent partition.
 */
export interface CdpTransport {
  /** Sends one Chrome DevTools Protocol command to the page (attaching the debugger on first use). */
  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
  /** Subscribes to protocol events (console, exceptions); returns the unsubscribe. */
  onEvent?(listener: (method: string, params: Record<string, unknown>) => void): () => void;
}

export interface BrowserViewHandle {
  /** The partition the view's session was created from (`persist:...`). */
  readonly partition: string;
  loadURL(url: string): Promise<void>;
  goBack(): void;
  goForward(): void;
  reload(): void;
  stop(): void;
  /** Current navigation state without the workspace (the host adds it). */
  snapshot(): Omit<BrowserState, 'cwd'>;
  /** Navigation state changed; returns the unsubscribe. */
  onChange(listener: () => void): () => void;
  /** Attaches to the window (when visible) or detaches from it, at the given bounds. */
  setVisible(visible: boolean, bounds?: BrowserBounds): void;
  setBounds(bounds: BrowserBounds): void;
  /** Cookies, storage, cache and auth of the partition. */
  clearData(): Promise<void>;
  destroy(): void;
  /** CDP access to the page (`webContents.debugger`); absent in views that cannot be driven. */
  readonly cdp?: CdpTransport;
}

export type BrowserViewFactory = (partition: string, cwd: string) => BrowserViewHandle;

export class BrowserAddressError extends Error {}

/** `persist:` partition of a workspace: isolated from the app, from Chrome and from other projects. */
export function partitionFor(cwd: string): string {
  const normalized = cwd.replace(/[\\/]+$/, '') || cwd;
  const hash = createHash('sha256').update(normalized).digest('hex').slice(0, 24);
  return `persist:browser-${hash}`;
}

const SEARCH_URL = 'https://duckduckgo.com/?q=';
const LOCAL_HOST = /^(localhost|\[[0-9a-f:]+\]|(\d{1,3}\.){3}\d{1,3})(:\d+)?([/?#].*)?$/i;
const LOOKS_LIKE_HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?([/?#].*)?$/i;

/**
 * Turns what the user typed into a loadable URL. Only `http(s)` pages (and `about:blank`) are
 * opened: `file:`, `javascript:`, `data:` and custom schemes are refused. Hosts without scheme get
 * `https://` (`http://` for localhost and IPs); anything else becomes a web search.
 */
export function normalizeAddress(input: string): string {
  const text = input.trim();
  if (text === '') throw new BrowserAddressError('Empty address.');
  if (text === 'about:blank') return text;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(text);
  const isHostPort = /^[^/\s]+:\d+([/?#]|$)/.test(text);
  if (scheme && !isHostPort) {
    const protocol = (scheme[1] ?? '').toLowerCase();
    if (protocol !== 'http' && protocol !== 'https') {
      throw new BrowserAddressError(`Address scheme "${protocol}:" is not allowed.`);
    }
    try {
      return new URL(text).toString();
    } catch {
      throw new BrowserAddressError('Invalid address.');
    }
  }
  if (LOCAL_HOST.test(text)) return new URL(`http://${text}`).toString();
  if (LOOKS_LIKE_HOST.test(text)) return new URL(`https://${text}`).toString();
  return `${SEARCH_URL}${encodeURIComponent(text)}`;
}

interface Entry {
  view: BrowserViewHandle;
  off: () => void;
}

export interface BrowserHostOptions {
  createView: BrowserViewFactory;
  /** Navigation state of a workspace browser changed. */
  onState?(state: BrowserState): void;
  /** Adds host-level data (who is using the browser) to every reported state. */
  decorate?(state: BrowserState): BrowserState;
}

/**
 * One browser per workspace (cwd), each with its own persistent partition. Only one is visible at a
 * time (the one of the active dock tab). Closing the dock tab only hides the view: the page, the
 * cookies and the agents' sessions stay.
 */
export class BrowserHost {
  private readonly entries = new Map<string, Entry>();
  private visibleCwd: string | undefined;
  private disposed = false;

  constructor(private readonly options: BrowserHostOptions) {}

  /** Views are created on first use. */
  get(cwd: string): BrowserViewHandle {
    if (this.disposed) throw new Error('The browser host is closed.');
    const key = keyOf(cwd);
    let entry = this.entries.get(key);
    if (!entry) {
      const view = this.options.createView(partitionFor(cwd), cwd);
      const off = view.onChange(() => this.options.onState?.(this.state(cwd)));
      entry = { view, off };
      this.entries.set(key, entry);
    }
    return entry.view;
  }

  has(cwd: string): boolean {
    return this.entries.has(keyOf(cwd));
  }

  get visible(): string | undefined {
    return this.visibleCwd;
  }

  state(cwd: string): BrowserState {
    const state: BrowserState = { cwd, ...this.get(cwd).snapshot() };
    return this.options.decorate ? this.options.decorate(state) : state;
  }

  /** Re-reports the state of a workspace (its decoration changed, e.g. the agent using it). */
  notify(cwd: string): void {
    if (this.has(cwd)) this.options.onState?.(this.state(cwd));
  }

  /** Shows the workspace browser at `bounds`; the previously visible one is hidden. */
  show(cwd: string, bounds: BrowserBounds): BrowserState {
    const view = this.get(cwd);
    if (this.visibleCwd !== undefined && keyOf(this.visibleCwd) !== keyOf(cwd)) {
      this.entries.get(keyOf(this.visibleCwd))?.view.setVisible(false);
    }
    this.visibleCwd = cwd;
    view.setVisible(true, bounds);
    return this.state(cwd);
  }

  setBounds(bounds: BrowserBounds): void {
    if (this.visibleCwd === undefined) return;
    this.entries.get(keyOf(this.visibleCwd))?.view.setBounds(bounds);
  }

  hide(): void {
    if (this.visibleCwd !== undefined) {
      this.entries.get(keyOf(this.visibleCwd))?.view.setVisible(false);
    }
    this.visibleCwd = undefined;
  }

  async navigate(cwd: string, address: string): Promise<BrowserState> {
    const url = normalizeAddress(address);
    const view = this.get(cwd);
    try {
      await view.loadURL(url);
    } catch {
      // A failed load (offline, refused, redirected, aborted by a newer navigation) is reported
      // through the state (title/url/loading); the address bar keeps working.
    }
    return this.state(cwd);
  }

  back(cwd: string): BrowserState {
    this.get(cwd).goBack();
    return this.state(cwd);
  }

  forward(cwd: string): BrowserState {
    this.get(cwd).goForward();
    return this.state(cwd);
  }

  reload(cwd: string): BrowserState {
    const view = this.get(cwd);
    if (view.snapshot().loading) view.stop();
    else view.reload();
    return this.state(cwd);
  }

  /** Wipes the project's browsing data (only its partition) and leaves the page blank. */
  async clearData(cwd: string): Promise<BrowserState> {
    const view = this.get(cwd);
    await view.clearData();
    await view.loadURL('about:blank').catch(() => {});
    return this.state(cwd);
  }

  dispose(): void {
    this.disposed = true;
    for (const { view, off } of this.entries.values()) {
      off();
      view.destroy();
    }
    this.entries.clear();
    this.visibleCwd = undefined;
  }
}

function keyOf(cwd: string): string {
  return cwd.replace(/[\\/]+$/, '') || cwd;
}
