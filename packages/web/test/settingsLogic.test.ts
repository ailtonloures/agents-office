import type { HooksStatus } from '@agents-office/shared';
import { describe, expect, it } from 'vitest';
import {
  classifyDiffLine,
  hooksBridgeOf,
  hooksSeenLabel,
  primaryAction,
  shouldPromptInstall,
  summaryLabel,
} from '../src/ui/settingsLogic';

const status = (over: Partial<HooksStatus> = {}): HooksStatus => ({
  path: '/h/.claude/settings.json',
  events: [],
  installedCount: 0,
  total: 10,
  hooksSeenAt: null,
  daemonReachable: true,
  ...over,
});

describe('settings logic', () => {
  it('hides the screen outside the desktop shell', () => {
    expect(hooksBridgeOf({})).toBeUndefined();
    expect(hooksBridgeOf({ agentsOfficeDesktop: { desktop: true } })).toBeUndefined();
    const hooks = { status: async () => status() };
    expect(hooksBridgeOf({ agentsOfficeDesktop: { desktop: true, hooks } })).toBe(hooks);
  });
  it('prompts only when nothing is installed and it was not dismissed', () => {
    expect(shouldPromptInstall(status(), false)).toBe(true);
    expect(shouldPromptInstall(status(), true)).toBe(false);
    expect(shouldPromptInstall(status({ installedCount: 3 }), false)).toBe(false);
  });
  it('labels the summary and the primary action', () => {
    expect(summaryLabel(status())).toBe('Nenhum hook instalado');
    expect(summaryLabel(status({ installedCount: 4 }))).toBe('4 de 10 hooks instalados');
    expect(summaryLabel(status({ installedCount: 10 }))).toBe('Todos os 10 hooks instalados');
    expect(primaryAction(status({ installedCount: 4 }))).toBe('install');
    expect(primaryAction(status({ installedCount: 10 }))).toBe('uninstall');
  });
  it('describes hooksSeenAt', () => {
    const now = new Date('2026-10-10T12:00:00Z');
    expect(hooksSeenLabel(status({ daemonReachable: false }), now)).toBe('Daemon inacessível');
    expect(hooksSeenLabel(status(), now)).toBe('Nenhum hook recebido ainda');
    expect(hooksSeenLabel(status({ hooksSeenAt: '2026-10-10T11:59:30Z' }), now)).toBe(
      'Último hook recebido há 30 s',
    );
    expect(hooksSeenLabel(status({ hooksSeenAt: '2026-10-10T11:50:00Z' }), now)).toBe(
      'Último hook recebido há 10 min',
    );
  });
  it('classifies diff lines', () => {
    expect(classifyDiffLine('+ a').kind).toBe('add');
    expect(classifyDiffLine('- a').kind).toBe('del');
    expect(classifyDiffLine('  a').kind).toBe('ctx');
  });
});
