import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import type { HooksChangeResult, HooksPreview, HooksStatus } from '@agents-office/shared';
// The same merger the `agents-office hooks` CLI uses (pure node, no extra dependency).
import {
  applyInstall,
  applyUninstall,
  buildHookCommand,
  HOOK_EVENTS,
  installHooks,
  readInstalled,
  renderDiff,
  uninstallHooks,
} from '../../../daemon/src/cli/settings-merger';
import { DEFAULT_PORT } from './probe';

export interface HookCommandInput {
  platform: NodeJS.Platform;
  /** The app executable (`process.execPath`: Electron or the packaged app). */
  execPath: string;
  /** Absolute path of the `agents-office.mjs` that handles `hook` (see `resolveDaemonEntry`). */
  entry: string;
  port: number;
}

/**
 * Command written into settings.json. Claude Code runs it through `sh -c`, so the Electron binary
 * runs the script as plain Node (`ELECTRON_RUN_AS_NODE=1`), with no `npx` and no `node` on the PATH.
 * Windows has no `VAR=x cmd` syntax, so there the script falls back to `node`.
 * The `agents-office.mjs hook` tail keeps the command recognisable by the merger marker.
 */
export function buildDesktopHookCommand(input: HookCommandInput): string {
  const port = input.port === DEFAULT_PORT ? undefined : input.port;
  if (input.platform === 'win32') return buildHookCommand('node', input.entry, port);
  return `ELECTRON_RUN_AS_NODE=1 ${buildHookCommand(input.execPath, input.entry, port)}`;
}

export function defaultSettingsPath(env: Record<string, string | undefined> = process.env): string {
  return env.AGENTS_OFFICE_SETTINGS_PATH
    ? resolve(env.AGENTS_OFFICE_SETTINGS_PATH)
    : join(homedir(), '.claude', 'settings.json');
}

export interface HooksServiceOptions {
  settingsPath: string;
  command: string;
  /** Returns the daemon `/health` JSON, or null when it cannot be reached. */
  health(): Promise<{ hooksSeenAt?: string } | null>;
}

export interface HooksService {
  status(): Promise<HooksStatus>;
  preview(action: 'install' | 'uninstall'): HooksPreview;
  install(): Promise<HooksChangeResult>;
  uninstall(): Promise<HooksChangeResult>;
}

export function createHooksService(options: HooksServiceOptions): HooksService {
  const path = resolve(options.settingsPath);
  const read = (): string | undefined =>
    existsSync(path) ? readFileSync(path, 'utf8') : undefined;

  const status = async (): Promise<HooksStatus> => {
    const installed = readInstalled(read(), path);
    const events = HOOK_EVENTS.map((event) => ({ event, installed: installed[event] }));
    const health = await options.health();
    return {
      path,
      events,
      installedCount: events.filter((e) => e.installed).length,
      total: events.length,
      hooksSeenAt: health?.hooksSeenAt ?? null,
      daemonReachable: health !== null,
    };
  };

  return {
    status,
    preview(action) {
      const before = read();
      const result =
        action === 'install'
          ? applyInstall(before, options.command, path)
          : before === undefined
            ? { text: null, changed: false }
            : applyUninstall(before, path);
      return {
        action,
        path,
        changed: result.changed,
        diff: result.changed ? renderDiff(before ?? null, result.text) : '',
      };
    },
    async install() {
      const outcome = installHooks({ settingsPath: path, command: options.command });
      return {
        action: 'install',
        changed: outcome.changed,
        deleted: false,
        ...(outcome.backupPath ? { backupPath: outcome.backupPath } : {}),
        status: await status(),
      };
    },
    async uninstall() {
      const outcome = uninstallHooks({ settingsPath: path });
      return {
        action: 'uninstall',
        changed: outcome.changed,
        deleted: outcome.deleted,
        status: await status(),
      };
    },
  };
}

/** Only the office window served by our own daemon may call the bridge. */
export function isTrustedSender(frameUrl: string | undefined, appOrigin: string): boolean {
  if (!frameUrl) return false;
  try {
    return new URL(frameUrl).origin === appOrigin;
  } catch {
    return false;
  }
}
