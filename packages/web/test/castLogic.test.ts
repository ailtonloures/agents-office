import {
  type AgentProfile,
  DEFAULT_TECH_LEAD_PROFILE,
  type ManagedChange,
  type ManagedSessionInfo,
  type ProjectRoster,
} from '@agents-office/shared';
import { describe, expect, it } from 'vitest';
import {
  auditLine,
  auditNewestFirst,
  availableProfiles,
  buildCastRows,
  canDeleteProfile,
  castBridgesOf,
  deleteProfileWarning,
  emptyForm,
  formFromProfile,
  formToDraft,
  hasErrors,
  linkOptions,
  linksLabel,
  otherProfileNames,
  randomAppearance,
  startFailureMessage,
  taskHints,
  validateForm,
} from '../src/ui/castLogic';

const designer: AgentProfile = {
  ...DEFAULT_TECH_LEAD_PROFILE,
  id: 'designer',
  name: 'Designer',
  description: 'UI',
  model: 'opus',
};
const profiles = [DEFAULT_TECH_LEAD_PROFILE, designer];

const roster = (...ids: string[]): ProjectRoster => ({
  autoReopen: true,
  entries: ids.map((profileId) => ({
    kind: 'profile' as const,
    profileId,
    createdBy: null,
    connections: [],
    notes: `notes ${profileId}`,
    reopen: true,
  })),
});

const session = (entryId: string, cwd = '/p'): ManagedSessionInfo => ({
  terminalId: `t-${entryId}`,
  cwd,
  entryId,
  name: entryId,
  appearance: null,
  profession: null,
  startedAt: '2026-01-01T00:00:00Z',
});

const none: ManagedChange = { sessions: [], failures: [] };

describe('randomAppearance', () => {
  it('is deterministic for a given random source and stays in range', () => {
    const seq = (values: number[]) => {
      let i = 0;
      return () => values[i++ % values.length] as number;
    };
    expect(randomAppearance(seq([0]))).toEqual(randomAppearance(seq([0])));
    const high = randomAppearance(() => 0.999999);
    expect(high.hairStyle).toBe(6);
    expect(high.hairColor).toMatch(/^#[0-9a-f]{6}$/);
    expect(high.base).toBe('support');
  });
});

describe('profile form', () => {
  it('rejects empty, long and duplicate names', () => {
    const form = emptyForm(() => 0);
    expect(validateForm(form, []).name).toMatch(/nome/i);
    form.name = 'x'.repeat(41);
    expect(validateForm(form, []).name).toMatch(/40/);
    form.name = '  designer ';
    expect(validateForm(form, ['Designer']).name).toMatch(/Já existe/);
    expect(hasErrors(validateForm(form, ['Other']))).toBe(false);
  });

  it('limits description, instructions and model', () => {
    const form = { ...emptyForm(() => 0), name: 'ok' };
    form.description = 'd'.repeat(201);
    form.instructions = 'i'.repeat(20_001);
    form.model = 'm'.repeat(101);
    const errors = validateForm(form, []);
    expect(Object.keys(errors).sort()).toEqual(['description', 'instructions', 'model']);
  });

  it('builds a draft without an empty model and trims text', () => {
    const form = { ...emptyForm(() => 0), name: '  Ana ', description: ' d ', model: '  ' };
    const draft = formToDraft(form);
    expect(draft.name).toBe('Ana');
    expect(draft.description).toBe('d');
    expect('model' in draft).toBe(false);
    expect(formToDraft({ ...form, model: ' opus ' }).model).toBe('opus');
  });

  it('round-trips a profile through the form and excludes itself from the names', () => {
    const form = formFromProfile(designer);
    expect(form.model).toBe('opus');
    expect(formToDraft(form)).toMatchObject({ name: 'Designer', model: 'opus', role: 'padrao' });
    expect(otherProfileNames(profiles, 'designer')).toEqual(['Tech Lead']);
    expect(otherProfileNames(profiles, undefined)).toEqual(['Tech Lead', 'Designer']);
  });
});

describe('cast rows', () => {
  it('joins roster, library and managed sessions of the project', () => {
    const change: ManagedChange = {
      sessions: [session('designer'), session('tech-lead', '/o')],
      failures: [],
    };
    const rows = buildCastRows('/p', roster('tech-lead', 'designer'), profiles, change);
    expect(rows.map((r) => [r.entryId, r.state])).toEqual([
      ['tech-lead', 'stopped'],
      ['designer', 'running'],
    ]);
    expect(rows[1]?.terminalId).toBe('t-designer');
    expect(rows[1]?.notes).toBe('notes designer');
  });

  it('marks failures and missing profiles with clear messages', () => {
    const change: ManagedChange = {
      sessions: [],
      failures: [
        {
          cwd: '/p',
          entryId: 'designer',
          name: 'Designer',
          code: 'claude-not-found',
          message: 'nope',
        },
      ],
    };
    const rows = buildCastRows('/p', roster('designer', 'ghost'), profiles, change);
    expect(rows[0]?.state).toBe('failed');
    expect(rows[0]?.message).toMatch(/Claude Code não encontrado/);
    expect(rows[1]?.state).toBe('missing');
    expect(rows[1]?.message).toMatch(/não existe mais/);
  });

  it('renders inline agents', () => {
    const inline: ProjectRoster = {
      autoReopen: true,
      entries: [
        {
          kind: 'inline',
          id: 'a1',
          name: 'Bot',
          profession: 'qa',
          instructions: '',
          createdBy: null,
          connections: [],
          notes: '',
          reopen: true,
        },
      ],
    };
    const [row] = buildCastRows('/p', inline, profiles, none);
    expect(row).toMatchObject({ name: 'Bot', subtitle: 'qa', state: 'stopped', kind: 'inline' });
  });

  it('lists the profiles not yet in the roster', () => {
    expect(availableProfiles(roster('designer'), profiles).map((p) => p.id)).toEqual(['tech-lead']);
  });
});

describe('messages', () => {
  it('explains a missing claude and an invalid folder', () => {
    expect(startFailureMessage({ code: 'claude-not-found', message: 'x' })).toContain('claudePath');
    expect(startFailureMessage({ code: 'invalid-cwd', message: 'x', cwd: '/gone' })).toContain(
      '/gone',
    );
    expect(startFailureMessage({ code: 'spawn-failed', message: 'boom' })).toBe('boom');
  });

  it('warns about the projects that use a profile', () => {
    expect(deleteProfileWarning('Ana', [])).toBe('Apagar o perfil "Ana"?');
    const text = deleteProfileWarning('Ana', ['/a', '/b']);
    expect(text).toContain('2 projeto(s)');
    expect(text).toContain('- /b');
  });

  it('never offers to delete the Tech Lead', () => {
    expect(canDeleteProfile(DEFAULT_TECH_LEAD_PROFILE)).toBe(false);
    expect(canDeleteProfile(designer)).toBe(true);
  });
});

describe('castBridgesOf', () => {
  it('needs both bridges', () => {
    expect(castBridgesOf({})).toBeUndefined();
    const profilesBridge = { list: () => {} };
    const managed = { start: () => {} };
    expect(castBridgesOf({ agentsOfficeDesktop: { profiles: profilesBridge } })).toBeUndefined();
    expect(
      castBridgesOf({ agentsOfficeDesktop: { profiles: profilesBridge, managed } }),
    ).toBeDefined();
  });
});

describe('"pode falar com" checklist', () => {
  it('lists the other agents and reflects connections symmetrically', () => {
    const r = roster('tech-lead', 'designer');
    const first = r.entries[0];
    if (first) first.connections = ['designer'];
    const rows = buildCastRows('/p', r, profiles, { sessions: [], failures: [] });
    const fromDesigner = linkOptions(r, rows, 'designer');
    expect(fromDesigner).toEqual([{ entryId: 'tech-lead', name: 'Tech Lead', connected: true }]);
    expect(linksLabel(fromDesigner)).toBe('Pode falar com (1)');
    expect(linkOptions(roster('designer'), rows.slice(1), 'designer')).toEqual([]);
  });
});

describe('agents created by orchestrators', () => {
  const created: ProjectRoster = {
    autoReopen: true,
    entries: [
      {
        kind: 'profile',
        profileId: 'designer',
        createdBy: null,
        connections: [],
        notes: '',
        reopen: true,
      },
      {
        kind: 'inline',
        id: 'agent-1',
        name: 'Bot',
        profession: 'qa',
        instructions: '',
        task: 'Do the thing',
        createdBy: 'designer',
        connections: [],
        notes: '',
        reopen: true,
      },
    ],
  };

  it('shows who created each agent and its original task', () => {
    const rows = buildCastRows('/p', created, profiles, { sessions: [], failures: [] });
    expect(rows[0]).toMatchObject({ createdBy: undefined, task: undefined });
    expect(rows[1]).toMatchObject({ createdBy: 'Designer', task: 'Do the thing' });
  });

  it('formats the audit log and the tab hints', () => {
    const base = {
      cwd: '/p',
      orchestratorId: 'designer',
      orchestratorName: 'Designer',
      agentId: 'agent-1',
      agentName: 'Bot',
      at: 'not-a-date',
    } as const;
    expect(auditLine({ ...base, type: 'criado' })).toBe('not-a-date · Designer criou Bot');
    expect(auditLine({ ...base, type: 'encerrado' })).toContain('Designer encerrou Bot');
    expect(auditLine({ ...base, type: 'encerrado', by: 'usuario' })).toContain('removido por você');
    expect(
      auditNewestFirst([
        { ...base, type: 'criado' },
        { ...base, type: 'encerrado' },
      ]).map((e) => e.type),
    ).toEqual(['encerrado', 'criado']);
    expect(
      taskHints([{ terminalId: 't1', task: 'Do it' } as never, { terminalId: 't2' } as never]),
    ).toEqual({ t1: 'Tarefa original: Do it' });
  });
});
