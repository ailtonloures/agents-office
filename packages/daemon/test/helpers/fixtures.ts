import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { OfficeEvent } from '@agents-office/shared';
import type { NormalizerInput } from '../../src/normalizer';
import { createNormalizer } from '../../src/normalizer';

export const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

interface FixtureInfo {
  projectSlug: string;
  sessionId: string;
}

interface TimedInput {
  input: NormalizerInput;
  /** Timestamp used to merge the files in order (the previous line's one when absent). */
  ts: string;
  /** Tool use ids (`tool_use` blocks) the line introduces. */
  toolUseIds: string[];
}

function readLines(path: string): string[] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '');
}

function timed(input: NormalizerInput & { line: string }, previousTs: string): TimedInput {
  const record = JSON.parse(input.line) as {
    timestamp?: string;
    message?: { content?: unknown };
  };
  const content = record.message?.content;
  const toolUseIds = Array.isArray(content)
    ? content
        .filter((block) => block?.type === 'tool_use' && typeof block.id === 'string')
        .map((block) => block.id as string)
    : [];
  return { input, ts: record.timestamp ?? previousTs, toolUseIds };
}

/**
 * Loads a fixture (a name under `test/fixtures`, or the absolute path of a captured one) as the
 * stream of inputs the watcher would feed the normalizer: every transcript line merged by
 * timestamp (stable, the parent first on ties), each `.meta.json` right after the line holding
 * its Agent `tool_use`. The layout mirrors `~/.claude/projects/<slug>/`.
 */
export function loadFixture(name: string): { info: FixtureInfo; inputs: NormalizerInput[] } {
  const dir = isAbsolute(name) ? name : join(FIXTURES_DIR, name);
  const info = JSON.parse(readFileSync(join(dir, 'fixture.json'), 'utf8')) as FixtureInfo;
  const { sessionId, projectSlug } = info;

  const streams: TimedInput[][] = [];
  let previous = '';
  streams.push(
    readLines(join(dir, `${sessionId}.jsonl`)).map((line) => {
      const item = timed({ kind: 'session-line', sessionId, projectSlug, line }, previous);
      previous = item.ts;
      return item;
    }),
  );

  const metas = new Map<string, NormalizerInput>();
  const subagentsDir = join(dir, sessionId, 'subagents');
  const files = existsSync(subagentsDir) ? readdirSync(subagentsDir).sort() : [];
  for (const file of files) {
    const agentId = file.replace(/^agent-/, '').replace(/\.(meta\.json|jsonl)$/, '');
    if (file.endsWith('.meta.json')) {
      const meta = JSON.parse(readFileSync(join(subagentsDir, file), 'utf8')) as {
        toolUseId: string;
      };
      metas.set(meta.toolUseId, { kind: 'agent-meta', sessionId, agentId, meta });
    } else if (file.endsWith('.jsonl')) {
      previous = '';
      streams.push(
        readLines(join(subagentsDir, file)).map((line) => {
          const item = timed({ kind: 'agent-line', sessionId, agentId, line }, previous);
          previous = item.ts;
          return item;
        }),
      );
    }
  }

  const merged = streams.flat().sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  const inputs: NormalizerInput[] = [];
  for (const item of merged) {
    inputs.push(item.input);
    for (const toolUseId of item.toolUseIds) {
      const meta = metas.get(toolUseId);
      if (meta !== undefined) inputs.push(meta);
    }
  }
  return { info, inputs };
}

/** Runs every input of a fixture through a fresh normalizer. */
export function normalizeFixture(name: string): OfficeEvent[] {
  const normalizer = createNormalizer();
  return loadFixture(name).inputs.flatMap((input) => normalizer.ingest(input));
}

export function loadHookPayload(event: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, 'hooks', `${event}.json`), 'utf8')) as Record<
    string,
    unknown
  >;
}
