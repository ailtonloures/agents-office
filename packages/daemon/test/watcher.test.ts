import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  truncateSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { NormalizerInput } from '../src/normalizer';
import { classifyPath, createTranscriptWatcher, type TranscriptWatcher } from '../src/watcher';

const SLUG = '-home-user-proj';
const SESSION = 'sess-1';
const WINDOW = 15 * 60 * 1000;

let dir: string;
let inputs: NormalizerInput[];
let watcher: TranscriptWatcher | undefined;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'agents-office-watcher-'));
  inputs = [];
  watcher = undefined;
});

afterEach(async () => {
  await watcher?.stop();
  rmSync(dir, { recursive: true, force: true });
});

async function startWatcher(extra: { usePolling?: boolean } = {}): Promise<void> {
  watcher = createTranscriptWatcher({
    projectsDir: dir,
    initialWindowMs: WINDOW,
    onInput: (input) => inputs.push(input),
    log: () => {},
    ...extra,
  });
  await watcher.start();
}

async function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`timeout waiting; inputs=${JSON.stringify(inputs)}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const sessionPath = (): string => join(dir, SLUG, `${SESSION}.jsonl`);
const subagentsDir = (): string => join(dir, SLUG, SESSION, 'subagents');
const lines = (kind: string): string[] =>
  inputs.filter((i) => i.kind === kind).map((i) => (i as { line: string }).line);

function makeSession(content = ''): void {
  mkdirSync(join(dir, SLUG), { recursive: true });
  writeFileSync(sessionPath(), content);
}

describe('classifyPath', () => {
  it('classifies session, agent and meta paths', () => {
    expect(classifyPath('/p', '/p/s/a.jsonl')).toEqual({
      kind: 'session',
      projectSlug: 's',
      sessionId: 'a',
    });
    expect(classifyPath('/p', '/p/s/a/subagents/agent-x1.jsonl')).toEqual({
      kind: 'agent',
      projectSlug: 's',
      sessionId: 'a',
      agentId: 'x1',
    });
    expect(classifyPath('/p', '/p/s/a/subagents/agent-x1.meta.json')).toEqual({
      kind: 'meta',
      projectSlug: 's',
      sessionId: 'a',
      agentId: 'x1',
    });
    expect(classifyPath('/p', '/p/s/a/other/agent-x1.jsonl')).toBeUndefined();
    expect(classifyPath('/p', '/p/s/notes.txt')).toBeUndefined();
  });
});

describe('createTranscriptWatcher', () => {
  it('delivers appended lines in order, none lost or duplicated', async () => {
    makeSession();
    await startWatcher();
    const expected: string[] = [];
    for (let i = 0; i < 20; i++) {
      const line = JSON.stringify({ n: i });
      expected.push(line);
      appendFileSync(sessionPath(), `${line}\n`);
      if (i % 5 === 0) await new Promise((resolve) => setTimeout(resolve, 70));
    }
    await waitFor(() => lines('session-line').length >= expected.length);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(lines('session-line')).toEqual(expected);
    expect(inputs[0]).toMatchObject({
      kind: 'session-line',
      sessionId: SESSION,
      projectSlug: SLUG,
    });
  });

  it('joins a line written in two pieces into one input', async () => {
    makeSession();
    await startWatcher();
    const full = JSON.stringify({ text: 'olá mundo, ação' });
    const bytes = Buffer.from(`${full}\n`);
    const cut = full.indexOf('ç'); // splits inside the file, before a multibyte char
    appendFileSync(sessionPath(), bytes.subarray(0, cut + 1)); // cuts mid multibyte sequence
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(inputs).toHaveLength(0);
    appendFileSync(sessionPath(), bytes.subarray(cut + 1));
    await waitFor(() => inputs.length >= 1);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(lines('session-line')).toEqual([full]);
  });

  it('ignores old files at initial load and reads recent ones from the start', async () => {
    makeSession('{"a":1}\n{"a":2}\n');
    const oldDir = join(dir, 'old-slug');
    mkdirSync(oldDir);
    const oldFile = join(oldDir, 'old-sess.jsonl');
    writeFileSync(oldFile, '{"old":true}\n');
    const past = new Date(Date.now() - 2 * WINDOW);
    utimesSync(oldFile, past, past);
    await startWatcher();
    expect(lines('session-line')).toEqual(['{"a":1}', '{"a":2}']);
    // an old file that is appended to later is picked up from the start
    appendFileSync(oldFile, '{"old":false}\n');
    await waitFor(() => lines('session-line').length >= 4);
    expect(lines('session-line').slice(2)).toEqual(['{"old":true}', '{"old":false}']);
  });

  it('emits the agent meta before the agent lines (initial load)', async () => {
    makeSession('{"s":1}\n');
    mkdirSync(subagentsDir(), { recursive: true });
    writeFileSync(join(subagentsDir(), 'agent-a1.jsonl'), '{"x":1}\n{"x":2}\n');
    writeFileSync(join(subagentsDir(), 'agent-a1.meta.json'), '{"toolUseId":"t1"}');
    await startWatcher();
    const kinds = inputs.map((i) => i.kind);
    expect(kinds.filter((k) => k === 'agent-meta')).toHaveLength(1);
    expect(kinds.indexOf('agent-meta')).toBeLessThan(kinds.indexOf('agent-line'));
    expect(inputs.find((i) => i.kind === 'agent-meta')).toMatchObject({
      sessionId: SESSION,
      agentId: 'a1',
      meta: { toolUseId: 't1' },
    });
  });

  it('emits the agent meta before the agent lines (live, jsonl created first)', async () => {
    makeSession();
    await startWatcher();
    mkdirSync(subagentsDir(), { recursive: true });
    writeFileSync(join(subagentsDir(), 'agent-b2.meta.json'), '{"toolUseId":"t2"}');
    writeFileSync(join(subagentsDir(), 'agent-b2.jsonl'), '{"y":1}\n');
    await waitFor(() => lines('agent-line').length >= 1);
    const kinds = inputs.map((i) => i.kind);
    expect(kinds).toEqual(['agent-meta', 'agent-line']);
  });

  it('re-reads after truncation without crashing', async () => {
    makeSession();
    await startWatcher();
    appendFileSync(sessionPath(), '{"n":1}\n{"n":2}\n{"n":3}\n');
    await waitFor(() => inputs.length >= 3);
    truncateSync(sessionPath(), 0);
    await new Promise((resolve) => setTimeout(resolve, 200));
    appendFileSync(sessionPath(), '{"n":9}\n');
    await waitFor(() => inputs.length >= 4);
    expect(lines('session-line')).toEqual(['{"n":1}', '{"n":2}', '{"n":3}', '{"n":9}']);
  });

  it('delivers an append in under 500 ms', async () => {
    makeSession();
    await startWatcher();
    const started = Date.now();
    appendFileSync(sessionPath(), '{"fast":true}\n');
    await waitFor(() => inputs.length >= 1, 2000);
    expect(Date.now() - started).toBeLessThan(500);
  });

  it('works with polling enabled', async () => {
    makeSession();
    await startWatcher({ usePolling: true });
    appendFileSync(sessionPath(), '{"p":1}\n');
    await waitFor(() => inputs.length >= 1);
    expect(lines('session-line')).toEqual(['{"p":1}']);
  });

  it('stop() releases handles and silences further input', async () => {
    makeSession();
    await startWatcher();
    await watcher?.stop();
    appendFileSync(sessionPath(), '{"late":true}\n');
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(inputs).toHaveLength(0);
    await watcher?.stop(); // idempotent
  });
});
