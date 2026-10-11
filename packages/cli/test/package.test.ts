import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const skinDir = join(packageDir, '..', 'web', 'public', 'skins', 'default');

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? listFiles(join(dir, entry.name))
      : [relative(skinDir, join(dir, entry.name)).split('\\').join('/')],
  );
}

/** Backticked file names/globs in the "Asset" column of LICENSES.md, e.g. `characters/*.png`. */
function declaredAssets(markdown: string): RegExp[] {
  const tokens = [...markdown.matchAll(/`([\w./*-]+\.\w+)`/g)].map((m) => m[1] as string);
  return tokens.map((token) => {
    // Bare names such as `tileset.png` live at the skin root; `*` stays inside one directory.
    const pattern = token.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
    return new RegExp(`^${pattern}$`);
  });
}

describe('default skin licensing', () => {
  const licenses = readFileSync(join(skinDir, 'LICENSES.md'), 'utf8');
  const files = listFiles(skinDir);

  it('ships a LICENSES.md that lists every asset', () => {
    const patterns = declaredAssets(licenses);
    const uncovered = files.filter(
      (file) => file !== 'LICENSES.md' && !patterns.some((pattern) => pattern.test(file)),
    );
    expect(uncovered).toEqual([]);
  });

  it('declares only CC0 assets and no third-party packs', () => {
    expect(licenses).toMatch(/CC0 1\.0/);
    expect(licenses).toMatch(/No third-party assets are included/);
    const rows = licenses.split('\n').filter((line) => /^\|.*\|$/.test(line));
    const dataRows = rows.slice(2); // header + separator
    expect(dataRows.length).toBeGreaterThan(0);
    for (const row of dataRows) expect(row).toMatch(/CC0 1\.0/);
    expect(licenses).not.toMatch(/CC[- ]BY|GPL|limezu|Modern (Interiors|Office)/i);
  });

  it('contains only image, font and json assets', () => {
    for (const file of files) expect(file).toMatch(/\.(png|fnt|json|md)$/);
  });
});

describe('publishable package', () => {
  const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as {
    name: string;
    bin: Record<string, string>;
    engines: { node: string };
    files: string[];
    license: string;
    private?: boolean;
  };

  it('is the public agents-office package for Node >= 20', () => {
    expect(manifest.name).toBe('agents-office');
    expect(manifest.private).toBeUndefined();
    expect(manifest.engines.node).toBe('>=20');
    expect(manifest.license).toBe('MIT');
    expect(manifest.bin['agents-office']).toBe('./bin/agents-office.mjs');
    expect(existsSync(join(packageDir, manifest.bin['agents-office'] as string))).toBe(true);
  });

  it.runIf(existsSync(join(packageDir, 'dist', 'web', 'index.html')))(
    'packs the built daemon, the web app and only the CC0 default skin',
    () => {
      const output = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
        cwd: packageDir,
        encoding: 'utf8',
      });
      const [result] = JSON.parse(output) as { files: { path: string }[] }[];
      const packed = (result?.files ?? []).map((file) => file.path);
      expect(packed).toEqual(
        expect.arrayContaining([
          'bin/agents-office.mjs',
          'dist/cli.mjs',
          'dist/hook.mjs',
          'dist/web/index.html',
          'dist/web/skins/default/LICENSES.md',
          'package.json',
        ]),
      );
      const skinFiles = packed
        .filter((path) => path.startsWith('dist/web/skins/'))
        .map((path) => path.slice('dist/web/skins/default/'.length))
        .sort();
      expect(
        packed.filter((p) => p.startsWith('dist/web/skins/') && !p.includes('/default/')),
      ).toEqual([]);
      expect(skinFiles).toEqual([...files()].sort());
      expect(packed.some((path) => path.startsWith('src/') || path.startsWith('test/'))).toBe(
        false,
      );
    },
    30_000,
  );
});

function files(): string[] {
  return listFiles(skinDir);
}
