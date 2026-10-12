import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const script = join(root, 'scripts', 'release.mjs');
const version = JSON.parse(readFileSync(join(root, 'packages', 'desktop', 'package.json'), 'utf8'))
  .version as string;
const [major, minor, patch] = version.split('.').map(Number) as [number, number, number];

function run(...args: string[]) {
  return spawnSync('node', [script, ...args], { cwd: root, encoding: 'utf8' });
}

describe('release script (dry run only)', () => {
  it.each([
    ['patch', `${major}.${minor}.${patch + 1}`],
    ['minor', `${major}.${minor + 1}.0`],
    ['major', `${major + 1}.0.0`],
  ])('computes the %s bump without touching anything', (kind, next) => {
    const before = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
    const result = run(kind, '--dry-run');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`${version} -> ${next} (tag v${next})`);
    expect(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' })).toBe(
      before,
    );
  });

  it('rejects a missing or unknown bump kind', () => {
    expect(run('--dry-run').status).toBe(1);
    expect(run('huge', '--dry-run').status).toBe(1);
  });

  it('tags with the same vX.Y.Z format the release workflow checks', () => {
    const workflow = readFileSync(join(root, '.github', 'workflows', 'release.yml'), 'utf8');
    expect(workflow).toContain('v$' + '{version}');
    expect(run('patch', '--dry-run').stdout).toMatch(/\(tag v\d+\.\d+\.\d+\)/);
  });
});
