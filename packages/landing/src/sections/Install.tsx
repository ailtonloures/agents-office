import { type KeyboardEvent, useRef, useState } from 'react';
import {
  CommandSnippet,
  Container,
  PixelButton,
  PixelPanel,
  Reveal,
  SectionHeading,
} from '../components';
import { RELEASES_URL } from '../config';
import { type MessageKey, useI18n } from '../i18n';
import { nextTabIndex } from '../lib/tabsLogic';
import { SECTION_IDS } from './ids';

type TabKey = 'linux' | 'macos' | 'cli' | 'windows';

const TABS: { key: TabKey; label: MessageKey }[] = [
  { key: 'linux', label: 'install.linux.title' },
  { key: 'macos', label: 'install.macos.title' },
  { key: 'cli', label: 'install.cli.title' },
  { key: 'windows', label: 'install.windows.title' },
];

function Download() {
  const { t } = useI18n();
  return (
    <div className="install__actions">
      <PixelButton variant="primary" href={RELEASES_URL} target="_blank" rel="noopener noreferrer">
        {t('install.download')}
      </PixelButton>
    </div>
  );
}

function Panel({ tab }: { tab: TabKey }) {
  const { t } = useI18n();
  switch (tab) {
    case 'linux':
      return (
        <>
          <p className="card-body">{t('install.linux.body')}</p>
          <div className="install__commands">
            <CommandSnippet
              command={t('install.linux.chmod')}
              label={t('install.linux.chmodLabel')}
            />
            <CommandSnippet command={t('install.linux.run')} label={t('install.linux.runLabel')} />
          </div>
          <p className="card-body">{t('install.linux.deb')}</p>
          <Download />
        </>
      );
    case 'macos':
      return (
        <>
          <p className="card-body">{t('install.macos.body')}</p>
          <p className="card-body">{t('install.macos.note')}</p>
          <div className="install__commands">
            <CommandSnippet
              command={t('install.macos.command')}
              label={t('install.macos.commandLabel')}
            />
          </div>
          <Download />
        </>
      );
    case 'cli':
      return (
        <>
          <p className="card-body">{t('install.cli.body')}</p>
          <div className="install__commands">
            <CommandSnippet
              command={t('install.hooks.command')}
              label={t('install.hooks.commandLabel')}
            />
          </div>
          <p className="card-body">{t('install.cli.note')}</p>
        </>
      );
    case 'windows':
      return (
        <>
          <p className="install__unavailable">{t('install.unavailable')}</p>
          <p className="card-body">{t('install.windows.body')}</p>
        </>
      );
  }
}

/** Install options as a WAI-ARIA tabs widget (automatic activation, roving tabindex). */
export function Install() {
  const { t } = useI18n();
  const [active, setActive] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = nextTabIndex(active, TABS.length, event.key);
    if (next === null) return;
    event.preventDefault();
    setActive(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <section id={SECTION_IDS.install} className="section" aria-labelledby="install-title">
      <Container>
        <Reveal>
          <SectionHeading
            id="install-title"
            eyebrow={t('install.eyebrow')}
            title={t('install.title')}
            lead={t('install.lead')}
          />
        </Reveal>
        <Reveal>
          <PixelPanel accent="developer" className="install">
            <div
              className="tabs__list"
              role="tablist"
              aria-label={t('install.tabsLabel')}
              onKeyDown={onKeyDown}
            >
              {TABS.map((tab, index) => (
                <button
                  key={tab.key}
                  ref={(node) => {
                    tabRefs.current[index] = node;
                  }}
                  type="button"
                  role="tab"
                  id={`install-tab-${tab.key}`}
                  className="tabs__tab"
                  aria-selected={index === active}
                  aria-controls={`install-panel-${tab.key}`}
                  tabIndex={index === active ? 0 : -1}
                  onClick={() => setActive(index)}
                >
                  {t(tab.label)}
                </button>
              ))}
            </div>
            {TABS.map((tab, index) => (
              <div
                key={tab.key}
                role="tabpanel"
                id={`install-panel-${tab.key}`}
                className="tabs__panel"
                aria-labelledby={`install-tab-${tab.key}`}
                hidden={index !== active}
              >
                {index === active ? <Panel tab={tab.key} /> : null}
              </div>
            ))}
          </PixelPanel>
        </Reveal>
      </Container>
    </section>
  );
}
