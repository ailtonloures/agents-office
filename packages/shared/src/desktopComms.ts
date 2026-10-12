// Contract of the communication-events bridge that the desktop shell exposes to the web app
// (`window.agentsOfficeDesktop.comms`): every state of an agent-to-agent message, plus a
// per-project history with the full text.

/** Lifecycle of a message between agents (mirrors the agent bus queue statuses). */
export type CommMessageStatus = 'na-fila' | 'entregue' | 'respondida' | 'expirada';

/** What happened to a message: started (queued), delivered, answered or expired. */
export type CommEventType = 'iniciada' | 'entregue' | 'respondida' | 'expirada';

export interface CommMessage {
  id: string;
  /** Project path. */
  cwd: string;
  fromEntryId: string;
  fromName: string;
  toEntryId: string;
  toName: string;
  /** Full text, never truncated. */
  text: string;
  context?: string;
  /** Id of the message this one answers, when it is a reply. */
  replyTo?: string;
  status: CommMessageStatus;
  createdAt: string;
  deliveredAt?: string;
  repliedAt?: string;
}

export interface CommEvent {
  type: CommEventType;
  message: CommMessage;
  /** ISO timestamp of the event. */
  at: string;
}

/** Messages kept per project in the history. */
export const COMM_HISTORY_MAX = 100;

export interface CommsBridge {
  /** Messages of a project, newest first, with the full text. */
  history(cwd: string): Promise<CommMessage[]>;
  /** Subscribes to every message state change (independent of any panel); returns unsubscribe. */
  onEvent(listener: (event: CommEvent) => void): () => void;
}

/** One-line preview of a message text for list rows. */
export function commPreview(text: string, max = 80): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
