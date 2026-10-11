import {
  createEmptyModel,
  type OfficeEvent,
  type OfficeModel,
  type PermissionDecision,
  type PermissionRequest,
  type ProfessionsConfig,
  parseServerMessage,
  reduce,
} from '@agents-office/shared';
import { applyRequested, applyResolved, applySnapshot } from '../ui/permissionLogic';
import { TypedEmitter } from './emitter';

export const RECONNECT_MIN_MS = 1000;
export const RECONNECT_MAX_MS = 10_000;

/** The subset of the browser `WebSocket` the client needs (injectable for tests). */
export interface SocketLike {
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  send(data: string): void;
  close(): void;
}

export interface OfficeClientOptions {
  /** WebSocket URL; default `ws(s)://<location.host>/stream?role=ui` (the UI role gets permissions). */
  url?: string;
  /** Default: `new WebSocket(url)`. */
  createSocket?: (url: string) => SocketLike;
  professions?: ProfessionsConfig;
  /** Called with non-fatal problems (malformed messages). Default: `console.warn`. */
  onWarning?: (message: string) => void;
}

export interface OfficeClientEvents {
  /** The model changed (new snapshot or after an event was folded in). */
  model: OfficeModel;
  /** An event was applied on top of the model. */
  event: OfficeEvent;
  /** Connection state changed (`true` once the socket is open). */
  connection: boolean;
  /** The pending permission requests changed (oldest first). */
  permissions: readonly PermissionRequest[];
}

/** Delay before reconnect attempt number `attempt` (0-based): 1 s doubling up to 10 s. */
export function reconnectDelay(attempt: number): number {
  return Math.min(RECONNECT_MIN_MS * 2 ** attempt, RECONNECT_MAX_MS);
}

export function defaultStreamUrl(location: { protocol: string; host: string }): string {
  return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/stream?role=ui`;
}

/**
 * Mirrors the daemon's `OfficeModel` over `/stream`: the snapshot replaces the model, every event
 * is folded in with the shared reducer (the same one the daemon runs). Reconnects with backoff.
 */
export class OfficeClient extends TypedEmitter<OfficeClientEvents> {
  private readonly url: string;
  private readonly createSocket: (url: string) => SocketLike;
  private readonly professions: ProfessionsConfig | undefined;
  private readonly warn: (message: string) => void;
  private model: OfficeModel = createEmptyModel();
  private connected = false;
  private hasSnapshot = false;
  private pending: readonly PermissionRequest[] = [];
  private socket: SocketLike | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private attempt = 0;
  private running = false;

  constructor(options: OfficeClientOptions = {}) {
    super();
    this.url = options.url ?? defaultStreamUrl(globalThis.location);
    this.createSocket = options.createSocket ?? ((url) => new WebSocket(url) as SocketLike);
    this.professions = options.professions;
    this.warn = options.onWarning ?? ((message) => console.warn(`[office-client] ${message}`));
  }

  getModel(): OfficeModel {
    return this.model;
  }

  isConnected(): boolean {
    return this.connected;
  }

  /** Pending permission requests, oldest first. */
  getPermissions(): readonly PermissionRequest[] {
    return this.pending;
  }

  /**
   * Sends the user's decision for a pending request and drops it from the local queue right away
   * (the daemon confirms with `permission.resolved`). Returns false when the socket is not open.
   */
  decide(id: string, decision: PermissionDecision): boolean {
    const socket = this.socket;
    if (!socket || !this.connected) return false;
    if (!this.pending.some((request) => request.id === id)) return false;
    try {
      socket.send(JSON.stringify({ kind: 'permission.decide', id, decision }));
    } catch (error) {
      this.warn(`could not send the decision: ${(error as Error).message}`);
      return false;
    }
    this.setPermissions(applyResolved(this.pending, id));
    return true;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.open();
  }

  stop(): void {
    this.running = false;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    const socket = this.socket;
    this.socket = undefined;
    if (socket) {
      detach(socket);
      socket.close();
    }
    this.setConnected(false);
    this.setPermissions([]);
  }

  /** Applies a snapshot as if the daemon had sent it (demo mode and tests). */
  feedSnapshot(model: OfficeModel): void {
    this.hasSnapshot = true;
    this.model = model;
    this.emit('model', this.model);
  }

  /** Folds an event in as if the daemon had streamed it (demo mode and tests). */
  feedEvent(event: OfficeEvent): void {
    this.model = reduce(
      this.model,
      event,
      this.professions ? { professions: this.professions } : {},
    );
    this.emit('event', event);
    this.emit('model', this.model);
  }

  /** Pretends the stream is open (demo mode, where no daemon is involved). */
  feedConnection(connected: boolean): void {
    this.setConnected(connected);
  }

  private open(): void {
    this.timer = undefined;
    let socket: SocketLike;
    try {
      socket = this.createSocket(this.url);
    } catch (error) {
      this.warn(`could not open socket: ${(error as Error).message}`);
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    this.hasSnapshot = false;
    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.attempt = 0;
      this.setConnected(true);
    };
    socket.onmessage = (message) => {
      if (this.socket === socket) this.handleMessage(message.data);
    };
    socket.onerror = () => {
      // A `close` always follows; reconnection is handled there.
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = undefined;
      this.setConnected(false);
      // Without the stream there is nobody to answer to: the next snapshot brings the real queue.
      this.setPermissions([]);
      this.scheduleReconnect();
    };
  }

  private handleMessage(data: unknown): void {
    let json: unknown;
    try {
      json = typeof data === 'string' ? JSON.parse(data) : undefined;
    } catch {
      json = undefined;
    }
    const parsed = parseServerMessage(json);
    if (!parsed.success) {
      this.warn('ignored a malformed stream message');
      return;
    }
    const message = parsed.data;
    if (message.kind === 'snapshot') {
      this.hasSnapshot = true;
      this.model = message.model;
      this.emit('model', this.model);
      return;
    }
    if (message.kind === 'permission.snapshot') {
      this.setPermissions(applySnapshot(message.pending));
      return;
    }
    if (message.kind === 'permission.requested') {
      this.setPermissions(applyRequested(this.pending, message.request));
      return;
    }
    if (message.kind === 'permission.resolved') {
      this.setPermissions(applyResolved(this.pending, message.id));
      return;
    }
    if (message.kind !== 'event') return;
    if (!this.hasSnapshot) return; // Events only make sense on top of a snapshot.
    this.model = reduce(
      this.model,
      message.event,
      this.professions ? { professions: this.professions } : {},
    );
    this.emit('event', message.event);
    this.emit('model', this.model);
  }

  private scheduleReconnect(): void {
    if (!this.running || this.timer !== undefined) return;
    const delay = reconnectDelay(this.attempt);
    this.attempt += 1;
    this.timer = setTimeout(() => {
      if (this.running) this.open();
    }, delay);
  }

  private setPermissions(next: readonly PermissionRequest[]): void {
    const same =
      next.length === this.pending.length && next.every((r, i) => r.id === this.pending[i]?.id);
    if (same) return;
    this.pending = next;
    this.emit('permissions', next);
  }

  private setConnected(connected: boolean): void {
    if (this.connected === connected) return;
    this.connected = connected;
    this.emit('connection', connected);
  }
}

function detach(socket: SocketLike): void {
  socket.onopen = null;
  socket.onmessage = null;
  socket.onclose = null;
  socket.onerror = null;
}
