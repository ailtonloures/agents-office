import type { Agent, OfficeModel, PermissionRequest, Session } from '@agents-office/shared';
import { createEmptyModel } from '@agents-office/shared';
import { describe, expect, it } from 'vitest';
import {
  approachTile,
  freeTileNear,
  hintPanelX,
  hudCounts,
  hudText,
  mostRecentRoom,
  nextWaiting,
  promptFor,
  roomFront,
  TIP_MS,
  TIPS,
  tipAt,
  waitingActors,
} from '../src/ui/hudLogic';
import { layoutBuilding } from '../src/world/roomLayout';

const usage = { inputTokens: 0, outputTokens: 0 };

function session(id: string, projectId: string, patch: Partial<Session> = {}): Session {
  return {
    id,
    projectId,
    profession: 'tech-lead',
    status: 'working',
    recentSteps: [],
    usage,
    agentIds: [],
    ...patch,
  };
}

function agent(id: string, sessionId: string, patch: Partial<Agent> = {}): Agent {
  return {
    id,
    sessionId,
    agentType: 'Explore',
    description: '',
    spawnDepth: 1,
    profession: 'analyst',
    status: 'working',
    recentSteps: [],
    usage,
    startedTs: '2026-01-01T00:00:00.000Z',
    ...patch,
  };
}

function build(): OfficeModel {
  const model = createEmptyModel();
  model.projects.p1 = {
    id: 'p1',
    name: 'one',
    cwd: '/1',
    sessionIds: ['s1'],
    lastActivityTs: '2026-01-01T00:01:00.000Z',
  };
  model.projects.p2 = {
    id: 'p2',
    name: 'two',
    cwd: '/2',
    sessionIds: ['s2'],
    lastActivityTs: '2026-01-01T00:02:00.000Z',
  };
  model.sessions.s1 = session('s1', 'p1', {
    agentIds: ['a1'],
    lastActivityTs: '2026-01-01T00:01:00.000Z',
  });
  model.sessions.s2 = session('s2', 'p2', {
    status: 'waiting',
    lastActivityTs: '2026-01-01T00:02:00.000Z',
  });
  model.agents.a1 = agent('a1', 's1', {
    status: 'waiting',
    lastActivityTs: '2026-01-01T00:03:00.000Z',
  });
  return model;
}

describe('hud counts', () => {
  it('counts sessions and agents like /health and the waiting actors', () => {
    expect(hudCounts(build())).toEqual({ sessions: 2, agents: 1, waiting: 2 });
    expect(hudCounts(createEmptyModel())).toEqual({ sessions: 0, agents: 0, waiting: 0 });
  });

  it('does not count finished agents or ended sessions', () => {
    const model = build();
    model.agents.a2 = agent('a2', 's1', { status: 'finished' });
    model.sessions.s3 = session('s3', 'p1', { status: 'ended' });
    expect(hudCounts(model)).toEqual({ sessions: 2, agents: 1, waiting: 2 });
  });

  it('ignores placeholder sessions and the agents hanging from them', () => {
    const model = build();
    model.projects.ghost = {
      id: 'ghost',
      name: 'ghost',
      cwd: '',
      sessionIds: ['s3'],
      lastActivityTs: '2026-01-01T00:00:00.000Z',
    };
    model.sessions.s3 = session('s3', 'ghost', { agentIds: ['a3'] });
    model.agents.a3 = agent('a3', 's3');
    model.sessions.s4 = session('s4', 'missing-project');
    model.agents.a4 = agent('a4', 's4');
    expect(hudCounts(model)).toEqual({ sessions: 2, agents: 1, waiting: 2 });
  });

  it('does not count a waiting-then-finished agent as waiting', () => {
    const model = build();
    model.agents.a1 = agent('a1', 's1', { status: 'finished' });
    expect(hudCounts(model)).toEqual({ sessions: 2, agents: 0, waiting: 1 });
  });

  it('still adds a pending permission once', () => {
    const model = build();
    const request = { actorId: 'a1' } as PermissionRequest;
    expect(hudCounts(model, [request])).toEqual({ sessions: 2, agents: 1, waiting: 2 });
    model.agents.a1 = agent('a1', 's1', { status: 'finished' });
    expect(hudCounts(model, [request]).agents).toBe(0);
  });

  it('formats the bar text (singular and plural)', () => {
    expect(hudText({ sessions: 2, agents: 3, waiting: 1 })).toBe('2 sessões · 3 agentes · ! 1');
    expect(hudText({ sessions: 1, agents: 1, waiting: 0 })).toBe('1 sessão · 1 agente · ! 0');
  });
});

describe('promptFor', () => {
  it('offers the action at hand first', () => {
    expect(promptFor({ kind: 'character', name: 'Explorer 2' }).hints).toEqual([
      { keys: ['Z'], label: 'Conversar com Explorer 2' },
    ]);
    expect(promptFor({ kind: 'board' }).hints[0]?.label).toBe('Ver o Hall da Fama');
    expect(promptFor({ kind: 'door', name: 'api' }).hints[0]?.label).toBe('Iniciar sessão em api');
    expect(
      promptFor({ kind: 'dialog', actions: [{ keys: ['T'], label: 'Abrir terminal' }] }).hints.map(
        (h) => h.keys[0],
      ),
    ).toEqual(['Z', 'X', 'T']);
    expect(promptFor({ kind: 'dialog' }).hints.map((h) => h.keys[0])).toEqual(['Z', 'X']);
  });

  it('points to the help key first, then rotates the tips', () => {
    expect(promptFor({ kind: 'idle', elapsedMs: 0 }).hints[0]?.keys).toEqual(['H']);
    const first = promptFor({ kind: 'idle', elapsedMs: TIP_MS });
    expect(first.hints).toEqual([]);
    expect(first.text).toBe(TIPS[0]);
    expect(promptFor({ kind: 'idle', elapsedMs: TIP_MS * 2 }).text).toBe(TIPS[1]);
    expect(tipAt(TIP_MS * TIPS.length)).toBe(TIPS[0]);
  });
});

describe('mostRecentRoom', () => {
  it('picks the project with the latest activity, agents included', () => {
    const model = build();
    expect(mostRecentRoom(model)).toBe('p1'); // a1 (00:03) in p1 beats p2 (00:02)
    (model.agents.a1 as Agent).lastActivityTs = '2026-01-01T00:00:00.000Z';
    expect(mostRecentRoom(model)).toBe('p2');
  });

  it('is undefined without projects', () => {
    expect(mostRecentRoom(createEmptyModel())).toBeUndefined();
  });
});

describe('waiting cycle', () => {
  it('orders waiting actors by activity and cycles through them', () => {
    const model = build();
    expect(waitingActors(model).map((w) => w.id)).toEqual(['s2', 'a1']);
    expect(nextWaiting(model)).toBe('s2');
    expect(nextWaiting(model, 's2')).toBe('a1');
    expect(nextWaiting(model, 'a1')).toBe('s2');
    expect(nextWaiting(model, 'gone')).toBe('s2');
  });

  it('is undefined when nobody waits', () => {
    expect(nextWaiting(createEmptyModel())).toBeUndefined();
  });
});

describe('positions', () => {
  const layout = layoutBuilding([
    { id: 'p1', name: 'one', firstSeen: 0, sessions: [{ id: 's1', agentCount: 1 }] },
  ]);

  it('roomFront is the corridor tile outside the door, facing it', () => {
    const front = roomFront(layout, 'p1');
    const door = layout.doors[0];
    expect(front?.tile).toEqual(door?.outside);
    expect(front?.facing).toBe('down');
    expect(layout.collision[front?.tile.y ?? 0]?.[front?.tile.x ?? 0]).toBe(false);
    expect(roomFront(layout, 'nope')).toBeUndefined();
  });

  it('approachTile finds a free walkable neighbour facing the target', () => {
    const lead = layout.desks[0];
    const spot = approachTile(layout, lead?.tile ?? { x: 0, y: 0 }, () => false);
    expect(spot).toBeDefined();
    const s = spot as NonNullable<typeof spot>;
    expect(layout.collision[s.tile.y]?.[s.tile.x]).toBe(false);
    expect(
      Math.abs(s.tile.x - (lead?.tile.x ?? 0)) + Math.abs(s.tile.y - (lead?.tile.y ?? 0)),
    ).toBe(1);
    const none = approachTile(layout, lead?.tile ?? { x: 0, y: 0 }, () => true);
    expect(none).toBeUndefined();
  });

  it('freeTileNear returns the tile when free, else a close free one', () => {
    const outside = layout.doors[0]?.outside ?? { x: 0, y: 0 };
    expect(freeTileNear(layout, outside, () => false)).toEqual(outside);
    const other = freeTileNear(layout, outside, (t) => t.x === outside.x && t.y === outside.y);
    expect(other).toBeDefined();
    expect(other).not.toEqual(outside);
  });
});

describe('hintPanelX', () => {
  it('right-aligns the panel against the margin', () => {
    expect(hintPanelX(320, 100, 6)).toBe(214);
  });

  it('never goes past the left margin on a narrow screen', () => {
    expect(hintPanelX(80, 100, 6)).toBe(6);
  });
});
