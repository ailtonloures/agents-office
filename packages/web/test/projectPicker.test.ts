import type { CatalogProject } from '@agents-office/shared';
import { describe, expect, it } from 'vitest';
import {
  buildStartOptions,
  canStart,
  claudeArgs,
  DEFAULT_PERMISSION_MODE,
  filterProjects,
  formatWhen,
  officeCwds,
  PERMISSION_MODES,
  permissionModeInfo,
  pickerBridgesOf,
  startErrorMessage,
} from '../src/ui/projectPicker';

const project = (cwd: string): CatalogProject => ({
  cwd,
  name: cwd.split('/').pop() ?? cwd,
  favorite: false,
  lastUsedAt: null,
  lastActivityAt: null,
  sources: ['history'],
});

describe('filterProjects', () => {
  const list = [
    project('/work/agents-office'),
    project('/work/billing-api'),
    project('/tmp/Notes'),
  ];

  it('returns everything for an empty query', () => {
    expect(filterProjects(list, '')).toHaveLength(3);
    expect(filterProjects(list, '   ')).toHaveLength(3);
  });

  it('matches name or path, case-insensitive, every word', () => {
    expect(filterProjects(list, 'OFFICE').map((p) => p.name)).toEqual(['agents-office']);
    expect(filterProjects(list, 'work api').map((p) => p.name)).toEqual(['billing-api']);
    expect(filterProjects(list, '/tmp').map((p) => p.name)).toEqual(['Notes']);
    expect(filterProjects(list, 'zzz')).toEqual([]);
  });

  it('keeps the catalog order', () => {
    expect(filterProjects(list, 'work').map((p) => p.name)).toEqual([
      'agents-office',
      'billing-api',
    ]);
  });
});

describe('launch options', () => {
  it('maps each choice to start options and claude arguments', () => {
    const fresh = buildStartOptions('/w', { kind: 'new' }, 'default');
    expect(fresh).toEqual({ cwd: '/w', permissionMode: 'default' });
    expect(claudeArgs(fresh)).toEqual(['--permission-mode', 'default']);

    const again = buildStartOptions('/w', { kind: 'continue' }, 'acceptEdits');
    expect(again).toEqual({ cwd: '/w', permissionMode: 'acceptEdits', continueLast: true });
    expect(claudeArgs(again)).toEqual(['--permission-mode', 'acceptEdits', '--continue']);

    const resume = buildStartOptions('/w', { kind: 'resume', sessionId: 'abc-1' }, 'plan');
    expect(resume).toEqual({ cwd: '/w', permissionMode: 'plan', resume: 'abc-1' });
    expect(claudeArgs(resume)).toEqual(['--permission-mode', 'plan', '--resume', 'abc-1']);
  });

  it('requires a session id to resume', () => {
    expect(canStart({ kind: 'resume', sessionId: '' })).toBe(false);
    expect(canStart({ kind: 'resume', sessionId: 'x' })).toBe(true);
    expect(canStart({ kind: 'new' })).toBe(true);
    expect(canStart({ kind: 'continue' })).toBe(true);
  });
});

describe('permission modes', () => {
  it('lists the six documented modes, default first and the only default choice', () => {
    expect(PERMISSION_MODES.map((m) => m.mode)).toEqual([
      'default',
      'acceptEdits',
      'plan',
      'dontAsk',
      'auto',
      'bypassPermissions',
    ]);
    expect(DEFAULT_PERMISSION_MODE).toBe('default');
  });

  it('labels which modes produce permission cards (spike 013)', () => {
    expect(permissionModeInfo('default').cards).toBe('yes');
    expect(permissionModeInfo('auto').cards).toBe('no');
    expect(permissionModeInfo('auto').note).toMatch(/Não gera cartões/);
    expect(permissionModeInfo('bypassPermissions').cards).toBe('no');
  });
});

describe('helpers', () => {
  it('formats relative times', () => {
    const now = new Date('2026-01-10T12:00:00Z');
    expect(formatWhen(null, now)).toBe('');
    expect(formatWhen('garbage', now)).toBe('');
    expect(formatWhen('2026-01-10T11:59:40Z', now)).toBe('agora');
    expect(formatWhen('2026-01-10T11:30:00Z', now)).toBe('há 30 min');
    expect(formatWhen('2026-01-10T09:00:00Z', now)).toBe('há 3 h');
    expect(formatWhen('2026-01-08T12:00:00Z', now)).toBe('há 2 d');
    expect(formatWhen('2025-06-01T00:00:00Z', now)).toBe('2025-06-01');
  });

  it('collects the cwds of the office rooms', () => {
    const projects = {
      a: { id: 'a', name: 'a', cwd: '/a', sessionIds: [], lastActivityTs: '' },
      b: { id: 'b', name: 'b', cwd: '', sessionIds: [], lastActivityTs: '' },
    };
    expect(officeCwds({ projects })).toEqual(['/a']);
  });

  it('explains start errors', () => {
    expect(
      startErrorMessage({ ok: false, code: 'claude-not-found', message: 'No claude.' }),
    ).toMatch(/claudePath/);
    expect(startErrorMessage({ ok: false, code: 'invalid-cwd', message: 'Bad dir.' })).toBe(
      'Bad dir.',
    );
  });

  it('finds both bridges only inside the desktop shell', () => {
    expect(pickerBridgesOf({})).toBeUndefined();
    expect(
      pickerBridgesOf({ agentsOfficeDesktop: { desktop: true, terminal: { start() {} } } }),
    ).toBeUndefined();
    const bridges = {
      desktop: true,
      terminal: { start() {} },
      projects: { list() {} },
    };
    expect(pickerBridgesOf({ agentsOfficeDesktop: bridges })).toBeDefined();
  });
});
