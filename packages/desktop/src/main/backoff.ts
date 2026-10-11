export interface RestartPolicyOptions {
  /** Maximum restarts inside the window (default 3). */
  maxAttempts?: number;
  windowMs?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

/**
 * Restart budget for the daemon: at most `maxAttempts` restarts per `windowMs` (3 per minute),
 * with an exponential delay between them. `next(now)` returns the delay to wait, or `null` when
 * the budget is spent (give up and tell the user).
 */
export class RestartPolicy {
  private readonly attempts: number[] = [];
  private readonly maxAttempts: number;
  private readonly windowMs: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;

  constructor(options: RestartPolicyOptions = {}) {
    this.maxAttempts = options.maxAttempts ?? 3;
    this.windowMs = options.windowMs ?? 60_000;
    this.baseDelayMs = options.baseDelayMs ?? 500;
    this.maxDelayMs = options.maxDelayMs ?? 8_000;
  }

  next(now: number): number | null {
    while (this.attempts.length > 0 && now - (this.attempts[0] as number) >= this.windowMs) {
      this.attempts.shift();
    }
    if (this.attempts.length >= this.maxAttempts) return null;
    const delay = Math.min(this.baseDelayMs * 2 ** this.attempts.length, this.maxDelayMs);
    this.attempts.push(now);
    return delay;
  }

  reset(): void {
    this.attempts.length = 0;
  }
}
