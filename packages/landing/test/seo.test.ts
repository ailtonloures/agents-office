import { describe, expect, it } from 'vitest';
import {
  absoluteUrl,
  buildHeadTags,
  buildJsonLd,
  buildRobotsTxt,
  buildSitemapXml,
  serializeJsonLd,
} from '../src/lib/seo';

const input = {
  siteUrl: 'https://example.com/landing',
  title: 'Agents "Office" <x>',
  description: 'A & B',
  repoUrl: 'https://github.com/o/r',
};

describe('seo', () => {
  it('builds absolute urls from the site url', () => {
    expect(absoluteUrl('https://example.com', '')).toBe('https://example.com/');
    expect(absoluteUrl('https://example.com/a', '/og.png')).toBe('https://example.com/a/og.png');
  });

  it('derives canonical and social urls from the site url and escapes attributes', () => {
    const html = buildHeadTags(input);
    expect(html).toContain('<link rel="canonical" href="https://example.com/landing/" />');
    expect(html).toContain('content="https://example.com/landing/og.png"');
    expect(html).toContain('twitter:card" content="summary_large_image"');
    expect(html).toContain('content="Agents &quot;Office&quot; &lt;x&gt;"');
    expect(html).toContain('content="A &amp; B"');
    expect(html).not.toContain('agents-office.vercel.app');
  });

  it('describes a free MIT application for Linux and macOS only', () => {
    const ld = buildJsonLd(input);
    expect(ld['@type']).toBe('SoftwareApplication');
    expect(ld.operatingSystem).toBe('Linux, macOS');
    expect(ld.operatingSystem).not.toMatch(/windows/i);
    expect(ld.offers.price).toBe('0');
    expect(ld.license).toContain('MIT');
    expect(ld.url).toBe('https://example.com/landing/');
  });

  it('emits JSON-LD that parses and cannot close its script tag', () => {
    const out = serializeJsonLd({ a: '</script><b>' });
    expect(out).not.toContain('</script>');
    expect(JSON.parse(out)).toEqual({ a: '</script><b>' });
    const tag = buildHeadTags(input).match(/ld\+json">(.*)<\/script>/)?.[1] ?? '';
    expect(JSON.parse(tag)['@context']).toBe('https://schema.org');
  });

  it('builds robots.txt and sitemap.xml for the site url', () => {
    expect(buildRobotsTxt('https://example.com')).toContain(
      'Sitemap: https://example.com/sitemap.xml',
    );
    const xml = buildSitemapXml('https://example.com', '2026-10-12');
    expect(xml).toContain('<loc>https://example.com/</loc>');
    expect(xml).toContain('<lastmod>2026-10-12</lastmod>');
  });
});
