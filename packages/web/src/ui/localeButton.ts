import { getLocale, t } from '../i18n/i18n';
import { type Locale, writeStoredLocale } from '../i18n/locale';
import { BUTTON_CSS } from './buttonStyles';
import { getCornerBar } from './cornerBar';
import { choiceNeedsReload, localeMenuItems, localeShortLabel } from './localeMenuLogic';

const CSS = `
.ao-locale{position:relative;display:flex}
.ao-locale-btn{padding:4px 8px}
.ao-locale-menu{position:absolute;left:0;bottom:calc(100% + 8px);z-index:30;display:flex;
  flex-direction:column;gap:6px;padding:6px;background:#1b1d2e;border:2px solid #f0c040}
.ao-locale-menu[hidden]{display:none}
.ao-locale-item{padding:4px 10px;text-align:left;white-space:nowrap}
.ao-locale-item[aria-checked="true"]{background:#4a4320}
${BUTTON_CSS}`;

export interface LocaleButtonOptions {
  /** The menu takes the keyboard while open (Phaser must not read keys). */
  onKeyboardCapture?: (captured: boolean) => void;
  /** Reloads the page; injectable for tests. */
  reload?: () => void;
}

/** The language button (last item of the corner bar) and its EN/PT/ES menu. */
export function mountLocaleButton(
  gameParent: HTMLElement,
  options: LocaleButtonOptions = {},
): { close: () => void } {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);

  const current = getLocale();
  const wrap = document.createElement('div');
  wrap.className = 'ao-locale';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ao-locale-btn';
  button.dataset.testid = 'locale-open';
  button.textContent = localeShortLabel(current);
  button.title = t('locale.title');
  button.setAttribute('aria-label', t('locale.title'));
  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-expanded', 'false');

  const menu = document.createElement('div');
  menu.className = 'ao-locale-menu';
  menu.dataset.testid = 'locale-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', t('locale.menuLabel'));
  menu.hidden = true;

  const items: HTMLButtonElement[] = [];
  for (const entry of localeMenuItems(current)) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'ao-locale-item';
    item.dataset.testid = `locale-option-${entry.code}`;
    item.textContent = entry.label;
    item.lang = entry.code;
    item.setAttribute('role', 'menuitemradio');
    item.setAttribute('aria-checked', String(entry.current));
    item.tabIndex = -1;
    item.addEventListener('click', () => choose(entry.code));
    items.push(item);
    menu.append(item);
  }
  wrap.append(button, menu);
  getCornerBar(gameParent).append(wrap);

  // Keep clicks away from the canvas (a click on the canvas selects or dismisses characters).
  for (const type of ['pointerdown', 'mousedown'])
    wrap.addEventListener(type, (event) => event.stopPropagation());

  const isOpen = () => !menu.hidden;

  function open(): void {
    menu.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    options.onKeyboardCapture?.(true);
    (items.find((item) => item.getAttribute('aria-checked') === 'true') ?? items[0])?.focus();
  }

  function close(restoreFocus = false): void {
    if (!isOpen()) return;
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    options.onKeyboardCapture?.(false);
    if (restoreFocus) button.focus();
  }

  function choose(code: Locale): void {
    if (!choiceNeedsReload(getLocale(), code)) {
      close(true);
      return;
    }
    writeStoredLocale(code);
    (options.reload ?? (() => location.reload()))();
  }

  button.addEventListener('click', () => (isOpen() ? close() : open()));
  menu.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      items[(index + step + items.length) % items.length]?.focus();
    }
  });
  document.addEventListener('pointerdown', (event) => {
    if (isOpen() && !wrap.contains(event.target as Node)) close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen()) close(true);
  });

  return { close };
}
