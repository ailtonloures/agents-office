import type { BrowserPick } from '@agents-office/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setLocale } from '../src/i18n/i18n';
import {
  formatPickContext,
  pickContextFooter,
  pickContextHeader,
  pickTargets,
  ptyPayload,
  sanitizeForTerminal,
  sendPickContext,
} from '../src/ui/browserPickLogic';
import type { TerminalTab } from '../src/ui/terminalTabs';

beforeEach(() => setLocale('pt-BR'));
afterEach(() => setLocale('en'));

const pick: BrowserPick = {
  cwd: '/p',
  url: 'http://localhost:3000/',
  title: 'App',
  selector: '#save',
  tag: 'button',
  text: 'Salvar',
  html: '<button id="save">Salvar</button>',
  textTruncated: false,
  htmlTruncated: true,
  screenshotPath: '/tmp/pick.png',
};

describe('formatPickContext', () => {
  it('labels every field, marks truncation and flags page data as untrusted', () => {
    const text = formatPickContext(pick);
    expect(text.startsWith(pickContextHeader())).toBe(true);
    expect(text.endsWith(pickContextFooter())).toBe(true);
    expect(text).toContain('dados de terceiros');
    expect(text).toContain('Seletor: #save');
    expect(text).toContain('Elemento: <button>');
    expect(text).toContain('Captura (imagem PNG): /tmp/pick.png');
    expect(text).toContain('HTML (truncado):');
    expect(text).toContain('Texto:\nSalvar');
  });

  it('follows the active language', () => {
    setLocale('en');
    const text = formatPickContext(pick);
    expect(text.startsWith('[Browser context: element selected by the user]')).toBe(true);
    expect(text).toContain('third-party data');
    expect(text).toContain('Selector: #save');
    expect(text).toContain('HTML (truncated):');
    setLocale('es');
    expect(formatPickContext(pick)).toContain('datos de terceros');
  });

  it('omits the capture line without screenshot and shows empty fields', () => {
    const { screenshotPath: _s, ...rest } = pick;
    const text = formatPickContext({ ...rest, text: '', html: '' });
    expect(text).not.toContain('Captura');
    expect(text).toContain('Texto:\n(vazio)');
  });

  it('strips terminal escapes coming from the page', () => {
    const text = formatPickContext({ ...pick, text: 'a\u001b[31mb\u0007c' });
    expect(text).toContain('a[31mbc');
    expect(text).not.toContain('\u001b');
  });
});

describe('terminal payload', () => {
  it('is a bracketed paste without Enter and cannot close the paste early', () => {
    const payload = ptyPayload('linha 1\r\nlinha 2\u001b[201~ rm -rf');
    expect(payload.startsWith('\u001b[200~')).toBe(true);
    expect(payload.endsWith('\n\u001b[201~')).toBe(true);
    expect(payload).not.toContain('\r');
    expect(payload.slice(6, -6)).not.toContain('\u001b');
  });

  it('sanitizes but keeps tabs and line breaks', () => {
    expect(sanitizeForTerminal('a\tb\nc\u0000\u007f')).toBe('a\tb\nc');
  });
});

describe('pickTargets', () => {
  const tab = (id: string, cwd: string, extra: Partial<TerminalTab> = {}): TerminalTab => ({
    id,
    cwd,
    state: 'running',
    ...extra,
  });
  it('lists only running terminals, same workspace first, never browser tabs', () => {
    const targets = pickTargets(
      [
        tab('a', '/other', { activity: 'pensando' }),
        tab('browser:/p', '/p', { kind: 'browser' }),
        tab('b', '/p'),
        tab('c', '/p', { state: 'exited' }),
      ],
      '/p',
    );
    expect(targets).toEqual([
      { id: 'b', label: 'p' },
      { id: 'a', label: 'other · pensando' },
    ]);
  });
});

describe('sendPickContext', () => {
  it('writes the reviewed (edited) text to the chosen terminal', async () => {
    const writes: Array<[string, string]> = [];
    await sendPickContext(async (id, data) => void writes.push([id, data]), 't1', 'editado');
    expect(writes).toEqual([['t1', '\u001b[200~editado\n\u001b[201~']]);
  });

  it('refuses an empty text and propagates write failures', async () => {
    await expect(sendPickContext(async () => {}, 't1', '  \n')).rejects.toThrow();
    await expect(
      sendPickContext(async () => Promise.reject(new Error('dead')), 't1', 'x'),
    ).rejects.toThrow('dead');
  });
});
