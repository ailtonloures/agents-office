import type { Plugin } from 'vite';
import { loadEnv } from 'vite';
import { en } from '../src/i18n/messages/en';
import { buildHeadTags, buildRobotsTxt, buildSitemapXml } from '../src/lib/seo';
import { resolveSiteUrl } from '../src/lib/siteUrl';

const REPO_URL = 'https://github.com/ailtonloures/agents-office';
const HEAD_PLACEHOLDER = '<!--seo-head-->';

/**
 * Derives every absolute URL (canonical, Open Graph, JSON-LD, sitemap, robots) from
 * `VITE_SITE_URL` at build time, so a custom domain needs no source change.
 */
export function seoPlugin(): Plugin {
  let siteUrl = resolveSiteUrl(undefined);
  return {
    name: 'agents-office-seo',
    configResolved(config) {
      const env = loadEnv(config.mode, config.envDir || process.cwd(), 'VITE_');
      siteUrl = resolveSiteUrl(process.env.VITE_SITE_URL ?? env.VITE_SITE_URL);
    },
    transformIndexHtml(html) {
      const tags = buildHeadTags({
        siteUrl,
        title: en['meta.title'],
        description: en['meta.description'],
        repoUrl: REPO_URL,
      });
      return html.replace(HEAD_PLACEHOLDER, tags);
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: buildRobotsTxt(siteUrl) });
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: buildSitemapXml(siteUrl, new Date().toISOString().slice(0, 10)),
      });
    },
  };
}
