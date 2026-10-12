import {
  Container,
  PixelIcon,
  type PixelIconName,
  PixelPanel,
  Reveal,
  type Role,
  SectionHeading,
} from '../components';
import { SECURITY_DOC_URL } from '../config';
import { type MessageKey, useI18n } from '../i18n';
import { SECTION_IDS } from './ids';

const ITEMS: {
  key: string;
  icon: PixelIconName;
  role: Role;
  title: MessageKey;
  body: MessageKey;
}[] = [
  {
    key: 'local',
    icon: 'room',
    role: 'developer',
    title: 'security.local.title',
    body: 'security.local.body',
  },
  {
    key: 'telemetry',
    icon: 'status',
    role: 'qa',
    title: 'security.telemetry.title',
    body: 'security.telemetry.body',
  },
  {
    key: 'failClosed',
    icon: 'inspect',
    role: 'tech-lead',
    title: 'security.failClosed.title',
    body: 'security.failClosed.body',
  },
  {
    key: 'passive',
    icon: 'hook',
    role: 'architect',
    title: 'security.passive.title',
    body: 'security.passive.body',
  },
  {
    key: 'safeInput',
    icon: 'terminal',
    role: 'analyst',
    title: 'security.safeInput.title',
    body: 'security.safeInput.body',
  },
  {
    key: 'isolation',
    icon: 'browser',
    role: 'support',
    title: 'security.isolation.title',
    body: 'security.isolation.body',
  },
];

export function Security() {
  const { t } = useI18n();
  return (
    <section id={SECTION_IDS.security} className="section" aria-labelledby="security-title">
      <Container>
        <Reveal>
          <SectionHeading
            id="security-title"
            eyebrow={t('security.eyebrow')}
            title={t('security.title')}
            lead={t('security.lead')}
          />
        </Reveal>
        <ul className="security-grid">
          {ITEMS.map((item, index) => (
            <li key={item.key}>
              <Reveal delay={(index % 3) * 70}>
                <PixelPanel accent={item.role} className="security-card">
                  <PixelIcon name={item.icon} accent={item.role} />
                  <h3 className="card-title">{t(item.title)}</h3>
                  <p className="card-body">{t(item.body)}</p>
                </PixelPanel>
              </Reveal>
            </li>
          ))}
        </ul>
        <Reveal>
          <p className="security-note">
            {t('security.note')}{' '}
            <a href={SECURITY_DOC_URL} target="_blank" rel="noopener noreferrer">
              {t('security.source')}
            </a>
          </p>
        </Reveal>
      </Container>
    </section>
  );
}
