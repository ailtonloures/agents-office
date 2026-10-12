import { DEFAULT_LOCALE, type Locale, readStoredLocale } from './locale';
import { en, type MessageKey, type Messages } from './messages/en';
import { es } from './messages/es';
import { ptBR } from './messages/pt-BR';

export type { MessageKey, Messages };

const DICTIONARIES: Record<Locale, Messages> = { en, 'pt-BR': ptBR, es };

export type MessageParams = Record<string, string | number>;

let active: Locale = DEFAULT_LOCALE;

/** Reads the stored choice and makes it the active locale. Call once, before mounting any UI. */
export function initLocale(): Locale {
  active = readStoredLocale();
  return active;
}

export function getLocale(): Locale {
  return active;
}

/** Sets the active locale in memory only (persisting is `writeStoredLocale`); used by tests. */
export function setLocale(locale: Locale): void {
  active = locale;
}

function interpolate(text: string, params?: MessageParams): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : match,
  );
}

/**
 * Text for `key` in the active locale, with `{name}` placeholders filled from `params`.
 * Falls back to English, then to the key itself, so a gap never renders as empty.
 */
export function t(key: MessageKey, params?: MessageParams): string {
  const dictionaries: Record<string, string | undefined> = DICTIONARIES[active];
  const text = dictionaries[key] || (en as Record<string, string>)[key] || key;
  return interpolate(text, params);
}

/** Date and time in the active locale. */
export function formatDateTime(date: Date, options?: Intl.DateTimeFormatOptions): string {
  return date.toLocaleString(getLocale(), options);
}
