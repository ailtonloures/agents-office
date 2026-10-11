import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isOurCommand } from '../../daemon/src/cli/settings-merger';
import { HOOKS_CHANNELS } from '../src/main/hooksChannels';
import {
  buildDesktopHookCommand,
  createHooksService,
  defaultSettingsPath,
  isTrustedSender,
} from '../src/main/hooksService';
import { createHooksBridge } from '../src/preload/bridge';

const ENTRY = '/opt/app/resources/daemon/bin/agents-office.mjs';
const COMMAND = buildDesktopHookCommand({
  platform: 'linux',
  execPath: '/opt/Agents Office/agents-office',
  entry: ENTRY,
  port: 4777,
});

let home: string;
let settingsPath: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'ao-hooks-'));
  mkdirSync(join(home, '.claude'));
  settingsPath = join(home, '.claude', 'settings.json');
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

const service = (health: () => Promise<{ hooksSeenAt?: string } | null> = async () => null) =>
  createHooksService({ settingsPath, command: COMMAND, health });

describe('buildDesktopHookCommand', () => {
  it('runs the app binary as node with an absolute path and stays recognisable', () => {
    expect(COMMAND).toBe(`ELECTRON_RUN_AS_NODE=1 "/opt/Agents Office/agents-office" ${ENTRY} hook`);
    expect(isOurCommand(COMMAND)).toBe(true);
  });
  it('adds --port only when it is not the default, and falls back to node on Windows', () => {
    const custom = buildDesktopHookCommand({
      platform: 'linux',
      execPath: '/a/app',
      entry: ENTRY,
      port: 5000,
    });
    expect(custom.endsWith('hook --port 5000')).toBe(true);
    const win = buildDesktopHookCommand({
      platform: 'win32',
      execPath: 'C:\\app.exe',
      entry: ENTRY,
      port: 4777,
    });
    expect(win).toBe(`node ${ENTRY} hook`);
    expect(isOurCommand(win)).toBe(true);
  });
});

describe('hooks service (temporary HOME)', () => {
  it('reports nothing installed, then everything, with the daemon hooksSeenAt', async () => {
    const empty = await service().status();
    expect(empty.installedCount).toBe(0);
    expect(empty.total).toBeGreaterThan(8);
    expect(empty.hooksSeenAt).toBeNull();
    expect(empty.daemonReachable).toBe(false);

    const svc = service(async () => ({ hooksSeenAt: '2026-10-10T10:00:00.000Z' }));
    const result = await svc.install();
    expect(result.changed).toBe(true);
    expect(result.status.installedCount).toBe(result.status.total);
    expect(result.status.hooksSeenAt).toBe('2026-10-10T10:00:00.000Z');
    expect(result.status.events.find((e) => e.event === 'PermissionRequest')?.installed).toBe(true);
  });

  it('previews the diff without touching the file', () => {
    const original = '{\n  "model": "x"\n}\n';
    writeFileSync(settingsPath, original);
    const preview = service().preview('install');
    expect(preview.changed).toBe(true);
    expect(preview.diff).toContain('+ ');
    expect(preview.diff).toContain('PermissionRequest');
    expect(readFileSync(settingsPath, 'utf8')).toBe(original);
    expect(existsSync(`${settingsPath}.agents-office.bak`)).toBe(false);
  });

  it('is idempotent and writes the backup once', async () => {
    const original = '{\n  "model": "x"\n}\n';
    writeFileSync(settingsPath, original);
    const svc = service();
    const first = await svc.install();
    expect(first.backupPath).toBe(`${settingsPath}.agents-office.bak`);
    expect(readFileSync(first.backupPath as string, 'utf8')).toBe(original);
    const afterFirst = readFileSync(settingsPath, 'utf8');
    const second = await svc.install();
    expect(second.changed).toBe(false);
    expect(readFileSync(settingsPath, 'utf8')).toBe(afterFirst);
    expect(svc.preview('install').changed).toBe(false);
  });

  it('uninstall restores the original byte for byte', async () => {
    const original =
      '{\n  "model": "x",\n  "hooks": {\n    "Stop": [\n      { "hooks": [{ "type": "command", "command": "notify-send hi" }] }\n    ]\n  }\n}\n';
    writeFileSync(settingsPath, original);
    const svc = service();
    await svc.install();
    expect(svc.preview('uninstall').changed).toBe(true);
    const result = await svc.uninstall();
    expect(result.changed).toBe(true);
    expect(result.deleted).toBe(false);
    expect(result.status.installedCount).toBe(0);
    expect(JSON.parse(readFileSync(settingsPath, 'utf8'))).toEqual(JSON.parse(original));
    // Same bytes as the CLI path: re-serialised with the detected indent.
    expect(readFileSync(settingsPath, 'utf8')).toBe(
      `${JSON.stringify(JSON.parse(original), null, 2)}\n`,
    );
  });

  it('deletes a settings file that agents-office created entirely', async () => {
    const svc = service();
    await svc.install();
    expect(existsSync(settingsPath)).toBe(true);
    const result = await svc.uninstall();
    expect(result.deleted).toBe(true);
    expect(existsSync(settingsPath)).toBe(false);
    expect((await svc.uninstall()).changed).toBe(false);
    expect(svc.preview('uninstall')).toMatchObject({ changed: false, diff: '' });
  });

  it('refuses invalid JSON without touching it', async () => {
    writeFileSync(settingsPath, '{ nope');
    await expect(service().install()).rejects.toThrow(/not valid JSON/);
    expect(readFileSync(settingsPath, 'utf8')).toBe('{ nope');
  });
});

describe('settings path and sender trust', () => {
  it('honours AGENTS_OFFICE_SETTINGS_PATH and defaults to ~/.claude/settings.json', () => {
    expect(defaultSettingsPath({ AGENTS_OFFICE_SETTINGS_PATH: '/tmp/x/s.json' })).toBe(
      '/tmp/x/s.json',
    );
    expect(defaultSettingsPath({})).toMatch(/\.claude[\\/]settings\.json$/);
  });
  it('trusts only our own origin', () => {
    const origin = 'http://127.0.0.1:4777';
    expect(isTrustedSender('http://127.0.0.1:4777/', origin)).toBe(true);
    expect(isTrustedSender('http://127.0.0.1:4777/?demo', origin)).toBe(true);
    expect(isTrustedSender('http://evil.example/', origin)).toBe(false);
    expect(isTrustedSender('http://127.0.0.1:9999/', origin)).toBe(false);
    expect(isTrustedSender('file:///etc/x', origin)).toBe(false);
    expect(isTrustedSender(undefined, origin)).toBe(false);
    expect(isTrustedSender('garbage', origin)).toBe(false);
  });
});

describe('preload bridge contract', () => {
  it('maps each method to its channel and exposes nothing else', async () => {
    const invoke = vi.fn(async () => ({ ok: true }));
    const bridge = createHooksBridge(invoke);
    expect(Object.keys(bridge).sort()).toEqual(['install', 'preview', 'status', 'uninstall']);
    await bridge.status();
    await bridge.preview('install');
    await bridge.preview('uninstall');
    await bridge.install();
    await bridge.uninstall();
    expect(invoke.mock.calls).toEqual([
      [HOOKS_CHANNELS.status],
      [HOOKS_CHANNELS.preview, 'install'],
      [HOOKS_CHANNELS.preview, 'uninstall'],
      [HOOKS_CHANNELS.install],
      [HOOKS_CHANNELS.uninstall],
    ]);
  });
  it('rejects an invalid action before reaching IPC', async () => {
    const invoke = vi.fn();
    const bridge = createHooksBridge(invoke);
    await expect(bridge.preview('rm -rf' as never)).rejects.toThrow(/Invalid/);
    expect(invoke).not.toHaveBeenCalled();
  });
});
