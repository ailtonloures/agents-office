/** Default daemon port (the one the Claude Code hooks are installed for). */
export const DEFAULT_PORT = 4777;

export type ProbeResult =
  /** An `agents-office` daemon answered `GET /health`. */
  | { kind: 'agents-office'; version: string }
  /** Something answered on the port, but it is not an `agents-office` daemon. */
  | { kind: 'other' }
  /** Nothing is listening (connection refused / timeout). */
  | { kind: 'free' };

export type DaemonMode =
  /** We start the daemon ourselves as a child process. */
  | { kind: 'own' }
  /** An `agents-office` daemon already runs on the port: connect to it, start nothing. */
  | { kind: 'external'; version: string }
  /** The port belongs to another program: show an error in the window. */
  | { kind: 'port-busy' };

export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

/** Recognizes the `/health` body of the daemon (`{ ok: true, version, sessions, agents, ... }`). */
export function parseHealth(body: unknown): { version: string } | null {
  if (typeof body !== 'object' || body === null) return null;
  const health = body as Record<string, unknown>;
  if (health.ok !== true) return null;
  if (typeof health.version !== 'string') return null;
  if (typeof health.sessions !== 'number' || typeof health.agents !== 'number') return null;
  return { version: health.version };
}

/** Asks `GET /health` on the loopback port. Never throws. */
export async function probeHealth(
  port: number,
  fetchImpl: FetchLike,
  timeoutMs = 1500,
): Promise<ProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`http://127.0.0.1:${port}/health`, {
      signal: controller.signal,
    });
    if (!response.ok) return { kind: 'other' };
    const health = parseHealth(await response.json().catch(() => null));
    return health ? { kind: 'agents-office', version: health.version } : { kind: 'other' };
  } catch (error) {
    // A refused connection means the port is free; an abort (silent listener) is "not ours".
    const code = (error as { cause?: { code?: string } }).cause?.code;
    if (code === 'ECONNREFUSED' || (error as { code?: string }).code === 'ECONNREFUSED') {
      return { kind: 'free' };
    }
    if ((error as Error).name === 'AbortError') return { kind: 'other' };
    return { kind: 'free' };
  } finally {
    clearTimeout(timer);
  }
}

export function decideMode(probe: ProbeResult): DaemonMode {
  switch (probe.kind) {
    case 'free':
      return { kind: 'own' };
    case 'agents-office':
      return { kind: 'external', version: probe.version };
    case 'other':
      return { kind: 'port-busy' };
  }
}

/** Port from `AGENTS_OFFICE_PORT` (like the CLI), else the default. */
export function resolvePort(env: Record<string, string | undefined>): number {
  const text = env.AGENTS_OFFICE_PORT;
  if (text === undefined || text === '') return DEFAULT_PORT;
  const port = Number(text);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : DEFAULT_PORT;
}
