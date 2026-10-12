import {
  createEmptyModel,
  isLive,
  type OfficeModel,
  parseServerMessage,
  reduce,
} from '@agents-office/shared';

/** What the messaging service needs to know about running terminals. */
export interface IdleProbe {
  /** True only when the agent running in the terminal is known to be idle (waiting for a prompt). */
  isIdle(terminalId: string): boolean;
  /** Fires whenever the office model changes. Returns the unsubscribe function. */
  onChange(listener: () => void): () => void;
}

/** True when the session bound to `terminalId` is idle in the model. Unknown means not idle. */
export function terminalIsIdle(model: OfficeModel, terminalId: string): boolean {
  const session = Object.values(model.sessions).find((s) => s.terminalId === terminalId);
  return session?.status === 'idle';
}

interface SocketLike {
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  close(): void;
}

export interface OfficeIdleSourceOptions {
  /** `ws://127.0.0.1:<port>/stream`. */
  url: string;
  connect?: (url: string) => SocketLike;
  retryMs?: number;
  setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}

/**
 * Keeps its own copy of the office model by following the daemon stream (the same snapshot +
 * events the web client gets), so "idle" is judged by the same model that draws the office.
 */
export class OfficeIdleSource implements IdleProbe {
  private model: OfficeModel = createEmptyModel();
  private socket: SocketLike | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly options: OfficeIdleSourceOptions) {}

  isIdle(terminalId: string): boolean {
    return terminalIsIdle(this.model, terminalId);
  }

  /** Id of the live session bound to `terminalId` in the model, or null. */
  liveSessionIdOfTerminal(terminalId: string): string | null {
    const session = Object.values(this.model.sessions).find((s) => s.terminalId === terminalId);
    return session && isLive(session) ? session.id : null;
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.open();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) (this.options.clearTimer ?? clearTimeout)(this.timer);
    this.timer = null;
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onclose = null;
      try {
        socket.close();
      } catch {
        // Already closed.
      }
    }
  }

  private open(): void {
    let socket: SocketLike;
    try {
      socket = this.options.connect
        ? this.options.connect(this.options.url)
        : (new WebSocket(this.options.url) as unknown as SocketLike);
    } catch {
      this.retry();
      return;
    }
    this.socket = socket;
    socket.onmessage = (event) => this.handle(event.data);
    socket.onclose = () => {
      this.socket = null;
      this.retry();
    };
    socket.onerror = () => {
      // `close` follows; nothing to do here.
    };
  }

  private retry(): void {
    if (this.stopped || this.timer) return;
    const set = this.options.setTimer ?? setTimeout;
    this.timer = set(() => {
      this.timer = null;
      if (!this.stopped) this.open();
    }, this.options.retryMs ?? 2000);
  }

  private handle(data: unknown): void {
    let json: unknown;
    try {
      json = JSON.parse(typeof data === 'string' ? data : String(data));
    } catch {
      return;
    }
    const parsed = parseServerMessage(json);
    if (!parsed.success) return;
    const message = parsed.data;
    if (message.kind === 'snapshot') this.model = message.model;
    else if (message.kind === 'event') this.model = reduce(this.model, message.event);
    else return;
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // Isolated.
      }
    }
  }
}
