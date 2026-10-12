import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { AGENT_NOTES_MAX } from '@agents-office/shared';

export const AGENT_BUS_SERVER_NAME = 'agent-bus';
const PROTOCOL_VERSION = '2025-03-26';
const MAX_BODY_BYTES = 256 * 1024;

/** Who is calling: bound to the session token when the session was registered. */
export interface BusSession {
  sessionId: string;
  /** Roster entry id of the agent (profile id or inline id); null for sessions without a profile. */
  entryId: string | null;
  cwd: string;
  /** Role used to select tools (e.g. 'padrao', 'orquestrador'). */
  role: string;
}

export interface BusToolResult {
  text: string;
  isError?: boolean;
  /** Images returned next to the text (base64, no data: prefix). */
  images?: Array<{ data: string; mimeType: string }>;
}

export interface BusTool {
  name: string;
  description: string;
  /** JSON Schema of the arguments. */
  inputSchema: Record<string, unknown>;
  /** Roles that get the tool; omitted means every role. */
  roles?: string[];
  handler(
    session: BusSession,
    args: Record<string, unknown>,
  ): BusToolResult | Promise<BusToolResult>;
}

export interface NotesSink {
  setNotes(cwd: string, entryId: string, notes: string): unknown;
}

export interface AgentBusOptions {
  /** Roster used by `save_notes`. */
  roster: NotesSink;
  /** Extra tools (later specs register theirs here or through `registerTool`). */
  tools?: BusTool[];
  notesMax?: number;
}

export interface BusCredentials {
  url: string;
  token: string;
}

function sha(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

export class AgentBus {
  private server: Server | null = null;
  private port = 0;
  private readonly sessions = new Map<string, BusSession>(); // token -> session
  private readonly tools = new Map<string, BusTool>();

  constructor(private readonly options: AgentBusOptions) {
    this.registerTool(this.saveNotesTool());
    for (const tool of options.tools ?? []) this.registerTool(tool);
  }

  registerTool(tool: BusTool): void {
    this.tools.set(tool.name, tool);
  }

  /** Tools visible to a role. */
  toolsFor(role: string): BusTool[] {
    return [...this.tools.values()].filter((t) => !t.roles || t.roles.includes(role));
  }

  /** Issues a token for a session; the credentials go to the claude `--mcp-config`. */
  registerSession(session: BusSession): BusCredentials {
    const token = randomBytes(32).toString('hex');
    this.sessions.set(token, { ...session });
    return { url: this.url(), token };
  }

  revokeSession(sessionId: string): void {
    for (const [token, s] of this.sessions)
      if (s.sessionId === sessionId) this.sessions.delete(token);
  }

  get listening(): boolean {
    return this.server !== null;
  }

  url(): string {
    return `http://127.0.0.1:${this.port}/mcp`;
  }

  async start(): Promise<number> {
    if (this.server) return this.port;
    const server = createServer((req, res) => {
      void this.handle(req, res).catch(() => {
        if (!res.headersSent) res.writeHead(500);
        res.end();
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });
    this.server = server;
    this.port = (server.address() as AddressInfo).port;
    return this.port;
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    this.sessions.clear();
    if (!server) return;
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections?.();
    });
  }

  private authenticate(req: IncomingMessage): BusSession | null {
    const header = req.headers.authorization;
    if (typeof header !== 'string') return null;
    const match = /^Bearer (.+)$/.exec(header);
    if (!match?.[1]) return null;
    const given = sha(match[1]);
    let found: BusSession | null = null;
    for (const [token, session] of this.sessions) {
      if (timingSafeEqual(given, sha(token))) found = session;
    }
    return found;
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const session = this.authenticate(req);
    if (!session) return send(res, 401, { error: 'unauthorized' });
    if (req.url?.split('?')[0] !== '/mcp') return send(res, 404, { error: 'not found' });
    if (req.method !== 'POST') {
      res.writeHead(405, { Allow: 'POST' });
      res.end();
      return;
    }
    let body: unknown;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return send(res, 400, rpcError(null, -32700, 'Parse error'));
    }
    if (Array.isArray(body)) {
      const results = (await Promise.all(body.map((m) => this.dispatch(session, m)))).filter(
        (r) => r !== null,
      );
      if (results.length === 0) {
        res.writeHead(202);
        res.end();
        return;
      }
      return send(res, 200, results);
    }
    const result = await this.dispatch(session, body);
    if (result === null) {
      res.writeHead(202);
      res.end();
      return;
    }
    send(res, 200, result);
  }

  private async dispatch(session: BusSession, message: unknown): Promise<object | null> {
    if (typeof message !== 'object' || message === null) {
      return rpcError(null, -32600, 'Invalid Request');
    }
    const msg = message as { id?: string | number; method?: unknown; params?: unknown };
    const isNotification = msg.id === undefined;
    if (typeof msg.method !== 'string') {
      return isNotification ? null : rpcError(msg.id ?? null, -32600, 'Invalid Request');
    }
    if (isNotification) return null;
    const id = msg.id as string | number;
    const params = (
      typeof msg.params === 'object' && msg.params !== null ? msg.params : {}
    ) as Record<string, unknown>;
    switch (msg.method) {
      case 'initialize':
        return rpcResult(id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: AGENT_BUS_SERVER_NAME, version: '1.0.0' },
        });
      case 'ping':
        return rpcResult(id, {});
      case 'tools/list':
        return rpcResult(id, {
          tools: this.toolsFor(session.role).map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        });
      case 'tools/call': {
        const name = params.name;
        const tool = typeof name === 'string' ? this.tools.get(name) : undefined;
        if (!tool || (tool.roles && !tool.roles.includes(session.role))) {
          return rpcError(id, -32602, `Unknown tool: ${String(name)}`);
        }
        const args = (
          typeof params.arguments === 'object' && params.arguments !== null ? params.arguments : {}
        ) as Record<string, unknown>;
        try {
          const out = await tool.handler({ ...session }, args);
          return rpcResult(id, {
            content: [
              { type: 'text', text: out.text },
              ...(out.images ?? []).map((image) => ({
                type: 'image',
                data: image.data,
                mimeType: image.mimeType,
              })),
            ],
            ...(out.isError ? { isError: true } : {}),
          });
        } catch (error) {
          return rpcResult(id, {
            content: [
              { type: 'text', text: error instanceof Error ? error.message : String(error) },
            ],
            isError: true,
          });
        }
      }
      default:
        return rpcError(id, -32601, `Method not found: ${msg.method}`);
    }
  }

  private saveNotesTool(): BusTool {
    const max = this.options.notesMax ?? AGENT_NOTES_MAX;
    return {
      name: 'save_notes',
      description: `Saves notes (replacing the previous ones) that will be shown to you at the start of future sessions in this project. Max ${max} characters.`,
      inputSchema: {
        type: 'object',
        properties: { notes: { type: 'string', description: 'The full notes text.' } },
        required: ['notes'],
      },
      handler: (session, args) => {
        if (typeof args.notes !== 'string')
          return { text: '"notes" must be a string.', isError: true };
        if (args.notes.length > max) {
          return {
            text: `Notes too long (${args.notes.length} > ${max} characters). Shorten them.`,
            isError: true,
          };
        }
        if (!session.entryId) {
          return {
            text: 'This session has no roster entry; notes cannot be saved.',
            isError: true,
          };
        }
        this.options.roster.setNotes(session.cwd, session.entryId, args.notes);
        return { text: 'Notes saved.' };
      },
    };
  }
}

function rpcResult(id: string | number, result: unknown): object {
  return { jsonrpc: '2.0', id, result };
}

function rpcError(id: string | number | null, code: number, message: string): object {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(text),
  });
  res.end(text);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** JSON for `claude --mcp-config`. */
export function buildMcpConfig(credentials: BusCredentials): string {
  return JSON.stringify({
    mcpServers: {
      [AGENT_BUS_SERVER_NAME]: {
        type: 'http',
        url: credentials.url,
        headers: { Authorization: `Bearer ${credentials.token}` },
      },
    },
  });
}
