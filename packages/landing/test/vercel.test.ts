import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface VercelConfig {
  installCommand: string;
  buildCommand: string;
  outputDirectory: string;
  headers: { source: string; headers: { key: string; value: string }[] }[];
}

const config = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../vercel.json'), 'utf8'),
) as VercelConfig;

describe('vercel.json', () => {
  it('installs only the landing and its workspace deps, not Electron or node-pty', () => {
    expect(config.installCommand).toContain('--frozen-lockfile');
    expect(config.installCommand).toContain('--filter @agents-office/landing...');
  });

  it('builds only the landing from the repository root into dist', () => {
    expect(config.buildCommand).toContain('--filter @agents-office/landing build');
    expect(config.outputDirectory).toBe('dist');
  });

  it('gives only the hashed /assets an immutable cache', () => {
    const immutable = config.headers.filter((h) =>
      h.headers.some((x) => x.value.includes('immutable')),
    );
    expect(immutable.map((h) => h.source)).toEqual(['/assets/(.*)']);
  });
});
