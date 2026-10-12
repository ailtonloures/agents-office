import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, join, relative } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const daemonPort = process.env.AGENTS_OFFICE_PORT ?? '4777';
const daemon = `127.0.0.1:${daemonPort}`;

const ASSET_BASE = '/excalidraw-assets/';

/** Folders of the Excalidraw fonts that are not shipped: Xiaolai is a 13 MB CJK fallback. */
const SKIPPED_FONT_DIRS = new Set(['Xiaolai']);

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

/**
 * Serves (dev) and emits (build) the Excalidraw fonts under /excalidraw-assets/fonts/, so the
 * whiteboard works offline instead of fetching its fonts from a CDN (spec 077).
 */
function excalidrawAssets(): Plugin {
  const fontsDir = (): string => {
    // The package does not export package.json: resolve the entry and locate dist/prod.
    const entry = createRequire(import.meta.url).resolve('@excalidraw/excalidraw');
    return join(dirname(entry), 'fonts');
  };
  const fontFiles = (): string[] => {
    const dir = fontsDir();
    if (!existsSync(dir)) return [];
    return listFiles(dir).filter((file) => {
      const family = relative(dir, file).split(/[\\/]/)[0] ?? '';
      return !SKIPPED_FONT_DIRS.has(family);
    });
  };
  return {
    name: 'excalidraw-assets',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = (request.url ?? '').split('?')[0] ?? '';
        if (!url.startsWith(`${ASSET_BASE}fonts/`)) return next();
        const relativePath = decodeURIComponent(url.slice(`${ASSET_BASE}fonts/`.length));
        const file = join(fontsDir(), relativePath);
        if (relativePath.includes('..') || !existsSync(file) || !statSync(file).isFile()) {
          return next();
        }
        response.setHeader('Content-Type', extname(file) === '.woff2' ? 'font/woff2' : 'font/ttf');
        response.end(readFileSync(file));
      });
    },
    generateBundle() {
      const dir = fontsDir();
      for (const file of fontFiles()) {
        this.emitFile({
          type: 'asset',
          fileName: `${ASSET_BASE.slice(1)}fonts/${relative(dir, file).split('\\').join('/')}`,
          source: readFileSync(file),
        });
      }
    },
  };
}

export default defineConfig({
  plugins: [excalidrawAssets()],
  build: {
    outDir: 'dist',
    // Phaser alone is ~1 MB minified; it gets its own chunk. The Excalidraw chunk (lazy, only
    // loaded when a board is opened) is larger still.
    chunkSizeWarningLimit: 1500,
    rollupOptions: { output: { manualChunks: { phaser: ['phaser'] } } },
  },
  server: {
    proxy: {
      '/stream': { target: `ws://${daemon}`, ws: true },
      '/health': `http://${daemon}`,
      '^/skin/': `http://${daemon}`,
    },
  },
});
