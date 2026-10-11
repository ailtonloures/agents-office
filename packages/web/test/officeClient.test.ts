import {
  createEmptyModel,
  type OfficeEvent,
  type OfficeModel,
  type PermissionRequest,
  reduce,
  type ServerMessage,
} from '@agents-office/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  defaultStreamUrl,
  OfficeClient,
  RECONNECT_MAX_MS,
  reconnectDelay,
  type SocketLike,
} from '../src/net/officeClient';

class FakeSocket implements SocketLike {
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  closed = false;
  sent: string[] = [];
  constructor(readonly url: string) {}
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.closed = true;
  }
  open(): void {
    this.onopen?.({});
  }
  /** Delivers a message from the daemon to the client. */
  push(message: ServerMessage | string): void {
    this.onmessage?.({ data: typeof message === 'string' ? message : JSON.stringify(message) });
  }
  drop(): void {
    this.onclose?.({});
  }
}

const T0 = '2026-10-10T12:00:00.000Z';
const sessionStarted: OfficeEvent = {
  type: 'session.started',
  ts: T0,
  source: 'jsonl',
  sessionId: 's1',
  projectId: 'p1',
  cwd: '/work/demo',
};

let sockets: FakeSocket[];
let warnings: string[];

function makeClient(): OfficeClient {
  return new OfficeClient({
    url: 'ws://test/stream',
    createSocket: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
    onWarning: (message) => warnings.push(message),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  sockets = [];
  warnings = [];
});
afterEach(() => {
  vi.useRealTimers();
});

describe('reconnectDelay', () => {
  it('doubles from 1 s up to 10 s', () => {
    expect([0, 1, 2, 3, 4, 10].map(reconnectDelay)).toEqual([
      1000, 2000, 4000, 8000, 10_000, 10_000,
    ]);
    expect(reconnectDelay(50)).toBe(RECONNECT_MAX_MS);
  });
});

describe('OfficeClient', () => {
  it('connects, applies the snapshot and emits connection/model', () => {
    const client = makeClient();
    const connection: boolean[] = [];
    const models: OfficeModel[] = [];
    client.on('connection', (c) => connection.push(c));
    client.on('model', (m) => models.push(m));
    client.start();
    expect(sockets[0]?.url).toBe('ws://test/stream');
    expect(client.isConnected()).toBe(false);

    sockets[0]?.open();
    const snapshot = reduce(createEmptyModel(), sessionStarted);
    sockets[0]?.push({ kind: 'snapshot', model: snapshot });

    expect(connection).toEqual([true]);
    expect(client.isConnected()).toBe(true);
    expect(client.getModel()).toEqual(snapshot);
    expect(models).toHaveLength(1);
  });

  it('folds events with the shared reducer', () => {
    const client = makeClient();
    const events: OfficeEvent[] = [];
    client.on('event', (e) => events.push(e));
    client.start();
    sockets[0]?.open();
    sockets[0]?.push({ kind: 'snapshot', model: createEmptyModel() });
    sockets[0]?.push({ kind: 'event', event: sessionStarted });

    expect(events).toEqual([sessionStarted]);
    expect(client.getModel()).toEqual(reduce(createEmptyModel(), sessionStarted));
    expect(Object.keys(client.getModel().sessions)).toEqual(['s1']);
  });

  it('ignores events before the snapshot and malformed messages', () => {
    const client = makeClient();
    client.start();
    sockets[0]?.open();
    sockets[0]?.push({ kind: 'event', event: sessionStarted });
    expect(client.getModel()).toEqual(createEmptyModel());
    sockets[0]?.push('not json');
    sockets[0]?.push('{"kind":"nope"}');
    expect(warnings).toHaveLength(2);
  });

  it('reconnects with backoff 1 s -> 2 s -> ... capped at 10 s, resetting after a successful open', () => {
    const client = makeClient();
    client.start();
    const delays: number[] = [];
    let last = Date.now();
    for (let i = 0; i < 6; i++) {
      sockets.at(-1)?.drop();
      const before = sockets.length;
      for (let ms = 0; sockets.length === before; ms += 100) {
        vi.advanceTimersByTime(100);
        if (ms > 20_000) throw new Error('no reconnect');
      }
      delays.push(Date.now() - last);
      last = Date.now();
    }
    expect(delays).toEqual([1000, 2000, 4000, 8000, 10_000, 10_000]);

    sockets.at(-1)?.open();
    sockets.at(-1)?.drop();
    vi.advanceTimersByTime(999);
    const count = sockets.length;
    vi.advanceTimersByTime(1);
    expect(sockets.length).toBe(count + 1);
  });

  it('flags disconnection and replaces the model with the new snapshot on reconnect', () => {
    const client = makeClient();
    const connection: boolean[] = [];
    client.on('connection', (c) => connection.push(c));
    client.start();
    sockets[0]?.open();
    sockets[0]?.push({ kind: 'snapshot', model: reduce(createEmptyModel(), sessionStarted) });
    expect(Object.keys(client.getModel().sessions)).toEqual(['s1']);

    sockets[0]?.drop();
    expect(client.isConnected()).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(2);
    sockets[1]?.open();
    sockets[1]?.push({ kind: 'snapshot', model: createEmptyModel() });

    expect(connection).toEqual([true, false, true]);
    expect(client.getModel()).toEqual(createEmptyModel());
  });

  it('stop() closes the socket and does not reconnect', () => {
    const client = makeClient();
    client.start();
    sockets[0]?.open();
    client.stop();
    expect(sockets[0]?.closed).toBe(true);
    expect(client.isConnected()).toBe(false);
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);
  });
});

const request = (id: string, ts = T0): PermissionRequest => ({
  id,
  sessionId: 's1',
  actorId: 's1',
  tool: 'Bash',
  inputSummary: 'ls',
  ts,
});

describe('OfficeClient permissions', () => {
  it('connects as the UI role by default', () => {
    expect(defaultStreamUrl({ protocol: 'http:', host: 'x:1' })).toBe('ws://x:1/stream?role=ui');
    expect(defaultStreamUrl({ protocol: 'https:', host: 'x' })).toBe('wss://x/stream?role=ui');
  });

  it('keeps the queue from snapshot, requested and resolved, oldest first', () => {
    const client = makeClient();
    const seen: string[][] = [];
    client.on('permissions', (list) => seen.push(list.map((r) => r.id)));
    client.start();
    sockets[0]?.open();
    sockets[0]?.push({
      kind: 'permission.snapshot',
      pending: [request('b', '2026-10-10T12:00:02Z')],
    });
    sockets[0]?.push({
      kind: 'permission.requested',
      request: request('a', '2026-10-10T12:00:01Z'),
    });
    sockets[0]?.push({
      kind: 'permission.requested',
      request: request('a', '2026-10-10T12:00:01Z'),
    });
    expect(client.getPermissions().map((r) => r.id)).toEqual(['a', 'b']);
    // Answered in the terminal: the request goes away silently, an unknown id changes nothing.
    sockets[0]?.push({ kind: 'permission.resolved', id: 'a' });
    sockets[0]?.push({ kind: 'permission.resolved', id: 'zzz' });
    expect(client.getPermissions().map((r) => r.id)).toEqual(['b']);
    expect(seen).toEqual([['b'], ['a', 'b'], ['b']]);
  });

  it('empties the queue when the stream drops (the next snapshot restores it)', () => {
    const client = makeClient();
    client.start();
    sockets[0]?.open();
    sockets[0]?.push({ kind: 'permission.snapshot', pending: [request('a')] });
    sockets[0]?.drop();
    expect(client.getPermissions()).toEqual([]);
    vi.advanceTimersByTime(1000);
    sockets[1]?.open();
    sockets[1]?.push({ kind: 'permission.snapshot', pending: [request('a')] });
    expect(client.getPermissions().map((r) => r.id)).toEqual(['a']);
  });
});
