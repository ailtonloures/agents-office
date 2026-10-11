import { describe, expect, it, vi } from 'vitest';
import { RestartPolicy } from '../src/main/backoff';
import { type ChildLike, DaemonController, type DaemonStatus } from '../src/main/daemonProcess';
import {
  decideMode,
  type FetchLike,
  type ProbeResult,
  parseHealth,
  probeHealth,
  resolvePort,
} from '../src/main/probe';

const HEALTH = { ok: true, version: '1.2.3', sessions: 0, agents: 0 };

function reply(body: unknown, ok = true): ReturnType<FetchLike> {
  return Promise.resolve({ ok, json: async () => body });
}

describe('probeHealth / decideMode', () => {
  it('recognizes an agents-office daemon', async () => {
    const probe = await probeHealth(4777, () => reply(HEALTH));
    expect(probe).toEqual({ kind: 'agents-office', version: '1.2.3' });
    expect(decideMode(probe)).toEqual({ kind: 'external', version: '1.2.3' });
  });

  it('treats other HTTP servers as a busy port', async () => {
    expect(await probeHealth(4777, () => reply({ status: 'up' }))).toEqual({ kind: 'other' });
    expect(await probeHealth(4777, () => reply('<html>', false))).toEqual({ kind: 'other' });
    expect(
      await probeHealth(4777, () =>
        Promise.resolve({ ok: true, json: () => Promise.reject(new Error('x')) }),
      ),
    ).toEqual({ kind: 'other' });
    expect(decideMode({ kind: 'other' })).toEqual({ kind: 'port-busy' });
  });

  it('treats a refused connection as a free port', async () => {
    const refused = Object.assign(new TypeError('fetch failed'), {
      cause: { code: 'ECONNREFUSED' },
    });
    const probe = await probeHealth(4777, () => Promise.reject(refused));
    expect(probe).toEqual({ kind: 'free' });
    expect(decideMode(probe)).toEqual({ kind: 'own' });
  });

  it('treats a listener that never answers as not ours', async () => {
    const hang: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
        );
      });
    expect(await probeHealth(4777, hang, 20)).toEqual({ kind: 'other' });
  });

  it('parses the health body strictly and resolves the port', () => {
    expect(parseHealth({ ok: true, version: '1', sessions: 1, agents: 2 })).toEqual({
      version: '1',
    });
    expect(parseHealth({ ok: false, version: '1', sessions: 1, agents: 2 })).toBeNull();
    expect(parseHealth(null)).toBeNull();
    expect(resolvePort({})).toBe(4777);
    expect(resolvePort({ AGENTS_OFFICE_PORT: '5001' })).toBe(5001);
    expect(resolvePort({ AGENTS_OFFICE_PORT: 'abc' })).toBe(4777);
    expect(resolvePort({ AGENTS_OFFICE_PORT: '99999' })).toBe(4777);
  });
});

describe('RestartPolicy', () => {
  it('allows 3 restarts per minute with exponential delay, then gives up', () => {
    const policy = new RestartPolicy();
    expect(policy.next(0)).toBe(500);
    expect(policy.next(1000)).toBe(1000);
    expect(policy.next(2000)).toBe(2000);
    expect(policy.next(3000)).toBeNull();
  });

  it('forgets restarts older than the window', () => {
    const policy = new RestartPolicy();
    policy.next(0);
    policy.next(1);
    policy.next(2);
    expect(policy.next(30_000)).toBeNull();
    expect(policy.next(60_001)).toBe(1000);
  });

  it('caps the delay and can be reset', () => {
    const policy = new RestartPolicy({ maxAttempts: 10, baseDelayMs: 1000, maxDelayMs: 3000 });
    expect([policy.next(0), policy.next(1), policy.next(2), policy.next(3)]).toEqual([
      1000, 2000, 3000, 3000,
    ]);
    policy.reset();
    expect(policy.next(4)).toBe(1000);
  });
});

class FakeChild implements ChildLike {
  killed = false;
  private exitListeners: Array<(code: number | null) => void> = [];
  private dataListeners: Array<(chunk: string) => void> = [];
  stdout = { on: (_e: 'data', l: (chunk: string) => void) => this.dataListeners.push(l) };
  stderr = null;
  /** When false, `kill()` does not make the child exit (a stuck process). */
  exitsOnKill = true;
  alive = true;
  kill(): boolean {
    this.killed = true;
    if (this.exitsOnKill) this.exit(null);
    return true;
  }
  once(_event: 'exit', listener: (code: number | null) => void): void {
    this.exitListeners.push(listener);
  }
  exit(code: number | null): void {
    this.alive = false;
    const listeners = this.exitListeners;
    this.exitListeners = [];
    for (const listener of listeners) listener(code);
  }
  print(text: string): void {
    for (const listener of this.dataListeners) listener(text);
  }
}

/** Manual clock + timers so backoff runs instantly. */
function harness(options: { probes: ProbeResult[]; neverReady?: boolean }) {
  let now = 0;
  const timers: Array<{ at: number; fn: () => void; id: number }> = [];
  let nextId = 0;
  const children: FakeChild[] = [];
  const probes = [...options.probes];
  const logs: string[] = [];
  const statuses: DaemonStatus[] = [];
  const controller = new DaemonController({
    port: 4777,
    fork: (args) => {
      expect(args).toEqual(['start', '--no-open', '--port', '4777']);
      const child = new FakeChild();
      children.push(child);
      return child;
    },
    // Queued answers first; then the port behaves like a real one: served while a child lives.
    probe: async () =>
      probes.shift() ??
      (children.some((child) => child.alive) && !options.neverReady
        ? ({ kind: 'agents-office', version: '1' } as const)
        : ({ kind: 'free' } as const)),
    now: () => now,
    setTimer: (fn, ms) => {
      const id = nextId++;
      timers.push({ at: now + ms, fn, id });
      return id;
    },
    clearTimer: (handle) => {
      const index = timers.findIndex((t) => t.id === handle);
      if (index >= 0) timers.splice(index, 1);
    },
    log: (line) => logs.push(line),
  });
  controller.onStatus((status) => statuses.push(status));
  /** Runs timers due within `ms`, letting promises settle in between. */
  const advance = async (ms: number): Promise<void> => {
    const target = now + ms;
    for (;;) {
      await Promise.resolve();
      await new Promise((r) => setImmediate(r));
      timers.sort((a, b) => a.at - b.at);
      const next = timers[0];
      if (!next || next.at > target) break;
      timers.shift();
      now = Math.max(now, next.at);
      next.fn();
    }
    now = target;
    await new Promise((r) => setImmediate(r));
  };
  return { controller, children, logs, statuses, advance };
}

const FREE: ProbeResult = { kind: 'free' };
const OURS: ProbeResult = { kind: 'agents-office', version: '9.9.9' };

describe('DaemonController', () => {
  it('starts the child when the port is free and reports running', async () => {
    const h = harness({ probes: [FREE, FREE, OURS] });
    const started = h.controller.start();
    await h.advance(1000);
    expect(await started).toEqual({ state: 'running', port: 4777 });
    expect(h.children).toHaveLength(1);
    expect(h.statuses.map((s) => s.state)).toEqual(['starting', 'running']);
  });

  it('forwards the child output line by line', async () => {
    const h = harness({ probes: [FREE, OURS] });
    const started = h.controller.start();
    await h.advance(10);
    h.children[0]?.print('hello\nworld\n');
    await started;
    expect(h.logs).toEqual(['hello', 'world']);
  });

  it('does not start a second daemon when an agents-office already runs', async () => {
    const h = harness({ probes: [OURS] });
    expect(await h.controller.start()).toEqual({ state: 'external', port: 4777, version: '9.9.9' });
    expect(h.children).toHaveLength(0);
    await h.controller.stop();
    expect(h.statuses.at(-1)).toEqual({ state: 'stopped' });
  });

  it('reports a busy port without starting anything', async () => {
    const h = harness({ probes: [{ kind: 'other' }] });
    expect(await h.controller.start()).toEqual({ state: 'port-busy', port: 4777 });
    expect(h.children).toHaveLength(0);
  });

  it('restarts after a crash with backoff and gives up after 3 tries', async () => {
    const h = harness({ probes: [FREE] });
    const started = h.controller.start();
    await h.advance(10);
    await started;
    expect(h.controller.status.state).toBe('running');

    h.children[0]?.exit(1);
    await h.advance(10);
    expect(h.controller.status).toMatchObject({ state: 'restarting', attempt: 1, delayMs: 500 });

    // New child comes up (probe answers ours once), then crashes again, twice more.
    await h.advance(500);
    expect(h.children).toHaveLength(2);
    h.children[1]?.exit(1);
    await h.advance(10);
    expect(h.controller.status).toMatchObject({ state: 'restarting', delayMs: 1000 });
    await h.advance(1000);
    h.children[2]?.exit(1);
    await h.advance(10);
    expect(h.controller.status).toMatchObject({ state: 'restarting', delayMs: 2000 });
    await h.advance(2000);
    h.children[3]?.exit(1);
    await h.advance(10);
    expect(h.controller.status.state).toBe('failed');
    expect(h.children).toHaveLength(4);
  });

  it('switches to external when the port was taken by another agents-office after a crash', async () => {
    const h = harness({ probes: [FREE, OURS, OURS] });
    const started = h.controller.start();
    await h.advance(10);
    await started;
    h.children[0]?.exit(1);
    await h.advance(10);
    expect(h.controller.status).toMatchObject({ state: 'external' });
    expect(h.children).toHaveLength(1);
  });

  it('stop() kills the child, cancels a pending restart and never restarts', async () => {
    const h = harness({ probes: [FREE] });
    const started = h.controller.start();
    await h.advance(10);
    await started;
    h.children[0]?.exit(1);
    await h.advance(10);
    expect(h.controller.status.state).toBe('restarting');
    await h.controller.stop();
    await h.advance(60_000);
    expect(h.children).toHaveLength(1);
    expect(h.controller.status).toEqual({ state: 'stopped' });
  });

  it('stop() waits for the child to exit and does not hang on a stuck one', async () => {
    const h = harness({ probes: [FREE, OURS] });
    const started = h.controller.start();
    await h.advance(10);
    await started;
    const child = h.children[0] as FakeChild;
    child.exitsOnKill = false;
    const stopped = vi.fn();
    void h.controller.stop().then(stopped);
    await h.advance(1000);
    expect(child.killed).toBe(true);
    expect(stopped).not.toHaveBeenCalled();
    await h.advance(5000);
    expect(stopped).toHaveBeenCalled();
  });

  it('fails when the child never answers /health', async () => {
    const h = harness({ probes: [FREE], neverReady: true });
    const started = h.controller.start();
    await h.advance(31_000);
    expect(await started).toMatchObject({ state: 'failed' });
    expect(h.children[0]?.killed).toBe(true);
    await h.advance(10_000);
    expect(h.children).toHaveLength(1);
  });
});
