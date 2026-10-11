import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cwdFromTranscript,
  decodeSlug,
  encodeSlug,
  firstPrompt,
  normalizeCwd,
  ProjectCatalog,
  sortProjects,
} from '../src/main/projectCatalog';

let root: string;
let work: string;
let history: string;
let store: string;

function folder(...parts: string[]): string {
  const path = join(work, ...parts);
  mkdirSync(path, { recursive: true });
  return path;
}

function transcript(
  cwd: string | null,
  sessionId: string,
  mtimeSec: number,
  lines: object[] = [],
  slug = encodeSlug(cwd ?? 'x'),
): void {
  const dir = join(history, slug);
  mkdirSync(dir, { recursive: true });
  const body = [{ type: 'summary' }, ...(cwd ? [{ type: 'system', cwd }] : []), ...lines]
    .map((l) => JSON.stringify(l))
    .join('\n');
  const file = join(dir, `${sessionId}.jsonl`);
  writeFileSync(file, `${body}\n`);
  utimesSync(file, mtimeSec, mtimeSec);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ao-catalog-'));
  work = join(root, 'work');
  history = join(root, 'projects');
  store = join(root, 'data', 'projects.json');
  mkdirSync(work);
  mkdirSync(history);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const make = (now = () => new Date('2026-01-02T03:04:05.000Z')) =>
  new ProjectCatalog({ storePath: store, projectsDir: history, now });

describe('slugs', () => {
  it('encodes every non alphanumeric character as a dash', () => {
    expect(encodeSlug('/home/ailton/.claude')).toBe('-home-ailton--claude');
    expect(encodeSlug('/a/my_app v2')).toBe('-a-my-app-v2');
  });

  it('decodes a slug by checking the directories on disk', () => {
    const a = folder('my-app');
    const b = folder('my_app', 'sub.dir');
    const hidden = folder('.config', 'tool');
    const is = (p: string) => existsSync(p);
    expect(decodeSlug(encodeSlug(a), is)).toBe(a);
    expect(decodeSlug(encodeSlug(b), is)).toBe(b);
    expect(decodeSlug(encodeSlug(hidden), is)).toBe(hidden);
    expect(decodeSlug(encodeSlug(join(work, 'nope-here')), is)).toBeNull();
    expect(decodeSlug('relative', is)).toBeNull();
  });
});

describe('transcript parsing', () => {
  it('reads the first cwd and tolerates broken or cut lines', () => {
    const head = `not json\n{"type":"x"}\n{"cwd":"/a/b","type":"user"}\n{"cwd":"/other"}\n{"cwd":"/cut`;
    expect(cwdFromTranscript(head)).toBe('/a/b');
    expect(cwdFromTranscript('{"a":1}\n')).toBeNull();
  });

  it('finds the first real user prompt and shortens it', () => {
    const lines = [
      { type: 'user', isMeta: true, message: { content: 'meta' } },
      { type: 'user', message: { content: '<command-name>/clear</command-name>' } },
      {
        type: 'user',
        message: { content: [{ type: 'text', text: `  hello\n  ${'x'.repeat(200)}` }] },
      },
    ]
      .map((l) => JSON.stringify(l))
      .join('\n');
    const summary = firstPrompt(lines);
    expect(summary?.startsWith('hello xxx')).toBe(true);
    expect(summary?.length).toBe(90);
    expect(summary?.endsWith('…')).toBe(true);
    expect(firstPrompt('{"type":"assistant"}')).toBeNull();
  });
});

describe('ProjectCatalog.list', () => {
  it('merges office and history projects without duplicates and drops missing folders', () => {
    const alpha = folder('alpha');
    const beta = folder('beta');
    const gone = join(work, 'gone');
    transcript(alpha, 's1', 1000);
    transcript(beta, 's2', 2000);
    transcript(gone, 's3', 3000, [], encodeSlug(gone));
    const list = make().list([`${alpha}/`, beta, gone, '', alpha]);
    expect(list.map((p) => p.cwd).sort()).toEqual([alpha, beta].sort());
    const a = list.find((p) => p.cwd === alpha);
    expect(a?.sources).toEqual(['office', 'history']);
    expect(a?.name).toBe('alpha');
    expect(a?.lastActivityAt).toBe(new Date(1000_000).toISOString());
  });

  it('falls back to decoding the slug when the transcript has no cwd', () => {
    const app = folder('some-app');
    transcript(null, 's1', 1000, [], encodeSlug(app));
    expect(
      make()
        .list()
        .map((p) => p.cwd),
    ).toEqual([app]);
  });

  it('uses the newest transcript of each slug', () => {
    const alpha = folder('alpha');
    transcript(alpha, 'old', 1000);
    transcript(alpha, 'new', 5000);
    expect(make().list()[0]?.lastActivityAt).toBe(new Date(5000_000).toISOString());
  });

  it('orders favorites, then recents by last use, then the rest by activity', () => {
    const [a, b, c, d, e] = ['a', 'b', 'c', 'd', 'e'].map((n) => folder(n)) as [
      string,
      string,
      string,
      string,
      string,
    ];
    transcript(a, 's', 1000);
    transcript(b, 's', 4000);
    transcript(c, 's', 3000);
    transcript(d, 's', 2000);
    transcript(e, 's', 500);
    let tick = 0;
    const catalog = make(() => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)));
    catalog.markUsed(d as string);
    catalog.markUsed(e as string);
    catalog.setFavorite(a as string, true);
    expect(catalog.list().map((p) => p.name)).toEqual(['a', 'e', 'd', 'b', 'c']);
    catalog.setFavorite(a as string, false);
    expect(catalog.list().map((p) => p.name)).toEqual(['e', 'd', 'b', 'c', 'a']);
  });

  it('sorts by name when nothing else distinguishes projects', () => {
    const base = { favorite: false, lastUsedAt: null, lastActivityAt: null, sources: [] };
    const sorted = sortProjects([
      { ...base, cwd: '/z', name: 'z' },
      { ...base, cwd: '/a', name: 'a' },
    ]);
    expect(sorted.map((p) => p.name)).toEqual(['a', 'z']);
  });

  it('survives a missing projects folder', () => {
    rmSync(history, { recursive: true });
    expect(
      make()
        .list([folder('x')])
        .map((p) => p.name),
    ).toEqual(['x']);
  });
});

describe('persistence', () => {
  it('keeps favorites, recents and added folders between runs', () => {
    const a = folder('a');
    const b = folder('b');
    const first = make();
    expect(first.add(a)?.cwd).toBe(a);
    first.setFavorite(a, true);
    first.markUsed(b);
    const second = make();
    const list = second.list();
    expect(list.find((p) => p.cwd === a)?.favorite).toBe(true);
    expect(list.find((p) => p.cwd === b)?.lastUsedAt).toBe('2026-01-02T03:04:05.000Z');
    expect(second.add(join(work, 'missing'))).toBeUndefined();
  });

  it('writes atomically (no temp file left) and keeps valid JSON', () => {
    const a = folder('a');
    const catalog = make();
    for (let i = 0; i < 5; i++) catalog.markUsed(a);
    expect(readdirSync(join(root, 'data'))).toEqual(['projects.json']);
    const saved = JSON.parse(readFileSync(store, 'utf8'));
    expect(saved.recents).toHaveLength(1);
  });

  it('caps recents and recovers from a corrupt file', () => {
    const catalog = make();
    for (let i = 0; i < 40; i++) catalog.markUsed(folder(`p${i}`));
    expect(JSON.parse(readFileSync(store, 'utf8')).recents).toHaveLength(30);
    writeFileSync(store, '{ broken');
    expect(make().list()).toEqual([]);
    expect(normalizeCwd('/a/b//')).toBe('/a/b');
  });
});

describe('ProjectCatalog.sessions', () => {
  it('lists transcripts newest first with the first prompt', () => {
    const a = folder('a');
    const prompt = (text: string) => [{ type: 'user', message: { content: text } }];
    transcript(a, 'older', 1000, prompt('first thing'));
    transcript(a, 'newer', 2000, prompt('second thing'));
    transcript(a, 'bad id!', 3000);
    const sessions = make().sessions(a);
    expect(sessions.map((s) => s.id)).toEqual(['newer', 'older']);
    expect(sessions[0]?.summary).toBe('second thing');
    expect(make().sessions(join(work, 'unknown'))).toEqual([]);
  });
});
