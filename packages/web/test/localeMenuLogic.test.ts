import { describe, expect, it } from 'vitest';
import { LOCALES } from '../src/i18n/locale';
import { choiceNeedsReload, localeMenuItems, localeShortLabel } from '../src/ui/localeMenuLogic';

describe('localeMenuLogic', () => {
  it('lists every supported locale', () => {
    expect(localeMenuItems('en').map((item) => item.code)).toEqual(LOCALES.map((l) => l.code));
  });

  it('marks only the current locale', () => {
    const items = localeMenuItems('pt-BR');
    expect(items.filter((item) => item.current).map((item) => item.code)).toEqual(['pt-BR']);
  });

  it('shows the short code of the current locale', () => {
    expect(localeShortLabel('en')).toBe('EN');
    expect(localeShortLabel('pt-BR')).toBe('PT');
    expect(localeShortLabel('es')).toBe('ES');
  });

  it('only reloads when the choice differs from the current locale', () => {
    expect(choiceNeedsReload('en', 'en')).toBe(false);
    expect(choiceNeedsReload('en', 'es')).toBe(true);
  });
});
