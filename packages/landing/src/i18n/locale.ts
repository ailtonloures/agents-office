export type Locale = 'en' | 'pt-BR' | 'es';

export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_STORAGE_KEY = 'agents-office-landing.locale';

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

/** First browser language that maps to a supported locale (pt* -> pt-BR, es* -> es), else English. */
export function detectLocale(navigatorLanguages: readonly string[] | undefined): Locale {
  for (const language of navigatorLanguages ?? []) {
    const base = String(language).toLowerCase().split('-')[0];
    if (base === 'pt') return 'pt-BR';
    if (base === 'es') return 'es';
    if (base === 'en') return 'en';
  }
  return DEFAULT_LOCALE;
}

/** The saved choice, or null when nothing valid is stored (or storage is unavailable). */
export function readStoredLocale(): Locale | null {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    return LOCALES.find((entry) => entry.code === stored)?.code ?? null;
  } catch {
    return null;
  }
}

export function writeStoredLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Storage unavailable (private mode, blocked): the choice just is not remembered.
  }
}

/** Initial locale: a valid saved choice wins, otherwise the browser language. */
export function resolveInitialLocale(navigatorLanguages: readonly string[] | undefined): Locale {
  return readStoredLocale() ?? detectLocale(navigatorLanguages);
}
