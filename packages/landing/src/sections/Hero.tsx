import { Container, PixelButton, PixelOffice, Reveal, SectionHeading } from '../components';
import { DOCS_URL, RELEASES_URL, REPO_URL } from '../config';
import { useI18n } from '../i18n';
import { SECTION_IDS } from './ids';

export function Hero() {
  const { t } = useI18n();
  return (
    <section id={SECTION_IDS.top} className="hero" aria-labelledby="hero-title">
      <Container>
        <Reveal eager>
          <SectionHeading
            id="hero-title"
            level={1}
            align="center"
            eyebrow={t('hero.eyebrow')}
            title={t('hero.title')}
            lead={t('hero.lead')}
          />
          <div className="hero__ctas">
            <PixelButton
              variant="primary"
              href={RELEASES_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('hero.ctaDownload')}
            </PixelButton>
            <PixelButton href={REPO_URL} target="_blank" rel="noopener noreferrer">
              {t('hero.ctaStar')}
            </PixelButton>
            <PixelButton href={DOCS_URL} target="_blank" rel="noopener noreferrer">
              {t('hero.docs')}
            </PixelButton>
          </div>
          <p className="hero__note">
            {t('hero.note')} {t('hero.platforms')}
          </p>
        </Reveal>
        <Reveal eager className="hero__scene">
          <PixelOffice />
        </Reveal>
      </Container>
    </section>
  );
}
