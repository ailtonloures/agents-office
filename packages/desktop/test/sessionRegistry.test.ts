import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { attachRegistry, SessionRegistry } from '../src/main/sessionRegistry';

let dir: string;
let path: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ao-registry-'));
  path = join(dir, 'sessions.json');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const info = (id: string, extra = {}) => ({
  id,
  cwd: `/w/${id}`,
  startedAt: '2026-10-10T10:00:00Z',
  ...extra,
});

describe('SessionRegistry', () => {
  it('starts empty without a file or with a corrupt one', () => {
    expect(new SessionRegistry(path).lostSessions()).toEqual([]);
    writeFileSync(path, '{ not json');
    expect(new SessionRegistry(path).lostSessions()).toEqual([]);
  });

  it('forgets a session that ended, so nothing is offered next time', () => {
    const registry = new SessionRegistry(path);
    registry.add(info('a'));
    registry.remove('a');
    expect(new SessionRegistry(path).lostSessions()).toEqual([]);
  });

  it('offers what a dead app left behind, with the bound Claude session id and mode', () => {
    const registry = new SessionRegistry(path);
    registry.add(info('a', { permissionMode: 'plan' }));
    registry.add(info('b'));
    registry.bind('a', 'claude-session-1');
    registry.bind('b', '../escape');
    // No remove(): the app "crashed".
    const next = new SessionRegistry(path);
    expect(next.lostSessions()).toEqual([
      { ...info('a'), permissionMode: 'plan', claudeSessionId: 'claude-session-1' },
      info('b'),
    ]);
  });

  it('keeps lost sessions across a second crash until they are dismissed', () => {
    const first = new SessionRegistry(path);
    first.add(info('a'));
    const second = new SessionRegistry(path);
    second.add(info('b'));
    const third = new SessionRegistry(path);
    expect(third.lostSessions().map((s) => s.id)).toEqual(['a', 'b']);
    third.dismissLost('a');
    expect(new SessionRegistry(path).lostSessions().map((s) => s.id)).toEqual(['b']);
  });

  it('keeps ended sessions recoverable after a system shutdown', () => {
    const registry = new SessionRegistry(path);
    registry.add(info('a'));
    registry.keepOnExitFromNow();
    registry.remove('a');
    expect(new SessionRegistry(path).lostSessions().map((s) => s.id)).toEqual(['a']);
  });

  it('ignores malformed entries and writes valid JSON', () => {
    writeFileSync(path, JSON.stringify({ active: [{ id: 1 }, null, info('ok')], lost: 'x' }));
    const registry = new SessionRegistry(path);
    expect(registry.lostSessions().map((s) => s.id)).toEqual(['ok']);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ active: [], lost: [info('ok')] });
  });

  it('follows a manager through attachRegistry', () => {
    const registry = new SessionRegistry(path);
    type Start = (i: ReturnType<typeof info> & { pid: number; cols: number; rows: number }) => void;
    const handlers: { start: Start; exit: (e: { id: string }) => void } = {
      start: () => {},
      exit: () => {},
    };
    attachRegistry(
      {
        onStart: (l) => {
          handlers.start = l as Start;
        },
        onExit: (l) => {
          handlers.exit = l;
        },
      },
      registry,
    );
    handlers.start({ ...info('a'), pid: 1, cols: 80, rows: 24 });
    expect(JSON.parse(readFileSync(path, 'utf8')).active).toHaveLength(1);
    handlers.exit({ id: 'a' });
    expect(JSON.parse(readFileSync(path, 'utf8')).active).toHaveLength(0);
  });
});
