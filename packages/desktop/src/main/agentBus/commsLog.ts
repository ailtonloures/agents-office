import {
  COMM_HISTORY_MAX,
  type CommEvent,
  type CommEventType,
  type CommMessage,
} from '@agents-office/shared';
import type { MessageEvent, MessageQueue } from './messageQueue';

const EVENT_TYPE: Record<MessageEvent['type'], CommEventType> = {
  enqueued: 'iniciada',
  delivered: 'entregue',
  replied: 'respondida',
  expired: 'expirada',
};

const toCommMessage = (m: MessageEvent['message']): CommMessage => ({
  id: m.id,
  cwd: m.cwd,
  fromEntryId: m.fromEntryId,
  fromName: m.fromName,
  toEntryId: m.toEntryId,
  toName: m.toName,
  text: m.text,
  ...(m.context !== undefined ? { context: m.context } : {}),
  ...(m.replyTo !== undefined ? { replyTo: m.replyTo } : {}),
  status: m.status,
  createdAt: m.createdAt,
  ...(m.deliveredAt !== undefined ? { deliveredAt: m.deliveredAt } : {}),
  ...(m.repliedAt !== undefined ? { repliedAt: m.repliedAt } : {}),
});

/**
 * Per-project, size-bounded history of agent messages (full text), fed by the queue events. It
 * also fans each event out to subscribers (the renderer), whether or not any panel is open.
 */
export class CommsLog {
  private readonly byProject = new Map<string, Map<string, CommMessage>>();
  private readonly listeners = new Set<(event: CommEvent) => void>();
  private off: (() => void) | undefined;

  constructor(private readonly options: { max?: number; now?: () => number } = {}) {}

  /** Starts following a queue. */
  attach(queue: MessageQueue): void {
    this.off?.();
    this.off = queue.onEvent((event) => this.record(event));
  }

  detach(): void {
    this.off?.();
    this.off = undefined;
  }

  onEvent(listener: (event: CommEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private record(event: MessageEvent): void {
    const message = toCommMessage(event.message);
    const max = this.options.max ?? COMM_HISTORY_MAX;
    let project = this.byProject.get(message.cwd);
    if (!project) {
      project = new Map();
      this.byProject.set(message.cwd, project);
    }
    project.set(message.id, message);
    // Oldest first (insertion order): drop settled ones before still-waiting ones.
    let excess = project.size - max;
    for (const [id, m] of project) {
      if (excess <= 0) break;
      if (m.status !== 'na-fila' && id !== message.id) {
        project.delete(id);
        excess--;
      }
    }
    for (const id of project.keys()) {
      if (excess <= 0) break;
      if (id !== message.id) {
        project.delete(id);
        excess--;
      }
    }
    const at = new Date(this.options.now?.() ?? Date.now()).toISOString();
    const out: CommEvent = { type: EVENT_TYPE[event.type], message: { ...message }, at };
    for (const listener of this.listeners) {
      try {
        listener(out);
      } catch {
        // A failing subscriber must not break the others.
      }
    }
  }

  /** Messages of a project, newest first. */
  history(cwd: string): CommMessage[] {
    const project = this.byProject.get(cwd);
    return project ? [...project.values()].reverse().map((m) => ({ ...m })) : [];
  }

  clear(): void {
    this.byProject.clear();
  }
}
