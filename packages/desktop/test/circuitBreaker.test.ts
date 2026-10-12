import { describe, expect, it } from 'vitest';
import { CircuitBreaker, HOP_LIMIT } from '../src/main/agentBus/circuitBreaker';
import type { IdleProbe } from '../src/main/agentBus/idleSource';
import { MessageQueue } from '../src/main/agentBus/messageQueue';
import { Messaging } from '../src/main/agentBus/messaging';

const CWD = '/p';

function setup() {
  let now = 0;
  const paused: Array<[string, number]> = [];
  const breaker = new CircuitBreaker({ now: () => now, onPause: (c, h) => paused.push([c, h]) });
  const writes: string[] = [];
  const listeners = new Set<() => void>();
  const probe: IdleProbe = {
    isIdle: () => true,
    onChange: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
  const messaging = new Messaging({
    breaker,
    queue: new MessageQueue({ now: () => now }),
    idle: probe,
    now: () => now,
    write: (_t, data) => writes.push(data),
    setTimer: () => 0,
    directory: {
      entries: () => [
        { entryId: 'ana', name: 'Ana' },
        { entryId: 'bia', name: 'Bia' },
      ],
      terminalOf: (_c, id) => `t-${id}`,
      canTalk: () => true,
    },
  });
  const session = (entryId: string) => ({ sessionId: 's', entryId, cwd: CWD, role: 'padrao' });
  return { breaker, messaging, paused, writes, session, advance: (ms: number) => (now += ms) };
}

describe('CircuitBreaker', () => {
  it('counts hops and pauses once at the limit', () => {
    const b = new CircuitBreaker({ onPause: () => {} });
    for (let i = 1; i < HOP_LIMIT; i++) expect(b.noteMessage(CWD)).toBe(i);
    expect(b.isPaused(CWD)).toBe(false);
    expect(b.noteMessage(CWD)).toBe(HOP_LIMIT);
    expect(b.isPaused(CWD)).toBe(true);
    expect(b.status(CWD)).toMatchObject({ paused: true, hops: HOP_LIMIT, hopLimit: HOP_LIMIT });
  });

  it('notifies the pause only once', () => {
    const { breaker, paused } = setup();
    for (let i = 0; i < HOP_LIMIT + 3; i++) breaker.noteMessage(CWD);
    expect(paused).toEqual([[CWD, HOP_LIMIT]]);
  });

  it('resets the count when the user types, and resumes', () => {
    const b = new CircuitBreaker();
    for (let i = 0; i < 5; i++) b.noteMessage(CWD);
    expect(b.userActivity(CWD)).toBe(false);
    expect(b.status(CWD).hops).toBe(0);
    for (let i = 0; i < HOP_LIMIT; i++) b.noteMessage(CWD);
    expect(b.userActivity(CWD)).toBe(true);
    expect(b.isPaused(CWD)).toBe(false);
  });

  it('keeps projects independent', () => {
    const b = new CircuitBreaker();
    for (let i = 0; i < HOP_LIMIT; i++) b.noteMessage(CWD);
    expect(b.isPaused('/other')).toBe(false);
  });

  it('rate-limits per sender within a sliding window', () => {
    let now = 0;
    const b = new CircuitBreaker({ rateLimit: 2, rateWindowMs: 1000, now: () => now });
    expect(b.allowSend(CWD, 'ana')).toBe(true);
    expect(b.allowSend(CWD, 'ana')).toBe(true);
    expect(b.allowSend(CWD, 'ana')).toBe(false);
    expect(b.allowSend(CWD, 'bia')).toBe(true);
    now = 1001;
    expect(b.allowSend(CWD, 'ana')).toBe(true);
  });
});

describe('Messaging with the breaker', () => {
  it('pauses deliveries at the limit and resumes on user input', () => {
    const s = setup();
    // Each delivery needs the destination to be seen busy; use sends to distinct moments instead.
    for (let i = 0; i < HOP_LIMIT; i++) {
      s.advance(20_000);
      const r = s.messaging.send(s.session(i % 2 ? 'bia' : 'ana'), i % 2 ? 'Ana' : 'Bia', `m${i}`);
      expect(r.isError).toBeUndefined();
    }
    expect(s.breaker.isPaused(CWD)).toBe(true);
    const before = s.writes.length;
    s.advance(20_000);
    const held = s.messaging.send(s.session('ana'), 'Bia', 'extra');
    expect(JSON.parse(held.text).note).toContain('paused');
    expect(s.writes.length).toBe(before);
    s.messaging.userActivity(CWD);
    expect(s.breaker.isPaused(CWD)).toBe(false);
    expect(s.writes.length).toBeGreaterThan(before);
  });

  it('"encerrar" drops waiting messages and resumes', () => {
    const s = setup();
    for (let i = 0; i < HOP_LIMIT; i++) s.breaker.noteMessage(CWD);
    s.messaging.send(s.session('ana'), 'Bia', 'hi');
    s.messaging.stopConversations(CWD);
    expect(s.breaker.isPaused(CWD)).toBe(false);
    s.messaging.flush();
    expect(s.writes).toHaveLength(0);
  });

  it('muted agents neither send nor receive', () => {
    const s = setup();
    s.messaging.setMuted(CWD, 'bia', true);
    expect(s.messaging.send(s.session('ana'), 'Bia', 'hi').isError).toBe(true);
    expect(s.messaging.send(s.session('bia'), 'Ana', 'hi').isError).toBe(true);
    expect(s.messaging.listAgents(s.session('ana')).map((a) => a.name)).not.toContain('Bia');
    expect(s.writes).toHaveLength(0);
    s.messaging.setMuted(CWD, 'bia', false);
    expect(s.messaging.send(s.session('ana'), 'Bia', 'hi').isError).toBeUndefined();
  });

  it('drops waiting messages when the destination gets muted', () => {
    const s = setup();
    s.breaker.noteMessage(CWD);
    for (let i = 0; i < HOP_LIMIT; i++) s.breaker.noteMessage(CWD);
    s.messaging.send(s.session('ana'), 'Bia', 'hi');
    s.messaging.setMuted(CWD, 'bia', true);
    s.breaker.userActivity(CWD);
    s.messaging.flush();
    expect(s.writes).toHaveLength(0);
  });

  it('rate-limits the sender', () => {
    const s = setup();
    let blocked = 0;
    for (let i = 0; i < 12; i++) {
      if (s.messaging.send(s.session('ana'), 'Bia', `m${i}`).isError) blocked++;
    }
    expect(blocked).toBeGreaterThan(0);
  });
});
