import { parseSkin, type Skin } from './schema';

export const EXTERNAL_SKIN_URL = '/skin/skin.json';
export const DEFAULT_SKIN_URL = '/skins/default/skin.json';

export interface LoadedSkin {
  skin: Skin;
  /** Folder URL (with trailing slash) the skin's relative paths resolve against. */
  baseUrl: string;
  source: 'external' | 'default';
  /** Set when an external skin existed but was unusable and the default was used instead. */
  warning?: string;
}

export interface SkinLoaderOptions {
  fetch?: typeof fetch;
  externalUrl?: string;
  defaultUrl?: string;
}

function folderOf(url: string): string {
  return url.slice(0, url.lastIndexOf('/') + 1);
}

type Attempt = { kind: 'ok'; skin: Skin } | { kind: 'absent' } | { kind: 'invalid'; error: string };

async function attempt(doFetch: typeof fetch, url: string): Promise<Attempt> {
  let response: Response;
  try {
    response = await doFetch(url, { cache: 'no-cache' });
  } catch {
    return { kind: 'absent' };
  }
  if (!response.ok) return { kind: 'absent' };
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return { kind: 'invalid', error: 'skin.json is not valid JSON' };
  }
  const parsed = parseSkin(json);
  return parsed.ok ? { kind: 'ok', skin: parsed.skin } : { kind: 'invalid', error: parsed.error };
}

/**
 * Resolves the skin manifest: `/skin/skin.json` (served by `--skin`) when present and valid,
 * otherwise the bundled default. An external skin that exists but is invalid yields the default
 * plus a `warning`. Throws only if the bundled default itself cannot be loaded.
 */
export async function loadSkinManifest(options: SkinLoaderOptions = {}): Promise<LoadedSkin> {
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const externalUrl = options.externalUrl ?? EXTERNAL_SKIN_URL;
  const defaultUrl = options.defaultUrl ?? DEFAULT_SKIN_URL;

  const external = await attempt(doFetch, externalUrl);
  if (external.kind === 'ok') {
    return { skin: external.skin, baseUrl: folderOf(externalUrl), source: 'external' };
  }
  const fallback = await attempt(doFetch, defaultUrl);
  if (fallback.kind !== 'ok') {
    throw new Error(
      fallback.kind === 'invalid'
        ? `default skin is invalid: ${fallback.error}`
        : `default skin not found at ${defaultUrl}`,
    );
  }
  const loaded: LoadedSkin = {
    skin: fallback.skin,
    baseUrl: folderOf(defaultUrl),
    source: 'default',
  };
  if (external.kind === 'invalid') {
    loaded.warning = `Invalid external skin (${external.error}); using the default skin.`;
  }
  return loaded;
}
