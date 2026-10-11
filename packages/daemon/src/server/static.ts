import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

export interface StaticFile {
  body: Buffer;
  contentType: string;
}

/**
 * Resolves a request path to a file under `root` (the built web app). Unknown paths without an
 * extension fall back to `index.html` (SPA) unless `spaFallback` is false. Returns undefined when nothing can be served;
 * traversal outside `root` is never served.
 */
export async function readStaticFile(
  root: string,
  urlPath: string,
  options: { spaFallback?: boolean } = {},
): Promise<StaticFile | undefined> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0] ?? '/');
  } catch {
    return undefined;
  }
  const base = resolve(root);
  const candidate = resolve(join(base, normalize(decoded)));
  if (candidate !== base && !candidate.startsWith(base + sep)) return undefined;

  const serve = async (path: string): Promise<StaticFile> => ({
    body: await readFile(path),
    contentType: MIME_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream',
  });

  if (existsSync(candidate) && statSync(candidate).isFile()) return serve(candidate);
  if (options.spaFallback !== false && extname(decoded) === '') {
    const index = join(base, 'index.html');
    if (existsSync(index)) return serve(index);
  }
  return undefined;
}
