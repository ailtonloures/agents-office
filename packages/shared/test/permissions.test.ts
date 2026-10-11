import { describe, expect, it } from 'vitest';
import * as shared from '../src';
import { PermissionRequestSchema, parseServerMessage } from '../src';

const request = {
  id: 'p1',
  sessionId: 's1',
  actorId: 'a35a2e5df361b1221',
  agentType: 'general-purpose',
  tool: 'Bash',
  inputSummary: 'echo sub > f5.txt',
  projectId: '-tmp-spike-proj',
  ts: '2026-10-10T12:00:00.000Z',
};

describe('permission contracts', () => {
  it('accepts a request and keeps unknown fields', () => {
    const parsed = PermissionRequestSchema.safeParse({ ...request, extra: 1 });
    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({ extra: 1 });
    expect(PermissionRequestSchema.safeParse({ ...request, actorId: '' }).success).toBe(false);
  });

  it('parses the permission server messages', () => {
    expect(parseServerMessage({ kind: 'permission.requested', request }).success).toBe(true);
    expect(parseServerMessage({ kind: 'permission.resolved', id: 'p1' }).success).toBe(true);
    expect(parseServerMessage({ kind: 'permission.resolved', id: '' }).success).toBe(false);
    expect(parseServerMessage({ kind: 'permission.snapshot', pending: [request] }).success).toBe(
      true,
    );
  });

  it('no longer exposes decisions, client messages or hook output', () => {
    for (const name of [
      'PermissionDecisionSchema',
      'PermissionDecideMessageSchema',
      'ClientMessageSchema',
      'parseClientMessage',
      'permissionHookOutput',
      'PermissionResolvedBySchema',
    ]) {
      expect(name in shared).toBe(false);
    }
    expect(parseServerMessage({ kind: 'permission.decide', id: 'p1' }).success).toBe(false);
  });
});
