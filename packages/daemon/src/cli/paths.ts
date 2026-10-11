import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Resolves a file or directory that lives at a different relative location in the monorepo
 * (this file is `packages/daemon/src/cli/*.ts`) and in the packed `agents-office` package (the
 * bundle is `dist/cli.mjs`). The first candidate that exists wins; the first one is the fallback.
 */
export function resolveAsset(candidates: readonly string[], base = import.meta.url): string {
  const paths = candidates.map((candidate) => fileURLToPath(new URL(candidate, base)));
  return paths.find((path) => existsSync(path)) ?? (paths[0] as string);
}

/** The `bin/agents-office.mjs` that hooks must invoke (absolute, next to this install). */
export const binPath = (): string =>
  resolveAsset(['../../bin/agents-office.mjs', '../bin/agents-office.mjs']);

/** The `package.json` holding the version. */
export const packageJsonPath = (): string =>
  resolveAsset(['../../package.json', '../package.json']);

/** The built web app: monorepo `packages/web/dist`, or `dist/web` inside the packed package. */
export const webDistPath = (): string => resolveAsset(['../../../web/dist', './web']);
