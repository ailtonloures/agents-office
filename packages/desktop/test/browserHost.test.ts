import type { BrowserBounds } from '@agents-office/shared';
import { describe, expect, it, vi } from 'vitest';
import { BROWSER_CHANNELS } from '../src/main/browserChannels';
import {
  BrowserAddressError,
  BrowserHost,
  type BrowserViewHandle,
  normalizeAddress,
  partitionFor,
} from '../src/main/browserHost';
import { registerBrowserIpc } from '../src/main/browserIpc';
import { createBrowserBridge } from '../src/preload/browserBridge';

class FakeView implements BrowserViewHandle {
  url = 'about:blank';
  title = '';
  loading = false;
  history: string[] = [];
  index = -1;
  visible = false;
  bounds: BrowserBounds | undefined;
  destroyed = false;
  cleared = 0;
  loads: string[] = [];
  failNext = false;
  /** Cookies live in the partition's jar, like Electron's session. */
  readonly jar: Set<string>;
  private listeners = new Set<() => void>();
  constructor(
    readonly partition: string,
    jars: Map<string, Set<string>>,
  ) {
    this.jar = jars.get(partition) ?? new Set();
    jars.set(partition, this.jar);
  }
  private emit() {
    for (const l of this.listeners) l();
  }
  async loadURL(url: string) {
    this.loads.push(url);
    if (this.failNext) {
      this.failNext = false;
      throw new Error('ERR_FAILED');
    }
    this.history = [...this.history.slice(0, this.index + 1), url];
    this.index = this.history.length - 1;
    this.url = url;
    this.emit();
  }
  goBack() {
    if (this.index > 0) this.url = this.history[--this.index] ?? this.url;
    this.emit();
  }
  goForward() {
    if (this.index < this.history.length - 1) this.url = this.history[++this.index] ?? this.url;
    this.emit();
  }
  reload() {
    this.loads.push(`reload:${this.url}`);
  }
  stop() {
    this.loading = false;
  }
  snapshot() {
    return {
      url: this.url,
      title: this.title,
      loading: this.loading,
      canGoBack: this.index > 0,
      canGoForward: this.index < this.history.length - 1,
    };
  }
  onChange(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  setVisible(visible: boolean, bounds?: BrowserBounds) {
    this.visible = visible;
    if (bounds) this.bounds = bounds;
  }
  setBounds(bounds: BrowserBounds) {
    this.bounds = bounds;
  }
  async clearData() {
    this.cleared += 1;
    this.jar.clear();
  }
  destroy() {
    this.destroyed = true;
  }
}

function setup() {
  const jars = new Map<string, Set<string>>();
  const views: FakeView[] = [];
  const onState = vi.fn();
  const host = new BrowserHost({
    createView: (partition) => {
      const view = new FakeView(partition, jars);
      views.push(view);
      return view;
    },
    onState,
  });
  return { host, views, jars, onState };
}

const B: BrowserBounds = { x: 0, y: 30, width: 400, height: 300 };

describe('partitionFor', () => {
  it('is persistent, stable and different per project', () => {
    expect(partitionFor('/a/proj')).toMatch(/^persist:browser-[0-9a-f]{24}$/);
    expect(partitionFor('/a/proj')).toBe(partitionFor('/a/proj/'));
    expect(partitionFor('/a/proj')).not.toBe(partitionFor('/a/other'));
  });
});

describe('normalizeAddress', () => {
  it('keeps http(s) urls and adds a scheme to hosts', () => {
    expect(normalizeAddress('https://example.com/a')).toBe('https://example.com/a');
    expect(normalizeAddress('example.com')).toBe('https://example.com/');
    expect(normalizeAddress('localhost:5173/x')).toBe('http://localhost:5173/x');
    expect(normalizeAddress('127.0.0.1:3000')).toBe('http://127.0.0.1:3000/');
    expect(normalizeAddress('about:blank')).toBe('about:blank');
  });
  it('searches the web for plain terms', () => {
    expect(normalizeAddress('pixel art office')).toBe(
      'https://duckduckgo.com/?q=pixel%20art%20office',
    );
  });
  it.each(['file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,hi', 'chrome://gpu', ''])(
    'refuses %j',
    (input) => {
      expect(() => normalizeAddress(input)).toThrow(BrowserAddressError);
    },
  );
});

describe('BrowserHost', () => {
  it('creates one view per project, each with its own partition', () => {
    const { host, views } = setup();
    host.show('/p1', B);
    host.show('/p2', B);
    host.show('/p1', B);
    expect(views).toHaveLength(2);
    expect(views[0]?.partition).not.toBe(views[1]?.partition);
    expect(views.every((v) => v.partition.startsWith('persist:'))).toBe(true);
    expect(host.get('/p1/')).toBe(views[0]);
  });

  it('shows only the visible project and hides the previous one', () => {
    const { host, views } = setup();
    host.show('/p1', B);
    host.show('/p2', { ...B, width: 500 });
    expect(views[0]?.visible).toBe(false);
    expect(views[1]?.visible).toBe(true);
    expect(views[1]?.bounds?.width).toBe(500);
    host.setBounds({ ...B, width: 600 });
    expect(views[1]?.bounds?.width).toBe(600);
    expect(views[0]?.bounds?.width).toBe(400);
    host.hide();
    expect(views[1]?.visible).toBe(false);
    expect(host.visible).toBeUndefined();
  });

  it('does not share cookies between projects (clearing one leaves the other)', async () => {
    const { host, views, jars } = setup();
    host.get('/p1');
    host.get('/p2');
    views[0]?.jar.add('session=1');
    expect(views[1]?.jar.size).toBe(0);
    expect(jars.size).toBe(2);
    await host.clearData('/p1');
    expect(views[0]?.jar.size).toBe(0);
    expect(views[0]?.url).toBe('about:blank');
    expect(views[1]?.cleared).toBe(0);
  });

  it('keeps the page and cookies when the tab is closed (hide) and shown again', async () => {
    const { host, views } = setup();
    host.show('/p1', B);
    await host.navigate('/p1', 'example.com');
    views[0]?.jar.add('a=b');
    host.hide();
    host.show('/p1', B);
    expect(views).toHaveLength(1);
    expect(views[0]?.destroyed).toBe(false);
    expect(views[0]?.url).toBe('https://example.com/');
    expect(views[0]?.jar.has('a=b')).toBe(true);
  });

  it('navigates, goes back/forward and reloads (or stops while loading)', async () => {
    const { host, views } = setup();
    await host.navigate('/p1', 'one.test');
    const state = await host.navigate('/p1', 'two.test');
    expect(state).toMatchObject({ cwd: '/p1', url: 'https://two.test/', canGoBack: true });
    expect(host.back('/p1')).toMatchObject({ url: 'https://one.test/', canGoForward: true });
    expect(host.forward('/p1').url).toBe('https://two.test/');
    host.reload('/p1');
    expect(views[0]?.loads.at(-1)).toBe('reload:https://two.test/');
    if (views[0]) views[0].loading = true;
    host.reload('/p1');
    expect(views[0]?.loading).toBe(false);
  });

  it('survives a failed load and rejects forbidden addresses without loading', async () => {
    const { host, views } = setup();
    host.get('/p1');
    if (views[0]) views[0].failNext = true;
    await expect(host.navigate('/p1', 'down.test')).resolves.toMatchObject({ cwd: '/p1' });
    await expect(host.navigate('/p1', 'file:///etc/passwd')).rejects.toBeInstanceOf(
      BrowserAddressError,
    );
    expect(views[0]?.loads).toEqual(['https://down.test/']);
  });

  it('reports state changes with the project and destroys everything on dispose', async () => {
    const { host, views, onState } = setup();
    await host.navigate('/p1', 'one.test');
    expect(onState).toHaveBeenLastCalledWith(
      expect.objectContaining({ cwd: '/p1', url: 'https://one.test/' }),
    );
    host.dispose();
    expect(views[0]?.destroyed).toBe(true);
    expect(() => host.get('/p1')).toThrow();
  });
});

describe('registerBrowserIpc + bridge', () => {
  function wire() {
    const { host } = setup();
    const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
    const trusted = vi.fn();
    registerBrowserIpc({
      ipcMain: { handle: (channel, listener) => handlers.set(channel, listener) },
      host,
      trusted,
    });
    const invoke = (channel: string, ...args: unknown[]) => {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`no handler ${channel}`);
      return Promise.resolve(handler({}, ...args));
    };
    return { host, trusted, handlers, bridge: createBrowserBridge(invoke, () => () => {}) };
  }

  it('registers every channel and checks the sender on each call', async () => {
    const { handlers, trusted, bridge } = wire();
    expect([...handlers.keys()].sort()).toEqual(
      Object.values(BROWSER_CHANNELS)
        .filter((c) => c !== BROWSER_CHANNELS.state && c !== BROWSER_CHANNELS.pick)
        .sort(),
    );
    await bridge.show('/p1', B);
    await bridge.navigate('/p1', 'example.com');
    await bridge.setBounds(B);
    await bridge.hide();
    expect(trusted).toHaveBeenCalledTimes(4);
  });

  it('start/cancel pick go through the picker; without one they answer unavailable', async () => {
    const { host, handlers } = wire();
    const calls: string[] = [];
    registerBrowserIpc({
      ipcMain: { handle: (channel, listener) => handlers.set(channel, listener) },
      host,
      trusted: () => {},
      picker: {
        start: async (cwd) => void calls.push(`start:${cwd}`),
        cancel: async (cwd) => void calls.push(`cancel:${cwd}`),
      },
    });
    const call = (channel: string, ...args: unknown[]) =>
      Promise.resolve(handlers.get(channel)?.({}, ...args));
    expect(await call(BROWSER_CHANNELS.startPick, '/p1')).toMatchObject({ ok: true });
    expect(await call(BROWSER_CHANNELS.cancelPick, '/p1')).toMatchObject({ ok: true });
    expect(await call(BROWSER_CHANNELS.startPick, '')).toEqual({
      ok: false,
      message: 'Invalid request.',
    });
    expect(calls).toEqual(['start:/p1', 'cancel:/p1']);
    const bare = wire();
    expect(await bare.bridge.startPick('/p1')).toMatchObject({ ok: false });
  });

  it('answers navigation and errors as results', async () => {
    const { bridge, host } = wire();
    const shown = await bridge.show('/p1', B);
    expect(shown).toMatchObject({ ok: true, state: { cwd: '/p1' } });
    const nav = await bridge.navigate('/p1', 'example.com');
    expect(nav).toMatchObject({ ok: true, state: { url: 'https://example.com/' } });
    expect(await bridge.navigate('/p1', 'javascript:alert(1)')).toEqual({
      ok: false,
      message: 'Address scheme "javascript:" is not allowed.',
    });
    expect(await bridge.show('', B)).toEqual({ ok: false, message: 'Invalid request.' });
    expect(await bridge.show('/p1', { x: 0, y: 0, width: -1, height: 1 })).toMatchObject({
      ok: false,
    });
    expect(host.visible).toBe('/p1');
    expect(await bridge.clearData('/p1')).toMatchObject({ ok: true });
  });
});
