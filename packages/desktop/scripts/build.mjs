// Bundles the Electron main process and the preload to CommonJS (Electron loads them with require).
// `electron` and the native `node-pty` stay external; the workspace package `@agents-office/shared` (and zod) are inlined.
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
rmSync(dist, { recursive: true, force: true });

await build({
  entryPoints: {
    main: join(root, 'src/main/main.ts'),
    preload: join(root, 'src/preload/index.ts'),
  },
  outdir: dist,
  outExtension: { '.js': '.cjs' },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron', 'node-pty'],
  logLevel: 'info',
  legalComments: 'none',
});
