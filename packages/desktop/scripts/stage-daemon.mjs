// Prepares build/daemon: the published `agents-office` package (bin, dist with the web app and the
// default skin) plus its production node_modules, keeping pnpm's relative symlinks so the files can be
// copied by electron-builder into `resources/daemon` on any platform.

import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'build', 'daemon');
const staging = join(tmpdir(), `agents-office-deploy-${process.pid}`);

rmSync(target, { recursive: true, force: true });
rmSync(staging, { recursive: true, force: true });
mkdirSync(dirname(target), { recursive: true });
execFileSync('pnpm', ['--filter', 'agents-office', 'deploy', '--prod', staging], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
cpSync(staging, target, { recursive: true, verbatimSymlinks: true });
rmSync(staging, { recursive: true, force: true });
console.log('daemon staged in', target);
