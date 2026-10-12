import type { BrowserApprovalRequest } from '@agents-office/shared';
import { describe, expect, it } from 'vitest';
import { dequeue } from '../src/ui/browserApprovalLogic';
import { browserApprovalBridgeOf } from '../src/ui/spawnApprovalLogic';

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
