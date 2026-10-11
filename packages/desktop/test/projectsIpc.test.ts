import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProjectCatalog } from '../src/main/projectCatalog';
import { PROJECTS_CHANNELS } from '../src/main/projectsChannels';
import { registerProjectsIpc } from '../src/main/projectsIpc';
import { createProjectsBridge } from '../src/preload/projectsBridge';

type Handler = (event: { trusted: boolean }, ...args: unknown[]) => unknown;

describe('registerProjectsIpc', () => {
  let root: string;
  let folder: string;
  const handlers = new Map<string, Handler>();
  let picked: string | null = null;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ao-pipc-'));
    folder = join(root, 'proj');
    mkdirSync(folder);
    handlers.clear();
    registerProjectsIpc<{ trusted: boolean }>({
      ipcMain: { handle: (channel, listener) => handlers.set(channel, listener as Handler) },
      catalog: new ProjectCatalog({
        storePath: join(root, 'projects.json'),
        projectsDir: join(root, 'history'),
      }),
      trusted: (event) => {
        if (!event.trusted) throw new Error('Untrusted sender.');
      },
      pickFolder: async () => picked,
    });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const bridge = () =>
    createProjectsBridge(async (channel, ...args) => {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`no handler ${channel}`);
      return handler({ trusted: true }, ...args);
    });

  it('picks, favorites, marks use and lists through the bridge', async () => {
    const api = bridge();
    expect(await api.list([folder])).toMatchObject([{ cwd: folder, favorite: false }]);
    picked = null;
    expect(await api.pickFolder()).toBeNull();
    picked = join(root, 'missing');
    expect(await api.pickFolder()).toBeNull();
    picked = folder;
    expect((await api.pickFolder())?.cwd).toBe(folder);
    await api.setFavorite(folder, true);
    await api.markUsed(folder);
    const [project] = await api.list();
    expect(project?.favorite).toBe(true);
    expect(project?.lastUsedAt).not.toBeNull();
    expect(await api.sessions(folder)).toEqual([]);
  });

  it('rejects untrusted senders, relative paths and malformed payloads', async () => {
    for (const channel of Object.values(PROJECTS_CHANNELS)) {
      expect(() => handlers.get(channel)?.({ trusted: false })).toThrow('Untrusted sender.');
    }
    const call = (channel: string, ...args: unknown[]) =>
      handlers.get(channel)?.({ trusted: true }, ...args);
    expect(() => call(PROJECTS_CHANNELS.setFavorite, 'relative/path', true)).toThrow();
    expect(() => call(PROJECTS_CHANNELS.setFavorite, folder, 'yes')).toThrow();
    expect(() => call(PROJECTS_CHANNELS.markUsed, 5)).toThrow();
    expect(() => call(PROJECTS_CHANNELS.sessions, 'rel')).toThrow();
    expect(call(PROJECTS_CHANNELS.list, 'not-an-array')).toEqual([]);
  });
});
