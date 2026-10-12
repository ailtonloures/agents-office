import {
  BetaBadge,
  Container,
  DesktopBadge,
  PixelIcon,
  type PixelIconName,
  PixelPanel,
  Reveal,
  type Role,
  SectionHeading,
} from '../components';
import { type MessageKey, useI18n } from '../i18n';
import { SECTION_IDS } from './ids';

interface Feature {
  key: string;
  icon: PixelIconName;
  role: Role;
  title: MessageKey;
  body: MessageKey;
  points: [MessageKey, MessageKey];
  desktop: boolean;
  beta?: boolean;
}

/** Desktop only means it needs the Electron shell (terminals, Agent Bus and what rides on it). */
const FEATURES: Feature[] = [
  {
    key: 'observability',
    icon: 'monitor',
    role: 'tech-lead',
    title: 'features.observability.title',
    body: 'features.observability.body',
    points: ['features.observability.p1', 'features.observability.p2'],
    desktop: false,
  },
  {
    key: 'terminals',
    icon: 'terminal',
    role: 'developer',
    title: 'features.terminals.title',
    body: 'features.terminals.body',
    points: ['features.terminals.p1', 'features.terminals.p2'],
    desktop: true,
  },
  {
    key: 'cast',
    icon: 'cast',
    role: 'architect',
    title: 'features.cast.title',
    body: 'features.cast.body',
    points: ['features.cast.p1', 'features.cast.p2'],
    desktop: true,
  },
  {
    key: 'bus',
    icon: 'bus',
    role: 'analyst',
    title: 'features.bus.title',
    body: 'features.bus.body',
    points: ['features.bus.p1', 'features.bus.p2'],
    desktop: true,
  },
  {
    key: 'board',
    icon: 'board',
    role: 'support',
    title: 'features.board.title',
    body: 'features.board.body',
    points: ['features.board.p1', 'features.board.p2'],
    desktop: true,
  },
  {
    key: 'browser',
    icon: 'browser',
    role: 'qa',
    title: 'features.browser.title',
    body: 'features.browser.body',
    points: ['features.browser.p1', 'features.browser.p2'],
    desktop: true,
    beta: true,
  },
];

export function Features() {
  const { t } = useI18n();
  return (
    <section id={SECTION_IDS.features} className="section" aria-labelledby="features-title">
      <Container>
        <Reveal>
          <SectionHeading
            id="features-title"
            eyebrow={t('features.eyebrow')}
            title={t('features.title')}
            lead={t('features.lead')}
          />
        </Reveal>
        <ul className="features">
          {FEATURES.map((feature, index) => (
            <Reveal as="li" key={feature.key} className="features__item" delay={(index % 3) * 90}>
              <PixelPanel accent={feature.role} className="feature-card">
                <div className="feature-card__top">
                  <PixelIcon
                    name={feature.icon}
                    accent={feature.role}
                    className="feature-card__icon"
                  />
                  <div className="feature-card__badges">
                    {feature.desktop ? <DesktopBadge label={t('features.badge.desktop')} /> : null}
                    {feature.beta ? <BetaBadge label={t('features.badge.beta')} /> : null}
                  </div>
                </div>
                <h3 className="card-title">{t(feature.title)}</h3>
                <p className="card-body">{t(feature.body)}</p>
                <ul className="feature-card__points" aria-label={t('features.points')}>
                  {feature.points.map((point) => (
                    <li key={point}>{t(point)}</li>
                  ))}
                </ul>
              </PixelPanel>
            </Reveal>
          ))}
        </ul>
      </Container>
    </section>
  );
}
