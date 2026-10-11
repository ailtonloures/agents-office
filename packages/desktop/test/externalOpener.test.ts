import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { realIsExecutable } from '../src/main/binaries';
import { EXTERNAL_CHANNELS } from '../src/main/externalChannels';
import { registerExternalIpc } from '../src/main/externalIpc';
import {
  discoverVSCode,
  EditorPathStore,
  fallbackPaths,
  type OpenerDeps,
  OpenerError,
  openInVSCode,
  realIsDirectory,
  realRun,
  VSCodeNotFound,
} from '../src/main/externalOpener';

function fakeDeps(
  options: {
    exec?: string[];
    dirs?: string[];
    platform?: NodeJS.Platform;
    path?: string;
    login?: string | undefined;
    run?: OpenerDeps['run'];
  } = {},
): OpenerDeps {
  const exec = new Set(options.exec ?? []);
  const dirs = new Set(options.dirs ?? ['/work/proj']);
  return {
    env: { PATH: options.path ?? '/usr/local/bin:/opt/x' },
    platform: options.platform ?? 'linux',
    homedir: '/home/u',
    isExecutable: (path) => exec.has(path),
    isDirectory: (path) => dirs.has(path),
    loginPath: async () => options.login,
    run: options.run ?? (async () => {}),
  };
}

describe('discoverVSCode', () => {
  it('prefers the login shell PATH over the process PATH', async () => {
    const deps = fakeDeps({
      exec: ['/login/bin/code', '/opt/x/code'],
      login: '/login/bin',
    });
    expect(await discoverVSCode(deps, '/work/proj')).toEqual({
      file: '/login/bin/code',
      args: ['/work/proj'],
      source: 'login-shell',
    });
  });

  it('falls back to the process PATH when the login shell has no code', async () => {
    const deps = fakeDeps({ exec: ['/opt/x/code'], login: '/login/bin' });
    expect((await discoverVSCode(deps, '/work/proj')).file).toBe('/opt/x/code');
  });

  it('finds /snap/bin/code on Linux when the PATH lacks it', async () => {
    const deps = fakeDeps({ exec: ['/snap/bin/code'], path: '/usr/bin:/bin' });
    expect(await discoverVSCode(deps, '/work/proj')).toMatchObject({
      file: '/snap/bin/code',
      source: 'fallback',
    });
  });

  it('finds the flatpak export on Linux', async () => {
    const flatpak = '/var/lib/flatpak/exports/bin/com.visualstudio.code';
    const deps = fakeDeps({ exec: [flatpak] });
    expect((await discoverVSCode(deps, '/work/proj')).file).toBe(flatpak);
  });

  it('uses the app bundle CLI on macOS, then `open -a` when only the app exists', async () => {
    const cli = '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code';
    const mac = await discoverVSCode(fakeDeps({ platform: 'darwin', exec: [cli] }), '/work/proj');
    expect(mac).toMatchObject({ file: cli, args: ['/work/proj'] });
    const open = await discoverVSCode(
      fakeDeps({ platform: 'darwin', dirs: ['/Applications/Visual Studio Code.app'] }),
      '/work/proj',
    );
    expect(open).toEqual({
      file: 'open',
      args: ['-a', 'Visual Studio Code', '/work/proj'],
      source: 'open-app',
    });
    expect(fallbackPaths('/home/u', 'darwin')).toContain(
      `/home/u/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code`,
    );
  });

  it('a manual path wins and is exclusive', async () => {
    const deps = fakeDeps({ exec: ['/m/code', '/opt/x/code'] });
    expect(await discoverVSCode(deps, '/work/proj', '/m/code')).toMatchObject({
      file: '/m/code',
      source: 'manual',
    });
    await expect(discoverVSCode(deps, '/work/proj', '/gone/code')).rejects.toThrow(
      /saved VS Code path "\/gone\/code"/,
    );
  });

  it('throws VSCodeNotFound with guidance when nothing is installed', async () => {
    const error = await discoverVSCode(fakeDeps(), '/work/proj').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(VSCodeNotFound);
    expect((error as VSCodeNotFound).message).toMatch(/Install VS Code/);
    expect((error as VSCodeNotFound).searched).toContain('/snap/bin/code');
  });
});

describe('openInVSCode', () => {
  it('validates the folder before looking for the editor', async () => {
    const run = vi.fn();
    const deps = fakeDeps({ exec: ['/opt/x/code'], run });
    for (const bad of ['relative/dir', '', '/work/missing', '/work/pr\0oj']) {
      await expect(openInVSCode(deps, bad)).rejects.toBeInstanceOf(OpenerError);
    }
    expect(run).not.toHaveBeenCalled();
  });

  it('passes the folder as one argument and wraps run failures', async () => {
    const run = vi.fn(async () => {});
    const deps = fakeDeps({ exec: ['/opt/x/code'], run });
    await openInVSCode(deps, '/work/proj');
    expect(run).toHaveBeenCalledWith('/opt/x/code', ['/work/proj']);
    const failing = fakeDeps({
      exec: ['/opt/x/code'],
      run: async () => {
        throw new Error('boom');
      },
    });
    await expect(openInVSCode(failing, '/work/proj')).rejects.toMatchObject({
      code: 'spawn-failed',
    });
  });
});

describe('with a fake code executable', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ao-opener-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  function realDeps(overrides: Partial<OpenerDeps> = {}): OpenerDeps {
    return {
      env: { PATH: join(root, 'bin') },
      platform: 'linux',
      homedir: root,
      isExecutable: realIsExecutable,
      isDirectory: realIsDirectory,
      loginPath: async () => undefined,
      run: realRun,
      ...overrides,
    };
  }

  function fakeCode(): { code: string; record: string } {
    const bin = join(root, 'bin');
    mkdirSync(bin, { recursive: true });
    const record = join(root, 'args.txt');
    const code = join(bin, 'code');
    writeFileSync(code, `#!/bin/sh\nprintf '%s\\0' "$@" > "${record}"\n`);
    chmodSync(code, 0o755);
    return { code, record };
  }

  it.each([
    'plain',
    'with spaces',
    `quote'd "double" $HOME \`tick\` ; & | ( ) * ? [x] {y} ~ ! #`,
    'acentuação ção ✓',
    'line\nbreak',
    '-looks-like-a-flag',
  ])('receives exactly the folder %j', async (name) => {
    const { record } = fakeCode();
    const dir = join(root, name);
    mkdirSync(dir);
    await openInVSCode(realDeps(), dir);
    expect(readFileSync(record, 'utf8').split('\0').slice(0, -1)).toEqual([dir]);
  });

  it('reports a failing command instead of throwing an unknown error', async () => {
    const bin = join(root, 'bin');
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'code'), '#!/bin/sh\nexit 3\n');
    chmodSync(join(bin, 'code'), 0o755);
    await expect(openInVSCode(realDeps(), root)).rejects.toMatchObject({ code: 'spawn-failed' });
  });

  it('reports missing VS Code without throwing from the IPC handler', async () => {
    const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
    const store = new EditorPathStore(join(root, 'editor.json'));
    registerExternalIpc({
      ipcMain: { handle: (channel, listener) => void handlers.set(channel, listener) },
      // Nothing is executable (the host may have a real VS Code), and nothing is ever run.
      opener: realDeps({
        env: { PATH: join(root, 'nothing') },
        isExecutable: () => false,
        run: async () => {
          throw new Error('must not run');
        },
      }),
      store,
      trusted: () => {},
    });
    const call = (channel: string, ...args: unknown[]) =>
      Promise.resolve(handlers.get(channel)?.({}, ...args));
    const missing = await call(EXTERNAL_CHANNELS.openInVSCode, root);
    expect(missing).toMatchObject({ ok: false, code: 'vscode-not-found' });
    expect((missing as { message: string }).message).toMatch(/Install VS Code/);
    expect(await call(EXTERNAL_CHANNELS.openInVSCode, 42)).toMatchObject({
      ok: false,
      code: 'invalid-request',
    });
    expect(await call(EXTERNAL_CHANNELS.openInVSCode, '/definitely/missing')).toMatchObject({
      ok: false,
      code: 'invalid-dir',
    });
  });

  it('saves a manual path, validates it and uses it', async () => {
    const { code, record } = fakeCode();
    const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
    const storePath = join(root, 'editor.json');
    const store = new EditorPathStore(storePath);
    registerExternalIpc({
      ipcMain: { handle: (channel, listener) => void handlers.set(channel, listener) },
      opener: realDeps({ env: { PATH: '' } }),
      store,
      trusted: () => {},
    });
    const call = (channel: string, ...args: unknown[]) =>
      Promise.resolve(handlers.get(channel)?.({}, ...args));
    expect(await call(EXTERNAL_CHANNELS.setEditorPath, 'code')).toMatchObject({ ok: false });
    expect(await call(EXTERNAL_CHANNELS.setEditorPath, join(root, 'none'))).toMatchObject({
      ok: false,
    });
    expect(await call(EXTERNAL_CHANNELS.setEditorPath, code)).toEqual({
      ok: true,
      vscodePath: code,
    });
    expect(new EditorPathStore(storePath).get()).toBe(code);
    expect(await call(EXTERNAL_CHANNELS.getEditorPath)).toBe(code);
    expect(await call(EXTERNAL_CHANNELS.openInVSCode, root)).toEqual({ ok: true });
    expect(readFileSync(record, 'utf8')).toBe(`${root}\0`);
    expect(await call(EXTERNAL_CHANNELS.setEditorPath, null)).toEqual({
      ok: true,
      vscodePath: null,
    });
  });

  it('rejects untrusted senders', async () => {
    const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
    registerExternalIpc({
      ipcMain: { handle: (channel, listener) => void handlers.set(channel, listener) },
      opener: realDeps(),
      store: new EditorPathStore(join(root, 'editor.json')),
      trusted: () => {
        throw new Error('Untrusted sender.');
      },
    });
    expect(() => handlers.get(EXTERNAL_CHANNELS.openInVSCode)?.({}, root)).toThrow(/Untrusted/);
  });
});
