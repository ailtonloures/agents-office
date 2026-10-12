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
