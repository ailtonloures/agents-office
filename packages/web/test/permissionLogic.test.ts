import {
  createEmptyModel,
  type OfficeModel,
  type PermissionRequest,
  reduce,
  type Session,
} from '@agents-office/shared';
import { describe, expect, it } from 'vitest';
import { hudCounts, hudText } from '../src/ui/hudLogic';
import {
  applyRequested,
  applyResolved,
  applySnapshot,
  pendingActorIds,
  queueView,
  sortQueue,
} from '../src/ui/permissionLogic';

const req = (id: string, patch: Partial<PermissionRequest> = {}): PermissionRequest => ({
  id,
  sessionId: 's1',
  actorId: 's1',
  tool: 'Bash',
  inputSummary: 'npm test',
  projectId: 'p1',
  ts: '2026-10-10T12:00:00.000Z',
  ...patch,
});

function officeModel(): OfficeModel {
  const base = { source: 'jsonl' as const, sessionId: 's1' };
  let model = reduce(createEmptyModel(), {
    ...base,
    type: 'session.started',
    ts: '2026-10-10T12:00:00.000Z',
    projectId: 'p1',
    cwd: '/work/demo-app',
  });
  model = reduce(model, {
    ...base,
    type: 'agent.spawned',
    spawnDepth: 1,
    ts: '2026-10-10T12:00:01.000Z',
    agentId: 'a1',
    agentType: 'code-reviewer',
    description: 'review',
  });
  return model;
}

describe('queue', () => {
  it('sorts oldest first with the id as tie-break', () => {
    const list = sortQueue([req('c', { ts: '2026-10-10T12:00:05.000Z' }), req('b'), req('a')]);
    expect(list.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('snapshot replaces (deduped), requested appends once, resolved removes', () => {
    const snap = applySnapshot([req('a'), req('a'), req('b', { ts: '2026-10-10T12:00:01.000Z' })]);
    expect(snap.map((r) => r.id)).toEqual(['a', 'b']);
    const withC = applyRequested(snap, req('c', { ts: '2026-10-10T12:00:02.000Z' }));
    expect(applyRequested(withC, req('c')).map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(applyResolved(withC, 'a').map((r) => r.id)).toEqual(['b', 'c']);
    expect(applyResolved(withC, 'x')).toHaveLength(3);
  });

  it('shows the oldest and counts the rest', () => {
    expect(queueView([])).toEqual({ current: undefined, more: 0 });
    const view = queueView([req('a'), req('b'), req('c')]);
    expect(view.current?.id).toBe('a');
    expect(view.more).toBe(2);
  });

  it('maps requests to the asking characters', () => {
    const ids = pendingActorIds([req('a'), req('b', { actorId: 'a1', agentType: 'x' })]);
    expect([...ids].sort()).toEqual(['a1', 's1']);
  });
});

describe('HUD', () => {
  it('counts pending requests without doubling actors that already wait', () => {
    const model = officeModel();
    expect(hudCounts(model).waiting).toBe(0);
    expect(hudText(hudCounts(model, [req('a')]))).toBe('1 session · 1 agent · ! 1');
    expect(hudCounts(model, [req('a'), req('b'), req('c', { actorId: 'a1' })]).waiting).toBe(3);
    const waiting: OfficeModel = {
      ...model,
      sessions: { s1: { ...(model.sessions.s1 as Session), status: 'waiting' } },
    };
    expect(hudCounts(waiting).waiting).toBe(1);
    expect(hudCounts(waiting, [req('a')]).waiting).toBe(1);
  });
});
