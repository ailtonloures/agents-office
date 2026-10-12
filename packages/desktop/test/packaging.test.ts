import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const desktop = join(dirname(fileURLToPath(import.meta.url)), '..');
const skinSource = join(desktop, '..', 'web', 'public', 'skins', 'default');
const config = readFileSync(join(desktop, 'electron-builder.yml'), 'utf8');

function listFiles(dir: string, base = dir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? listFiles(join(dir, entry.name), base)
      : [relative(base, join(dir, entry.name)).split('\\').join('/')],
  );
}

describe('electron-builder configuration', () => {
  it('builds AppImage, deb and dmg without signing', () => {
    expect(config).toMatch(/target: \[AppImage, deb\]/);
    expect(config).toMatch(/target: dmg/);
    expect(config).toMatch(/identity: null/);
    expect(config).toMatch(/^productName: Agents Office$/m);
    expect(config).toMatch(/^appId: \S+\.\S+/m);
  });

  it('ships the daemon next to the asar, with its node_modules added by a hook', () => {
    expect(config).toMatch(/from: build\/daemon\s+to: daemon/);
    expect(config).toMatch(/afterPack: scripts\/after-pack\.cjs/);
    expect(existsSync(join(desktop, 'scripts', 'after-pack.cjs'))).toBe(true);
    expect(existsSync(join(desktop, 'scripts', 'stage-daemon.mjs'))).toBe(true);
  });

  it('unpacks the native node-pty module out of the asar and keeps it external in the bundle', () => {
    expect(config).toMatch(/^asarUnpack:\s*\n\s*- "\*\*\/node_modules\/node-pty\/\*\*"/m);
    expect(readFileSync(join(desktop, 'scripts', 'build.mjs'), 'utf8')).toMatch(
      /external: \['electron', 'electron-updater', 'node-pty'\]/,
    );
  });

  it('has a dist script that builds the workspace first', () => {
    const manifest = JSON.parse(readFileSync(join(desktop, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(manifest.scripts.dist).toMatch(/^pnpm --workspace-root build && /);
    expect(manifest.scripts.dist).toContain('electron-builder');
  });
});

describe('auto-update publishing', () => {
  const workflow = readFileSync(
    join(desktop, '..', '..', '.github', 'workflows', 'release.yml'),
    'utf8',
  );
  const manifest = JSON.parse(readFileSync(join(desktop, 'package.json'), 'utf8')) as {
    dependencies: Record<string, string>;
    homepage: string;
    repository: { url: string };
  };

  it('publishes to the GitHub repository', () => {
    expect(config).toMatch(
      /^publish:\s*\n\s+provider: github\s*\n\s+owner: ailtonloures\s*\n\s+repo: agents-office$/m,
    );
    expect(manifest.homepage).toBe('https://github.com/ailtonloures/agents-office');
    expect(manifest.repository.url).toContain('ailtonloures/agents-office');
  });

  it('bundles electron-updater as an external runtime dependency', () => {
    expect(manifest.dependencies['electron-updater']).toBeDefined();
    expect(readFileSync(join(desktop, 'scripts', 'build.mjs'), 'utf8')).toMatch(
      /external: \['electron', 'electron-updater', 'node-pty'\]/,
    );
  });

  it('releases on v* tags with write permission, checking the tag against the version', () => {
    expect(workflow).toMatch(/tags: \["v\*"\]/);
    expect(workflow).toMatch(/permissions:\s*\n\s+contents: write/);
    expect(workflow).toMatch(/runs-on: ubuntu-latest/);
    expect(workflow).toMatch(/node-version: 22/);
    expect(workflow).toMatch(/version: 9/);
    expect(workflow).toContain('packages/desktop/package.json');
    expect(workflow).toContain('GITHUB_REF_NAME');
    expect(workflow).toMatch(/exit 1/);
  });

  it('builds, stages the daemon and publishes the AppImage with generated notes', () => {
    expect(workflow).toContain('scripts/stage-daemon.mjs');
    expect(workflow).toMatch(/electron-builder .*--linux AppImage --publish always/);
    expect(workflow).toMatch(/GH_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}/);
    expect(workflow).toContain('--generate-notes');
  });
});

describe('packaged assets are CC0', () => {
  const licenses = readFileSync(join(desktop, 'resources', 'LICENSES.md'), 'utf8');

  it('lists every file in resources/ as CC0', () => {
    const files = listFiles(join(desktop, 'resources')).filter((file) => file !== 'LICENSES.md');
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const row = licenses
        .split('\n')
        .find((line) => line.startsWith('|') && line.includes(`\`${file}\``));
      expect(row, `${file} must be listed in resources/LICENSES.md`).toMatch(/CC0 1\.0/);
    }
    expect(licenses).toMatch(/No third-party assets are included/);
  });

  it('stages only the default CC0 skin when the daemon is staged', () => {
    const staged = join(desktop, 'build', 'daemon', 'dist', 'web', 'skins');
    if (!existsSync(staged)) return; // `pnpm dist` was not run; the cli package test guards the source
    expect(readdirSync(staged)).toEqual(['default']);
    expect(listFiles(join(staged, 'default')).sort()).toEqual(listFiles(skinSource).sort());
    expect(readFileSync(join(staged, 'default', 'LICENSES.md'), 'utf8')).toMatch(/CC0 1\.0/);
  });
});
