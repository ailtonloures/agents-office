import { describe, expect, it } from 'vitest';
import {
  AGENT_NOTES_MAX,
  AgentProfileSchema,
  AppearanceSchema,
  DEFAULT_TECH_LEAD_PROFILE,
  enforceProfileInvariants,
  HAIR_STYLE_MAX,
  isDefaultProfileId,
  isProfileNameTaken,
  PROFILE_INSTRUCTIONS_MAX,
  PROFILE_NAME_MAX,
  ProjectRosterSchema,
  RosterEntrySchema,
  rosterEntryId,
  TECH_LEAD_PROFILE_ID,
} from '../src';

const appearance = {
  base: 'developer',
  hairStyle: 2,
  hairColor: '#112233',
  skinColor: '#f1c9a5',
  outfitColor: '#00ff00',
};
const profile = { id: 'designer', name: 'Designer', appearance };

describe('AppearanceSchema', () => {
  it('accepts a valid appearance and defaults hairStyle', () => {
    expect(AppearanceSchema.parse(appearance)).toEqual(appearance);
    const { hairStyle: _h, ...rest } = appearance;
    expect(AppearanceSchema.parse(rest).hairStyle).toBe(0);
  });
  it('rejects bad base, colors and hair index', () => {
    expect(AppearanceSchema.safeParse({ ...appearance, base: 'wizard' }).success).toBe(false);
    expect(AppearanceSchema.safeParse({ ...appearance, hairColor: 'red' }).success).toBe(false);
    expect(AppearanceSchema.safeParse({ ...appearance, skinColor: '#fff' }).success).toBe(false);
    expect(AppearanceSchema.safeParse({ ...appearance, hairStyle: -1 }).success).toBe(false);
    expect(
      AppearanceSchema.safeParse({ ...appearance, hairStyle: HAIR_STYLE_MAX + 1 }).success,
    ).toBe(false);
    expect(AppearanceSchema.safeParse({ ...appearance, hairStyle: 1.5 }).success).toBe(false);
  });
});

describe('AgentProfileSchema', () => {
  it('applies defaults', () => {
    const p = AgentProfileSchema.parse(profile);
    expect(p).toMatchObject({
      description: '',
      instructions: '',
      permissionMode: 'default',
      role: 'padrao',
    });
    expect(p.model).toBeUndefined();
  });
  it('accepts full profile', () => {
    const p = AgentProfileSchema.parse({
      ...profile,
      description: 'd',
      instructions: '# md',
      permissionMode: 'plan',
      model: 'sonnet',
      role: 'orquestrador',
    });
    expect(p.role).toBe('orquestrador');
    expect(p.model).toBe('sonnet');
  });
  it('trims the name and enforces limits', () => {
    expect(AgentProfileSchema.parse({ ...profile, name: '  Rev  ' }).name).toBe('Rev');
    expect(AgentProfileSchema.safeParse({ ...profile, name: '   ' }).success).toBe(false);
    expect(
      AgentProfileSchema.safeParse({ ...profile, name: 'x'.repeat(PROFILE_NAME_MAX) }).success,
    ).toBe(true);
    expect(
      AgentProfileSchema.safeParse({ ...profile, name: 'x'.repeat(PROFILE_NAME_MAX + 1) }).success,
    ).toBe(false);
    expect(
      AgentProfileSchema.safeParse({
        ...profile,
        instructions: 'x'.repeat(PROFILE_INSTRUCTIONS_MAX),
      }).success,
    ).toBe(true);
    expect(
      AgentProfileSchema.safeParse({
        ...profile,
        instructions: 'x'.repeat(PROFILE_INSTRUCTIONS_MAX + 1),
      }).success,
    ).toBe(false);
  });
  it('rejects invalid id, permission mode, role and empty model', () => {
    expect(AgentProfileSchema.safeParse({ ...profile, id: '../x' }).success).toBe(false);
    expect(AgentProfileSchema.safeParse({ ...profile, id: '' }).success).toBe(false);
    expect(AgentProfileSchema.safeParse({ ...profile, permissionMode: 'yolo' }).success).toBe(
      false,
    );
    expect(AgentProfileSchema.safeParse({ ...profile, role: 'boss' }).success).toBe(false);
    expect(AgentProfileSchema.safeParse({ ...profile, model: ' ' }).success).toBe(false);
  });
});

describe('roster', () => {
  it('parses profile and inline entries with defaults', () => {
    const e = RosterEntrySchema.parse({ kind: 'profile', profileId: 'designer' });
    expect(e).toMatchObject({ createdBy: null, connections: [], notes: '' });
    const i = RosterEntrySchema.parse({
      kind: 'inline',
      id: 'helper-1',
      name: 'Helper',
      profession: 'qa',
      createdBy: 'orch',
    });
    expect(i).toMatchObject({ instructions: '', createdBy: 'orch' });
    expect(rosterEntryId(e)).toBe('designer');
    expect(rosterEntryId(i)).toBe('helper-1');
  });
  it('rejects unknown kind, bad notes size and bad profession', () => {
    expect(RosterEntrySchema.safeParse({ kind: 'x' }).success).toBe(false);
    expect(
      RosterEntrySchema.safeParse({
        kind: 'profile',
        profileId: 'a',
        notes: 'n'.repeat(AGENT_NOTES_MAX + 1),
      }).success,
    ).toBe(false);
    expect(
      RosterEntrySchema.safeParse({ kind: 'inline', id: 'a', name: 'A', profession: 'wizard' })
        .success,
    ).toBe(false);
  });
  it('defaults an empty roster with autoReopen on', () => {
    expect(ProjectRosterSchema.parse({})).toEqual({ entries: [], autoReopen: true });
    expect(ProjectRosterSchema.parse({ autoReopen: false }).autoReopen).toBe(false);
  });
  it('rejects rosters over the entry limit', () => {
    const entries = Array.from({ length: 51 }, (_, n) => ({ kind: 'profile', profileId: `p${n}` }));
    expect(ProjectRosterSchema.safeParse({ entries }).success).toBe(false);
  });
});

describe('names and default profile', () => {
  it('detects duplicate names case-insensitively', () => {
    expect(isProfileNameTaken(' designer ', ['Designer'])).toBe(true);
    expect(isProfileNameTaken('Revisor', ['Designer'])).toBe(false);
  });
  it('built-in Tech Lead is a valid profile and frozen', () => {
    expect(AgentProfileSchema.safeParse(DEFAULT_TECH_LEAD_PROFILE).success).toBe(true);
    expect(DEFAULT_TECH_LEAD_PROFILE.id).toBe(TECH_LEAD_PROFILE_ID);
    expect(DEFAULT_TECH_LEAD_PROFILE.role).toBe('padrao');
    expect(Object.isFrozen(DEFAULT_TECH_LEAD_PROFILE)).toBe(true);
    expect(isDefaultProfileId('tech-lead')).toBe(true);
    expect(isDefaultProfileId('designer')).toBe(false);
  });
  it('enforceProfileInvariants pins id/role of the Tech Lead only', () => {
    const edited = { ...DEFAULT_TECH_LEAD_PROFILE, name: 'Chefe', role: 'orquestrador' as const };
    expect(enforceProfileInvariants(edited)).toMatchObject({
      id: 'tech-lead',
      role: 'padrao',
      name: 'Chefe',
    });
    const other = AgentProfileSchema.parse({ ...profile, role: 'orquestrador' });
    expect(enforceProfileInvariants(other).role).toBe('orquestrador');
  });
});
