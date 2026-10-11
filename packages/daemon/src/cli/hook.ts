// Dependency-free on purpose: the `hook` command runs on every Claude Code hook, so it must
// start fast (no Fastify/chokidar/tsx). Keep this file free of relative imports and TS-only
// runtime constructs so Node can run it directly with native type stripping.

/** Mirrors DEFAULT_PORT in server/daemon.ts (not imported to keep the cold start light). */
const DEFAULT_PORT = 4777;
const MAX_STDIN_BYTES = 1024 * 1024;
const POST_TIMEOUT_MS = 300;

export interface HookRunOptions {
  stdin: AsyncIterable<Uint8Array | string>;
  env: Record<string, string | undefined>;
  argv: string[];
  fetchImpl?: typeof fetch;
  /** Where the permission decision is printed (default `process.stdout`). */
  stdout?: { write(text: string): unknown };
}

async function readStdin(stdin: HookRunOptions['stdin']): Promise<string | undefined> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stdin) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_STDIN_BYTES) return undefined;
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function resolvePort(argv: string[], env: HookRunOptions['env']): number {
  const index = argv.indexOf('--port');
  const text = (index >= 0 ? argv[index + 1] : undefined) ?? env.AGENTS_OFFICE_PORT;
  const port = Number(text);
  return text !== undefined && Number.isInteger(port) && port > 0 && port <= 65535
    ? port
    : DEFAULT_PORT;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Forwards the hook payload read from stdin to the daemon. Never throws: any failure (daemon off,
 * bad JSON, timeout, oversized input) is swallowed so Claude Code is never disturbed. Callers
 * should exit 0 afterwards.
 *
 * Regular events are fire-and-forget (300 ms budget, no stdout). `PermissionRequest` is a
 * long-poll to `/hook/permission` with no timeout: on 200 the decision JSON is printed to stdout;
 * on 204, any error, or when the process is told to terminate, nothing is printed (Claude Code
 * then falls back to the terminal prompt, which is already on screen). Never exit 2.
 */
export async function runHook(options: HookRunOptions): Promise<void> {
  const aborter = new AbortController();
  const onTerminate = (): void => aborter.abort();
  const signals = ['SIGTERM', 'SIGINT', 'SIGHUP'] as const;
  try {
    const body = await readStdin(options.stdin);
    if (body === undefined) return;
    const parsed: unknown = JSON.parse(body); // invalid JSON is dropped here instead of being sent
    const terminalId = options.env.AGENTS_OFFICE_TERMINAL_ID;
    const payload =
      terminalId && isRecord(parsed) && parsed.terminalId === undefined
        ? JSON.stringify({ ...parsed, terminalId })
        : body;
    const isPermission = isRecord(parsed) && parsed.hook_event_name === 'PermissionRequest';
    const port = resolvePort(options.argv, options.env);
    const doFetch = options.fetchImpl ?? fetch;
    const url = `http://127.0.0.1:${port}${isPermission ? '/hook/permission' : '/hook'}`;
    const init = { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload };
    if (!isPermission) {
      await doFetch(url, { ...init, signal: AbortSignal.timeout(POST_TIMEOUT_MS) });
      return;
    }
    // Closing the connection on termination lets the broker drop the pending request.
    for (const signal of signals) process.once(signal, onTerminate);
    const response = await doFetch(url, { ...init, signal: aborter.signal });
    if (response.status !== 200) return;
    const text = await response.text();
    if (aborter.signal.aborted || text.length === 0) return;
    (options.stdout ?? process.stdout).write(text);
  } catch {
    // Intentionally silent.
  } finally {
    for (const signal of signals) process.off(signal, onTerminate);
  }
}
