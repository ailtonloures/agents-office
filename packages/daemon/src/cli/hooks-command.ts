import { parseArgs } from 'node:util';
import { binPath } from './paths';
import {
  buildHookCommand,
  defaultSettingsPath,
  HOOK_EVENTS,
  installHooks,
  statusHooks,
  uninstallHooks,
} from './settings-merger';

export const HOOKS_USAGE = `Usage: agents-office hooks <install|uninstall|status> [options]

Options:
  --settings <path>   settings.json to edit (default ~/.claude/settings.json)
  --port <n>          install: make the hook post to this port; status: daemon port to query
  --dry-run           install/uninstall: show the diff without writing anything
  -h, --help          Show this help
`;

function parsePort(text: string | undefined): number | undefined | 'invalid' {
  if (text === undefined) return undefined;
  const port = Number(text);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : 'invalid';
}

/** Returns the process exit code. */
export async function runHooksCommand(argv: string[]): Promise<number> {
  const [action, ...rest] = argv;
  if (action === undefined || action === '-h' || action === '--help') {
    console.log(HOOKS_USAGE);
    return action === undefined ? 1 : 0;
  }
  if (action !== 'install' && action !== 'uninstall' && action !== 'status') {
    console.error(`Unknown hooks command "${action}".\n\n${HOOKS_USAGE}`);
    return 1;
  }
  const { values } = parseArgs({
    args: rest,
    options: {
      settings: { type: 'string' },
      port: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: false,
  });
  if (values.help) {
    console.log(HOOKS_USAGE);
    return 0;
  }
  const port = parsePort(values.port);
  if (port === 'invalid') {
    console.error(`Invalid port "${values.port}".`);
    return 1;
  }
  const settingsPath = values.settings ?? defaultSettingsPath();

  try {
    if (action === 'install') {
      const command = buildHookCommand(process.execPath, binPath(), port);
      const outcome = installHooks({ settingsPath, command, dryRun: values['dry-run'] });
      if (outcome.dryRun) {
        console.log(outcome.changed ? outcome.diff : '(no changes)');
        console.log(`\nDry run: ${outcome.path} not modified.`);
      } else if (!outcome.changed) {
        console.log(`Hooks already installed in ${outcome.path}.`);
      } else {
        if (outcome.backupPath) console.log(`Backup written to ${outcome.backupPath}`);
        console.log(`Hooks installed in ${outcome.path}.`);
      }
      return 0;
    }
    if (action === 'uninstall') {
      const outcome = uninstallHooks({ settingsPath, dryRun: values['dry-run'] });
      if (values['dry-run']) {
        console.log(outcome.changed ? outcome.diff : '(no changes)');
        console.log(`\nDry run: ${outcome.path} not modified.`);
      } else if (!outcome.changed) {
        console.log(`No agents-office hooks found in ${outcome.path}.`);
      } else {
        console.log(
          outcome.deleted
            ? `Hooks removed; ${outcome.path} was created by agents-office and has been deleted.`
            : `Hooks removed from ${outcome.path}.`,
        );
      }
      return 0;
    }
    return await printStatus(settingsPath, port);
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }
}

async function printStatus(settingsPath: string, port: number | undefined): Promise<number> {
  const { path, installed } = statusHooks(settingsPath);
  console.log(`Settings: ${path}`);
  for (const event of HOOK_EVENTS) {
    console.log(`  ${installed[event] ? 'installed    ' : 'not installed'}  ${event}`);
  }
  const daemonPort = port ?? Number(process.env.AGENTS_OFFICE_PORT ?? 4777);
  try {
    const response = await fetch(`http://127.0.0.1:${daemonPort}/health`, {
      signal: AbortSignal.timeout(500),
    });
    const health = (await response.json()) as { hooksSeenAt?: string };
    console.log(`Daemon: running on port ${daemonPort}`);
    console.log(`  last hook received: ${health.hooksSeenAt ?? 'never'}`);
  } catch {
    console.log(`Daemon: not reachable on port ${daemonPort}`);
  }
  return 0;
}
