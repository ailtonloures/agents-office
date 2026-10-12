export interface BrowserActor {
  /** Roster entry (or session) of the agent that asked. */
  id: string;
  name: string;
}

export interface BrowserActivity {
  actor: BrowserActor;
  /** Tool being run, e.g. `browser_click`. */
  action: string;
}

export class BrowserQueueFullError extends Error {
  readonly code = 'queue-full';
}

export interface BrowserQueueOptions {
  /** Max actions waiting per workspace (running one excluded). */
  maxPending?: number;
  /** Who uses a workspace browser (or how many wait) changed. */
  onChange?(cwd: string): void;
}

interface Lane {
  tail: Promise<void>;
  running: BrowserActivity | undefined;
  waiting: number;
}

const keyOf = (cwd: string): string => cwd.replace(/[\\/]+$/, '') || cwd;

/**
 * Serial queue per workspace browser: one agent action at a time, in arrival order, so the clicks
 * and keystrokes of two agents never interleave. Each action carries its author so the window can
 * show who is using the browser. Workspaces do not block each other.
 */
export class BrowserQueue {
  private readonly lanes = new Map<string, Lane>();
  private readonly maxPending: number;

  constructor(private readonly options: BrowserQueueOptions = {}) {
    this.maxPending = options.maxPending ?? 20;
  }

  /** Runs `task` after every earlier action of the workspace finished (or failed). */
  run<T>(cwd: string, activity: BrowserActivity, task: () => Promise<T>): Promise<T> {
    const key = keyOf(cwd);
    let lane = this.lanes.get(key);
    if (!lane) {
      lane = { tail: Promise.resolve(), running: undefined, waiting: 0 };
      this.lanes.set(key, lane);
    }
    if (lane.waiting >= this.maxPending) {
      return Promise.reject(
        new BrowserQueueFullError('Too many browser actions are waiting; try again shortly.'),
      );
    }
    const current = lane;
    current.waiting++;
    this.options.onChange?.(cwd);
    const result = current.tail.then(async () => {
      current.waiting--;
      current.running = activity;
      this.options.onChange?.(cwd);
      try {
        return await task();
      } finally {
        current.running = undefined;
      }
    });
    current.tail = result.then(
      () => this.settle(key, cwd),
      () => this.settle(key, cwd),
    );
    return result;
  }

  private settle(key: string, cwd: string): void {
    const lane = this.lanes.get(key);
    if (lane && lane.waiting === 0 && !lane.running) this.lanes.delete(key);
    this.options.onChange?.(cwd);
  }

  /** The action running now in the workspace, if any. */
  current(cwd: string): BrowserActivity | undefined {
    return this.lanes.get(keyOf(cwd))?.running;
  }

  /** Actions waiting behind the current one. */
  pending(cwd: string): number {
    return this.lanes.get(keyOf(cwd))?.waiting ?? 0;
  }
}
