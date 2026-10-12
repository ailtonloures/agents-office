import type { CommEvent } from '@agents-office/shared';
import { commPreview } from '@agents-office/shared';
import { describe, expect, it, vi } from 'vitest';
import { CommsLog } from '../src/main/agentBus/commsLog';
import { MessageQueue } from '../src/main/agentBus/messageQueue';
import { COMMS_CHANNELS } from '../src/main/commsChannels';
import { registerCommsIpc } from '../src/main/commsIpc';

const base = (cwd: string, to: string, text = 'oi') => ({
  cwd,
  fromEntryId: 'a',
  fromName: 'Ana',
  toEntryId: to,
  toName: to,
  text,
});

function setup(max?: number) {
  const queue = new MessageQueue({ historyMax: 500 });
  const log = new CommsLog({ max });
  log.attach(queue);
  const events: CommEvent[] = [];
  log.onEvent((e) => events.push(e));
  return { queue, log, events };
}

describe('CommsLog', () => {
  it('emits every state of a message', () => {
    const { queue, events } = setup();
    const m = queue.enqueue(base('/p', 'b'));
    queue.markDelivered(m.id);
    queue.markReplied(m.id);
    const e = queue.enqueue(base('/p', 'c'));
    queue.expireFor('/p', 'c');
    expect(events.map((x) => [x.type, x.message.id, x.message.status])).toEqual([
      ['iniciada', m.id, 'na-fila'],
      ['entregue', m.id, 'entregue'],
      ['respondida', m.id, 'respondida'],
      ['iniciada', e.id, 'na-fila'],
      ['expirada', e.id, 'expirada'],
    ]);
  });

  it('keeps the full text and upserts by id, newest first, per project', () => {
    const { queue, log } = setup();
    const long = 'x'.repeat(3000);
    const a = queue.enqueue(base('/p', 'b', long));
    queue.enqueue(base('/q', 'b', 'outro'));
    queue.enqueue(base('/p', 'b', 'segundo'));
    queue.markDelivered(a.id);
    const h = log.history('/p');
    expect(h).toHaveLength(2);
    expect(h[1]).toMatchObject({ id: a.id, text: long, status: 'entregue' });
    expect(h[0]?.text).toBe('segundo');
    expect(log.history('/q')).toHaveLength(1);
    expect(log.history('/nada')).toEqual([]);
  });

  it('respects the per-project limit, dropping settled messages first', () => {
    const { queue, log } = setup(3);
    const first = queue.enqueue(base('/p', 'b', '1'));
    queue.markDelivered(first.id);
    queue.enqueue(base('/p', 'b', '2'));
    queue.enqueue(base('/p', 'b', '3'));
    queue.enqueue(base('/p', 'b', '4'));
    expect(log.history('/p').map((m) => m.text)).toEqual(['4', '3', '2']);
    queue.enqueue(base('/p', 'b', '5'));
    expect(log.history('/p')).toHaveLength(3);
    expect(log.history('/p')[0]?.text).toBe('5');
  });

  it('stops recording after detach', () => {
    const { queue, log, events } = setup();
    log.detach();
    queue.enqueue(base('/p', 'b'));
    expect(events).toHaveLength(0);
  });
});

describe('registerCommsIpc', () => {
  it('serves history, checks the sender and pushes events to the window', async () => {
    const { queue, log } = setup();
    const handlers = new Map<string, (event: string, ...args: unknown[]) => unknown>();
    const send = vi.fn();
    const trusted = vi.fn((event: string) => {
      if (event !== 'ok') throw new Error('untrusted');
    });
    registerCommsIpc({
      ipcMain: { handle: (c, l) => handlers.set(c, l as never) },
      log,
      trusted,
      target: () => ({ isDestroyed: () => false, send }),
    });
    const m = queue.enqueue(base('/p', 'b'));
    expect(send).toHaveBeenCalledWith(
      COMMS_CHANNELS.event,
      expect.objectContaining({ type: 'iniciada' }),
    );
    const history = handlers.get(COMMS_CHANNELS.history);
    expect(history?.('ok', '/p')).toEqual([expect.objectContaining({ id: m.id })]);
    expect(() => history?.('bad', '/p')).toThrow('untrusted');
    expect(() => history?.('ok', 'relative')).toThrow();
  });
});

describe('commPreview', () => {
  it('flattens whitespace and truncates', () => {
    expect(commPreview('a\n  b')).toBe('a b');
    expect(commPreview('x'.repeat(200), 10)).toHaveLength(10);
  });
});
