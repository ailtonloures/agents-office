import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatDateTime, getLocale, initLocale, setLocale, t } from '../src/i18n/i18n';
import { LOCALE_STORAGE_KEY } from '../src/i18n/locale';
import { en } from '../src/i18n/messages/en';
import { es } from '../src/i18n/messages/es';
import { ptBR } from '../src/i18n/messages/pt-BR';

afterEach(() => {
  setLocale('en');
  vi.unstubAllGlobals();
});

describe('active locale', () => {
  it('is English without a saved choice', () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined });
    expect(initLocale()).toBe('en');
    expect(getLocale()).toBe('en');
  });

  it('follows the saved choice', () => {
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => (key === LOCALE_STORAGE_KEY ? 'es' : null),
    });
    expect(initLocale()).toBe('es');
    expect(t('common.close')).toBe('Cerrar');
  });
});

describe('t', () => {
  it('returns the text of the active locale', () => {
    expect(t('common.close')).toBe('Close');
    setLocale('pt-BR');
    expect(t('common.close')).toBe('Fechar');
  });

  it('interpolates named placeholders', () => {
    const dictionary = en as Record<string, string>;
    dictionary['test.greeting'] = 'Hello {name}, {count} left, {name}!';
    try {
      expect(t('test.greeting' as never, { name: 'Ana', count: 3 })).toBe(
        'Hello Ana, 3 left, Ana!',
      );
      expect(t('test.greeting' as never, { name: 'Ana' })).toBe('Hello Ana, {count} left, Ana!');
    } finally {
      delete dictionary['test.greeting'];
    }
  });

  it('falls back to English when the locale lacks the key', () => {
    const dictionary = en as Record<string, string>;
    dictionary['test.onlyEnglish'] = 'Only English';
    try {
      setLocale('es');
      expect(t('test.onlyEnglish' as never)).toBe('Only English');
    } finally {
      delete dictionary['test.onlyEnglish'];
    }
  });

  it('falls back to the key itself when nobody has it', () => {
    setLocale('pt-BR');
    expect(t('nope.missing' as never)).toBe('nope.missing');
  });
});

describe('dictionary parity', () => {
  for (const [name, dictionary] of [
    ['pt-BR', ptBR],
    ['es', es],
  ] as const) {
    it(`${name} has every English key as a non-empty string`, () => {
      const translated = dictionary as Record<string, unknown>;
      for (const key of Object.keys(en)) {
        expect(typeof translated[key], `${name}:${key}`).toBe('string');
        expect((translated[key] as string).trim(), `${name}:${key}`).not.toBe('');
      }
      expect(Object.keys(dictionary).sort()).toEqual(Object.keys(en).sort());
    });
  }
});

describe('formatDateTime', () => {
  const date = new Date(2026, 0, 31, 15, 4, 5);
  const options = { dateStyle: 'short', timeStyle: 'short' } as const;

  it('formats according to the active locale', () => {
    setLocale('en');
    expect(formatDateTime(date, options)).toBe(date.toLocaleString('en', options));
    setLocale('pt-BR');
    expect(formatDateTime(date, options)).toBe(date.toLocaleString('pt-BR', options));
    expect(formatDateTime(date, options)).toContain('31/01/2026');
    setLocale('es');
    expect(formatDateTime(date, options)).toBe(date.toLocaleString('es', options));
  });
});
