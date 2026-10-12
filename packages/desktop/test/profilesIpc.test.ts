import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProfileLibrary } from '../src/main/profileLibrary';
import { registerProfilesIpc } from '../src/main/profilesIpc';
import { RosterStore } from '../src/main/rosterStore';
import { createProfilesBridge } from '../src/preload/profilesBridge';

type Handler = (event: { trusted: boolean }, ...args: unknown[]) => unknown;
const appearance = {
  base: 'developer',
  hairStyle: 0,
  hairColor: '#000000',
  skinColor: '#ffffff',
  outfitColor: '#123456',
} as const;

describe('registerProfilesIpc', () => {
  let root: string;
  const handlers = new Map<string, Handler>();
  let trustedFlag = true;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ao-pfipc-'));
    handlers.clear();
    trustedFlag = true;
    const roster = new RosterStore(join(root, 'rosters.json'));
    registerProfilesIpc<{ trusted: boolean }>({
      ipcMain: { handle: (c, l) => handlers.set(c, l as Handler) },
      library: new ProfileLibrary({
        dir: join(root, 'profiles'),
        usage: (id) => roster.projectsUsing(id),
      }),
      roster,
      comms: {
        status: () => ({ mutedEntryIds: [], paused: false, hops: 0, hopLimit: 8 }),
        mute: () => {},
        resume: () => {},
        stop: () => {},
      },
      trusted: (e) => {
        if (!e.trusted) throw new Error('Untrusted sender.');
      },
    });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const bridge = () =>
    createProfilesBridge(async (channel, ...args) => {
      const h = handlers.get(channel);
      if (!h) throw new Error(`no handler ${channel}`);
      return h({ trusted: trustedFlag }, ...args);
    });

  it('runs the full flow through the bridge', async () => {
    const api = bridge();
    const p = await api.create({ name: 'Dev', appearance });
    await api.roster.addProfile('/proj', p.id);
    expect((await api.roster.get('/proj')).entries).toHaveLength(1);
    expect(await api.remove(p.id)).toEqual({ deleted: false, usedBy: ['/proj'] });
    expect((await api.remove(p.id, true)).deleted).toBe(true);
    expect((await api.roster.get('/proj')).entries).toHaveLength(0);
    expect((await api.list()).map((x) => x.id)).toEqual(['tech-lead']);
  });

  it('validates payloads and rejects untrusted senders', async () => {
    const api = bridge();
    await expect(api.roster.get('relative')).rejects.toThrow();
    await expect(api.roster.addProfile('/p', 'unknown')).rejects.toThrow();
    await expect(
      api.create({ name: 'X', appearance: { ...appearance, hairColor: 'red' } }),
    ).rejects.toThrow();
    trustedFlag = false;
    await expect(api.list()).rejects.toThrow('Untrusted');
  });
});
