import type {
  BrowserApprovalKind,
  BrowserApprovalRequest,
  BrowserApprovalResponse,
} from '@agents-office/shared';

/** How long a browser action waits for the user before it is denied (fail closed). */
export const BROWSER_APPROVAL_TIMEOUT_MS = 2 * 60 * 1000;

export interface BrowserApprovalDeps {
  /** Pushes the card to the window; it is also served by `pending()` on (re)load. */
  pushRequest(request: BrowserApprovalRequest): void;
  pushResolved(id: string): void;
  /** System notification so the user notices the card. */
  notify(request: BrowserApprovalRequest): void;
  dismissNotice(id: string): void;
  newId?: () => string;
  now?: () => Date;
  timeoutMs?: number;
}

export interface BrowserApprovalAsk {
  cwd: string;
  kind: BrowserApprovalKind;
  title: string;
  detail: string;
  origin?: string;
  agentName?: string;
}

interface Waiting {
  request: BrowserApprovalRequest;
  resolve(allowed: boolean): void;
  timer: ReturnType<typeof setTimeout>;
}

const keyOf = (cwd: string): string => cwd.replace(/[\\/]+$/, '') || cwd;

/**
 * Confirmation cards of the embedded browser: downloads, site permissions and `browser_eval`.
 * Nothing runs without an explicit "Permitir": denial, timeout, shutdown, a failing UI and a
 * pause all resolve to `false`.
 */
export class BrowserApprovals {
  private readonly waiting = new Map<string, Waiting>();
  private counter = 0;

  constructor(private readonly deps: BrowserApprovalDeps) {}

  /** Resolves true only when the user allowed it. */
  ask(input: BrowserApprovalAsk): Promise<boolean> {
    const id = this.deps.newId?.() ?? `bro-${Date.now().toString(36)}-${++this.counter}`;
    const request: BrowserApprovalRequest = {
      id,
      cwd: input.cwd,
      kind: input.kind,
      title: input.title,
      detail: input.detail,
      ...(input.origin ? { origin: input.origin } : {}),
      ...(input.agentName ? { agentName: input.agentName } : {}),
      createdAt: (this.deps.now?.() ?? new Date()).toISOString(),
    };
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(
        () => this.settle(id, false),
        this.deps.timeoutMs ?? BROWSER_APPROVAL_TIMEOUT_MS,
      );
      timer.unref?.();
      this.waiting.set(id, { request, resolve, timer });
      try {
        this.deps.pushRequest({ ...request });
        this.deps.notify({ ...request });
      } catch {
        // The card is also served by pending(); the timeout denies if nobody ever sees it.
      }
    });
  }

  pending(): BrowserApprovalRequest[] {
    return [...this.waiting.values()].map((w) => ({ ...w.request }));
  }

  /** Applies the user's answer; false when the request is not pending anymore. */
  respond(response: BrowserApprovalResponse): boolean {
    if (!this.waiting.has(response.id)) return false;
    this.settle(response.id, response.allow === true);
    return true;
  }

  /** Denies what still waits for a workspace (the user paused its agents). */
  denyWorkspace(cwd: string): void {
    for (const [id, w] of [...this.waiting]) {
      if (keyOf(w.request.cwd) === keyOf(cwd)) this.settle(id, false);
    }
  }

  /** Denies everything still waiting (app shutdown). */
  denyAll(): void {
    for (const id of [...this.waiting.keys()]) this.settle(id, false);
  }

  private settle(id: string, allowed: boolean): void {
    const waiting = this.waiting.get(id);
    if (!waiting) return;
    this.waiting.delete(id);
    clearTimeout(waiting.timer);
    try {
      this.deps.dismissNotice(id);
      this.deps.pushResolved(id);
    } catch {
      // window gone
    }
    waiting.resolve(allowed);
  }
}
