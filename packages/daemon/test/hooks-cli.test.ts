import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { HOOK_EVENTS, isOurCommand } from '../src/cli/settings-merger';
import { createDaemon, type Daemon } from '../src/server';

const BIN = fileURLToPath(new URL('../bin/agents-office.mjs', import.meta.url));

let home: string;
let settingsPath: string;
let daemon: Daemon | undefined;
let sockets: WebSocket[];

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'agents-office-hooks-'));
  mkdirSync(join(home, '.claude'));
  settingsPath = join(home, '.claude', 'settings.json');
  sockets = [];
  daemon = undefined;
});

afterEach(async () => {
  for (const socket of sockets) socket.terminate();
  await daemon?.stop();
  rmSync(home, { recursive: true, force: true });
});

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
  ms: number;
}

function run(args: string[], input = '', env: Record<string, string> = {}): Promise<RunResult> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BIN, ...args], {
      env: { ...process.env, HOME: home, ...env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr, ms: Date.now() - started }));
    child.stdin.end(input);
  });
}

const install = (...extra: string[]) =>
  run(['hooks', 'install', '--settings', settingsPath, ...extra]);
const uninstall = (...extra: string[]) =>
  run(['hooks', 'uninstall', '--settings', settingsPath, ...extra]);

const THIRD_PARTY = {
  model: 'opus',
  permissions: { allow: ['Bash(ls:*)'] },
  hooks: {
    PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo guard' }] }],
    Stop: [{ hooks: [{ type: 'command', command: '/usr/local/bin/notify --done' }] }],
    PostToolUseFailure: [{ hooks: [{ type: 'command', command: 'echo failed' }] }],
  },
  env: { FOO: 'bar' },
};

function commandsOf(settings: { hooks: Record<string, { hooks: { command: string }[] }[]> }) {
  return Object.values(settings.hooks)
    .flat()
    .flatMap((group) => group.hooks.map((hook) => hook.command))
    .filter(isOurCommand);
}

// Each test spawns the CLI as a real process several times; under full-suite CPU load that exceeds the 5 s default.
describe('hooks install/uninstall (Seam 3)', { timeout: 30_000 }, () => {
  it('creates a missing settings file on install and deletes it on uninstall', async () => {
    expect(existsSync(settingsPath)).toBe(false);
    const installed = await install();
    expect(installed.code).toBe(0);

    const text = readFileSync(settingsPath, 'utf8');
    expect(text).toBe(`${JSON.stringify(JSON.parse(text), null, 2)}\n`);
    const settings = JSON.parse(text);
    expect(Object.keys(settings.hooks)).toEqual([...HOOK_EVENTS]);
    expect(settings.hooks.PreToolUse[0].matcher).toBe('*');
    expect(existsSync(`${settingsPath}.agents-office.bak`)).toBe(false);

    const command: string = settings.hooks.Stop[0].hooks[0].command;
    expect(command).toContain(BIN);
    expect(command).toContain(process.execPath);
    expect(command.endsWith(' hook')).toBe(true);

    expect((await uninstall()).code).toBe(0);
    expect(existsSync(settingsPath)).toBe(false);
  });

  it('leaves third-party settings byte-identical after install then uninstall', async () => {
    const original = `${JSON.stringify(THIRD_PARTY, null, 2)}\n`;
    writeFileSync(settingsPath, original);

    expect((await install()).code).toBe(0);
    const installed = JSON.parse(readFileSync(settingsPath, 'utf8'));
    expect(installed.model).toBe('opus');
    expect(installed.hooks.PreToolUse).toHaveLength(2);
    expect(installed.hooks.PreToolUse[0]).toEqual(THIRD_PARTY.hooks.PreToolUse[0]);
    expect(installed.hooks.PostToolUseFailure).toEqual(THIRD_PARTY.hooks.PostToolUseFailure);
    expect(readFileSync(`${settingsPath}.agents-office.bak`, 'utf8')).toBe(original);

    expect((await uninstall()).code).toBe(0);
    expect(readFileSync(settingsPath, 'utf8')).toBe(original);
  });

  it('keeps the first backup and does not duplicate entries when installing twice', async () => {
    const original = `${JSON.stringify(THIRD_PARTY, null, 2)}\n`;
    writeFileSync(settingsPath, original);

    await install();
    const afterFirst = readFileSync(settingsPath, 'utf8');
    const second = await install();
    expect(second.code).toBe(0);
    expect(readFileSync(settingsPath, 'utf8')).toBe(afterFirst);
    expect(readFileSync(`${settingsPath}.agents-office.bak`, 'utf8')).toBe(original);
    expect(commandsOf(JSON.parse(afterFirst))).toHaveLength(HOOK_EVENTS.length);

    await uninstall();
    expect(readFileSync(settingsPath, 'utf8')).toBe(original);
  });

  it('handles a settings file without a trailing newline and with a hooks-less object', async () => {
    const original = JSON.stringify({ theme: 'dark' }, null, 2);
    writeFileSync(settingsPath, original);
    await install();
    await uninstall();
    expect(readFileSync(settingsPath, 'utf8')).toBe(original);
  });

  it('refuses to touch invalid JSON', async () => {
    writeFileSync(settingsPath, '{ not json');
    const result = await install();
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('not valid JSON');
    expect(readFileSync(settingsPath, 'utf8')).toBe('{ not json');
  });

  it('--dry-run prints the diff and writes nothing', async () => {
    const original = `${JSON.stringify(THIRD_PARTY, null, 2)}\n`;
    writeFileSync(settingsPath, original);
    const result = await install('--dry-run');
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/^\+ .*agents-office\.mjs.* hook/m);
    expect(result.stdout).toContain('Dry run');
    expect(readFileSync(settingsPath, 'utf8')).toBe(original);
    expect(existsSync(`${settingsPath}.agents-office.bak`)).toBe(false);
  });

  it('installs PermissionRequest with a 24 h timeout and no other event has a timeout', async () => {
    await install();
    const installed = JSON.parse(readFileSync(settingsPath, 'utf8'));
    const group = installed.hooks.PermissionRequest[0];
    expect(group.hooks).toHaveLength(1);
    expect(group.hooks[0]).toMatchObject({ type: 'command', timeout: 86400 });
    expect(isOurCommand(group.hooks[0].command)).toBe(true);
    for (const event of HOOK_EVENTS) {
      if (event === 'PermissionRequest') continue;
      expect(installed.hooks[event][0].hooks[0].timeout).toBeUndefined();
    }
  });

  it('--dry-run shows the PermissionRequest timeout in the diff', async () => {
    const result = await install('--dry-run');
    expect(result.stdout).toContain('"PermissionRequest"');
    expect(result.stdout).toMatch(/\+\s+"timeout": 86400/);
    expect(existsSync(settingsPath)).toBe(false);
  });

  it('migrates an old install (9 events) by adding only PermissionRequest, then uninstalls byte-identical', async () => {
    const original = `${JSON.stringify(THIRD_PARTY, null, 2)}\n`;
    writeFileSync(settingsPath, original);
    await install();
    const full = JSON.parse(readFileSync(settingsPath, 'utf8'));
    // Simulate an installation made before PermissionRequest existed.
    delete full.hooks.PermissionRequest;
    writeFileSync(settingsPath, `${JSON.stringify(full, null, 2)}\n`);

    const migrated = await install();
    expect(migrated.code).toBe(0);
    const after = JSON.parse(readFileSync(settingsPath, 'utf8'));
    expect(after.hooks.PermissionRequest).toHaveLength(1);
    for (const event of HOOK_EVENTS) {
      if (event === 'PermissionRequest') continue;
      expect(after.hooks[event]).toEqual(full.hooks[event]);
    }
    const again = readFileSync(settingsPath, 'utf8');
    await install();
    expect(readFileSync(settingsPath, 'utf8')).toBe(again);

    await uninstall();
    expect(readFileSync(settingsPath, 'utf8')).toBe(original);
  });

  it('status reports installed events and daemon reachability', async () => {
    await install();
    const result = await run(['hooks', 'status', '--settings', settingsPath, '--port', '1']);
    expect(result.code).toBe(0);
    for (const event of HOOK_EVENTS)
      expect(result.stdout).toMatch(new RegExp(`installed +${event}`));
    expect(result.stdout).toContain('not reachable');
  });
});

describe('hook command: PermissionRequest', () => {
  const permissionPayload = () =>
    JSON.stringify({
      hook_event_name: 'PermissionRequest',
      session_id: 'perm-session',
      cwd: '/tmp/project',
      tool_name: 'Bash',
      tool_input: { command: 'ls' },
    });

  async function startDaemon(): Promise<number> {
    daemon = createDaemon({
      port: 0,
      projectsDir: join(home, 'projects'),
      usePolling: true,
      log: () => {},
    });
    return (await daemon.start()).port;
  }

  async function waitFor(predicate: () => boolean): Promise<void> {
    const deadline = Date.now() + 5000;
    while (!predicate()) {
      if (Date.now() > deadline) throw new Error('timeout');
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  async function connectUi(port: number) {
    const messages: Record<string, unknown>[] = [];
    const socket = new WebSocket(`ws://127.0.0.1:${port}/stream?role=ui`);
    sockets.push(socket);
    socket.on('message', (data) => messages.push(JSON.parse(data.toString())));
    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => resolve());
      socket.once('error', reject);
    });
    await waitFor(() => messages.some((m) => m.kind === 'permission.snapshot'));
    return {
      messages,
      requested: () => messages.filter((m) => m.kind === 'permission.requested'),
      decide: (id: string, decision: Record<string, unknown>) =>
        socket.send(JSON.stringify({ kind: 'permission.decide', id, decision })),
    };
  }

  it('prints the allow decision decided by the UI', async () => {
    const port = await startDaemon();
    const ui = await connectUi(port);
    const result = run(['hook'], permissionPayload(), {
      AGENTS_OFFICE_PORT: String(port),
      AGENTS_OFFICE_TERMINAL_ID: 'term-1',
    });
    await waitFor(() => ui.requested().length === 1);
    const request = ui.requested()[0]?.request as { id: string };
    ui.decide(request.id, { behavior: 'allow' });
    const done = await result;
    expect(done.code).toBe(0);
    expect(JSON.parse(done.stdout)).toEqual({
      hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } },
    });
  });

  it('prints the deny decision with its message', async () => {
    const port = await startDaemon();
    const ui = await connectUi(port);
    const result = run(['hook'], permissionPayload(), { AGENTS_OFFICE_PORT: String(port) });
    await waitFor(() => ui.requested().length === 1);
    const request = ui.requested()[0]?.request as { id: string };
    ui.decide(request.id, { behavior: 'deny', message: 'not now' });
    const done = await result;
    expect(done.code).toBe(0);
    expect(JSON.parse(done.stdout)).toEqual({
      hookSpecificOutput: {
        hookEventName: 'PermissionRequest',
        decision: { behavior: 'deny', message: 'not now' },
      },
    });
  });

  it('exits 0 with empty stdout when the request is answered in the terminal', async () => {
    const port = await startDaemon();
    const ui = await connectUi(port);
    const result = run(['hook'], permissionPayload(), { AGENTS_OFFICE_PORT: String(port) });
    await waitFor(() => ui.requested().length === 1);
    await fetch(`http://127.0.0.1:${port}/hook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        hook_event_name: 'PostToolUse',
        session_id: 'perm-session',
        tool_name: 'Bash',
        tool_input: { command: 'ls' },
        tool_use_id: 'toolu_1',
      }),
    });
    const done = await result;
    expect(done.code).toBe(0);
    expect(done.stdout).toBe('');
  });

  it('exits 0 with empty stdout when no UI is connected (204)', async () => {
    const port = await startDaemon();
    const done = await run(['hook'], permissionPayload(), { AGENTS_OFFICE_PORT: String(port) });
    expect(done.code).toBe(0);
    expect(done.stdout).toBe('');
  });

  it('exits 0 quickly with empty stdout when the daemon is off', async () => {
    const done = await run(['hook'], permissionPayload(), { AGENTS_OFFICE_PORT: '1' });
    expect(done.code).toBe(0);
    expect(done.stdout).toBe('');
    expect(done.ms).toBeLessThan(500);
  });

  it('closes the connection on SIGTERM so the broker drops the pending request', async () => {
    const port = await startDaemon();
    const ui = await connectUi(port);
    const child = spawn(process.execPath, [BIN, 'hook'], {
      env: { ...process.env, HOME: home, AGENTS_OFFICE_PORT: String(port) },
    });
    const exited = new Promise<number | null>((resolve) => child.on('close', resolve));
    child.stdin.end(permissionPayload());
    await waitFor(() => ui.requested().length === 1);
    child.kill('SIGTERM');
    expect(await exited).toBe(0);
    await waitFor(() => ui.messages.some((m) => m.kind === 'permission.resolved'));
    expect(ui.messages.find((m) => m.kind === 'permission.resolved')).toMatchObject({
      by: 'hook-gone',
    });
  });
});

describe('hook command', () => {
  const payload = JSON.stringify({
    hook_event_name: 'SessionStart',
    session_id: 'hook-test-session',
    cwd: '/tmp/project',
    source: 'startup',
  });

  it('exits 0 quickly with no output when the daemon is off', async () => {
    const result = await run(['hook'], payload, { AGENTS_OFFICE_PORT: '1' });
    expect(result.code).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.ms).toBeLessThan(500);
  });

  it('exits 0 silently on invalid JSON input', async () => {
    const result = await run(['hook'], 'not json');
    expect(result.code).toBe(0);
    expect(result.stdout).toBe('');
  });

  it('delivers the event to a running daemon (visible on the WebSocket)', async () => {
    daemon = createDaemon({
      port: 0,
      projectsDir: join(home, 'projects'),
      usePolling: true,
    });
    const { port } = await daemon.start();

    const messages: string[] = [];
    const socket = new WebSocket(`ws://127.0.0.1:${port}/stream`);
    sockets.push(socket);
    socket.on('message', (data) => messages.push(data.toString()));
    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => resolve());
      socket.once('error', reject);
    });

    const result = await run(['hook'], payload, { AGENTS_OFFICE_PORT: String(port) });
    expect(result.code).toBe(0);
    expect(result.stdout).toBe('');

    const deadline = Date.now() + 5000;
    while (!messages.some((message) => message.includes('hook-test-session'))) {
      if (Date.now() > deadline) throw new Error('hook event never reached the WebSocket');
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    const health = (await fetch(`http://127.0.0.1:${port}/health`).then((r) => r.json())) as {
      hooksSeenAt?: string;
    };
    expect(health.hooksSeenAt).toBeTypeOf('string');
  });
});
