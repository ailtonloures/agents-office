export type Locale = 'en' | 'pt-BR' | 'es';

export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_STORAGE_KEY = 'agents-office.locale';

/** Supported languages; `label` is the native name shown in the language menu. */
export const LOCALES: readonly { code: Locale; short: string; label: string }[] = [
  { code: 'en', short: 'EN', label: 'English' },
  { code: 'pt-BR', short: 'PT', label: 'Português' },
  { code: 'es', short: 'ES', label: 'Español' },
];

/** Any stored or received value to a supported locale; invalid input falls back to the default. */
export function parseLocale(value: unknown): Locale {
  return LOCALES.find((entry) => entry.code === value)?.code ?? DEFAULT_LOCALE;
}

export function readStoredLocale(): Locale {
  try {
    return parseLocale(localStorage.getItem(LOCALE_STORAGE_KEY));
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function writeStoredLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Storage unavailable (private mode, blocked): the choice just is not remembered.
  }
}
