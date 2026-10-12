import {
  createEmptyModel,
  type ManagedSessionInfo,
  type ProjectRoster,
  type Session,
} from '@agents-office/shared';
import { describe, expect, it } from 'vitest';
import { appearanceFor, appearanceKey, explicitAppearance } from '../src/characters/appearance';
import { isManagedSession, lookOf, managedLooks, rosterPresence } from '../src/ui/managedBinding';
import { activityByTerminal } from '../src/ui/sessionBinding';

const session = (id: string, patch: Partial<Session> = {}): Session => ({
  id,
  projectId: 'p1',
  profession: 'tech-lead',
  status: 'working',
  recentSteps: [],
  usage: { inputTokens: 0, outputTokens: 0 },
  agentIds: [],
  ...patch,
});

const info = (patch: Partial<ManagedSessionInfo> = {}): ManagedSessionInfo => ({
  terminalId: 't1',
  cwd: '/p',
  entryId: 'designer',
  name: 'Designer',
  appearance: {
    base: 'analyst',
    hairStyle: 3,
    hairColor: '#aa0000',
    skinColor: '#ffddaa',
    outfitColor: '#00aa00',
  },
  profession: null,
  startedAt: '2026-01-01T00:00:00Z',
  ...patch,
});

describe('explicitAppearance', () => {
  it('takes base, hair style and colors from the profile', () => {
    const a = explicitAppearance('designer', info().appearance as never);
    expect(a.profession).toBe('analyst');
    expect(a.accessory).toBe('glasses');
    expect(a.hairStyle).toBe(3);
    expect(a.explicit).toEqual({
      skinColor: '#ffddaa',
      hairColor: '#aa0000',
      outfitColor: '#00aa00',
    });
  });

  it('keeps the hash as the default and the other traits stable', () => {
    expect(appearanceFor('x', 'qa').explicit).toBeUndefined();
    const a = explicitAppearance('designer', info().appearance as never);
    expect(a.pants).toBe(appearanceFor('designer', 'analyst').pants);
    expect(explicitAppearance('designer', info().appearance as never)).toEqual(a);
  });

  it('has a key that changes with any explicit choice', () => {
    const base = info().appearance as never as Parameters<typeof explicitAppearance>[1];
    const k = appearanceKey(explicitAppearance('d', base));
    expect(appearanceKey(explicitAppearance('d', { ...base, hairColor: '#000000' }))).not.toBe(k);
    expect(appearanceKey(undefined)).toBe('');
  });
});

describe('managed binding', () => {
  const model = createEmptyModel();
  model.sessions.s1 = session('s1', { terminalId: 't1' });
  model.sessions.s2 = session('s2', { terminalId: 'other' });
  model.sessions.s3 = session('s3');

  it('links sessions to profiles by terminal id; the rest stay external', () => {
    const looks = managedLooks(model, [info()]);
    expect([...looks.keys()]).toEqual(['s1']);
    expect(looks.get('s1')).toMatchObject({ name: 'Designer', profession: 'analyst' });
    expect(looks.get('s1')?.look?.explicit?.hairColor).toBe('#aa0000');
    expect(isManagedSession(model, [info()], 's1')).toBe(true);
    expect(isManagedSession(model, [info()], 's2')).toBe(false);
    expect(isManagedSession(model, [info()], 's3')).toBe(false);
  });

  it('falls back to the hash look for inline agents', () => {
    const l = lookOf(info({ appearance: null, profession: 'qa' }));
    expect(l.look).toBeUndefined();
    expect(l.profession).toBe('qa');
  });

  it('puts the profile name in the tab title, even before the session is bound', () => {
    const tabs = activityByTerminal(model, [info(), info({ terminalId: 't9', name: 'Nova' })]);
    expect(tabs.t1).toBe('Designer · trabalhando');
    expect(tabs.t9).toBe('Nova');
    expect(tabs.other).toBeDefined();
  });

  it('marks a roster entry without a running session as absent', () => {
    const roster: ProjectRoster = {
      autoReopen: true,
      entries: [
        { kind: 'profile', profileId: 'designer', createdBy: null, connections: [], notes: '' },
        { kind: 'profile', profileId: 'reviewer', createdBy: null, connections: [], notes: '' },
      ],
    };
    const presence = rosterPresence('/p', roster, [info()]);
    expect(presence.get('designer')).toBe('active');
    expect(presence.get('reviewer')).toBe('absent');
    expect(rosterPresence('/other', roster, [info()]).get('designer')).toBe('absent');
  });
});
