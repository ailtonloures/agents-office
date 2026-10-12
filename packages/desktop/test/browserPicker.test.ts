import type { BrowserPickEvent } from '@agents-office/shared';
import { describe, expect, it } from 'vitest';
import { BrowserHost, type BrowserViewHandle, type CdpTransport } from '../src/main/browserHost';
import {
  BrowserPicker,
  normalizePick,
  PICK_BINDING,
  PICK_HTML_MAX,
  PICK_TEXT_MAX,
  pickerScript,
} from '../src/main/browserPicker';

class FakeCdp implements CdpTransport {
  log: Array<{ method: string; params?: Record<string, unknown> }> = [];
  listeners = new Set<(method: string, params: Record<string, unknown>) => void>();
  evalValue: unknown = true;
  onEvent(l: (method: string, params: Record<string, unknown>) => void) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  call(payload: unknown) {
    for (const l of this.listeners) {
      l('Runtime.bindingCalled', { name: PICK_BINDING, payload: JSON.stringify(payload) });
    }
  }
  async send(method: string, params?: Record<string, unknown>) {
    this.log.push({ method, params });
    if (method === 'Runtime.evaluate') return { result: { value: this.evalValue } };
    if (method === 'Page.captureScreenshot') return { data: 'AAAA' };
    return {};
  }
}

function makeView(cdp: CdpTransport): BrowserViewHandle {
  return {
    partition: 'p',
    cdp,
    async loadURL() {},
    goBack() {},
    goForward() {},
    reload() {},
    stop() {},
    snapshot: () => ({
      url: 'http://x.test/',
      title: 'X\u001b[0m',
      loading: false,
      canGoBack: false,
      canGoForward: false,
    }),
    onChange: () => () => {},
    setVisible() {},
    setBounds() {},
    async clearData() {},
    destroy() {},
  };
}

function setup(cdp = new FakeCdp()) {
  const events: BrowserPickEvent[] = [];
  const saved: string[] = [];
  const host = new BrowserHost({ createView: () => makeView(cdp) });
  const picker = new BrowserPicker({
    host,
    push: (e) => events.push(e),
    saveScreenshot: async (b64) => {
      saved.push(b64);
      return '/tmp/pick.png';
    },
    newNonce: () => 'N1',
  });
  return { cdp, events, saved, picker };
}

const data = {
  selector: 'div > button.go',
  tag: 'BUTTON',
  text: 'Go',
  html: '<button class="go">Go</button>',
  rect: { x: 10, y: 20, width: 100, height: 30 },
};

describe('normalizePick', () => {
  it('truncates text and html and reports it', () => {
    const result = normalizePick({
      ...data,
      text: 'a'.repeat(PICK_TEXT_MAX + 5),
      html: 'b'.repeat(PICK_HTML_MAX + 1),
    });
    expect(result?.text).toHaveLength(PICK_TEXT_MAX);
    expect(result?.textTruncated).toBe(true);
    expect(result?.html).toHaveLength(PICK_HTML_MAX);
    expect(result?.htmlTruncated).toBe(true);
    expect(result?.tag).toBe('button');
  });

  it('keeps short values whole, drops control characters and rejects non-picks', () => {
    const result = normalizePick({ ...data, text: 'x\u001b[2Jy' });
    expect(result?.text).toBe('x[2Jy');
    expect(result?.textTruncated).toBe(false);
    expect(normalizePick(null)).toBeNull();
    expect(normalizePick({ selector: '', tag: '' })).toBeNull();
  });
});

describe('BrowserPicker', () => {
  it('injects the highlighter with a binding and nonce', async () => {
    const { cdp, picker } = setup();
    await picker.start('/p');
    expect(cdp.log.map((c) => c.method)).toEqual(['Runtime.addBinding', 'Runtime.evaluate']);
    expect(cdp.log[0]?.params).toEqual({ name: PICK_BINDING });
    expect(String(cdp.log[1]?.params?.expression)).toContain('"N1"');
    expect(pickerScript('N1')).toContain('isTrusted');
    expect(picker.isActive('/p')).toBe(true);
  });

  it('collects the element with capture and reports it once', async () => {
    const { cdp, events, saved, picker } = setup();
    await picker.start('/p');
    cdp.call({ nonce: 'N1', type: 'pick', data });
    await new Promise((r) => setTimeout(r, 0));
    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event?.status).toBe('picked');
    if (event?.status !== 'picked') return;
    expect(event.pick).toMatchObject({
      cwd: '/p',
      url: 'http://x.test/',
      title: 'X[0m',
      selector: 'div > button.go',
      tag: 'button',
      screenshotPath: '/tmp/pick.png',
    });
    expect(saved).toEqual(['AAAA']);
    const shot = cdp.log.find((c) => c.method === 'Page.captureScreenshot');
    expect(shot?.params?.clip).toEqual({ x: 10, y: 20, width: 100, height: 30, scale: 1 });
    expect(picker.isActive('/p')).toBe(false);
    cdp.call({ nonce: 'N1', type: 'pick', data });
    await new Promise((r) => setTimeout(r, 0));
    expect(events).toHaveLength(1);
  });

  it('ignores messages with a wrong nonce (the page cannot fake a pick)', async () => {
    const { cdp, events, picker } = setup();
    await picker.start('/p');
    cdp.call({ nonce: 'guess', type: 'pick', data });
    await new Promise((r) => setTimeout(r, 0));
    expect(events).toEqual([]);
    expect(picker.isActive('/p')).toBe(true);
  });

  it('still delivers the element when the capture fails', async () => {
    const { cdp, events, picker } = setup();
    const send = cdp.send.bind(cdp);
    cdp.send = async (m, p) => {
      if (m === 'Page.captureScreenshot') throw new Error('boom');
      return send(m, p);
    };
    await picker.start('/p');
    cdp.call({ nonce: 'N1', type: 'pick', data });
    await new Promise((r) => setTimeout(r, 0));
    const event = events[0];
    expect(event?.status === 'picked' && event.pick.screenshotPath).toBeFalsy();
    expect(event?.status).toBe('picked');
  });

  it('cancel removes the highlighter and notifies; Escape in the page does the same', async () => {
    const { cdp, events, picker } = setup();
    await picker.start('/p');
    await picker.cancel('/p');
    expect(events).toEqual([{ status: 'cancelled', cwd: '/p' }]);
    expect(String(cdp.log.at(-1)?.params?.expression)).toContain('__aoPickerStop');
    await picker.start('/p');
    cdp.call({ nonce: 'N1', type: 'cancel' });
    await new Promise((r) => setTimeout(r, 0));
    expect(events).toHaveLength(2);
    expect(picker.isActive('/p')).toBe(false);
  });

  it('fails when the page cannot run the picker', async () => {
    const { cdp, picker } = setup();
    cdp.evalValue = false;
    await expect(picker.start('/p')).rejects.toThrow();
    expect(picker.isActive('/p')).toBe(false);
    expect(cdp.listeners.size).toBe(0);
  });

  it('gives up after the timeout', async () => {
    const cdp = new FakeCdp();
    const events: BrowserPickEvent[] = [];
    const picker = new BrowserPicker({
      host: new BrowserHost({ createView: () => makeView(cdp) }),
      push: (e) => events.push(e),
      saveScreenshot: async () => undefined,
      timeoutMs: 5,
    });
    await picker.start('/p');
    await new Promise((r) => setTimeout(r, 30));
    expect(events).toEqual([{ status: 'cancelled', cwd: '/p' }]);
  });
});
