import {
  Container,
  PixelIcon,
  type PixelIconName,
  PixelPanel,
  Reveal,
  type Role,
  SectionHeading,
} from '../components';
import { type MessageKey, useI18n } from '../i18n';
import { SECTION_IDS } from './ids';

interface Item {
  key: string;
  icon: PixelIconName;
  role: Role;
  title: MessageKey;
  body: MessageKey;
}

const MODES: Item[] = [
  {
    key: 'passive',
    icon: 'monitor',
    role: 'qa',
    title: 'how.modes.passive.title',
    body: 'how.modes.passive.body',
  },
  {
    key: 'active',
    icon: 'cast',
    role: 'tech-lead',
    title: 'how.modes.active.title',
    body: 'how.modes.active.body',
  },
];

const METAPHOR: Item[] = [
  {
    key: 'project',
    icon: 'room',
    role: 'architect',
    title: 'how.project.title',
    body: 'how.project.body',
  },
  {
    key: 'session',
    icon: 'lead',
    role: 'tech-lead',
    title: 'how.session.title',
    body: 'how.session.body',
  },
  {
    key: 'subagent',
    icon: 'employee',
    role: 'developer',
    title: 'how.subagent.title',
    body: 'how.subagent.body',
  },
];

const DETAILS: Item[] = [
  { key: 'status', icon: 'status', role: 'qa', title: 'how.status.title', body: 'how.status.body' },
  {
    key: 'inspect',
    icon: 'inspect',
    role: 'analyst',
    title: 'how.inspect.title',
    body: 'how.inspect.body',
  },
  { key: 'hooks', icon: 'hook', role: 'support', title: 'how.hooks.title', body: 'how.hooks.body' },
];

export function HowItWorks() {
  const { t } = useI18n();
  return (
    <section id={SECTION_IDS.how} className="section" aria-labelledby="how-title">
      <Container>
        <Reveal>
          <SectionHeading
            id="how-title"
            eyebrow={t('how.eyebrow')}
            title={t('how.title')}
            lead={t('how.lead')}
          />
        </Reveal>
        <ul className="modes">
          {MODES.map((item, index) => (
            <Reveal as="li" key={item.key} className="modes__item" delay={index * 90}>
              <PixelPanel accent={item.role} className="metaphor__card">
                <PixelIcon name={item.icon} accent={item.role} className="metaphor__icon" />
                <h3 className="card-title">{t(item.title)}</h3>
                <p className="card-body">{t(item.body)}</p>
              </PixelPanel>
            </Reveal>
          ))}
        </ul>
        <ol className="metaphor">
          {METAPHOR.map((item, index) => (
            <Reveal as="li" key={item.key} className="metaphor__item" delay={index * 90}>
              <PixelPanel accent={item.role} className="metaphor__card">
                <PixelIcon name={item.icon} accent={item.role} className="metaphor__icon" />
                <h3 className="card-title">{t(item.title)}</h3>
                <p className="card-body">{t(item.body)}</p>
              </PixelPanel>
            </Reveal>
          ))}
        </ol>
        <ul className="details">
          {DETAILS.map((item, index) => (
            <Reveal as="li" key={item.key} className="details__item" delay={index * 90}>
              <PixelIcon name={item.icon} accent={item.role} className="details__icon" />
              <div>
                <h3 className="card-title card-title--small">{t(item.title)}</h3>
                <p className="card-body">{t(item.body)}</p>
              </div>
            </Reveal>
          ))}
        </ul>
      </Container>
    </section>
  );
}
