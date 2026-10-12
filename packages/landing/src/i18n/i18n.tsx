import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { applyDocumentMeta } from './documentMeta';
import { LOCALES, type Locale, resolveInitialLocale, writeStoredLocale } from './locale';
import type { MessageKey } from './messages/en';
import { type MessageParams, translate } from './translate';

export type { MessageKey, MessageParams };

export interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, params?: MessageParams) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export interface I18nProviderProps {
  children: ReactNode;
  /** Forces the starting locale (tests, previews); otherwise saved choice, then browser language. */
  initialLocale?: Locale;
}

export function I18nProvider({ children, initialLocale }: I18nProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(
    () =>
      initialLocale ??
      resolveInitialLocale(typeof navigator === 'undefined' ? undefined : navigator.languages),
  );

  useEffect(() => {
    document.documentElement.lang = locale;
    applyDocumentMeta({
      title: translate(locale, 'meta.title'),
      description: translate(locale, 'meta.description'),
    });
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    writeStoredLocale(next);
  }, []);

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      setLocale,
      t: (key, params) => translate(locale, key, params),
    }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside <I18nProvider>');
  return value;
}

/** Language picker: a native `<select>` (keyboard and screen reader friendly) with native names. */
export function LangSwitch({
  className,
  labelKey = 'lang.menuLabel',
}: {
  className?: string;
  /** Accessible name; the footer copy uses its own so the two controls are told apart. */
  labelKey?: MessageKey;
}) {
  const { locale, setLocale, t } = useI18n();
  return (
    <label className={['lang-switch', className ?? ''].filter(Boolean).join(' ')}>
      <span className="lang-switch__label">{t('lang.label')}</span>
      <select
        className="lang-switch__select"
        value={locale}
        aria-label={t(labelKey)}
        onChange={(event) => setLocale(event.target.value as Locale)}
      >
        {LOCALES.map((entry) => (
          <option key={entry.code} value={entry.code}>
            {entry.short} - {entry.label}
          </option>
        ))}
      </select>
    </label>
  );
}
