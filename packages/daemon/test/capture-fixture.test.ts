import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { anonymizeLine, captureFixture, REDACTED } from '../scripts/capture-fixture';
import { FIXTURES_DIR } from './helpers/fixtures';

const HOME = '/home/jdoe';

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

describe('capture-fixture anonymization', () => {
  it('keeps structure, ids, tool blocks, timestamps, cwd, isSidechain and usage', () => {
    const line = JSON.stringify({
      parentUuid: 'p1',
      isSidechain: true,
      agentId: 'a1',
      type: 'assistant',
      uuid: 'u1',
      timestamp: '2026-10-10T12:00:00.000Z',
      cwd: `${HOME}/secret-project`,
      sessionId: 's1',
      gitBranch: 'jdoe/feature',
      message: {
        id: 'msg_1',
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'my private reasoning', signature: 'abc' },
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'Read',
            input: { file_path: `${HOME}/secret-project/a.ts` },
          },
        ],
        usage: { input_tokens: 3, output_tokens: 9, service_tier: 'standard' },
      },
    });
    const out = JSON.parse(anonymizeLine(line, { home: HOME }) ?? 'null');
    expect(out).toEqual({
      parentUuid: 'p1',
      isSidechain: true,
      agentId: 'a1',
      type: 'assistant',
      uuid: 'u1',
      timestamp: '2026-10-10T12:00:00.000Z',
      cwd: '/anon/secret-project',
      sessionId: 's1',
      gitBranch: REDACTED,
      message: {
        id: 'msg_1',
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: REDACTED },
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'Read',
            input: { file_path: '/anon/secret-project/a.ts' },
          },
        ],
        usage: { input_tokens: 3, output_tokens: 9, service_tier: 'standard' },
      },
    });
  });

  it('redacts prompts and tool results, keeping is_error and task-notification routing', () => {
    const user = JSON.parse(
      anonymizeLine(
        JSON.stringify({
          type: 'user',
          message: {
            role: 'user',
            content: [
              { type: 'tool_result', tool_use_id: 'toolu_1', is_error: true, content: 'boom' },
            ],
          },
          toolUseResult: { status: 'completed', agentId: 'a1', prompt: 'do private things' },
        }),
        { home: HOME },
      ) ?? 'null',
    );
    expect(user.message.content[0]).toEqual({
      type: 'tool_result',
      tool_use_id: 'toolu_1',
      is_error: true,
      content: REDACTED,
    });
    expect(user.toolUseResult).toEqual({ status: 'completed', agentId: 'a1', prompt: REDACTED });

    const queued = JSON.parse(
      anonymizeLine(
        JSON.stringify({
          type: 'queue-operation',
          content:
            '<task-notification>\n<task-id>a1</task-id>\n<tool-use-id>toolu_1</tool-use-id>\n<status>completed</status>\n<summary>private</summary>\n</task-notification>',
        }),
      ) ?? 'null',
    );
    expect(queued.content).toBe(
      '<task-notification>\n<task-id>a1</task-id>\n<tool-use-id>toolu_1</tool-use-id>\n<status>completed</status>\n</task-notification>',
    );
    expect(anonymizeLine('{truncated')).toBeUndefined();
  });

  it('captures a session directory with its subagents into the fixture layout', () => {
    const root = mkdtempSync(join(tmpdir(), 'capture-'));
    const projectDir = join(root, '-home-jdoe-secret-project');
    const sessionDir = join(projectDir, 'sess-1');
    mkdirSync(join(sessionDir, 'subagents'), { recursive: true });
    writeFileSync(
      `${sessionDir}.jsonl`,
      `${JSON.stringify({ type: 'user', cwd: `${HOME}/secret-project`, message: { content: 'hi' } })}\n`,
    );
    writeFileSync(
      join(sessionDir, 'subagents', 'agent-a1.jsonl'),
      `${JSON.stringify({ type: 'user', isSidechain: true, agentId: 'a1' })}\n`,
    );
    writeFileSync(
      join(sessionDir, 'subagents', 'agent-a1.meta.json'),
      JSON.stringify({
        agentType: 'Explore',
        description: 'private',
        toolUseId: 't1',
        spawnDepth: 1,
      }),
    );

    const result = captureFixture(sessionDir, 'demo', join(root, 'out'), { home: HOME });
    expect(result).toMatchObject({ sessionId: 'sess-1', agentIds: ['a1'] });
    const files = listFiles(result.outDir).map((file) => file.slice(result.outDir.length + 1));
    expect(files.sort()).toEqual([
      'fixture.json',
      'sess-1.jsonl',
      'sess-1/subagents/agent-a1.jsonl',
      'sess-1/subagents/agent-a1.meta.json',
    ]);
    const all = files.map((file) => readFileSync(join(result.outDir, file), 'utf8')).join('\n');
    expect(all).not.toContain('/home/');
    expect(all).not.toContain('jdoe');
    expect(JSON.parse(readFileSync(join(result.outDir, 'fixture.json'), 'utf8'))).toEqual({
      projectSlug: '-anon-secret-project',
      sessionId: 'sess-1',
    });
  });
});

describe('committed fixtures', () => {
  it('contain no home paths', () => {
    for (const file of listFiles(FIXTURES_DIR)) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/\/home\/|\/Users\/|C:\\\\Users/);
    }
  });
});
