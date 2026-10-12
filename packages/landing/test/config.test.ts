import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SITE_URL,
  DOCS_URL,
  RELEASES_URL,
  REPO_URL,
  resolveSiteUrl,
  STACK,
} from '../src/config';

describe('config', () => {
  it('derives release and docs URLs from the repository', () => {
    expect(REPO_URL).toBe('https://github.com/ailtonloures/agents-office');
    expect(RELEASES_URL).toBe(`${REPO_URL}/releases/latest`);
    expect(DOCS_URL.startsWith(REPO_URL)).toBe(true);
  });

  it('cleans a configured site URL', () => {
    expect(resolveSiteUrl('https://example.com/')).toBe('https://example.com');
    expect(resolveSiteUrl('  https://example.com/app// ')).toBe('https://example.com/app');
  });

  it('falls back when the site URL is missing or unusable', () => {
    expect(resolveSiteUrl(undefined)).toBe(DEFAULT_SITE_URL);
    expect(resolveSiteUrl('')).toBe(DEFAULT_SITE_URL);
    expect(resolveSiteUrl('not a url')).toBe(DEFAULT_SITE_URL);
    expect(resolveSiteUrl('javascript:alert(1)')).toBe(DEFAULT_SITE_URL);
  });

  it('lists the stack chips', () => {
    expect(STACK).toEqual(['pnpm', 'TypeScript', 'zod', 'Phaser', 'Electron']);
  });
});
