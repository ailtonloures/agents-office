import type { CommEvent, CommMessage } from '@agents-office/shared';
import { describe, expect, it } from 'vitest';
import { VISIT_DOTS_MS, VISIT_TEXT_MS, visitBubbleText } from '../src/characters/balloons';
import { VisitQueue } from '../src/characters/visits';

const message = (id: string, to: string, extra: Partial<CommMessage> = {}): CommMessage => ({
  id,
  cwd: '/p',
  fromEntryId: 'a',
  fromName: 'A',
  toEntryId: to,
  toName: to,
  text: `pedido ${id}`,
  status: 'na-fila',
  createdAt: '2026-01-01T00:00:00Z',
  ...extra,
});
const event = (type: CommEvent['type'], m: CommMessage): CommEvent => ({
  type,
  message: m,
  at: '2026-01-01T00:00:00Z',
});

describe('VisitQueue', () => {
  it('queues one visit per message, in order, per sender (broadcast: one at a time)', () => {
    const q = new VisitQueue();
    q.note(event('iniciada', message('m1', 'b')));
    q.note(event('iniciada', message('m2', 'c')));
    expect(q.list('/p', 'a').map((v) => v.id)).toEqual(['m1', 'm2']);
    expect(q.current('/p', 'a')?.toEntryId).toBe('b');
    expect(q.pending('/p', 'a')).toBe(1);
    expect(q.current('/p', 'b')).toBeUndefined();
  });

  it('ends the visit on the reply and moves to the next recipient', () => {
    const q = new VisitQueue();
    q.note(event('iniciada', message('m1', 'b')));
    q.note(event('iniciada', message('m2', 'c')));
    expect(q.note(event('respondida', message('m1', 'b', { status: 'respondida' })))?.id).toBe(
      'm1',
    );
    expect(q.current('/p', 'a')?.id).toBe('m2');
  });

  it('ends the visit on expiry; delivery alone keeps the sender there', () => {
    const q = new VisitQueue();
    q.note(event('iniciada', message('m1', 'b')));
    q.note(event('entregue', message('m1', 'b', { status: 'entregue' })));
    expect(q.current('/p', 'a')?.id).toBe('m1');
    q.note(event('expirada', message('m1', 'b', { status: 'expirada' })));
    expect(q.current('/p', 'a')).toBeUndefined();
  });

  it('ignores replies, self messages and repeated events', () => {
    const q = new VisitQueue();
    q.note(event('iniciada', message('r1', 'a', { fromEntryId: 'b', replyTo: 'm1' })));
    q.note(event('iniciada', message('s1', 'a')));
    q.note(event('iniciada', message('m1', 'b')));
    q.note(event('iniciada', message('m1', 'b')));
    expect(q.list('/p', 'a')).toHaveLength(1);
    expect(q.list('/p', 'b')).toHaveLength(0);
  });

  it('scopes by project', () => {
    const q = new VisitQueue();
    q.note(event('iniciada', message('m1', 'b', { cwd: '/other' })));
    expect(q.current('/p', 'a')).toBeUndefined();
    expect(q.current('/other', 'a')?.id).toBe('m1');
  });

  it('keeps a short summary of the text', () => {
    const q = new VisitQueue();
    q.note(event('iniciada', message('m1', 'b', { text: 'x'.repeat(300) })));
    expect(q.get('m1')?.preview.length).toBeLessThanOrEqual(60);
  });
});

describe('visitBubbleText', () => {
  it('alternates the summary and the dots balloon', () => {
    expect(visitBubbleText(0, 'Revisar o PR')).toBe('Revisar o PR');
    expect(visitBubbleText(VISIT_TEXT_MS + 1, 'Revisar o PR')).toBeUndefined();
    expect(visitBubbleText(VISIT_TEXT_MS + VISIT_DOTS_MS + 5, 'Revisar o PR')).toBe('Revisar o PR');
    expect(visitBubbleText(0, '  ')).toBeUndefined();
  });
});
