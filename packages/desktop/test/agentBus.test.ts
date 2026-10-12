import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentBus, buildMcpConfig } from '../src/main/agentBus/server';
import { buildSessionPrompt } from '../src/main/agentBus/sessionPrompt';

const buses: AgentBus[] = [];
afterEach(async () => {
  await Promise.all(buses.splice(0).map((b) => b.stop()));
});

async function setup(notesMax?: number) {
  const setNotes = vi.fn();
  const bus = new AgentBus({ roster: { setNotes }, notesMax });
  buses.push(bus);
  await bus.start();
  const creds = bus.registerSession({ sessionId: 's1', entryId: 'p1', cwd: '/w', role: 'padrao' });
  return { bus, creds, setNotes };
}

async function rpc(url: string, token: string | null, method: string, params?: unknown, id = 1) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
  return { status: res.status, body: res.status === 200 ? await res.json() : null };
}

describe('AgentBus', () => {
  it('listens on loopback with an ephemeral port', async () => {
    const { creds } = await setup();
    expect(creds.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
  });

  it('rejects requests without or with a wrong token', async () => {
    const { creds, setNotes } = await setup();
    expect((await rpc(creds.url, null, 'tools/list')).status).toBe(401);
    expect(
      (
        await rpc(creds.url, 'nope', 'tools/call', {
          name: 'save_notes',
          arguments: { notes: 'x' },
        })
      ).status,
    ).toBe(401);
    expect(setNotes).not.toHaveBeenCalled();
  });

  it('rejects a revoked token', async () => {
    const { bus, creds } = await setup();
    bus.revokeSession('s1');
    expect((await rpc(creds.url, creds.token, 'tools/list')).status).toBe(401);
  });

  it('initializes and lists tools', async () => {
    const { creds } = await setup();
    const init = await rpc(creds.url, creds.token, 'initialize', {});
    expect(init.body.result.serverInfo.name).toBe('agent-bus');
    const list = await rpc(creds.url, creds.token, 'tools/list');
    expect(list.body.result.tools.map((t: { name: string }) => t.name)).toEqual(['save_notes']);
  });

  it('save_notes writes to the roster of the session project and entry', async () => {
    const { creds, setNotes } = await setup();
    const r = await rpc(creds.url, creds.token, 'tools/call', {
      name: 'save_notes',
      arguments: { notes: 'hello' },
    });
    expect(r.body.result.isError).toBeUndefined();
    expect(setNotes).toHaveBeenCalledWith('/w', 'p1', 'hello');
  });

  it('save_notes enforces the size limit', async () => {
    const { creds, setNotes } = await setup(5);
    const r = await rpc(creds.url, creds.token, 'tools/call', {
      name: 'save_notes',
      arguments: { notes: '123456' },
    });
    expect(r.body.result.isError).toBe(true);
    expect(setNotes).not.toHaveBeenCalled();
  });

  it('filters tools by role', async () => {
    const { bus, creds } = await setup();
    bus.registerTool({
      name: 'spawn_agent',
      description: 'x',
      inputSchema: { type: 'object' },
      roles: ['orquestrador'],
      handler: () => ({ text: 'ok' }),
    });
    const list = await rpc(creds.url, creds.token, 'tools/list');
    expect(list.body.result.tools).toHaveLength(1);
    const call = await rpc(creds.url, creds.token, 'tools/call', {
      name: 'spawn_agent',
      arguments: {},
    });
    expect(call.body.error.code).toBe(-32602);
    const orch = bus.registerSession({
      sessionId: 's2',
      entryId: 'o',
      cwd: '/w',
      role: 'orquestrador',
    });
    const ok = await rpc(orch.url, orch.token, 'tools/call', {
      name: 'spawn_agent',
      arguments: {},
    });
    expect(ok.body.result.content[0].text).toBe('ok');
  });
});

describe('prompt and config builders', () => {
  it('builds the prompt with identity, instructions and notes', () => {
    const p = buildSessionPrompt({
      name: 'Ana',
      profession: 'QA',
      instructions: 'Test it',
      notes: 'Prev',
    });
    expect(p).toContain('"Ana", QA');
    expect(p).toContain('Test it');
    expect(p).toContain('Prev');
    expect(p).toContain('CLAUDE.md');
  });

  it('omits empty sections', () => {
    const p = buildSessionPrompt({ name: 'Ana', instructions: '  ', notes: '' });
    expect(p).not.toContain('Instructions');
    expect(p).not.toContain('Notes from');
  });

  it('builds the mcp config', () => {
    const cfg = JSON.parse(buildMcpConfig({ url: 'u', token: 't' }));
    expect(cfg.mcpServers['agent-bus'].headers.Authorization).toBe('Bearer t');
  });
});
