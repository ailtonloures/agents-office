/** Pure SEO helpers shared by the Vite plugin (build time) and the tests. No DOM, no clock. */

export interface SeoInput {
  siteUrl: string;
  title: string;
  description: string;
  repoUrl: string;
}

const escapeAttr = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Absolute URL of a site-relative path. */
export function absoluteUrl(siteUrl: string, path: string): string {
  return `${siteUrl}/${path.replace(/^\/+/, '')}`;
}

/** schema.org SoftwareApplication data (free, MIT, Linux and macOS only). */
export function buildJsonLd({ siteUrl, description, repoUrl }: SeoInput) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Agents Office',
    description,
    url: absoluteUrl(siteUrl, ''),
    image: absoluteUrl(siteUrl, 'og.png'),
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Linux, macOS',
    license: 'https://opensource.org/licenses/MIT',
    isAccessibleForFree: true,
    codeRepository: repoUrl,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  };
}

/** Escapes `<` so the JSON can never close its own `<script>` element. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

/** Head tags that depend on the site URL and copy: canonical, social cards and JSON-LD. */
export function buildHeadTags(input: SeoInput): string {
  const { siteUrl, title, description } = input;
  const page = absoluteUrl(siteUrl, '');
  const image = absoluteUrl(siteUrl, 'og.png');
  const t = escapeAttr(title);
  const d = escapeAttr(description);
  const lines = [
    `<meta name="description" content="${d}" />`,
    `<link rel="canonical" href="${escapeAttr(page)}" />`,
    '<meta property="og:type" content="website" />',
    '<meta property="og:site_name" content="Agents Office" />',
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:url" content="${escapeAttr(page)}" />`,
    `<meta property="og:image" content="${escapeAttr(image)}" />`,
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    '<meta property="og:image:alt" content="Pixel art office with Claude Code agents at their desks" />',
    '<meta property="og:locale" content="en_US" />',
    '<meta property="og:locale:alternate" content="pt_BR" />',
    '<meta property="og:locale:alternate" content="es_ES" />',
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
    `<meta name="twitter:image" content="${escapeAttr(image)}" />`,
    `<script type="application/ld+json">${serializeJsonLd(buildJsonLd(input))}</script>`,
  ];
  return lines.join('\n    ');
}

export function buildRobotsTxt(siteUrl: string): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${absoluteUrl(siteUrl, 'sitemap.xml')}\n`;
}

export function buildSitemapXml(siteUrl: string, lastmod: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${absoluteUrl(siteUrl, '')}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`;
}
