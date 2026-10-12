import type { Locale } from './locale';
import { en, type MessageKey, type Messages } from './messages/en';
import { es } from './messages/es';
import { ptBR } from './messages/pt-BR';

export type MessageParams = Record<string, string | number>;

export const DICTIONARIES: Record<Locale, Messages> = { en, 'pt-BR': ptBR, es };

function interpolate(text: string, params?: MessageParams): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : match,
  );
}

/**
 * Text for `key` in `locale`, with `{name}` placeholders filled from `params`.
 * Falls back to English, then to the key itself, so a gap never renders as empty.
 */
export function translate(
  locale: Locale,
  key: MessageKey,
  params?: MessageParams,
  dictionaries: Record<string, Partial<Record<string, string>>> = DICTIONARIES,
): string {
  const text = dictionaries[locale]?.[key] || dictionaries.en?.[key] || key;
  return interpolate(text, params);
}
