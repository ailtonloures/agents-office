import { describe, expect, it } from 'vitest';
import {
  createProfessionsConfig,
  DEFAULT_PROFESSIONS,
  parseProfessionsOverride,
  resolveProfession,
  SESSION_PROFESSION,
} from '../src/model';

describe('professions', () => {
  it.each([
    ['Explore', 'analyst'],
    ['Plan', 'architect'],
    ['general-purpose', 'developer'],
    ['claude-code-guide', 'support'],
    ['code-reviewer', 'qa'],
    ['hugos-core:judge', 'qa'],
    ['completion-gate', 'qa'],
    ['qa-runner', 'qa'],
    ['test-writer', 'qa'],
    ['docs-writer', 'support'],
    ['statusline-setup', 'developer'],
    ['something-unknown', 'developer'],
    ['', 'developer'],
  ])('%s -> %s', (agentType, profession) => {
    expect(resolveProfession(agentType, DEFAULT_PROFESSIONS)).toBe(profession);
  });

  it('the session is the tech-lead', () => {
    expect(SESSION_PROFESSION).toBe('tech-lead');
  });

  it('override: exact map beats defaults, override rules beat default rules', () => {
    const config = createProfessionsConfig({
      exact: { Explore: 'developer', 'my-agent': 'architect' },
      rules: [{ pattern: '^db-', profession: 'analyst' }],
      fallback: 'support',
    });
    expect(resolveProfession('Explore', config)).toBe('developer');
    expect(resolveProfession('my-agent', config)).toBe('architect');
    expect(resolveProfession('db-tuner', config)).toBe('analyst');
    expect(resolveProfession('Plan', config)).toBe('architect');
    expect(resolveProfession('reviewer', config)).toBe('qa');
    expect(resolveProfession('zzz', config)).toBe('support');
  });

  it('does not treat prototype keys as exact matches', () => {
    expect(resolveProfession('constructor', DEFAULT_PROFESSIONS)).toBe('developer');
  });

  it('parses and validates a professions.json', () => {
    const parsed = parseProfessionsOverride({
      exact: { Foo: 'qa' },
      rules: [{ pattern: 'x+', flags: 'i', profession: 'support' }],
    });
    expect(resolveProfession('Foo', createProfessionsConfig(parsed))).toBe('qa');
    expect(() => parseProfessionsOverride({ exact: { Foo: 'wizard' } })).toThrow(
      /invalid profession/,
    );
    expect(() => parseProfessionsOverride({ rules: [{ pattern: '(', profession: 'qa' }] })).toThrow(
      /regular expression/,
    );
    expect(() => parseProfessionsOverride([])).toThrow();
  });
});
