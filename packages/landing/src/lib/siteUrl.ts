export const DEFAULT_SITE_URL = 'https://agents-office.vercel.app';

/** Cleans a configured site URL: trims it, drops trailing slashes, falls back when unusable. */
export function resolveSiteUrl(raw: string | undefined, fallback: string = DEFAULT_SITE_URL) {
  const value = raw?.trim();
  if (!value) return fallback;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return fallback;
    return url.origin + url.pathname.replace(/\/+$/, '');
  } catch {
    return fallback;
  }
}
