import { I18nProvider, useI18n } from './i18n';
import {
  Architecture,
  Features,
  Footer,
  Hero,
  HowItWorks,
  Install,
  Nav,
  OpenSource,
  Security,
} from './sections';

function Page() {
  const { t } = useI18n();
  return (
    <>
      <a className="skip-link" href="#main">
        {t('a11y.skipToContent')}
      </a>
      <Nav />
      <main id="main">
        <Hero />
        <HowItWorks />
        <Features />
        <Architecture />
        <Security />
        <Install />
        <OpenSource />
      </main>
      <Footer />
    </>
  );
}

export function App() {
  return (
    <I18nProvider>
      <Page />
    </I18nProvider>
  );
}
