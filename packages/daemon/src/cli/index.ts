import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  createProfessionsConfig,
  type ProfessionsConfig,
  parseProfessionsOverride,
} from '../model';
import {
  createDaemon,
  DEFAULT_PORT,
  DEFAULT_PROJECTS_DIR,
  isLoopbackHost,
  LOOPBACK_HOST,
} from '../server';
import { runHooksCommand } from './hooks-command';
import { packageJsonPath, webDistPath } from './paths';

const USAGE = `Usage: agents-office [start] [options]
       agents-office hooks <install|uninstall|status> [--settings <path>] [--dry-run]
       agents-office hook   (reads a Claude Code hook payload on stdin; used by settings.json)

Options:
  --port <n>              Port to listen on (default ${DEFAULT_PORT}, env AGENTS_OFFICE_PORT)
  --projects-dir <path>   Claude Code projects dir (default ~/.claude/projects, env AGENTS_OFFICE_PROJECTS_DIR)
  --professions <path>    professions.json overriding the default tool -> profession table
  --skin <dir>            Serve an external skin (skin.json + assets) under /skin/*
  --no-open               Do not open the browser
  --unsafe-host <host>    Bind a non-loopback host (no authentication!)
  -h, --help              Show this help
`;

function expandHome(path: string): string {
  return path.startsWith('~') ? resolve(homedir(), path.slice(2)) : resolve(path);
}

function readVersion(): string {
  try {
    return (JSON.parse(readFileSync(packageJsonPath(), 'utf8')) as { version: string }).version;
  } catch {
    return '0.0.0';
  }
}

function loadProfessions(path: string): ProfessionsConfig {
  return createProfessionsConfig(parseProfessionsOverride(JSON.parse(readFileSync(path, 'utf8'))));
}

/** Resolves to an exit code, or -1 when the daemon keeps running. */
async function start(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      port: { type: 'string' },
      'projects-dir': { type: 'string' },
      professions: { type: 'string' },
      skin: { type: 'string' },
      'no-open': { type: 'boolean', default: false },
      'unsafe-host': { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: false,
  });
  if (values.help) {
    console.log(USAGE);
    return 0;
  }

  const portText = values.port ?? process.env.AGENTS_OFFICE_PORT ?? String(DEFAULT_PORT);
  const port = Number(portText);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error(`Invalid port "${portText}".`);
    return 1;
  }
  const projectsDir = expandHome(
    values['projects-dir'] ?? process.env.AGENTS_OFFICE_PROJECTS_DIR ?? DEFAULT_PROJECTS_DIR,
  );
  const skinDir = values.skin !== undefined ? expandHome(values.skin) : undefined;
  if (skinDir !== undefined && !existsSync(skinDir)) {
    console.error(`Skin directory not found: ${skinDir}`);
    return 1;
  }
  const host = values['unsafe-host'] ?? LOOPBACK_HOST;

  let professions: ProfessionsConfig | undefined;
  if (values.professions !== undefined) {
    try {
      professions = loadProfessions(expandHome(values.professions));
    } catch (error) {
      console.error(`Could not load professions file: ${(error as Error).message}`);
      return 1;
    }
  }

  const daemon = createDaemon({
    port,
    host,
    unsafeHost: values['unsafe-host'] !== undefined && !isLoopbackHost(host),
    projectsDir,
    webDist: webDistPath(),
    ...(skinDir ? { skinDir } : {}),
    version: readVersion(),
    ...(professions ? { professions } : {}),
  });

  let address: Awaited<ReturnType<typeof daemon.start>>;
  try {
    address = await daemon.start();
  } catch (error) {
    await daemon.stop().catch(() => {});
    if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      console.error(
        `Port ${port} is already in use. Is agents-office already running? Pick another with --port.`,
      );
    } else {
      console.error(`Could not start agents-office: ${(error as Error).message}`);
    }
    return 1;
  }

  const url = `http://${address.host === '::1' ? '[::1]' : address.host}:${address.port}`;
  const model = daemon.getModel();
  console.log(`agents-office listening on ${url}`);
  console.log(`  projects dir: ${projectsDir}`);
  if (skinDir) console.log(`  skin: ${skinDir}`);
  console.log(
    `  loaded ${Object.keys(model.sessions).length} session(s), ${Object.keys(model.agents).length} agent(s)`,
  );

  const quit = (): void => {
    void daemon.stop().finally(() => process.exit(0));
  };
  process.once('SIGINT', quit);
  process.once('SIGTERM', quit);

  if (!values['no-open']) {
    try {
      const { default: open } = await import('open');
      await open(url);
    } catch (error) {
      console.error(`Could not open the browser (${(error as Error).message}); visit ${url}`);
    }
  }
  // Stay alive: the HTTP server and watcher keep the event loop busy.
  return -1;
}

async function main(argv: string[]): Promise<void> {
  const [first, ...rest] = argv;
  let code: number;
  if (first === undefined || first.startsWith('-')) {
    code = await start(argv);
  } else if (first === 'hooks') {
    code = await runHooksCommand(rest);
  } else if (first === 'start') {
    code = await start(rest);
  } else {
    console.error(`Unknown command "${first}".\n\n${USAGE}`);
    code = 1;
  }
  if (code >= 0) process.exit(code);
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error);
  process.exit(1);
});
