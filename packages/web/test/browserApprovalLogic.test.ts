import type { BrowserApprovalRequest } from '@agents-office/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setLocale } from '../src/i18n/i18n';
import { approvalHeading, approvalTitle, dequeue } from '../src/ui/browserApprovalLogic';
import { browserApprovalBridgeOf } from '../src/ui/spawnApprovalLogic';

beforeEach(() => setLocale('pt-BR'));
afterEach(() => setLocale('en'));

const req = (id: string): BrowserApprovalRequest => ({
  id,
  cwd: '/p',
  kind: 'download',
  title: 't',
  detail: 'd',
  createdAt: '2026-01-01T00:00:00Z',
});

describe('browser approval card logic', () => {
  it('removes answered requests and keeps the others in order', () => {
    expect(dequeue([req('a'), req('b'), req('c')], 'b').map((r) => r.id)).toEqual(['a', 'c']);
  });

  it('finds the bridge only when complete', () => {
    const bridge = {
      pending: async () => [],
      respond: async () => true,
      onRequest: () => () => {},
      onResolved: () => () => {},
    };
    expect(browserApprovalBridgeOf({ agentsOfficeDesktop: { browserApproval: bridge } })).toBe(
      bridge,
    );
    expect(browserApprovalBridgeOf({ agentsOfficeDesktop: { browserApproval: {} } })).toBe(
      undefined,
    );
    expect(browserApprovalBridgeOf({})).toBe(undefined);
  });
});

describe('approval card text', () => {
  const base = { id: 'x', cwd: '/p', detail: 'd', createdAt: '2026-01-01T00:00:00Z' };

  it('builds the question from the request data in the active language', () => {
    const download: BrowserApprovalRequest = {
      ...base,
      kind: 'download',
      title: 'Baixar "a.zip"?',
      filename: 'a.zip',
    };
    const permission: BrowserApprovalRequest = {
      ...base,
      kind: 'permission',
      title: 't',
      detail: 'geolocation',
      origin: 'https://a.test',
    };
    const evalReq: BrowserApprovalRequest = {
      ...base,
      kind: 'eval',
      title: 't',
      agentName: 'Ana',
    };
    expect(approvalTitle(download)).toBe('Baixar "a.zip"?');
    expect(approvalTitle(permission)).toBe('https://a.test quer saber a sua localização');
    expect(approvalTitle(evalReq)).toBe('Ana quer executar JavaScript na página');
    setLocale('en');
    expect(approvalTitle(download)).toBe('Download "a.zip"?');
    expect(approvalTitle(permission)).toBe('https://a.test wants to know your location');
    expect(approvalTitle({ ...permission, detail: 'weird' })).toBe(
      'https://a.test wants to use the feature "weird"',
    );
    expect(approvalTitle(evalReq)).toBe('Ana wants to run JavaScript on the page');
    expect(approvalHeading(evalReq, 3)).toBe(
      'Ana wants to run JavaScript on the page (+2 in queue)',
    );
  });

  it('falls back to the title sent by the shell when data is missing', () => {
    expect(approvalTitle({ ...base, kind: 'download', title: 'Baixar x?' })).toBe('Baixar x?');
  });
});
