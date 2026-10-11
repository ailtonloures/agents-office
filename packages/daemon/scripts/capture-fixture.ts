/**
 * Copies a real Claude Code session into an anonymized test fixture.
 *
 *   node packages/daemon/scripts/capture-fixture.ts <sessionDir | session.jsonl> <name> [outDir]
 *
 * `<sessionDir>` is `<projectsDir>/<cwd-slug>/<sessionId>` (the directory holding `subagents/`);
 * the parent transcript is the sibling `<sessionId>.jsonl`. The fixture is written to
 * `packages/daemon/test/fixtures/<name>/` (or `<outDir>/<name>/`) with the same layout:
 *
 *   fixture.json                                  { projectSlug, sessionId }
 *   <sessionId>.jsonl
 *   <sessionId>/subagents/agent-<agentId>.jsonl
 *   <sessionId>/subagents/agent-<agentId>.meta.json
 *
 * Anonymization keeps the structure, ids, `type`, `tool_use`/`tool_result`, `timestamp`, `cwd`,
 * `isSidechain` and `usage`, and replaces every other string (prompts, thinking, tool inputs and
 * results, descriptions) with a placeholder. Home paths become `/anon`. Runs on Node >= 22.18
 * (native type stripping), so it only uses erasable TypeScript and `node:` imports.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ANON_HOME = '/anon';
export const REDACTED = '[redacted]';

/** String fields kept verbatim: ids, enums, timestamps and versions. */
const PRESERVED_KEYS: ReadonlySet<string> = new Set([
  'type',
  'uuid',
  'parentUuid',
  'logicalParentUuid',
  'leafUuid',
  'messageId',
  'sessionId',
  'session_id',
  'agentId',
  'timestamp',
  'id',
  'tool_use_id',
  'toolUseId',
  'toolUseID',
  'sourceToolAssistantUUID',
  'parentAgentId',
  'name',
  'role',
  'model',
  'stop_reason',
  'stop_sequence',
  'version',
  'userType',
  'entrypoint',
  'subtype',
  'operation',
  'level',
  'requestId',
  'promptId',
  'permissionMode',
  'mode',
  'status',
  'agentType',
  'subagent_type',
  'service_tier',
  'hook_event_name',
  'notification_type',
  'tool_name',
  'agent_id',
  'agent_type',
]);

/** String fields holding a path: kept, with the home directory replaced. */
const PATH_KEYS: ReadonlySet<string> = new Set([
  'cwd',
  'file_path',
  'notebook_path',
  'path',
  'transcript_path',
  'agent_transcript_path',
]);

/** Fields dropped altogether (opaque blobs that could encode content). */
const DROPPED_KEYS: ReadonlySet<string> = new Set(['signature', 'snapshot']);

export interface AnonymizeOptions {
  /** Home directory to hide. Defaults to the current user's. */
  home?: string;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Replaces the home directory (as a path and as a Claude Code project slug) with `/anon`. */
export function anonymizePath(text: string, home: string): string {
  const slug = home.replace(/[^a-zA-Z0-9]/g, '-');
  return text
    .replace(new RegExp(escapeRegExp(home), 'g'), ANON_HOME)
    .replace(new RegExp(escapeRegExp(slug), 'g'), '-anon');
}

/** Keeps only the routing tags of `<task-notification>` blocks; drops summaries and results. */
export function anonymizeTaskNotifications(text: string): string | undefined {
  const blocks = [...text.matchAll(/<task-notification>([\s\S]*?)<\/task-notification>/g)];
  if (blocks.length === 0) return undefined;
  return blocks
    .map((match) => {
      const body = match[1] ?? '';
      const tags = ['task-id', 'tool-use-id', 'status']
        .map((tag) => {
          const value = new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(body)?.[1];
          return value === undefined ? undefined : `<${tag}>${value}</${tag}>`;
        })
        .filter((tag) => tag !== undefined);
      return `<task-notification>\n${tags.join('\n')}\n</task-notification>`;
    })
    .join('\n');
}

function anonymizeValue(value: unknown, key: string | undefined, home: string): unknown {
  if (Array.isArray(value)) return value.map((item) => anonymizeValue(item, key, home));
  if (typeof value === 'object' && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [childKey, child] of Object.entries(value)) {
      if (DROPPED_KEYS.has(childKey)) continue;
      result[childKey] = anonymizeValue(child, childKey, home);
    }
    return result;
  }
  if (typeof value !== 'string') return value;
  if (key !== undefined && PRESERVED_KEYS.has(key)) return anonymizePath(value, home);
  if (key !== undefined && PATH_KEYS.has(key)) return anonymizePath(value, home);
  const notifications = anonymizeTaskNotifications(value);
  if (notifications !== undefined) return notifications;
  return value === '' ? value : REDACTED;
}

/** Anonymizes one decoded transcript record or meta object. */
export function anonymizeRecord(record: unknown, options: AnonymizeOptions = {}): unknown {
  return anonymizeValue(record, undefined, options.home ?? homedir());
}

/**
 * Anonymizes one JSONL line. Lines that are not valid JSON are kept out of the fixture (they
 * cannot be anonymized safely); returns `undefined` for them.
 */
export function anonymizeLine(line: string, options: AnonymizeOptions = {}): string | undefined {
  try {
    return JSON.stringify(anonymizeRecord(JSON.parse(line), options));
  } catch {
    return undefined;
  }
}

function anonymizeJsonlFile(source: string, target: string, home: string) {
  const lines = readFileSync(source, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => anonymizeLine(line, { home }))
    .filter((line) => line !== undefined);
  writeFileSync(target, `${lines.join('\n')}\n`);
}

export interface CaptureResult {
  outDir: string;
  sessionId: string;
  projectSlug: string;
  agentIds: string[];
}

/** Copies and anonymizes a session (parent JSONL, subagent JSONL and metas) into a fixture. */
export function captureFixture(
  sessionPath: string,
  name: string,
  outRoot: string,
  options: AnonymizeOptions = {},
): CaptureResult {
  const home = options.home ?? homedir();
  const sessionDir = resolve(sessionPath).replace(/\.jsonl$/, '');
  const sessionId = basename(sessionDir);
  const parentJsonl = `${sessionDir}.jsonl`;
  if (!existsSync(parentJsonl)) throw new Error(`Session transcript not found: ${parentJsonl}`);
  const projectSlug = anonymizePath(basename(dirname(sessionDir)), home);

  const outDir = join(outRoot, name);
  const outSubagents = join(outDir, sessionId, 'subagents');
  mkdirSync(outSubagents, { recursive: true });
  writeFileSync(
    join(outDir, 'fixture.json'),
    `${JSON.stringify({ projectSlug, sessionId }, null, 2)}\n`,
  );
  anonymizeJsonlFile(parentJsonl, join(outDir, `${sessionId}.jsonl`), home);

  const agentIds: string[] = [];
  const subagentsDir = join(sessionDir, 'subagents');
  if (existsSync(subagentsDir)) {
    for (const file of readdirSync(subagentsDir).sort()) {
      const source = join(subagentsDir, file);
      if (file.endsWith('.meta.json')) {
        const meta = anonymizeRecord(JSON.parse(readFileSync(source, 'utf8')), { home });
        writeFileSync(join(outSubagents, file), `${JSON.stringify(meta)}\n`);
      } else if (file.endsWith('.jsonl')) {
        anonymizeJsonlFile(source, join(outSubagents, file), home);
        agentIds.push(file.replace(/^agent-/, '').replace(/\.jsonl$/, ''));
      }
    }
  }
  return { outDir, sessionId, projectSlug, agentIds };
}

function main(argv: string[]) {
  const [sessionPath, name, outRoot] = argv;
  if (sessionPath === undefined || name === undefined) {
    console.error('Usage: capture-fixture.ts <sessionDir | session.jsonl> <name> [outDir]');
    process.exit(1);
  }
  const defaultOut = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures');
  const result = captureFixture(sessionPath, name, outRoot ?? defaultOut);
  console.log(
    `Captured session ${result.sessionId} (${result.agentIds.length} subagents) into ${result.outDir}`,
  );
  console.log('Review it manually and grep for personal data before committing.');
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
