import { describe, expect, it } from 'vitest';
import { BrowserTools, browserTools } from '../src/main/agentBus/browserTools';
import type { BusSession } from '../src/main/agentBus/server';
import { BrowserDriver, parseKey } from '../src/main/browserDriver';
import { BrowserHost, type BrowserViewHandle, type CdpTransport } from '../src/main/browserHost';
import { BrowserQueue } from '../src/main/browserQueue';

type Handler = (params: Record<string, unknown> | undefined) => unknown;

/** Fake page: records every CDP command and answers Runtime.evaluate from a script. */
class FakeCdp implements CdpTransport {
  log: Array<{ method: string; params?: Record<string, unknown> }> = [];
  handlers = new Map<string, Handler>();
  listeners = new Set<(method: string, params: Record<string, unknown>) => void>();
  delay = 0;
  emit(method: string, params: Record<string, unknown>) {
    for (const l of this.listeners) l(method, params);
  }
  onEvent(listener: (method: string, params: Record<string, unknown>) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  async send(method: string, params?: Record<string, unknown>) {
    this.log.push({ method, params });
    if (this.delay) await new Promise((r) => setTimeout(r, this.delay));
    return this.handlers.get(method)?.(params) ?? {};
  }
}

function makeView(cdp: FakeCdp | undefined): BrowserViewHandle {
  let url = 'about:blank';
  let title = '';
  const listeners = new Set<() => void>();
  return {
    partition: 'p',
    cdp,
    async loadURL(next) {
      url = next;
      title = `T:${next}`;
      for (const l of listeners) l();
    },
    goBack() {},
    goForward() {},
    reload() {},
    stop() {},
    snapshot: () => ({ url, title, loading: false, canGoBack: false, canGoForward: false }),
    onChange(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    setVisible() {},
    setBounds() {},
    async clearData() {},
    destroy() {},
  };
}

const session = (entryId: string, cwd = '/p'): BusSession => ({
  sessionId: `s-${entryId}`,
  entryId,
  cwd,
  role: 'padrao',
});

function setup(
  cdp: FakeCdp | null = new FakeCdp(),
  safety: {
    paused?: () => boolean;
    confirmEval?: (session: BusSession, agent: string, expression: string) => Promise<boolean>;
  } = {},
) {
  const host = new BrowserHost({ createView: () => makeView(cdp ?? undefined) });
  const changes: string[] = [];
  const queue = new BrowserQueue({ onChange: (cwd) => changes.push(cwd) });
  const driver = new BrowserDriver({ host, timeoutMs: 200 });
  const tools = new BrowserTools({
    driver,
    queue,
    authorName: (s) => (s.entryId === 'ana' ? 'Ana' : 'Bob'),
    isPaused: () => safety.paused?.() ?? false,
    confirmEval: safety.confirmEval ?? (async () => true),
  });
  return { host, queue, driver, tools, cdp: cdp as FakeCdp, changes };
}
const parse = (r: { text: string }) => JSON.parse(r.text);

describe('browser tools', () => {
  it('exposes the nine tools', () => {
    expect(browserTools(setup().tools).map((t) => t.name)).toEqual([
      'browser_navigate',
      'browser_click',
      'browser_type',
      'browser_press_key',
      'browser_eval',
      'browser_snapshot',
      'browser_screenshot',
      'browser_console',
      'browser_wait_for',
    ]);
  });

  it('navigates and frames the page as untrusted', async () => {
    const { tools } = setup();
    const r = await tools.navigate(session('ana'), { url: 'example.com' });
    const out = parse(r);
    expect(out.ok).toBe(true);
    expect(out.page.url).toBe('https://example.com/');
    expect(out.notice).toMatch(/untrusted/);
  });

  it('reports bad addresses with a structured error', async () => {
    const { tools } = setup();
    const r = await tools.navigate(session('ana'), { url: 'javascript:alert(1)' });
    expect(r.isError).toBe(true);
    expect(parse(r).error).toBe('invalid-address');
  });

  it('clicks an element at its center', async () => {
    const cdp = new FakeCdp();
    cdp.handlers.set('Runtime.evaluate', () => ({
      result: { value: { x: 10, y: 20, w: 5, h: 5 } },
    }));
    const { tools } = setup(cdp);
    const r = await tools.click(session('ana'), { selector: '#go' });
    expect(parse(r).clicked).toBe('#go');
    expect(cdp.log.map((c) => `${c.method}:${c.params?.type ?? ''}`)).toEqual([
      'Runtime.evaluate:',
      'Input.dispatchMouseEvent:mouseMoved',
      'Input.dispatchMouseEvent:mousePressed',
      'Input.dispatchMouseEvent:mouseReleased',
    ]);
    expect(cdp.log[2]?.params).toMatchObject({ x: 10, y: 20 });
  });

  it('click: element-not-found and invalid input', async () => {
    const cdp = new FakeCdp();
    cdp.handlers.set('Runtime.evaluate', () => ({ result: { value: null } }));
    const { tools } = setup(cdp);
    expect(parse(await tools.click(session('ana'), { selector: '#x' })).error).toBe(
      'element-not-found',
    );
    expect(parse(await tools.click(session('ana'), {})).error).toBe('invalid-input');
  });

  it('click by coordinates skips lookup', async () => {
    const { tools, cdp } = setup();
    await tools.click(session('ana'), { x: 1, y: 2 });
    expect(cdp.log[0]?.method).toBe('Input.dispatchMouseEvent');
  });

  it('types into a selector and inserts text', async () => {
    const cdp = new FakeCdp();
    cdp.handlers.set('Runtime.evaluate', () => ({ result: { value: true } }));
    const { tools } = setup(cdp);
    const r = await tools.type(session('ana'), { text: 'hi', selector: 'input', clear: true });
    expect(r.isError).toBeUndefined();
    expect(cdp.log.at(-1)).toMatchObject({ method: 'Input.insertText', params: { text: 'hi' } });
  });

  it('presses keys with modifiers', async () => {
    const { tools, cdp } = setup();
    await tools.pressKey(session('ana'), { key: 'Control+a' });
    expect(cdp.log.map((c) => c.params?.type)).toEqual(['rawKeyDown', 'keyUp']);
    expect(cdp.log[0]?.params).toMatchObject({ key: 'a', modifiers: 2, code: 'KeyA' });
    expect(parseKey('Enter').text).toBe('\r');
    expect(() => parseKey('Hyper+x')).toThrow();
    expect(parse(await tools.pressKey(session('ana'), { key: 'Nope' })).error).toBe(
      'invalid-input',
    );
  });

  it('eval returns the JSON value, truncates, and maps exceptions', async () => {
    const cdp = new FakeCdp();
    const { tools } = setup(cdp);
    cdp.handlers.set('Runtime.evaluate', () => ({ result: { value: { a: 1 } } }));
    expect(parse(await tools.evaluate(session('ana'), { expression: '1' })).value).toBe('{"a":1}');
    cdp.handlers.set('Runtime.evaluate', () => ({ result: { value: 'x'.repeat(30_000) } }));
    expect(parse(await tools.evaluate(session('ana'), { expression: '1' })).truncated).toBe(true);
    cdp.handlers.set('Runtime.evaluate', () => ({
      exceptionDetails: { exception: { description: 'ReferenceError: z' } },
    }));
    const bad = await tools.evaluate(session('ana'), { expression: 'z' });
    expect(parse(bad)).toMatchObject({ error: 'eval-failed', message: 'ReferenceError: z' });
  });

  it('wait_for polls until matched and times out', async () => {
    const cdp = new FakeCdp();
    let n = 0;
    cdp.handlers.set('Runtime.evaluate', () => ({
      result: { value: ++n >= 3 ? 'selector' : null },
    }));
    const { tools } = setup(cdp);
    expect(parse(await tools.waitFor(session('ana'), { selector: '#a' })).matched).toBe('selector');
    cdp.handlers.set('Runtime.evaluate', () => ({ result: { value: null } }));
    const r = await tools.waitFor(session('ana'), { text: 'never', timeoutMs: 150 });
    expect(parse(r).error).toBe('timeout');
    expect(parse(await tools.waitFor(session('ana'), {})).error).toBe('invalid-input');
  });

  it('CDP timeout and failures become structured errors', async () => {
    const cdp = new FakeCdp();
    cdp.delay = 400;
    const { tools } = setup(cdp);
    expect(parse(await tools.click(session('ana'), { x: 1, y: 1 })).error).toBe('timeout');
    const failing = new FakeCdp();
    failing.handlers.set('Input.dispatchKeyEvent', () => {
      throw new Error('boom');
    });
    expect(parse(await setup(failing).tools.pressKey(session('ana'), { key: 'a' })).error).toBe(
      'cdp-error',
    );
  });

  it('views without CDP are reported as unsupported', async () => {
    const { tools } = setup(null);
    expect(parse(await tools.click(session('ana'), { x: 1, y: 1 })).error).toBe('unsupported');
  });

  it('never interleaves the actions of two agents, in arrival order, with the author', async () => {
    const cdp = new FakeCdp();
    cdp.delay = 20;
    const { tools, queue } = setup(cdp);
    const seen: Array<string | undefined> = [];
    const orig = cdp.send.bind(cdp);
    cdp.send = async (method, params) => {
      seen.push(queue.current('/p')?.actor.name);
      return orig(method, params);
    };
    const results = await Promise.all([
      tools.click(session('ana'), { x: 1, y: 1 }),
      tools.click(session('bob'), { x: 2, y: 2 }),
      tools.pressKey(session('ana'), { key: 'a' }),
    ]);
    expect(results.every((r) => !r.isError)).toBe(true);
    const xs = cdp.log
      .filter((c) => c.method === 'Input.dispatchMouseEvent')
      .map((c) => c.params?.x);
    // ana's three mouse events, then bob's three: never mixed.
    expect(xs).toEqual([1, 1, 1, 2, 2, 2]);
    expect(seen).toEqual(['Ana', 'Ana', 'Ana', 'Bob', 'Bob', 'Bob', 'Ana', 'Ana']);
    expect(queue.current('/p')).toBeUndefined();
  });

  it('keeps going after a failed action and isolates workspaces', async () => {
    const { queue } = setup();
    const order: string[] = [];
    const a = queue.run('/p', { actor: { id: '1', name: 'A' }, action: 'x' }, async () => {
      order.push('a1');
      throw new Error('x');
    });
    const b = queue.run('/p', { actor: { id: '2', name: 'B' }, action: 'x' }, async () => {
      order.push('b');
    });
    const c = queue.run('/q', { actor: { id: '3', name: 'C' }, action: 'x' }, async () => {
      order.push('c');
    });
    await expect(a).rejects.toThrow();
    await Promise.all([b, c]);
    expect(order).toEqual(['a1', 'c', 'b'].filter((x) => order.includes(x)));
    expect(order.indexOf('a1')).toBeLessThan(order.indexOf('b'));
  });

  it('exposes current author and pending count, and bounds the queue', async () => {
    const queue = new BrowserQueue({ maxPending: 1 });
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const first = queue.run(
      '/p',
      { actor: { id: '1', name: 'Ana' }, action: 'browser_click' },
      () => gate,
    );
    await Promise.resolve();
    const second = queue.run(
      '/p',
      { actor: { id: '2', name: 'Bob' }, action: 'browser_click' },
      async () => {},
    );
    expect(queue.current('/p')?.actor.name).toBe('Ana');
    expect(queue.pending('/p')).toBe(1);
    await expect(
      queue.run('/p', { actor: { id: '3', name: 'C' }, action: 'x' }, async () => {}),
    ).rejects.toMatchObject({ code: 'queue-full' });
    release();
    await Promise.all([first, second]);
    expect(queue.pending('/p')).toBe(0);
  });

  it('host decoration reports who uses the browser', async () => {
    const host = new BrowserHost({
      createView: () => makeView(new FakeCdp()),
      decorate: (s) => ({ ...s, agent: 'Ana' }),
    });
    expect(host.state('/p').agent).toBe('Ana');
  });

  const TREE = {
    nodes: [
      {
        nodeId: '1',
        role: { value: 'RootWebArea' },
        name: { value: 'Page' },
        childIds: ['2', '3', '4', '5'],
      },
      {
        nodeId: '2',
        parentId: '1',
        role: { value: 'heading' },
        name: { value: 'Welcome' },
        properties: [{ name: 'level', value: { value: 1 } }],
        childIds: [],
      },
      {
        nodeId: '3',
        parentId: '1',
        role: { value: 'button' },
        name: { value: 'Save' },
        backendDOMNodeId: 11,
        childIds: [],
      },
      { nodeId: '4', parentId: '1', ignored: true, role: { value: 'none' }, childIds: ['6'] },
      {
        nodeId: '6',
        parentId: '4',
        role: { value: 'textbox' },
        name: { value: 'Email' },
        value: { value: 'a@b.c' },
        backendDOMNodeId: 22,
        childIds: [],
      },
      { nodeId: '5', parentId: '1', role: { value: 'generic' }, childIds: [] },
    ],
  };

  it('snapshot builds an outline with stable refs and frames it as untrusted', async () => {
    const cdp = new FakeCdp();
    cdp.handlers.set('Accessibility.getFullAXTree', () => TREE);
    const { tools } = setup(cdp);
    const out = parse(await tools.snapshot(session('ana')));
    expect(out.snapshot).toBe(
      [
        '- RootWebArea "Page"',
        '  - heading "Welcome" [level=1]',
        '  - button "Save" [ref=e1]',
        '  - textbox "Email" value="a@b.c" [ref=e2]',
      ].join('\n'),
    );
    expect(out.refCount).toBe(2);
    expect(out.notice).toMatch(/snapshot/);
    expect(parse(await tools.snapshot(session('ana'))).snapshot).toBe(out.snapshot);
  });

  it('click and type resolve snapshot refs to the right element', async () => {
    const cdp = new FakeCdp();
    cdp.handlers.set('Accessibility.getFullAXTree', () => TREE);
    cdp.handlers.set('DOM.resolveNode', (p) => ({
      object: { objectId: `obj-${p?.backendNodeId}` },
    }));
    cdp.handlers.set('Runtime.callFunctionOn', () => ({
      result: { value: { x: 7, y: 9, w: 4, h: 4 } },
    }));
    const { tools } = setup(cdp);
    expect(parse(await tools.click(session('ana'), { ref: 'e1' })).error).toBe('element-not-found');
    await tools.snapshot(session('ana'));
    const r = parse(await tools.click(session('ana'), { ref: 'e2' }));
    expect(r.clicked).toBe('ref e2');
    const resolve = cdp.log.filter((c) => c.method === 'DOM.resolveNode');
    expect(resolve.at(-1)?.params).toEqual({ backendNodeId: 22 });
    expect(cdp.log.find((c) => c.params?.type === 'mousePressed')?.params).toMatchObject({
      x: 7,
      y: 9,
    });
    await tools.type(session('ana'), { text: 'hi', ref: 'e1' });
    expect(resolve.length).toBe(1);
    expect(cdp.log.filter((c) => c.method === 'DOM.resolveNode').at(-1)?.params).toEqual({
      backendNodeId: 11,
    });
    expect(cdp.log.at(-1)).toMatchObject({ method: 'Input.insertText' });
  });

  it('a ref whose node vanished asks for a new snapshot', async () => {
    const cdp = new FakeCdp();
    cdp.handlers.set('Accessibility.getFullAXTree', () => TREE);
    cdp.handlers.set('DOM.resolveNode', () => {
      throw new Error('No node with given id found');
    });
    const { tools } = setup(cdp);
    await tools.snapshot(session('ana'));
    const r = parse(await tools.click(session('ana'), { ref: 'e1' }));
    expect(r.error).toBe('element-not-found');
    expect(r.message).toMatch(/snapshot/);
  });

  it('screenshot returns the image next to a text result', async () => {
    const cdp = new FakeCdp();
    cdp.handlers.set('Page.captureScreenshot', () => ({ data: 'QUJD' }));
    const { tools } = setup(cdp);
    const r = await tools.screenshot(session('ana'), { fullPage: true, format: 'jpeg' });
    expect(r.images).toEqual([{ data: 'QUJD', mimeType: 'image/jpeg' }]);
    expect(r.text).not.toContain('QUJD');
    expect(cdp.log[0]?.params).toMatchObject({ format: 'jpeg', captureBeyondViewport: true });
    expect(parse(await tools.screenshot(session('ana'), { format: 'gif' })).error).toBe(
      'invalid-input',
    );
    cdp.handlers.set('Page.captureScreenshot', () => ({}));
    expect(parse(await tools.screenshot(session('ana'), {})).error).toBe('cdp-error');
  });

  it('console collects page output, filters, limits and clears', async () => {
    const cdp = new FakeCdp();
    const { tools } = setup(cdp);
    await tools.navigate(session('ana'), { url: 'example.com' });
    await tools.pressKey(session('ana'), { key: 'a' });
    cdp.emit('Runtime.consoleAPICalled', { type: 'log', args: [{ value: 'hello' }, { value: 3 }] });
    cdp.emit('Runtime.consoleAPICalled', { type: 'warning', args: [{ value: 'careful' }] });
    cdp.emit('Runtime.exceptionThrown', {
      exceptionDetails: { exception: { description: 'TypeError: x' } },
    });
    cdp.emit('Log.entryAdded', {
      entry: { level: 'error', text: 'Failed to load', url: 'https://x/a.js' },
    });
    const all = parse(await tools.console(session('ana'), {}));
    expect(all.entries.map((e: { level: string; text: string }) => `${e.level}:${e.text}`)).toEqual(
      ['log:hello 3', 'warn:careful', 'error:TypeError: x', 'error:Failed to load'],
    );
    expect(all.notice).toMatch(/entries/);
    expect(
      parse(await tools.console(session('ana'), { level: 'error', limit: 1 })).entries,
    ).toHaveLength(1);
    expect(parse(await tools.console(session('ana'), { level: 'nope' })).error).toBe(
      'invalid-input',
    );
    await tools.console(session('ana'), { clear: true });
    expect(parse(await tools.console(session('ana'), {})).entries).toEqual([]);
  });
});
