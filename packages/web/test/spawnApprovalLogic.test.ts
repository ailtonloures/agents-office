import type { SpawnApprovalRequest } from '@agents-office/shared';
import { describe, expect, it } from 'vitest';
import {
  buildResponse,
  dequeue,
  enqueue,
  instructionsValid,
  spawnApprovalBridgeOf,
} from '../src/ui/spawnApprovalLogic';

const req = (id: string): SpawnApprovalRequest => ({
  id,
  cwd: '/p',
  orchestratorId: 'boss',
  orchestratorName: 'Boss',
  name: 'A',
  profession: 'developer',
  instructions: 'Do it.',
  createdAt: '2026-10-11T00:00:00.000Z',
});

describe('spawn approval logic', () => {
  it('queues without duplicates and removes by id', () => {
    const q = enqueue(enqueue([], req('1')), req('2'));
    expect(enqueue(q, req('1')).map((r) => r.id)).toEqual(['1', '2']);
    expect(dequeue(q, '1').map((r) => r.id)).toEqual(['2']);
  });

  it('validates the edited instructions', () => {
    expect(instructionsValid('  ')).toBe(false);
    expect(instructionsValid('ok')).toBe(true);
    expect(instructionsValid('x'.repeat(20_001))).toBe(false);
  });

  it('builds responses for approve, edit, always and deny', () => {
    const r = req('1');
    const base = { instructions: 'Do it.', allowAlways: false };
    expect(buildResponse(r, { ...base, approved: true })).toEqual({ id: '1', approved: true });
    expect(buildResponse(r, { ...base, approved: true, instructions: ' Do more. ' })).toEqual({
      id: '1',
      approved: true,
      instructions: 'Do more.',
    });
    expect(buildResponse(r, { ...base, approved: true, allowAlways: true })).toEqual({
      id: '1',
      approved: true,
      allowAlways: true,
    });
    expect(
      buildResponse(r, { instructions: 'changed', allowAlways: true, approved: false }),
    ).toEqual({ id: '1', approved: false });
  });

  it('finds the bridge only when complete', () => {
    expect(spawnApprovalBridgeOf({})).toBeUndefined();
    const ok = {
      pending: () => {},
      respond: () => {},
      onRequest: () => {},
      onResolved: () => {},
    };
    expect(spawnApprovalBridgeOf({ agentsOfficeDesktop: { spawnApproval: ok } })).toBe(ok);
    expect(
      spawnApprovalBridgeOf({ agentsOfficeDesktop: { spawnApproval: { pending: () => {} } } }),
    ).toBeUndefined();
  });
});
