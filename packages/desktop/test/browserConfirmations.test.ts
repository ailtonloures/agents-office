import type { BrowserApprovalRequest } from '@agents-office/shared';
import { describe, expect, it, vi } from 'vitest';
import { BrowserTools } from '../src/main/agentBus/browserTools';
import type { BusSession } from '../src/main/agentBus/server';
import { BrowserApprovalsFixture } from './browserConfirmationsFixture';

const session: BusSession = { sessionId: 's1', entryId: 'ana', cwd: '/p', role: 'padrao' };
const ask = (f: BrowserApprovalsFixture, cwd = '/p') =>
  f.approvals.ask({ cwd, kind: 'eval', title: 't', detail: 'd' });

describe('browser approvals', () => {
  it('allows only on an explicit allow', async () => {
    const f = new BrowserApprovalsFixture();
    const answer = f.approvals.ask({ cwd: '/p', kind: 'download', title: 't', detail: 'd' });
    expect(f.pushed).toHaveLength(1);
    expect(f.notices).toEqual([f.pushed[0]?.id]);
    expect(f.approvals.respond({ id: f.pushed[0]?.id ?? '', allow: true })).toBe(true);
    await expect(answer).resolves.toBe(true);
    expect(f.resolved).toEqual([f.pushed[0]?.id]);
    expect(f.approvals.pending()).toEqual([]);
  });

  it('denies on Negar', async () => {
    const f = new BrowserApprovalsFixture();
    const answer = ask(f);
    f.approvals.respond({ id: f.pushed[0]?.id ?? '', allow: false });
    await expect(answer).resolves.toBe(false);
  });

  it('denies on timeout, app quit and pause; unknown ids are ignored', async () => {
    vi.useFakeTimers();
    try {
      const f = new BrowserApprovalsFixture(1000);
      const timeout = ask(f);
      vi.advanceTimersByTime(1001);
      await expect(timeout).resolves.toBe(false);
      const quit = ask(f);
      f.approvals.denyAll();
      await expect(quit).resolves.toBe(false);
      const paused = ask(f, '/p/');
      const other = ask(f, '/q');
      f.approvals.denyWorkspace('/p');
      await expect(paused).resolves.toBe(false);
      expect(f.approvals.pending()).toHaveLength(1);
      f.approvals.denyAll();
      await expect(other).resolves.toBe(false);
      expect(f.approvals.respond({ id: 'nope', allow: true })).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a failing push still ends in a denial by timeout', async () => {
    vi.useFakeTimers();
    try {
      const f = new BrowserApprovalsFixture(500);
      f.failPush = true;
      const answer = ask(f);
      vi.advanceTimersByTime(501);
      await expect(answer).resolves.toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('browser guard', () => {
  it('asks for permissions and downloads and never grants the forbidden ones', async () => {
    const f = new BrowserApprovalsFixture();
    const guard = f.guard();
    const geo = guard.permission('/p', 'geolocation', 'https://maps.example/a?b=1');
    const asked = f.pushed[0] as BrowserApprovalRequest;
    expect(asked).toMatchObject({ kind: 'permission', origin: 'https://maps.example' });
    f.approvals.respond({ id: asked.id, allow: true });
    await expect(geo).resolves.toBe(true);
    await expect(guard.permission('/p', 'openExternal', 'https://a.example/')).resolves.toBe(false);
    await expect(guard.permission('/p', 'media', 'file:///etc/passwd')).resolves.toBe(false);
    expect(f.pushed).toHaveLength(1);

    const file = guard.download('/p', { filename: 'a.zip', url: 'https://a.example/a.zip' });
    const card = f.pushed[1] as BrowserApprovalRequest;
    expect(card).toMatchObject({ kind: 'download', detail: 'https://a.example/a.zip' });
    f.approvals.respond({ id: card.id, allow: false });
    await expect(file).resolves.toBe(false);
  });
});

describe('browser tools safety', () => {
  const make = (confirm: () => Promise<boolean>, paused = () => false) => {
    const calls: string[] = [];
    const driver = new Proxy({} as never, {
      get: (_t, name) => async () => {
        calls.push(String(name));
        return { url: 'https://a.example/', title: 'A', value: '1', truncated: false };
      },
    });
    const queue = {
      run: async (_c: string, _a: unknown, task: () => Promise<unknown>) => {
        await Promise.resolve(); // waits its turn
        return task();
      },
    };
    const tools = new BrowserTools({
      driver,
      queue: queue as never,
      authorName: () => 'Ana',
      isPaused: paused,
      confirmEval: confirm,
    });
    return { tools, calls };
  };

  it('browser_eval runs only after an allow', async () => {
    const confirm = vi.fn(async () => true);
    const { tools, calls } = make(confirm);
    const result = await tools.evaluate(session, { expression: '1+1' });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['evaluateExpression']);
    expect(JSON.parse(result.text).ok).toBe(true);
  });

  it('browser_eval is not run on deny or when the card fails', async () => {
    for (const confirm of [async () => false, async () => Promise.reject(new Error('x'))]) {
      const { tools, calls } = make(confirm);
      const result = await tools.evaluate(session, { expression: '1+1' });
      expect(result.isError).toBe(true);
      expect(JSON.parse(result.text).error).toBe('denied');
      expect(calls).toEqual([]);
    }
  });

  it('paused workspaces answer "paused by the user" without asking or touching the page', async () => {
    const confirm = vi.fn(async () => true);
    const { tools, calls } = make(confirm, () => true);
    for (const result of [
      await tools.navigate(session, { url: 'https://a.example' }),
      await tools.click(session, { selector: 'a' }),
      await tools.snapshot(session),
      await tools.evaluate(session, { expression: '1' }),
    ]) {
      expect(result.isError).toBe(true);
      expect(JSON.parse(result.text)).toMatchObject({ error: 'paused' });
      expect(result.text).toContain('Pausado pelo usuário');
    }
    expect(confirm).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it('an action that waited in the queue notices a pause that came meanwhile', async () => {
    let paused = false;
    const { tools, calls } = make(
      async () => true,
      () => paused,
    );
    const pending = tools.navigate(session, { url: 'https://a.example' });
    paused = true;
    const result = await pending;
    expect(JSON.parse(result.text).error).toBe('paused');
    expect(calls).toEqual([]);
  });
});
