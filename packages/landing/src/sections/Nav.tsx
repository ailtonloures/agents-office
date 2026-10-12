import { useEffect, useState } from 'react';
import { Container } from '../components';
import { REPO_URL } from '../config';
import { LangSwitch, type MessageKey, useI18n } from '../i18n';
import { SECTION_IDS, type SectionKey } from './ids';

const NAV_ITEMS: { section: SectionKey; label: MessageKey }[] = [
  { section: 'how', label: 'nav.how' },
  { section: 'features', label: 'nav.features' },
  { section: 'architecture', label: 'nav.architecture' },
  { section: 'security', label: 'nav.security' },
  { section: 'install', label: 'nav.install' },
];

/** Sticky top bar with section anchors, language switch and GitHub link; a menu on phones. */
export function Nav() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const close = () => setOpen(false);

  return (
    <header className="nav">
      <Container className="nav__inner">
        <a
          className="nav__brand"
          href={`#${SECTION_IDS.top}`}
          aria-label={t('nav.home')}
          onClick={close}
        >
          <span className="nav__logo" aria-hidden="true" />
          Agents Office
        </a>
        <button
          type="button"
          className="nav__toggle"
          aria-expanded={open}
          aria-controls="site-nav"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? t('nav.menuClose') : t('nav.menuOpen')}
        </button>
        <nav
          id="site-nav"
          className={`nav__menu${open ? ' nav__menu--open' : ''}`}
          aria-label={t('a11y.mainNav')}
        >
          <ul className="nav__links">
            {NAV_ITEMS.map((item) => (
              <li key={item.section}>
                <a href={`#${SECTION_IDS[item.section]}`} onClick={close}>
                  {t(item.label)}
                </a>
              </li>
            ))}
            <li>
              <a href={REPO_URL} target="_blank" rel="noopener noreferrer" onClick={close}>
                {t('nav.github')}
              </a>
            </li>
          </ul>
          <LangSwitch />
        </nav>
      </Container>
    </header>
  );
}
