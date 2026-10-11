// Builds the publishable package: the daemon CLI and the hook fast path are bundled to plain
// JavaScript (workspace code and zod inlined; fastify, chokidar, ws and open stay dependencies),
// and the web app plus the default skin are copied next to them.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(root, '..', '..');
const dist = join(root, 'dist');
const webDist = join(repo, 'packages', 'web', 'dist');

if (!existsSync(join(webDist, 'index.html'))) {
  console.error(
    'packages/web/dist is missing: run `pnpm --filter @agents-office/web build` first.',
  );
  process.exit(1);
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const common = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  logLevel: 'info',
  legalComments: 'none',
};

await build({
  ...common,
  entryPoints: { cli: join(repo, 'packages/daemon/src/cli/index.ts') },
  outdir: dist,
  outExtension: { '.js': '.mjs' },
  // Runtime dependencies of the published package (see package.json).
  external: ['fastify', '@fastify/websocket', 'chokidar', 'open'],
  // Some bundled CommonJS-style code may call require().
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
});

await build({
  ...common,
  entryPoints: { hook: join(repo, 'packages/daemon/src/cli/hook.ts') },
  outdir: dist,
  outExtension: { '.js': '.mjs' },
});

cpSync(webDist, join(dist, 'web'), { recursive: true });
for (const file of ['LICENSE', 'README.md']) {
  const source = join(repo, file);
  if (existsSync(source)) cpSync(source, join(root, file));
}
console.log('agents-office package built in', dist);
