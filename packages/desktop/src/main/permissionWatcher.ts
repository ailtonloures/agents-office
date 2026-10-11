import { parseServerMessage } from '@agents-office/shared';

export interface PermissionNotice {
  id: string;
  title: string;
  body: string;
}

export interface PermissionUpdate {
  pending: number;
  /**
   * Ids that stopped being pending in this update (resolved in the terminal, omitted by a fresh
   * snapshot, or dropped with the connection). Absent when there are none.
   */
  resolvedIds?: string[];
  /** Set when a brand-new request arrived (never for a snapshot or a repeated id). */
  notice?: PermissionNotice;
}

function withResolved(update: PermissionUpdate, resolvedIds: string[]): PermissionUpdate {
  return resolvedIds.length > 0 ? { ...update, resolvedIds } : update;
}

/**
 * Keeps the set of pending permission ids from the daemon's stream (pure, no sockets) and tells
 * when a system notification is due.
 */
export class PermissionTracker {
  private readonly pending = new Set<string>();

  get count(): number {
    return this.pending.size;
  }

  /** Forgets every pending id and returns them (they all count as resolved). */
  clear(): string[] {
    const ids = [...this.pending];
    this.pending.clear();
    return ids;
  }

  /** Feeds one decoded WebSocket frame. Unknown or invalid frames leave the state untouched. */
  apply(raw: unknown): PermissionUpdate {
    const parsed = parseServerMessage(raw);
    if (!parsed.success) return { pending: this.pending.size };
    const message = parsed.data;
    switch (message.kind) {
      case 'permission.snapshot': {
        const incoming = new Set(message.pending.map((request) => request.id));
        const resolvedIds = [...this.pending].filter((id) => !incoming.has(id));
        this.pending.clear();
        for (const id of incoming) this.pending.add(id);
        return withResolved({ pending: this.pending.size }, resolvedIds);
      }
      case 'permission.requested': {
        const { request } = message;
        const isNew = !this.pending.has(request.id);
        this.pending.add(request.id);
        if (!isNew) return { pending: this.pending.size };
        const summary = request.inputSummary.trim();
        return {
          pending: this.pending.size,
          notice: {
            id: request.id,
            title: 'Pedido de permissão do Claude Code',
            body: `${summary.length > 0 ? `${request.tool}: ${summary}` : request.tool}\nResponda no terminal.`,
          },
        };
      }
      case 'permission.resolved': {
        const wasPending = this.pending.delete(message.id);
        return withResolved({ pending: this.pending.size }, wasPending ? [message.id] : []);
      }
      default:
        return { pending: this.pending.size };
    }
  }
}

export interface SocketLike {
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  close(): void;
}

export interface PermissionWatcherDeps {
  url: string;
  createSocket(url: string): SocketLike;
  onUpdate(update: PermissionUpdate): void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  reconnectMs?: number;
}

/**
 * Listens to `/stream?role=ui` of the daemon from the main process, so a notification can fire
 * while the window is hidden. Reconnects until `stop()`.
 */
export class PermissionWatcher {
  readonly tracker = new PermissionTracker();
  private socket: SocketLike | undefined;
  private timer: unknown;
  private stopped = true;

  constructor(private readonly deps: PermissionWatcherDeps) {}

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer !== undefined) (this.deps.clearTimer ?? clearTimeout)(this.timer as never);
    this.timer = undefined;
    const socket = this.socket;
    this.socket = undefined;
    if (socket) {
      socket.onclose = null;
      socket.close();
    }
    this.deps.onUpdate(withResolved({ pending: 0 }, this.tracker.clear()));
  }

  private connect(): void {
    const socket = this.deps.createSocket(this.deps.url);
    this.socket = socket;
    socket.onmessage = (event) => {
      let raw: unknown;
      try {
        raw = JSON.parse(String(event.data));
      } catch {
        return;
      }
      this.deps.onUpdate(this.tracker.apply(raw));
    };
    socket.onerror = () => {};
    socket.onclose = () => {
      if (this.socket === socket) this.socket = undefined;
      // Without the stream nothing can be tracked: every pending request counts as resolved, so no
      // notification is left orphaned (the snapshot after reconnecting restores what is real).
      this.deps.onUpdate(withResolved({ pending: 0 }, this.tracker.clear()));
      if (this.stopped) return;
      const setTimer = this.deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
      this.timer = setTimer(() => {
        this.timer = undefined;
        if (!this.stopped) this.connect();
      }, this.deps.reconnectMs ?? 1000);
    };
  }
}
