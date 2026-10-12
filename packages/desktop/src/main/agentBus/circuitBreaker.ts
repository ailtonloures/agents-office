import type { CommsStatus } from '@agents-office/shared';

/** Messages chained without a human in the loop before deliveries pause. */
export const HOP_LIMIT = 8;
/** Per sender: at most this many messages per window. */
export const RATE_LIMIT = 10;
export const RATE_WINDOW_MS = 60_000;

export interface CircuitBreakerOptions {
  hopLimit?: number;
  rateLimit?: number;
  rateWindowMs?: number;
  now?: () => number;
  /** Called once when a project reaches the hop limit. */
  onPause?: (cwd: string, hops: number) => void;
}

interface ProjectState {
  hops: number;
  paused: boolean;
}

const senderKey = (cwd: string, entryId: string): string => `${cwd}\u0000${entryId}`;

/**
 * Protects against endless agent conversations. Per project it counts the messages exchanged since
 * the user last typed in one of its terminals (the hop count) and pauses deliveries at the limit;
 * per sender it limits the message rate; and it keeps the set of muted agents (no sending and no
 * receiving). In memory only.
 */
export class CircuitBreaker {
  private readonly projects = new Map<string, ProjectState>();
  private readonly sent = new Map<string, number[]>();
  private readonly muted = new Map<string, Set<string>>();

  constructor(private readonly options: CircuitBreakerOptions = {}) {}

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  private state(cwd: string): ProjectState {
    let state = this.projects.get(cwd);
    if (!state) {
      state = { hops: 0, paused: false };
      this.projects.set(cwd, state);
    }
    return state;
  }

  get hopLimit(): number {
    return this.options.hopLimit ?? HOP_LIMIT;
  }

  isPaused(cwd: string): boolean {
    return this.projects.get(cwd)?.paused ?? false;
  }

  /** Counts one more message of the chain; pauses the project at the limit. Returns its hop. */
  noteMessage(cwd: string): number {
    const state = this.state(cwd);
    state.hops += 1;
    if (!state.paused && state.hops >= this.hopLimit) {
      state.paused = true;
      try {
        this.options.onPause?.(cwd, state.hops);
      } catch {
        // A failing listener must not break messaging.
      }
    }
    return state.hops;
  }

  /** The user typed in a terminal of the project: the chain starts over and deliveries resume. */
  userActivity(cwd: string): boolean {
    const state = this.projects.get(cwd);
    if (!state || (state.hops === 0 && !state.paused)) return false;
    const wasPaused = state.paused;
    state.hops = 0;
    state.paused = false;
    return wasPaused;
  }

  /** "Continuar": same as the user stepping in. */
  resume(cwd: string): void {
    this.userActivity(cwd);
  }

  /**
   * Whether the sender may send now; records the attempt when it may. Messages older than the
   * window no longer count.
   */
  allowSend(cwd: string, entryId: string): boolean {
    const now = this.now();
    const window = this.options.rateWindowMs ?? RATE_WINDOW_MS;
    const key = senderKey(cwd, entryId);
    const recent = (this.sent.get(key) ?? []).filter((t) => now - t < window);
    if (recent.length >= (this.options.rateLimit ?? RATE_LIMIT)) {
      this.sent.set(key, recent);
      return false;
    }
    recent.push(now);
    this.sent.set(key, recent);
    return true;
  }

  setMuted(cwd: string, entryId: string, muted: boolean): void {
    const set = this.muted.get(cwd) ?? new Set<string>();
    if (muted) set.add(entryId);
    else set.delete(entryId);
    this.muted.set(cwd, set);
  }

  isMuted(cwd: string, entryId: string): boolean {
    return this.muted.get(cwd)?.has(entryId) ?? false;
  }

  status(cwd: string): CommsStatus {
    const state = this.projects.get(cwd);
    return {
      mutedEntryIds: [...(this.muted.get(cwd) ?? [])],
      paused: state?.paused ?? false,
      hops: state?.hops ?? 0,
      hopLimit: this.hopLimit,
    };
  }

  clear(): void {
    this.projects.clear();
    this.sent.clear();
    this.muted.clear();
  }
}
