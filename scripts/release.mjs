#!/usr/bin/env node
// Usage: pnpm release <patch|minor|major> [--dry-run]
// Bumps packages/desktop/package.json, commits it and creates the vX.Y.Z tag.
// It never pushes: the maintainer pushes the commit and the tag (see DEVELOPMENT.md, "Releasing").
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const desktopPackage = resolve(root, 'packages/desktop/package.json');
const BUMPS = ['patch', 'minor', 'major'];

export function bumpVersion(version, kind) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`Unsupported version "${version}" (expected X.Y.Z)`);
  if (!BUMPS.includes(kind)) throw new Error(`Bump must be one of: ${BUMPS.join(', ')}`);
  const [major, minor, patch] = match.slice(1).map(Number);
  if (kind === 'major') return `${major + 1}.0.0`;
  if (kind === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function main(argv) {
  const dryRun = argv.includes('--dry-run');
  const kind = argv.find((arg) => !arg.startsWith('--'));
  if (!kind || !BUMPS.includes(kind)) {
    console.error('Usage: pnpm release <patch|minor|major> [--dry-run]');
    process.exit(1);
  }

  const raw = readFileSync(desktopPackage, 'utf8');
  const pkg = JSON.parse(raw);
  const next = bumpVersion(pkg.version, kind);
  const tag = `v${next}`;
  console.log(
    `packages/desktop: ${pkg.version} -> ${next} (tag ${tag})${dryRun ? ' [dry run]' : ''}`,
  );

  if (git('tag', '--list', tag)) throw new Error(`Tag ${tag} already exists`);
  if (!dryRun) {
    if (git('status', '--porcelain')) {
      throw new Error('Working tree is not clean: commit or stash your changes first');
    }
    pkg.version = next;
    writeFileSync(desktopPackage, `${JSON.stringify(pkg, null, 2)}\n`);
    git('add', 'packages/desktop/package.json');
    git('commit', '-m', `:bookmark: release ${tag}`);
    git('tag', '-a', tag, '-m', tag);
    console.log(`Created commit and tag ${tag}. Publish with:\n  git push origin HEAD ${tag}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
