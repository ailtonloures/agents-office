import { Container, PixelButton, PixelPanel, Reveal, SectionHeading } from '../components';
import { DOC_LINKS, ISSUES_URL, LICENSE_URL, REPO_URL } from '../config';
import { type MessageKey, useI18n } from '../i18n';
import { SECTION_IDS } from './ids';

const DOCS: { key: keyof typeof DOC_LINKS; label: MessageKey }[] = [
  { key: 'readme', label: 'oss.docs.readme' },
  { key: 'architecture', label: 'oss.docs.architecture' },
  { key: 'design', label: 'oss.docs.design' },
  { key: 'development', label: 'oss.docs.development' },
];

const EXTERNAL = { target: '_blank', rel: 'noopener noreferrer' } as const;

export function OpenSource() {
  const { t } = useI18n();
  return (
    <section id={SECTION_IDS.oss} className="section" aria-labelledby="oss-title">
      <Container>
        <Reveal>
          <SectionHeading
            id="oss-title"
            eyebrow={t('oss.eyebrow')}
            title={t('oss.title')}
            lead={t('oss.lead')}
          />
        </Reveal>
        <div className="oss-grid">
          <Reveal>
            <PixelPanel accent="qa" className="oss-card">
              <h3 className="card-title">{t('oss.license')}</h3>
              <p className="card-body">{t('oss.licenseBody')}</p>
              <p className="oss-card__links">
                <a href={LICENSE_URL} {...EXTERNAL}>
                  {t('oss.license')}
                </a>
              </p>
            </PixelPanel>
          </Reveal>
          <Reveal delay={70}>
            <PixelPanel accent="architect" className="oss-card">
              <h3 className="card-title">{t('oss.docs')}</h3>
              <p className="card-body">{t('oss.docsBody')}</p>
              <ul className="oss-card__links">
                {DOCS.map((doc) => (
                  <li key={doc.key}>
                    <a href={DOC_LINKS[doc.key]} {...EXTERNAL}>
                      {t(doc.label)}
                    </a>
                  </li>
                ))}
              </ul>
            </PixelPanel>
          </Reveal>
          <Reveal delay={140}>
            <PixelPanel accent="developer" className="oss-card">
              <h3 className="card-title">{t('oss.contribute')}</h3>
              <p className="card-body">{t('oss.contributeBody')}</p>
              <p className="oss-card__links">
                <a href={DOC_LINKS.development} {...EXTERNAL}>
                  {t('oss.docs.development')}
                </a>
                {' · '}
                <a href={ISSUES_URL} {...EXTERNAL}>
                  {t('oss.issues')}
                </a>
              </p>
            </PixelPanel>
          </Reveal>
        </div>
        <Reveal>
          <div className="oss-cta">
            <PixelButton variant="primary" href={REPO_URL} {...EXTERNAL}>
              {t('oss.star')}
            </PixelButton>
            <PixelButton href={REPO_URL} {...EXTERNAL}>
              {t('oss.repo')}
            </PixelButton>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
