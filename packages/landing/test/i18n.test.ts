import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_LOCALE,
  detectLocale,
  LOCALE_STORAGE_KEY,
  LOCALES,
  parseLocale,
  readStoredLocale,
  resolveInitialLocale,
  writeStoredLocale,
} from '../src/i18n/locale';
import { en } from '../src/i18n/messages/en';
import { DICTIONARIES, translate } from '../src/i18n/translate';

function stubStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  });
  return data;
}

function stubThrowingStorage() {
  const boom = () => {
    throw new Error('blocked');
  };
  vi.stubGlobal('localStorage', { getItem: boom, setItem: boom });
}

afterEach(() => vi.unstubAllGlobals());

describe('dictionaries', () => {
  const keys = Object.keys(en).sort();

  it.each(LOCALES.map((l) => l.code))('%s has exactly the English keys', (code) => {
    expect(Object.keys(DICTIONARIES[code]).sort()).toEqual(keys);
  });

  it.each(LOCALES.map((l) => l.code))('%s has no empty strings', (code) => {
    for (const [key, value] of Object.entries(DICTIONARIES[code])) {
      expect(value.trim(), `${code}:${key}`).not.toBe('');
    }
  });

  it('keeps the same placeholders in every language', () => {
    const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();
    for (const [key, value] of Object.entries(en)) {
      for (const { code } of LOCALES) {
        const other = (DICTIONARIES[code] as Record<string, string>)[key] ?? '';
        expect(placeholders(other), `${code}:${key}`).toEqual(placeholders(value));
      }
    }
  });

  it('covers every section', () => {
    const groups = new Set(keys.map((k) => k.split('.')[0]));
    for (const g of [
      'nav',
      'hero',
      'how',
      'features',
      'arch',
      'security',
      'install',
      'oss',
      'footer',
    ]) {
      expect(groups.has(g), g).toBe(true);
    }
  });
});

describe('install copy', () => {
  const codes = LOCALES.map((l) => l.code);
  const installEntries = (code: (typeof codes)[number]) =>
    Object.entries(DICTIONARIES[code]).filter(([key]) => key.startsWith('install.'));

  it.each(codes)('%s does not offer macOS or the old file name', (code) => {
    for (const [key, value] of installEntries(code)) {
      expect(value, `${code}:${key}`).not.toMatch(/\.dmg|xattr|linux-x64/i);
      // macOS may only be named where the page says it is not available.
      if (!key.startsWith('install.unavailable')) {
        expect(value, `${code}:${key}`).not.toMatch(/macos/i);
      }
    }
    expect(Object.keys(DICTIONARIES[code]).filter((k) => k.startsWith('install.macos'))).toEqual(
      [],
    );
  });

  it.each(codes)('%s says macOS and Windows are unavailable', (code) => {
    const text = DICTIONARIES[code]['install.unavailable.body' as never] as string;
    expect(text).toMatch(/macOS/);
    expect(text).toMatch(/Windows/);
  });

  it.each(codes)('%s uses the real release file names in the commands', (code) => {
    const d = DICTIONARIES[code] as Record<string, string>;
    expect(d['install.linux.chmod']).toContain('linux-x86_64.AppImage');
    expect(d['install.linux.run']).toContain('linux-x86_64.AppImage');
    expect(d['install.linux.debCommand']).toContain('linux-amd64.deb');
    expect(d['install.linux.debCommand']).toMatch(/^sudo apt install \.\//);
  });

  it.each(codes)('%s says Linux (AppImage and .deb) in the hero platforms', (code) => {
    const text = (DICTIONARIES[code] as Record<string, string>)['hero.platforms'] ?? '';
    expect(text).toMatch(/Linux/);
    expect(text).toMatch(/AppImage/);
    expect(text).toMatch(/\.deb/);
  });
});

describe('passive and active modes copy', () => {
  const codes = LOCALES.map((l) => l.code);
  const keys = [
    'how.modes.passive.title',
    'how.modes.passive.body',
    'how.modes.active.title',
    'how.modes.active.body',
  ];

  it.each(codes)('%s defines the passive and active mode cards', (code) => {
    const d = DICTIONARIES[code] as Record<string, string>;
    for (const key of keys) expect((d[key] ?? '').trim(), `${code}:${key}`).not.toBe('');
  });

  it('describes watching and orchestrating in the English meta description', () => {
    expect(en['meta.description']).toMatch(/orchestrat/i);
    expect(en['meta.description']).toMatch(/agents/i);
    expect(en['meta.title']).toMatch(/orchestrat/i);
  });

  it('covers profiles, agent talk, board, terminal and watching in the English active card', () => {
    const text = `${en['how.modes.active.body']} ${en['features.lead']}`;
    for (const word of [/profile/i, /talk|communicat|message/i, /board|Excalidraw/i, /terminal/i]) {
      expect(text).toMatch(word);
    }
  });

  it('never presents the product as passive only', () => {
    expect(en['hero.lead']).toMatch(/orchestrat|create|profile/i);
    expect(en['how.lead']).toMatch(/passive/i);
    expect(en['how.lead']).toMatch(/active/i);
  });

  it('keeps the embedded browser marked as beta in the copy', () => {
    expect(en['features.browser.body']).toMatch(/beta/i);
  });

  it('keeps index.html title equal to the English meta title', () => {
    const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
    expect(html).toContain(`<title>${en['meta.title']}</title>`);
  });
});

describe('translate', () => {
  it('interpolates placeholders', () => {
    expect(translate('pt-BR', 'footer.copyright', { year: 2026 })).toBe('(c) 2026 Agents Office');
  });

  it('keeps an unknown placeholder untouched', () => {
    expect(translate('en', 'footer.copyright', { other: 1 })).toBe('(c) {year} Agents Office');
  });

  it('falls back to English, then to the key', () => {
    const dictionaries = { en: { 'a.b': 'English' }, es: { 'a.c': '' } };
    expect(translate('es', 'a.b' as never, undefined, dictionaries)).toBe('English');
    expect(translate('es', 'a.c' as never, undefined, dictionaries)).toBe('a.c');
    expect(translate('es', 'x.y' as never, undefined, dictionaries)).toBe('x.y');
  });

  it('returns the localized text', () => {
    expect(translate('es', 'nav.install')).toBe('Instalar');
  });
});

describe('detectLocale', () => {
  it('maps browser languages', () => {
    expect(detectLocale(['pt-PT'])).toBe('pt-BR');
    expect(detectLocale(['pt'])).toBe('pt-BR');
    expect(detectLocale(['es-MX'])).toBe('es');
    expect(detectLocale(['en-GB'])).toBe('en');
  });

  it('uses the first supported language and falls back to English', () => {
    expect(detectLocale(['fr-FR', 'es-AR'])).toBe('es');
    expect(detectLocale(['de'])).toBe('en');
    expect(detectLocale([])).toBe('en');
    expect(detectLocale(undefined)).toBe('en');
  });
});

describe('parseLocale and storage', () => {
  it('parses supported locales and falls back otherwise', () => {
    for (const { code } of LOCALES) expect(parseLocale(code)).toBe(code);
    for (const value of ['fr', '', null, undefined, 42, 'PT-BR']) {
      expect(parseLocale(value)).toBe(DEFAULT_LOCALE);
    }
  });

  it('round-trips the saved choice', () => {
    const data = stubStorage();
    writeStoredLocale('es');
    expect(data.get(LOCALE_STORAGE_KEY)).toBe('es');
    expect(readStoredLocale()).toBe('es');
  });

  it('ignores a corrupted saved choice', () => {
    stubStorage({ [LOCALE_STORAGE_KEY]: 'klingon' });
    expect(readStoredLocale()).toBeNull();
  });

  it('does not throw when storage is blocked', () => {
    stubThrowingStorage();
    expect(() => writeStoredLocale('es')).not.toThrow();
    expect(readStoredLocale()).toBeNull();
    expect(resolveInitialLocale(['pt-BR'])).toBe('pt-BR');
  });

  it('prefers the saved choice over the browser language', () => {
    stubStorage({ [LOCALE_STORAGE_KEY]: 'es' });
    expect(resolveInitialLocale(['pt-BR'])).toBe('es');
  });
});

describe('npm CLI command', () => {
  it.each(LOCALES.map((l) => l.code))(
    'is not advertised in %s: the CLI is not published to npm, hooks install from the app',
    (code) => {
      const offenders = Object.entries(DICTIONARIES[code]).filter(([, value]) =>
        /npx\s+agents-office|hooks install/i.test(value),
      );
      expect(offenders).toEqual([]);
    },
  );
});
