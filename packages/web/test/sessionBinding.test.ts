import { createEmptyModel, type Session } from '@agents-office/shared';
import { describe, expect, it } from 'vitest';
import {
  activityByTerminal,
  claudeSessionByTerminal,
  doorAt,
  roomCwd,
  sessionIdByTerminal,
} from '../src/ui/sessionBinding';
import { layoutBuilding } from '../src/world/roomLayout';

const session = (id: string, patch: Partial<Session> = {}): Session => ({
  id,
  projectId: 'p1',
  profession: 'tech-lead',
  status: 'idle',
  recentSteps: [],
  usage: { inputTokens: 0, outputTokens: 0 },
  agentIds: [],
  ...patch,
});

describe('doorAt', () => {
  const layout = layoutBuilding([
    { id: 'p1', name: 'one', firstSeen: 0, sessions: [{ id: 's1', agentCount: 1 }] },
  ]);

  it('finds the room door by its tile and nothing elsewhere', () => {
    const door = layout.doors[0];
    expect(door).toBeDefined();
    if (!door) return;
    expect(doorAt(layout, door.tile)?.roomId).toBe(door.roomId);
    expect(doorAt(layout, door.outside)).toBeUndefined();
  });
});

describe('roomCwd / activityByTerminal', () => {
  it('reads the project cwd, undefined when empty or unknown', () => {
    const model = createEmptyModel();
    model.projects.p1 = {
      id: 'p1',
      name: 'one',
      cwd: '/x/one',
      sessionIds: [],
      lastActivityTs: '',
    };
    model.projects.p2 = { id: 'p2', name: 'two', cwd: '', sessionIds: [], lastActivityTs: '' };
    expect(roomCwd(model, 'p1')).toBe('/x/one');
    expect(roomCwd(model, 'p2')).toBeUndefined();
    expect(roomCwd(model, 'nope')).toBeUndefined();
  });

  it('maps only the sessions bound to a terminal, with the office status label', () => {
    const model = createEmptyModel();
    model.sessions.s1 = session('s1', { terminalId: 't1', status: 'thinking' });
    model.sessions.s2 = session('s2');
    expect(activityByTerminal(model)).toEqual({ t1: 'pensando' });
  });
});

describe('claudeSessionByTerminal', () => {
  it('maps each app tab to its Claude session and skips external sessions', () => {
    const model = createEmptyModel();
    model.sessions.a = session('a', { terminalId: 'term-1' });
    model.sessions.b = session('b');
    expect(claudeSessionByTerminal(model)).toEqual({ 'term-1': 'a' });
  });
});

describe('sessionIdByTerminal', () => {
  it('finds the session running in the tab, or nothing', () => {
    const model = createEmptyModel();
    model.sessions.s1 = session('s1', { terminalId: 't1' });
    model.sessions.s2 = session('s2');
    expect(sessionIdByTerminal(model, 't1')).toBe('s1');
    expect(sessionIdByTerminal(model, 't9')).toBeUndefined();
    expect(sessionIdByTerminal(model, undefined)).toBeUndefined();
  });
});
