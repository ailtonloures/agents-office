import { describe, expect, it, vi } from 'vitest';
import { OfficeIdleSource } from '../src/main/agentBus/idleSource';

class FakeSocket {
  onopen: ((e: unknown) => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  closed = false;
  close() {
    this.closed = true;
  }
}

const session = (status: string) => ({
  id: 's1',
  projectId: 'p',
  profession: 'tech-lead',
  status,
  recentSteps: [],
  usage: { inputTokens: 0, outputTokens: 0 },
  agentIds: [],
  terminalId: 't1',
});

describe('OfficeIdleSource', () => {
  it('follows the stream snapshot and reconnects after a close', () => {
    const sockets: FakeSocket[] = [];
    const timers: Array<() => void> = [];
    const source = new OfficeIdleSource({
      url: 'ws://x/stream',
      connect: () => {
        const s = new FakeSocket();
        sockets.push(s);
        return s;
      },
      setTimer: (fn) => {
        timers.push(fn);
        return 0 as unknown as ReturnType<typeof setTimeout>;
      },
    });
    const changed = vi.fn();
    source.onChange(changed);
    source.start();
    expect(source.isIdle('t1')).toBe(false);
    const model = { projects: {}, sessions: { s1: session('idle') }, agents: {}, hallOfFame: [] };
    sockets[0]?.onmessage?.({ data: JSON.stringify({ kind: 'snapshot', model }) });
    expect(source.isIdle('t1')).toBe(true);
    expect(changed).toHaveBeenCalledTimes(1);
    sockets[0]?.onmessage?.({ data: 'not json' });
    expect(changed).toHaveBeenCalledTimes(1);
    sockets[0]?.onclose?.({});
    timers[0]?.();
    expect(sockets).toHaveLength(2);
    source.stop();
    expect(sockets[1]?.closed).toBe(true);
  });
});
