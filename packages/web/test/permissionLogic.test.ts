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
  cardContent,
  decisionFor,
  editReason,
  pendingActorIds,
  queueView,
  REASON_MAX,
  requesterName,
  shortcutFor,
  sortQueue,
  toolLabel,
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

describe('text', () => {
  it('labels tools in Portuguese and falls back to the name', () => {
    expect(toolLabel('Bash')).toBe('Rodar comando');
    expect(toolLabel('Edit')).toBe('Editar arquivo');
    expect(toolLabel('mcp__git__push')).toBe('Ferramenta MCP git / push');
    expect(toolLabel('Weird')).toBe('Usar Weird');
  });

  it('names the Tech Lead and subagents', () => {
    const model = officeModel();
    expect(requesterName(model, req('a'))).toBe('Tech Lead');
    expect(requesterName(model, req('b', { actorId: 'a1', agentType: 'code-reviewer' }))).toBe(
      'Code Reviewer',
    );
    expect(
      requesterName(createEmptyModel(), req('c', { actorId: 'zz', agentType: 'explore' })),
    ).toBe('Explorer');
  });

  it('builds the card lines with project, tool, summary and queue', () => {
    const model = officeModel();
    const content = cardContent(model, req('a', { inputSummary: 'x '.repeat(100) }), 2);
    expect(content.who).toBe('Tech Lead · demo-app');
    expect(content.tool).toBe('Rodar comando (Bash)');
    expect(content.summary).toHaveLength(3);
    expect(content.summary.every((line) => line.length <= 42)).toBe(true);
    expect(content.summary[2]?.endsWith('…')).toBe(true);
    expect(content.queue).toBe('+2 na fila');
    expect(cardContent(model, req('a'), 0).queue).toBe('');
  });
});

describe('input', () => {
  it('maps Y / N / T (any case)', () => {
    expect(shortcutFor('y')).toBe('allow');
    expect(shortcutFor('N')).toBe('deny');
    expect(shortcutFor('t')).toBe('defer');
    expect(shortcutFor('z')).toBeUndefined();
  });

  it('builds decisions; a blank reason is a plain deny', () => {
    expect(decisionFor('allow')).toEqual({ behavior: 'allow' });
    expect(decisionFor('defer')).toEqual({ behavior: 'defer' });
    expect(decisionFor('deny', '   ')).toEqual({ behavior: 'deny' });
    expect(decisionFor('deny', 'use  pnpm')).toEqual({ behavior: 'deny', message: 'use pnpm' });
  });

  it('edits the reason: characters, backspace, limits, modifiers', () => {
    let text = '';
    for (const key of ['n', 'a', 'o']) text = editReason(text, { key });
    expect(text).toBe('nao');
    expect(editReason(text, { key: 'Backspace' })).toBe('na');
    expect(editReason(text, { key: 'Shift' })).toBe('nao');
    expect(editReason(text, { key: 'c', ctrlKey: true })).toBe('nao');
    expect(editReason('x'.repeat(REASON_MAX), { key: 'y' })).toHaveLength(REASON_MAX);
    expect(editReason('', { key: ' ' })).toBe('');
  });
});

describe('HUD', () => {
  it('counts pending requests without doubling actors that already wait', () => {
    const model = officeModel();
    expect(hudCounts(model).waiting).toBe(0);
    expect(hudText(hudCounts(model, [req('a')]))).toBe('1 sessão · 1 agente · ! 1');
    expect(hudCounts(model, [req('a'), req('b'), req('c', { actorId: 'a1' })]).waiting).toBe(3);
    const waiting: OfficeModel = {
      ...model,
      sessions: { s1: { ...(model.sessions.s1 as Session), status: 'waiting' } },
    };
    expect(hudCounts(waiting).waiting).toBe(1);
    expect(hudCounts(waiting, [req('a')]).waiting).toBe(1);
  });
});
