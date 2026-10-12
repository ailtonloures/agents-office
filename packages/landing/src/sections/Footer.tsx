import { Container } from '../components';
import { RELEASES_URL, REPO_URL } from '../config';
import { LangSwitch, useI18n } from '../i18n';
import { SECTION_IDS } from './ids';

export function Footer() {
  const { t } = useI18n();
  const year = new Date().getFullYear();
  return (
    <footer className="footer">
      <Container className="footer__inner">
        <div className="footer__brand">
          <strong className="footer__name">Agents Office</strong>
          <p className="footer__tagline">{t('footer.tagline')}</p>
          <p className="footer__legal">
            {t('footer.license')} {t('footer.assets')}
          </p>
          <p className="footer__legal">{t('footer.copyright', { year })}</p>
        </div>
        <nav className="footer__nav" aria-label={t('footer.navLabel')}>
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
            {t('footer.github')}
          </a>
          <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer">
            {t('footer.releases')}
          </a>
          <a href={`#${SECTION_IDS.top}`}>{t('footer.backToTop')}</a>
        </nav>
        <LangSwitch labelKey="lang.footerMenuLabel" />
      </Container>
    </footer>
  );
}
