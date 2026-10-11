import { join } from 'node:path';

export interface DaemonEntryInput {
  /** `app.isPackaged`. */
  packaged: boolean;
  resourcesPath: string;
  /** Repo root in development (two levels above `packages/desktop`). */
  repoRoot: string;
  exists(path: string): boolean;
  env: Record<string, string | undefined>;
}

/**
 * The script that starts the daemon: `AGENTS_OFFICE_DAEMON_ENTRY` wins; packaged apps carry it in
 * `resources/daemon`; in the monorepo the built `packages/cli` is used, falling back to the
 * development bin (tsx) when the CLI was not built yet.
 */
export function resolveDaemonEntry(input: DaemonEntryInput): string {
  const override = input.env.AGENTS_OFFICE_DAEMON_ENTRY;
  if (override) return override;
  if (input.packaged) return join(input.resourcesPath, 'daemon', 'bin', 'agents-office.mjs');
  const cli = join(input.repoRoot, 'packages', 'cli');
  if (input.exists(join(cli, 'dist', 'cli.mjs'))) return join(cli, 'bin', 'agents-office.mjs');
  return join(input.repoRoot, 'packages', 'daemon', 'bin', 'agents-office.mjs');
}
