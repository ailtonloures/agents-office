import { type CommEvent, commPreview } from '@agents-office/shared';

/** A message its sender is delivering in person (walking to the recipient's desk). */
export interface Visit {
  /** Message id. */
  id: string;
  cwd: string;
  fromEntryId: string;
  toEntryId: string;
  /** Short summary shown in the visitor's speech bubble. */
  preview: string;
  /** When the visit became the sender's current one (ms, scene clock); set by the controller. */
  startedAt: number | undefined;
}

export const VISIT_PREVIEW_MAX = 60;

/**
 * Turns the communication events into visits. Each sender has a FIFO of visits and makes one at a
 * time (a broadcast is just several messages: one recipient after the other). A visit ends when
 * its message is answered or expires; replies themselves never start a visit (the original sender
 * is not summoned back: the replier answers from its desk).
 */
export class VisitQueue {
  private readonly bySender = new Map<string, Visit[]>();

  /** Feeds one event; returns the visit that ended because of it, if any. */
  note(event: CommEvent): Visit | undefined {
    const m = event.message;
    if (event.type === 'iniciada') {
      if (m.replyTo !== undefined || m.fromEntryId === m.toEntryId) return undefined;
      const key = senderKey(m.cwd, m.fromEntryId);
      const list = this.bySender.get(key) ?? [];
      if (list.some((v) => v.id === m.id)) return undefined;
      list.push({
        id: m.id,
        cwd: m.cwd,
        fromEntryId: m.fromEntryId,
        toEntryId: m.toEntryId,
        preview: commPreview(m.text, VISIT_PREVIEW_MAX),
        startedAt: undefined,
      });
      this.bySender.set(key, list);
      return undefined;
    }
    if (event.type === 'respondida' || event.type === 'expirada') return this.drop(m.id);
    return undefined;
  }

  /** The visit `entryId` is making right now (head of its line). */
  current(cwd: string, entryId: string): Visit | undefined {
    return this.bySender.get(senderKey(cwd, entryId))?.[0];
  }

  /** Visits of a sender, in order (the first resolvable one is the current one). */
  list(cwd: string, entryId: string): readonly Visit[] {
    return this.bySender.get(senderKey(cwd, entryId)) ?? [];
  }

  get(messageId: string): Visit | undefined {
    for (const list of this.bySender.values()) {
      const found = list.find((v) => v.id === messageId);
      if (found) return found;
    }
    return undefined;
  }

  /** Removes a visit (answered, expired or timed out); returns it. */
  drop(messageId: string): Visit | undefined {
    for (const [key, list] of this.bySender) {
      const index = list.findIndex((v) => v.id === messageId);
      if (index < 0) continue;
      const [gone] = list.splice(index, 1);
      if (list.length === 0) this.bySender.delete(key);
      return gone;
    }
    return undefined;
  }

  /** Visits still waiting behind the current one for this sender. */
  pending(cwd: string, entryId: string): number {
    return Math.max(0, (this.bySender.get(senderKey(cwd, entryId))?.length ?? 0) - 1);
  }

  clear(): void {
    this.bySender.clear();
  }
}

const senderKey = (cwd: string, entryId: string): string => `${cwd}\u0000${entryId}`;
