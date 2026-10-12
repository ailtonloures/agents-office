import { LOCALES, type Locale } from '../i18n/locale';

export interface LocaleMenuItem {
  code: Locale;
  short: string;
  label: string;
  current: boolean;
}

/** Menu entries from the supported languages, with the active one marked. */
export function localeMenuItems(current: Locale): LocaleMenuItem[] {
  return LOCALES.map((entry) => ({ ...entry, current: entry.code === current }));
}

/** Short code shown on the button (falls back to the raw code). */
export function localeShortLabel(current: Locale): string {
  return LOCALES.find((entry) => entry.code === current)?.short ?? current;
}

/** Choosing the language already in use only closes the menu; anything else saves and reloads. */
export function choiceNeedsReload(current: Locale, chosen: Locale): boolean {
  return chosen !== current;
}
