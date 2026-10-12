import {
  Container,
  PixelIcon,
  type PixelIconName,
  PixelPanel,
  Reveal,
  SectionHeading,
} from '../components';
import { STACK } from '../config';
import { type MessageKey, useI18n } from '../i18n';
import { SECTION_IDS } from './ids';

const STEPS: { key: string; icon: PixelIconName; title: MessageKey; desc: MessageKey }[] = [
  { key: 'claude', icon: 'lead', title: 'arch.step.claude', desc: 'arch.step.claude.desc' },
  { key: 'sources', icon: 'hook', title: 'arch.step.sources', desc: 'arch.step.sources.desc' },
  { key: 'daemon', icon: 'bus', title: 'arch.step.daemon', desc: 'arch.step.daemon.desc' },
  { key: 'socket', icon: 'status', title: 'arch.step.socket', desc: 'arch.step.socket.desc' },
  { key: 'client', icon: 'monitor', title: 'arch.step.client', desc: 'arch.step.client.desc' },
];

const DESKTOP: { key: string; icon: PixelIconName; label: MessageKey }[] = [
  { key: 'pty', icon: 'terminal', label: 'arch.desktop.pty' },
  { key: 'bus', icon: 'cast', label: 'arch.desktop.bus' },
  { key: 'updater', icon: 'inspect', label: 'arch.desktop.updater' },
];

/** Pixel arrow between two pipeline steps (points right, or down on narrow screens). */
function Arrow() {
  return (
    <svg
      className="pipeline__arrow"
      viewBox="0 0 8 8"
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M0 3h5V1h1v1h1v1h1v2H7v1H6v1H5V5H0z" fill="currentColor" />
    </svg>
  );
}

export function Architecture() {
  const { t } = useI18n();
  return (
    <section id={SECTION_IDS.architecture} className="section" aria-labelledby="arch-title">
      <Container>
        <Reveal>
          <SectionHeading
            id="arch-title"
            eyebrow={t('arch.eyebrow')}
            title={t('arch.title')}
            lead={t('arch.lead')}
          />
        </Reveal>
        <Reveal>
          <ol className="pipeline" aria-label={t('arch.diagramLabel')}>
            {STEPS.map((step, index) => (
              <li key={step.key} className="pipeline__step">
                {index > 0 ? <Arrow /> : null}
                <div className="pipeline__box">
                  <PixelIcon name={step.icon} className="pipeline__icon" />
                  <strong className="pipeline__title">{t(step.title)}</strong>
                  <span className="pipeline__desc">{t(step.desc)}</span>
                </div>
              </li>
            ))}
          </ol>
        </Reveal>
        <div className="arch-grid">
          <Reveal>
            <PixelPanel accent="developer" className="arch-card">
              <h3 className="card-title">{t('arch.desktop.title')}</h3>
              <p className="card-body">{t('arch.desktop.body')}</p>
              <ul className="arch-card__tags">
                {DESKTOP.map((item) => (
                  <li key={item.key}>
                    <PixelIcon name={item.icon} accent="developer" className="arch-card__icon" />
                    {t(item.label)}
                  </li>
                ))}
              </ul>
            </PixelPanel>
          </Reveal>
          <Reveal delay={90}>
            <PixelPanel accent="architect" className="arch-card">
              <h3 className="card-title">{t('arch.stack.title')}</h3>
              <p className="card-body">{t('arch.stack.body')}</p>
              <ul className="chips">
                {STACK.map((name) => (
                  <li key={name} className="chip">
                    {name}
                  </li>
                ))}
              </ul>
              <h3 className="card-title card-title--small arch-card__sub">
                {t('arch.reduce.title')}
              </h3>
              <p className="card-body">{t('arch.reduce.body')}</p>
            </PixelPanel>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
