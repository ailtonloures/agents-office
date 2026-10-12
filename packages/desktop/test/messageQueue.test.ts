import { describe, expect, it, vi } from 'vitest';
import { MessageQueue, QueueFullError } from '../src/main/agentBus/messageQueue';

function make(options: ConstructorParameters<typeof MessageQueue>[0] = {}) {
  let n = 0;
  let t = 1_000;
  const clock = { advance: (ms: number) => (t += ms) };
  const queue = new MessageQueue({ newId: () => `m${++n}`, now: () => t, ...options });
  return { queue, clock };
}

const base = (to: string, text = 'oi') => ({
  cwd: '/p',
  fromEntryId: 'a',
  fromName: 'Ana',
  toEntryId: to,
  toName: to,
  text,
});

describe('MessageQueue', () => {
  it('keeps FIFO order per destination', () => {
    const { queue } = make();
    queue.enqueue(base('b', '1'));
    queue.enqueue(base('c', 'x'));
    queue.enqueue(base('b', '2'));
    expect(queue.queuedFor('/p', 'b').map((m) => m.text)).toEqual(['1', '2']);
    expect(queue.peek('/p', 'b')?.text).toBe('1');
    expect(queue.destinationsWithQueue()).toHaveLength(2);
  });

  it('walks na-fila -> entregue -> respondida', () => {
    const { queue } = make();
    const m = queue.enqueue(base('b'));
    expect(m.status).toBe('na-fila');
    expect(queue.markReplied(m.id)).toBeUndefined();
    expect(queue.markDelivered(m.id)?.status).toBe('entregue');
    expect(queue.markDelivered(m.id)).toBeUndefined();
    expect(queue.queuedFor('/p', 'b')).toHaveLength(0);
    expect(queue.markReplied(m.id)?.status).toBe('respondida');
  });

  it('expires by TTL and when the destination goes away', () => {
    const { queue, clock } = make({ ttlMs: 100 });
    const a = queue.enqueue(base('b'));
    clock.advance(150);
    expect(queue.expireStale().map((m) => m.id)).toEqual([a.id]);
    expect(queue.get(a.id)?.status).toBe('expirada');
    const b = queue.enqueue(base('b'));
    queue.expireFor('/p', 'b');
    expect(queue.get(b.id)?.status).toBe('expirada');
  });

  it('limits the queue per destination', () => {
    const { queue } = make({ queueMax: 2 });
    queue.enqueue(base('b'));
    queue.enqueue(base('b'));
    expect(() => queue.enqueue(base('b'))).toThrow(QueueFullError);
    expect(() => queue.enqueue(base('c'))).not.toThrow();
  });

  it('bounds the history, dropping settled messages first', () => {
    const { queue } = make({ historyMax: 3 });
    const first = queue.enqueue(base('b', '1'));
    queue.markDelivered(first.id);
    queue.enqueue(base('b', '2'));
    queue.enqueue(base('b', '3'));
    queue.enqueue(base('b', '4'));
    expect(queue.history().map((m) => m.text)).toEqual(['4', '3', '2']);
  });

  it('emits events and clears everything', () => {
    const { queue } = make();
    const seen = vi.fn();
    queue.onEvent(seen);
    const m = queue.enqueue(base('b'));
    queue.markDelivered(m.id);
    expect(seen.mock.calls.map((c) => c[0].type)).toEqual(['enqueued', 'delivered']);
    queue.clear();
    expect(queue.history()).toHaveLength(0);
  });
});
