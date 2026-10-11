import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createNormalizer, type NormalizerInput } from '../src/normalizer';
import { loadFixture } from './helpers/fixtures';

const sessionId = '5e551017-0008-4000-8000-000000000008';
const projectSlug = '-anon-projects-demo-app';

function sessionLine(line: string): NormalizerInput {
  return { kind: 'session-line', sessionId, projectSlug, line };
}

describe('normalizer: robustness', () => {
  const validLine = JSON.stringify({
    type: 'assistant',
    uuid: 'r1',
    timestamp: '2026-10-10T18:00:00.000Z',
    cwd: '/anon/projects/demo-app',
    sessionId,
    message: {
      id: 'msg_r1',
      role: 'assistant',
      content: [{ type: 'tool_use', id: 'toolu_r1', name: 'Read', input: { file_path: 'a.ts' } }],
    },
  });

  it('skips a truncated line without throwing', () => {
    const normalizer = createNormalizer();
    const truncated = validLine.slice(0, Math.floor(validLine.length / 2));
    expect(normalizer.ingest(sessionLine(truncated))).toEqual([]);
    expect(normalizer.stats.skipped).toBe(1);
    // The complete line, once written, is still processed.
    const events = normalizer.ingest(sessionLine(validLine));
    expect(events.map((event) => event.type)).toEqual(['session.started', 'tool.started']);
  });

  it.each([
    ['invalid JSON', '{not json'],
    ['empty line', ''],
    ['JSON array', '[1,2,3]'],
    ['JSON null', 'null'],
    ['JSON string', '"assistant"'],
    ['unknown type', JSON.stringify({ type: 'hologram', timestamp: '2026-10-10T18:00:00.000Z' })],
    ['missing type', JSON.stringify({ uuid: 'x1', timestamp: '2026-10-10T18:00:00.000Z' })],
    [
      'assistant without timestamp',
      JSON.stringify({ type: 'assistant', uuid: 'x2', message: { content: [] } }),
    ],
    [
      'assistant with a bad timestamp',
      JSON.stringify({ type: 'assistant', uuid: 'x3', timestamp: 'yesterday', message: {} }),
    ],
  ])('skips %s and counts it', (_label, line) => {
    const normalizer = createNormalizer();
    expect(() => normalizer.ingest(sessionLine(line))).not.toThrow();
    expect(normalizer.ingest(sessionLine(line))).toEqual([]);
    expect(normalizer.stats.skipped).toBeGreaterThanOrEqual(1);
  });

  it.each([
    ['message is a string', { message: 'hello' }],
    ['content is a string', { message: { content: 'hello' } }],
    ['content has junk blocks', { message: { content: [null, 1, 'x', { type: 'tool_use' }] } }],
    [
      'usage has junk values',
      { message: { id: 'm', content: [], usage: { input_tokens: 'many' } } },
    ],
  ])('tolerates an assistant line whose %s', (_label, extra) => {
    const normalizer = createNormalizer();
    const line = JSON.stringify({
      type: 'assistant',
      uuid: 'odd',
      timestamp: '2026-10-10T18:00:00.000Z',
      ...extra,
    });
    expect(() => normalizer.ingest(sessionLine(line))).not.toThrow();
  });

  it('counts known non-event records as ignored, not skipped', () => {
    const normalizer = createNormalizer();
    for (const type of ['system', 'file-history-snapshot', 'permission-mode', 'last-prompt']) {
      expect(normalizer.ingest(sessionLine(JSON.stringify({ type, sessionId })))).toEqual([]);
    }
    expect(normalizer.stats).toMatchObject({ ignored: 4, skipped: 0 });
  });

  it('never throws on garbage inputs of any kind', () => {
    const normalizer = createNormalizer();
    const garbage: unknown[] = [
      null,
      undefined,
      42,
      'session-line',
      {},
      { kind: 'teleport' },
      { kind: 'session-line', sessionId, projectSlug, line: 42 },
      { kind: 'agent-line', sessionId, agentId: 'a', line: null },
      { kind: 'agent-meta', sessionId, agentId: 'a', meta: 'not an object' },
      { kind: 'agent-meta', sessionId, agentId: 'a', meta: { spawnDepth: -3, toolUseId: 7 } },
      { kind: 'hook', payload: null, receivedAt: '2026-10-10T18:00:00.000Z' },
      { kind: 'hook', payload: { hook_event_name: 'PreToolUse', session_id: sessionId } },
    ];
    for (const input of garbage) {
      expect(() => normalizer.ingest(input as NormalizerInput)).not.toThrow();
    }
    expect(normalizer.stats.skipped).toBeGreaterThanOrEqual(9);
  });

  it('survives a fixture whose lines are cut at random points', () => {
    const { inputs } = loadFixture('parallel-subagents');
    const normalizer = createNormalizer();
    let seed = 7;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (const input of inputs) {
      const damaged =
        'line' in input && random() < 0.3
          ? { ...input, line: input.line.slice(0, Math.floor(random() * input.line.length)) }
          : input;
      expect(() => normalizer.ingest(damaged)).not.toThrow();
    }
    expect(normalizer.stats.skipped).toBeGreaterThan(0);
  });

  it('deduplicates a line read twice (same uuid)', () => {
    const normalizer = createNormalizer();
    expect(normalizer.ingest(sessionLine(validLine))).toHaveLength(2);
    expect(normalizer.ingest(sessionLine(validLine))).toEqual([]);
    expect(normalizer.stats.duplicates).toBe(1);
  });
});

describe('normalizer: purity', () => {
  const sourceDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'normalizer');

  it('has no fs, net or clock dependency', () => {
    const files = readdirSync(sourceDir).filter((file) => file.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(join(sourceDir, file), 'utf8');
      expect(source, file).not.toMatch(
        /from\s+['"](node:)?(fs|fs\/promises|net|http|https|os)['"]/,
      );
      expect(source, file).not.toMatch(/\bDate\.now\(|new Date\(|performance\.now\(|setTimeout\(/);
    }
  });

  it('is deterministic: the same inputs give the same events', () => {
    const { inputs } = loadFixture('nested-subagent');
    const run = () => {
      const normalizer = createNormalizer();
      return inputs.flatMap((input) => normalizer.ingest(input));
    };
    expect(run()).toEqual(run());
  });
});
