import { describe, expect, it } from 'vitest';
import {
  type PermissionDecision,
  PermissionRequestSchema,
  parseClientMessage,
  parseServerMessage,
  permissionHookOutput,
} from '../src';

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
    for (const by of ['ui', 'released', 'terminal', 'hook-gone']) {
      expect(parseServerMessage({ kind: 'permission.resolved', id: 'p1', by }).success).toBe(true);
    }
    expect(parseServerMessage({ kind: 'permission.resolved', id: 'p1', by: 'x' }).success).toBe(
      false,
    );
    expect(parseServerMessage({ kind: 'permission.snapshot', pending: [request] }).success).toBe(
      true,
    );
  });

  it('parses permission.decide for allow, deny and defer only', () => {
    for (const decision of [
      { behavior: 'allow' },
      { behavior: 'deny', message: 'no' },
      { behavior: 'deny' },
      { behavior: 'defer' },
    ]) {
      expect(parseClientMessage({ kind: 'permission.decide', id: 'p1', decision }).success).toBe(
        true,
      );
    }
    expect(
      parseClientMessage({ kind: 'permission.decide', id: 'p1', decision: { behavior: 'ask' } })
        .success,
    ).toBe(false);
    expect(parseClientMessage({ kind: 'nope' }).success).toBe(false);
  });

  it('builds the hook output and none for defer', () => {
    expect(permissionHookOutput({ behavior: 'allow' })).toEqual({
      hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } },
    });
    expect(permissionHookOutput({ behavior: 'deny', message: 'nope' })).toEqual({
      hookSpecificOutput: {
        hookEventName: 'PermissionRequest',
        decision: { behavior: 'deny', message: 'nope' },
      },
    });
    const deny: PermissionDecision = { behavior: 'deny' };
    expect(permissionHookOutput(deny)?.hookSpecificOutput.decision).toEqual({ behavior: 'deny' });
    expect(permissionHookOutput({ behavior: 'defer' })).toBeNull();
  });
});
