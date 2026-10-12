import { randomUUID } from 'node:crypto';

/** Lifecycle of a message: queued -> delivered -> replied; a queued one can expire. */
export type MessageStatus = 'na-fila' | 'entregue' | 'respondida' | 'expirada';

export interface AgentMessage {
  id: string;
  /** Project path; messages never cross projects. */
  cwd: string;
  fromEntryId: string;
  fromName: string;
  toEntryId: string;
  toName: string;
  text: string;
  context?: string;
  /** Set when this message is a reply: id of the message it answers. */
  replyTo?: string;
  /** Messages exchanged in the project since the last human intervention, this one included. */
  hops?: number;
  status: MessageStatus;
  createdAt: string;
  deliveredAt?: string;
  repliedAt?: string;
}

export type MessageEvent =
  | { type: 'enqueued'; message: AgentMessage }
  | { type: 'delivered'; message: AgentMessage }
  | { type: 'replied'; message: AgentMessage }
  | { type: 'expired'; message: AgentMessage };

export interface MessageQueueOptions {
  now?: () => number;
  newId?: () => string;
  /** Messages kept for history (any status); the oldest settled ones are dropped first. */
  historyMax?: number;
  /** Queued messages per destination. */
  queueMax?: number;
  /** A queued message older than this expires. */
  ttlMs?: number;
}

export const MESSAGE_HISTORY_MAX = 200;
export const MESSAGE_QUEUE_MAX = 20;
export const MESSAGE_TTL_MS = 30 * 60 * 1000;

export class QueueFullError extends Error {
  constructor(max: number) {
    super(`The destination already has ${max} messages waiting. Try again later.`);
    this.name = 'QueueFullError';
  }
}

export const destinationKey = (cwd: string, entryId: string): string => `${cwd}\u0000${entryId}`;

/**
 * In-memory FIFO queue per destination agent. Nothing is persisted: closing the app drops every
 * queue and the history.
 */
export class MessageQueue {
  /** Insertion order == creation order. */
  private readonly messages = new Map<string, AgentMessage>();
  private readonly listeners = new Set<(event: MessageEvent) => void>();

  constructor(private readonly options: MessageQueueOptions = {}) {}

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  private stamp(): string {
    return new Date(this.now()).toISOString();
  }

  onEvent(listener: (event: MessageEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: MessageEvent): void {
    for (const listener of this.listeners) {
      try {
        listener({ ...event, message: { ...event.message } });
      } catch {
        // A failing listener must not break the queue.
      }
    }
  }

  /** Adds a message at the end of the destination's queue. Throws `QueueFullError`. */
  enqueue(
    input: Omit<AgentMessage, 'id' | 'status' | 'createdAt' | 'deliveredAt' | 'repliedAt'>,
  ): AgentMessage {
    this.expireStale();
    const max = this.options.queueMax ?? MESSAGE_QUEUE_MAX;
    if (this.queuedFor(input.cwd, input.toEntryId).length >= max) throw new QueueFullError(max);
    const message: AgentMessage = {
      ...input,
      id: this.options.newId?.() ?? `msg-${randomUUID().slice(0, 8)}`,
      status: 'na-fila',
      createdAt: this.stamp(),
    };
    this.messages.set(message.id, message);
    this.trim();
    this.emit({ type: 'enqueued', message });
    return { ...message };
  }

  /** Records the hop count of a message just enqueued. */
  setHops(id: string, hops: number): void {
    const message = this.messages.get(id);
    if (message) message.hops = hops;
  }

  get(id: string): AgentMessage | undefined {
    const message = this.messages.get(id);
    return message ? { ...message } : undefined;
  }

  /** Messages waiting for a destination, oldest first. */
  queuedFor(cwd: string, toEntryId: string): AgentMessage[] {
    return [...this.messages.values()]
      .filter((m) => m.status === 'na-fila' && m.cwd === cwd && m.toEntryId === toEntryId)
      .map((m) => ({ ...m }));
  }

  /** Destinations that have something waiting. */
  destinationsWithQueue(): Array<{ cwd: string; entryId: string }> {
    const seen = new Map<string, { cwd: string; entryId: string }>();
    for (const m of this.messages.values()) {
      if (m.status !== 'na-fila') continue;
      seen.set(destinationKey(m.cwd, m.toEntryId), { cwd: m.cwd, entryId: m.toEntryId });
    }
    return [...seen.values()];
  }

  /** Oldest queued message of a destination (does not remove it). */
  peek(cwd: string, toEntryId: string): AgentMessage | undefined {
    return this.queuedFor(cwd, toEntryId)[0];
  }

  markDelivered(id: string): AgentMessage | undefined {
    const message = this.messages.get(id);
    if (message?.status !== 'na-fila') return undefined;
    message.status = 'entregue';
    message.deliveredAt = this.stamp();
    this.emit({ type: 'delivered', message });
    return { ...message };
  }

  /** Marks a delivered message as answered. */
  markReplied(id: string): AgentMessage | undefined {
    const message = this.messages.get(id);
    if (message?.status !== 'entregue') return undefined;
    message.status = 'respondida';
    message.repliedAt = this.stamp();
    this.emit({ type: 'replied', message });
    return { ...message };
  }

  /** Expires every queued message of a destination (its session ended). */
  expireFor(cwd: string, toEntryId: string): AgentMessage[] {
    const out: AgentMessage[] = [];
    for (const m of this.messages.values()) {
      if (m.status === 'na-fila' && m.cwd === cwd && m.toEntryId === toEntryId) {
        m.status = 'expirada';
        this.emit({ type: 'expired', message: m });
        out.push({ ...m });
      }
    }
    return out;
  }

  /** Expires queued messages older than the TTL. */
  expireStale(): AgentMessage[] {
    const ttl = this.options.ttlMs ?? MESSAGE_TTL_MS;
    const limit = this.now() - ttl;
    const out: AgentMessage[] = [];
    for (const m of this.messages.values()) {
      if (m.status === 'na-fila' && Date.parse(m.createdAt) <= limit) {
        m.status = 'expirada';
        this.emit({ type: 'expired', message: m });
        out.push({ ...m });
      }
    }
    return out;
  }

  /** Newest first. */
  history(limit?: number): AgentMessage[] {
    const all = [...this.messages.values()].reverse().map((m) => ({ ...m }));
    return limit === undefined ? all : all.slice(0, limit);
  }

  /** Drops every queue and the history (app closing). */
  clear(): void {
    this.messages.clear();
  }

  /** Keeps the history bounded: settled messages go first, queued ones only as a last resort. */
  private trim(): void {
    const max = this.options.historyMax ?? MESSAGE_HISTORY_MAX;
    let excess = this.messages.size - max;
    if (excess <= 0) return;
    for (const [id, m] of this.messages) {
      if (excess <= 0) break;
      if (m.status !== 'na-fila') {
        this.messages.delete(id);
        excess--;
      }
    }
    for (const id of this.messages.keys()) {
      if (excess <= 0) break;
      this.messages.delete(id);
      excess--;
    }
  }
}
