import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setLocale } from '../src/i18n/i18n';
import { lostLabel, resumeOptions } from '../src/ui/lostSessions';

beforeEach(() => setLocale('pt-BR'));
afterEach(() => setLocale('en'));

const base = { id: 'term-1', cwd: '/w/alpha', startedAt: '2026-10-10T10:00:00Z' };

describe('resumeOptions', () => {
  it('resumes by id when the Claude session is known, keeping the permission mode', () => {
    expect(resumeOptions({ ...base, claudeSessionId: 'abc-123', permissionMode: 'plan' })).toEqual({
      cwd: '/w/alpha',
      permissionMode: 'plan',
      resume: 'abc-123',
    });
  });

  it('falls back to --continue when the id is unknown', () => {
    expect(resumeOptions(base)).toEqual({ cwd: '/w/alpha', continueLast: true });
  });
});

describe('lostLabel', () => {
  it('names the project and how it resumes', () => {
    expect(lostLabel(base)).toBe('alpha - retoma a última conversa da pasta');
    expect(lostLabel({ ...base, cwd: 'C:\\w\\beta', claudeSessionId: 'x' })).toBe(
      'beta - retoma a sessão anterior',
    );
  });
});

describe('lostLabel in other languages', () => {
  it('uses English and Spanish', () => {
    setLocale('en');
    expect(lostLabel(base)).toBe('alpha - resumes the last conversation in the folder');
    setLocale('es');
    expect(lostLabel({ ...base, claudeSessionId: 'x' })).toBe('alpha - reanuda la sesión anterior');
  });
});
