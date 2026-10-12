import { describe, expect, it } from 'vitest';
import {
  type ActivityKind,
  CYCLE_MS,
  entryDurationMs,
  GRID_COLS,
  GRID_ROWS,
  pathToDesk,
  SCRIPT,
  STEP_MS,
  sceneAt,
  TECH_LEAD_DESK,
} from '../src/pixel/officeLogic';

const samples = Array.from({ length: Math.floor(CYCLE_MS / 100) }, (_, i) => i * 100);

describe('officeLogic', () => {
  it('fits every entry inside one cycle', () => {
    for (const e of SCRIPT) expect(e.enterAtMs + entryDurationMs(e)).toBeLessThan(CYCLE_MS);
  });

  it('enters and leaves in script order', () => {
    const firstSeen = new Map<string, number>();
    const lastSeen = new Map<string, number>();
    for (const t of samples) {
      for (const a of sceneAt(t).agents) {
        if (a.role === 'tech-lead') continue;
        if (!firstSeen.has(a.id)) firstSeen.set(a.id, t);
        lastSeen.set(a.id, t);
      }
    }
    const ids = SCRIPT.map((e) => e.id);
    const firsts = ids.map((id) => firstSeen.get(id) ?? -1);
    expect(firsts.every((v) => v >= 0)).toBe(true);
    expect([...firsts].sort((a, b) => a - b)).toEqual(firsts);
    const lasts = ids.map((id) => lastSeen.get(id) ?? -1);
    expect([...lasts].sort((a, b) => a - b)).toEqual(lasts);
  });

  it('keeps positions inside the grid', () => {
    for (const t of samples) {
      for (const a of sceneAt(t).agents) {
        expect(Number.isInteger(a.tile.x) && Number.isInteger(a.tile.y)).toBe(true);
        expect(a.tile.x).toBeGreaterThanOrEqual(0);
        expect(a.tile.x).toBeLessThan(GRID_COLS);
        expect(a.tile.y).toBeGreaterThanOrEqual(0);
        expect(a.tile.y).toBeLessThan(GRID_ROWS);
      }
    }
  });

  it('keeps the Tech Lead seated at the main desk', () => {
    for (const t of samples) {
      const lead = sceneAt(t).agents.find((a) => a.role === 'tech-lead');
      expect(lead?.pose).toBe('seated');
      expect(lead?.tile).toEqual(TECH_LEAD_DESK);
    }
  });

  it('is deterministic and repeats every cycle', () => {
    for (const t of [0, 1234, 9999, 17000]) {
      expect(sceneAt(t)).toEqual(sceneAt(t));
      expect(sceneAt(t + CYCLE_MS).agents).toEqual(sceneAt(t).agents);
      expect(sceneAt(t - CYCLE_MS).agents).toEqual(sceneAt(t).agents);
    }
    expect(sceneAt(Number.NaN).cycleMs).toBe(0);
  });

  it('never teleports: consecutive samples move at most one tile', () => {
    const prev = new Map<string, { x: number; y: number }>();
    for (let t = 0; t < CYCLE_MS; t += STEP_MS / 2) {
      for (const a of sceneAt(t).agents) {
        const p = prev.get(a.id);
        if (p) expect(Math.abs(a.tile.x - p.x) + Math.abs(a.tile.y - p.y)).toBeLessThanOrEqual(1);
        prev.set(a.id, a.tile);
      }
      for (const id of [...prev.keys()])
        if (!sceneAt(t).agents.some((a) => a.id === id)) prev.delete(id);
    }
  });

  it('paths are 4-connected', () => {
    for (const e of SCRIPT) {
      const p = pathToDesk(e.desk);
      for (let i = 1; i < p.length; i++) {
        const a = p[i - 1];
        const b = p[i];
        expect(Math.abs((a?.x ?? 0) - (b?.x ?? 0)) + Math.abs((a?.y ?? 0) - (b?.y ?? 0))).toBe(1);
      }
    }
  });

  it('covers all states, activities and roles', () => {
    const states = new Set<string>();
    const activities = new Set<ActivityKind>();
    const roles = new Set<string>();
    for (const t of samples) {
      for (const a of sceneAt(t).agents) {
        states.add(a.state);
        roles.add(a.role);
        if (a.activity) activities.add(a.activity);
      }
    }
    expect([...states].sort()).toEqual(['entering', 'leaving', 'reporting', 'working']);
    expect([...activities].sort()).toEqual([
      'reading',
      'terminal',
      'thinking',
      'typing',
      'waiting',
    ]);
    expect([...roles].sort()).toEqual(
      ['analyst', 'architect', 'developer', 'qa', 'support', 'tech-lead'].sort(),
    );
  });
});
