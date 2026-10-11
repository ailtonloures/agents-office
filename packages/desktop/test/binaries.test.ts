import { delimiter } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  type BinaryDeps,
  BinaryResolver,
  ClaudeNotFound,
  commonClaudeDirs,
  extractMarkedPath,
} from '../src/main/binaries';

function deps(overrides: Partial<BinaryDeps> & { files?: string[] } = {}): BinaryDeps {
  const files = new Set(overrides.files ?? []);
  return {
    env: { SHELL: '/bin/zsh', PATH: '/usr/bin:/bin' },
    platform: 'linux',
    homedir: '/home/u',
    isExecutable: (p) => files.has(p),
    runShell: async () => '',
    ...overrides,
  };
}

describe('extractMarkedPath', () => {
  it('ignores rc noise around the markers', () => {
    expect(extractMarkedPath('welcome\n__AO_S__/a:/b__AO_E__\nbye')).toBe('/a:/b');
  });

  it('uses the last start marker when an rc file prints one too', () => {
    expect(extractMarkedPath('__AO_S__x__AO_S__/p__AO_E__')).toBe('/p');
  });

  it('returns undefined without markers or with an empty PATH', () => {
    expect(extractMarkedPath('no markers')).toBeUndefined();
    expect(extractMarkedPath('__AO_S____AO_E__')).toBeUndefined();
    expect(extractMarkedPath('__AO_S__/a')).toBeUndefined();
  });
});

describe('BinaryResolver', () => {
  it('finds claude through an interactive login shell and returns that PATH', async () => {
    const runShell = vi.fn(async () => 'noise\n__AO_S__/home/u/.local/bin:/usr/bin__AO_E__');
    const resolver = new BinaryResolver(deps({ runShell, files: ['/home/u/.local/bin/claude'] }));
    const found = await resolver.resolveClaude();
    expect(found).toEqual({
      path: '/home/u/.local/bin/claude',
      pathEnv: '/home/u/.local/bin:/usr/bin',
      source: 'login-shell',
    });
    expect(runShell).toHaveBeenCalledWith(
      '/bin/zsh',
      ['-ilc', expect.stringContaining('__AO_S__')],
      5000,
    );
  });

  it('uses -ilc (interactive), not just -lc', async () => {
    const runShell = vi.fn<BinaryDeps['runShell']>(async () => '');
    await new BinaryResolver(deps({ runShell })).resolveClaude().catch(() => undefined);
    expect(runShell.mock.calls[0]?.[1]?.[0]).toBe('-ilc');
  });

  it('caches the result and the login PATH', async () => {
    const runShell = vi.fn(async () => '__AO_S__/opt/bin__AO_E__');
    const resolver = new BinaryResolver(deps({ runShell, files: ['/opt/bin/claude'] }));
    await resolver.resolveClaude();
    await resolver.resolveClaude();
    expect(runShell).toHaveBeenCalledTimes(1);
  });

  it('searches again when the cached binary disappears', async () => {
    const files = ['/opt/bin/claude'];
    const resolver = new BinaryResolver(
      deps({
        runShell: async () => '__AO_S__/opt/bin:/other__AO_E__',
        isExecutable: (p) => files.includes(p),
      }),
    );
    expect((await resolver.resolveClaude()).path).toBe('/opt/bin/claude');
    files.splice(0, 1, '/other/claude');
    expect((await resolver.resolveClaude()).path).toBe('/other/claude');
  });

  it('falls back to the process PATH and then to common directories', async () => {
    const failing = async () => {
      throw new Error('timeout');
    };
    const viaProcess = new BinaryResolver(deps({ runShell: failing, files: ['/usr/bin/claude'] }));
    expect((await viaProcess.resolveClaude()).source).toBe('process-path');

    const viaCommon = new BinaryResolver(
      deps({ runShell: failing, files: ['/home/u/.local/bin/claude'] }),
    );
    const found = await viaCommon.resolveClaude();
    expect(found.source).toBe('common-dir');
    expect(found.pathEnv.split(delimiter)).toContain('/home/u/.local/bin');
  });

  it('does not cache a failed login shell lookup', async () => {
    const runShell = vi
      .fn<BinaryDeps['runShell']>()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue('__AO_S__/x__AO_E__');
    const resolver = new BinaryResolver(deps({ runShell }));
    expect(await resolver.resolveLoginPath()).toBeUndefined();
    expect(await resolver.resolveLoginPath()).toBe('/x');
  });

  it('throws ClaudeNotFound with guidance when nothing is found', async () => {
    const resolver = new BinaryResolver(deps());
    const error = await resolver.resolveClaude().catch((e) => e);
    expect(error).toBeInstanceOf(ClaudeNotFound);
    expect(error.code).toBe('claude-not-found');
    expect(error.message).toMatch(/not found/i);
    expect(error.message).toMatch(/settings/i);
    expect(error.searched).toContain('/home/u/.local/bin');
  });

  it('prefers a valid manual path and reports an invalid one', async () => {
    const runShell = vi.fn(async () => '__AO_S__/usr/bin__AO_E__');
    const resolver = new BinaryResolver(
      deps({ runShell, files: ['/m/claude', '/usr/bin/claude'] }),
    );
    const manual = await resolver.resolveClaude('/m/claude');
    expect(manual.path).toBe('/m/claude');
    expect(manual.source).toBe('manual');
    expect(manual.pathEnv.split(delimiter)).toContain('/m');

    const error = await resolver.resolveClaude('/gone/claude').catch((e) => e);
    expect(error).toBeInstanceOf(ClaudeNotFound);
    expect(error.message).toContain('/gone/claude');
  });

  it('skips the login shell on Windows and has no macOS-only dirs on Linux', async () => {
    const runShell = vi.fn(async () => '');
    const win = new BinaryResolver(
      deps({ platform: 'win32', runShell, env: { PATH: 'C:\\bin' }, files: [] }),
    );
    await win.resolveClaude().catch(() => undefined);
    expect(runShell).not.toHaveBeenCalled();
    expect(commonClaudeDirs('/h', 'linux')).not.toContain('/opt/homebrew/bin');
    expect(commonClaudeDirs('/h', 'darwin')).toContain('/opt/homebrew/bin');
  });
});
