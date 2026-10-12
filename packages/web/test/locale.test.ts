import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  LOCALES,
  parseLocale,
  readStoredLocale,
  writeStoredLocale,
} from '../src/i18n/locale';

function stubStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  });
  return data;
}

afterEach(() => vi.unstubAllGlobals());

describe('parseLocale', () => {
  it('accepts the supported locales', () => {
    for (const { code } of LOCALES) expect(parseLocale(code)).toBe(code);
  });

  it('falls back to English for anything else', () => {
    expect(DEFAULT_LOCALE).toBe('en');
    for (const value of ['fr', '', null, undefined, 42, 'PT-BR', {}]) {
      expect(parseLocale(value)).toBe('en');
    }
  });
});

describe('stored locale', () => {
  it('defaults to English without a saved choice', () => {
    stubStorage();
    expect(readStoredLocale()).toBe('en');
  });

  it('reads a valid saved choice', () => {
    stubStorage({ [LOCALE_STORAGE_KEY]: 'pt-BR' });
    expect(readStoredLocale()).toBe('pt-BR');
  });

  it('ignores a corrupted saved choice', () => {
    stubStorage({ [LOCALE_STORAGE_KEY]: 'klingon' });
    expect(readStoredLocale()).toBe('en');
  });

  it('does not throw when storage is blocked', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    vi.stubGlobal('localStorage', blocked);
    expect(readStoredLocale()).toBe('en');
    expect(() => writeStoredLocale('es')).not.toThrow();
  });

  it('persists the written choice', () => {
    const data = stubStorage();
    writeStoredLocale('es');
    expect(data.get(LOCALE_STORAGE_KEY)).toBe('es');
    expect(readStoredLocale()).toBe('es');
  });
});
