import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { TerminalConfig } from '@agents-office/shared';

export const DEFAULT_MAX_SESSIONS = 12;
export const MAX_SESSIONS_CEILING = 64;

/** Small JSON file in the app data folder (manual `claude` path, session limit). */
export class AppConfigStore {
  private value: TerminalConfig;

  constructor(private readonly path: string) {
    this.value = AppConfigStore.load(path);
  }

  private static load(path: string): TerminalConfig {
    const fallback: TerminalConfig = { claudePath: null, maxSessions: DEFAULT_MAX_SESSIONS };
    try {
      const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<TerminalConfig>;
      const maxSessions = Number.isInteger(raw.maxSessions)
        ? Math.min(Math.max(raw.maxSessions as number, 1), MAX_SESSIONS_CEILING)
        : fallback.maxSessions;
      return {
        claudePath:
          typeof raw.claudePath === 'string' && raw.claudePath !== '' ? raw.claudePath : null,
        maxSessions,
      };
    } catch {
      return fallback;
    }
  }

  get(): TerminalConfig {
    return { ...this.value };
  }

  update(patch: Partial<TerminalConfig>): TerminalConfig {
    this.value = { ...this.value, ...patch };
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(this.value, null, 2)}\n`);
    renameSync(tmp, this.path);
    return this.get();
  }
}
