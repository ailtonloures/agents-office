import { RestartPolicy } from './backoff';
import { decideMode, type ProbeResult } from './probe';

export type DaemonStatus =
  | { state: 'idle' }
  | { state: 'starting'; port: number }
  /** Our own child process is serving. */
  | { state: 'running'; port: number }
  /** Connected to a daemon we did not start (approval via UI depends on that daemon). */
  | { state: 'external'; port: number; version: string }
  /** The port belongs to another program. */
  | { state: 'port-busy'; port: number }
  /** The child died; a new one starts after the backoff delay. */
  | { state: 'restarting'; port: number; attempt: number; delayMs: number }
  /** Out of restart budget (or never became healthy). */
  | { state: 'failed'; port: number; reason: string }
  | { state: 'stopped' };

/** The subset of Electron's `UtilityProcess` / `ChildProcess` the controller needs. */
export interface ChildLike {
  kill(): boolean;
  once(event: 'exit', listener: (code: number | null) => void): unknown;
  stdout?: { on(event: 'data', listener: (chunk: Buffer | string) => void): unknown } | null;
  stderr?: { on(event: 'data', listener: (chunk: Buffer | string) => void): unknown } | null;
}

export interface DaemonControllerDeps {
  port: number;
  /** Starts `agents-office start --no-open --port <port>`; extra args come from the caller. */
  fork(args: string[]): ChildLike;
  probe(port: number): Promise<ProbeResult>;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  /** Receives every output line of the child. */
  log?: (line: string) => void;
  policy?: RestartPolicy;
  /** How long a fresh child may take to answer `/health` (default 30 s). */
  readyTimeoutMs?: number;
  readyPollMs?: number;
  killGraceMs?: number;
}

type Listener = (status: DaemonStatus, previous: DaemonStatus) => void;

/**
 * Owns the embedded daemon: probes the port first (never starts a second daemon), starts it as a
 * child process, restarts it with backoff when it crashes and stops it on quit. No Electron here.
 */
export class DaemonController {
  private current: DaemonStatus = { state: 'idle' };
  private child: ChildLike | undefined;
  private stopping = false;
  private restartTimer: unknown;
  private readonly listeners = new Set<Listener>();
  private readonly policy: RestartPolicy;
  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;

  constructor(private readonly deps: DaemonControllerDeps) {
    this.policy = deps.policy ?? new RestartPolicy();
    this.now = deps.now ?? Date.now;
    this.setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = deps.clearTimer ?? ((handle) => clearTimeout(handle as NodeJS.Timeout));
  }

  get status(): DaemonStatus {
    return this.current;
  }

  get port(): number {
    return this.deps.port;
  }

  onStatus(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Probes the port and, when it is free, starts the child. Resolves with the settled status. */
  async start(): Promise<DaemonStatus> {
    this.stopping = false;
    this.set({ state: 'starting', port: this.deps.port });
    const mode = decideMode(await this.deps.probe(this.deps.port));
    if (this.stopping) return this.current;
    switch (mode.kind) {
      case 'external':
        return this.set({ state: 'external', port: this.deps.port, version: mode.version });
      case 'port-busy':
        return this.set({ state: 'port-busy', port: this.deps.port });
      case 'own':
        return this.launch();
    }
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.restartTimer !== undefined) this.clearTimer(this.restartTimer);
    this.restartTimer = undefined;
    const child = this.child;
    this.child = undefined;
    if (child) await this.terminate(child);
    this.set({ state: 'stopped' });
  }

  private terminate(child: ChildLike): Promise<void> {
    return new Promise((resolve) => {
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        this.clearTimer(timer);
        resolve();
      };
      // Resolve even if the process ignores the signal, so quitting never hangs.
      const timer = this.setTimer(finish, this.deps.killGraceMs ?? 5000);
      child.once('exit', finish);
      child.kill();
    });
  }

  private async launch(): Promise<DaemonStatus> {
    const child = this.deps.fork(['start', '--no-open', '--port', String(this.deps.port)]);
    this.child = child;
    this.forwardOutput(child);
    let exited = false;
    let abandoned = false;
    child.once('exit', (code) => {
      exited = true;
      if (this.child === child) this.child = undefined;
      if (!this.stopping && !abandoned) void this.onCrash(code);
    });

    const deadline = this.now() + (this.deps.readyTimeoutMs ?? 30_000);
    const pollMs = this.deps.readyPollMs ?? 100;
    while (!this.stopping && !exited) {
      const probe = await this.deps.probe(this.deps.port);
      if (this.stopping || exited) break;
      if (probe.kind === 'agents-office')
        return this.set({ state: 'running', port: this.deps.port });
      if (this.now() >= deadline) {
        abandoned = true;
        this.child = undefined;
        child.kill();
        return this.set({
          state: 'failed',
          port: this.deps.port,
          reason: 'The daemon did not answer /health in time.',
        });
      }
      await new Promise<void>((resolve) => this.setTimer(resolve, pollMs));
    }
    return this.current;
  }

  private async onCrash(code: number | null): Promise<void> {
    this.log(`daemon exited (code ${code ?? 'null'})`);
    // The port may have been taken meanwhile (also the case when our start lost the race).
    const mode = decideMode(await this.deps.probe(this.deps.port));
    if (this.stopping) return;
    if (mode.kind === 'external') {
      this.set({ state: 'external', port: this.deps.port, version: mode.version });
      return;
    }
    if (mode.kind === 'port-busy') {
      this.set({ state: 'port-busy', port: this.deps.port });
      return;
    }
    const delay = this.policy.next(this.now());
    if (delay === null) {
      this.set({
        state: 'failed',
        port: this.deps.port,
        reason: 'The daemon keeps crashing (3 restarts in the last minute).',
      });
      return;
    }
    const attempt = this.current.state === 'restarting' ? this.current.attempt + 1 : 1;
    this.set({ state: 'restarting', port: this.deps.port, attempt, delayMs: delay });
    this.restartTimer = this.setTimer(() => {
      this.restartTimer = undefined;
      if (this.stopping) return;
      void this.launch();
    }, delay);
  }

  private forwardOutput(child: ChildLike): void {
    const forward = (chunk: Buffer | string): void => {
      for (const line of String(chunk).split(/\r?\n/)) if (line.length > 0) this.log(line);
    };
    child.stdout?.on('data', forward);
    child.stderr?.on('data', forward);
  }

  private log(line: string): void {
    this.deps.log?.(line);
  }

  private set(next: DaemonStatus): DaemonStatus {
    const previous = this.current;
    this.current = next;
    for (const listener of this.listeners) listener(next, previous);
    return next;
  }
}
