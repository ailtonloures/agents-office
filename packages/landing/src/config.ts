/** Site-wide constants. Everything that points outside the page lives here. */

import { DEFAULT_SITE_URL, resolveSiteUrl } from './lib/siteUrl';

export const REPO_URL = 'https://github.com/ailtonloures/agents-office';
export const RELEASES_URL = `${REPO_URL}/releases/latest`;
export const DOCS_URL = `${REPO_URL}#readme`;
export { DEFAULT_SITE_URL, resolveSiteUrl };

/** Public site URL, configurable at build time with `VITE_SITE_URL`. */
export const SITE_URL = resolveSiteUrl(import.meta.env.VITE_SITE_URL);

/** Stack chips are product names, so they are not translated. */
export const STACK = ['pnpm', 'TypeScript', 'zod', 'Phaser', 'Electron'] as const;

const BLOB = `${REPO_URL}/blob/main`;
export const DOC_LINKS = {
  readme: `${BLOB}/README.md`,
  architecture: `${BLOB}/ARCHITECTURE.md`,
  design: `${BLOB}/DESIGN.md`,
  development: `${BLOB}/DEVELOPMENT.md`,
} as const;
export const SECURITY_DOC_URL = `${DOC_LINKS.architecture}#security`;
export const ISSUES_URL = `${REPO_URL}/issues`;
export const LICENSE_URL = `${BLOB}/LICENSE`;
