import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDaemon, type Daemon } from '../src/server';

let root: string;
let daemon: Daemon | undefined;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'agents-office-skin-'));
  mkdirSync(join(root, 'skin', 'img'), { recursive: true });
  writeFileSync(join(root, 'skin', 'skin.json'), '{"name":"custom"}');
  writeFileSync(join(root, 'skin', 'img', 'a.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  writeFileSync(join(root, 'secret.txt'), 'secret');
  daemon = undefined;
});

afterEach(async () => {
  await daemon?.stop();
  rmSync(root, { recursive: true, force: true });
});

async function start(skinDir?: string): Promise<string> {
  daemon = createDaemon({
    port: 0,
    projectsDir: join(root, 'projects'),
    webDist: join(root, 'no-dist'),
    usePolling: true,
    ...(skinDir ? { skinDir } : {}),
  });
  const { port } = await daemon.start();
  return `http://127.0.0.1:${port}`;
}

describe('GET /skin/*', () => {
  it('serves files of the skin directory with their content type', async () => {
    const base = await start(join(root, 'skin'));
    const json = await fetch(`${base}/skin/skin.json`);
    expect(json.status).toBe(200);
    expect(json.headers.get('content-type')).toContain('application/json');
    expect(await json.json()).toEqual({ name: 'custom' });

    const png = await fetch(`${base}/skin/img/a.png`);
    expect(png.status).toBe(200);
    expect(png.headers.get('content-type')).toBe('image/png');
  });

  it('answers 404 for missing files (no SPA fallback) and for traversal', async () => {
    const base = await start(join(root, 'skin'));
    expect((await fetch(`${base}/skin/missing`)).status).toBe(404);
    expect((await fetch(`${base}/skin/%2e%2e/secret.txt`)).status).toBe(404);
  });

  it('answers 404 when no skin directory is configured', async () => {
    const base = await start();
    expect((await fetch(`${base}/skin/skin.json`)).status).toBe(404);
  });
});
