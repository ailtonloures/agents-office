import { type Agent, createEmptyModel, type OfficeModel } from '@agents-office/shared';
import { describe, expect, it } from 'vitest';
import { DIALOG_COLS, DIALOG_LINES } from '../src/ui/dialogContent';
import { formatClock, hallOfFamePages, projectNameOf } from '../src/ui/hallOfFame';

const T0 = Date.parse('2026-10-10T12:00:00.000Z');
const iso = (seconds: number) => new Date(T0 + seconds * 1000).toISOString();

function entry(n: number, extra: Partial<Agent> & { projectName?: string } = {}) {
  return {
    id: `a${n}`,
    sessionId: 's1',
    agentType: 'general-purpose',
    description: `Tarefa numero ${n}`,
    spawnDepth: 1,
    profession: 'developer' as const,
    status: 'finished' as const,
    recentSteps: [],
    usage: { inputTokens: 0, outputTokens: 0 },
    startedTs: iso(n * 100),
    finishedTs: iso(n * 100 + 192),
    ...extra,
  };
}

const modelWith = (count: number, extra: Partial<OfficeModel> = {}): OfficeModel => ({
  ...createEmptyModel(),
  hallOfFame: Array.from({ length: count }, (_, i) => entry(i + 1, { projectName: 'my-app' })),
  ...extra,
});

describe('hallOfFamePages', () => {
  it('shows a friendly page when nobody finished yet', () => {
    expect(hallOfFamePages(createEmptyModel())).toEqual([
      ['Hall da Fama', 'Ninguem concluiu uma tarefa ainda.'],
    ]);
  });

  it('lists profession, description, project, duration and time, newest first', () => {
    const pages = hallOfFamePages(modelWith(3));
    expect(pages).toHaveLength(4);
    expect(pages[0]?.[0]).toBe('Hall da Fama');
    expect(pages[0]?.[1]).toContain('3 agentes');
    const newest = pages[1] ?? [];
    expect(newest[0]).toBe(`1/3 Desenvolvedor - 3m 12s - ${formatClock(iso(300 + 192))}`);
    expect(newest[1]).toBe('Tarefa numero 3');
    expect(newest[2]).toBe('Projeto: my-app');
    expect(pages[3]?.[1]).toBe('Tarefa numero 1');
  });

  it('keeps only the last 20 and respects the dialog geometry', () => {
    const model = modelWith(25);
    model.hallOfFame[24] = entry(25, {
      description: 'x '.repeat(200),
      projectName: 'p'.repeat(80),
    });
    const pages = hallOfFamePages(model);
    expect(pages).toHaveLength(21);
    for (const page of pages) {
      expect(page.length).toBeLessThanOrEqual(DIALOG_LINES);
      for (const line of page) expect(line.length).toBeLessThanOrEqual(DIALOG_COLS);
    }
    expect(pages[1]?.[1]?.endsWith('…')).toBe(true);
  });

  it('falls back to the live session project, then to "desconhecido"', () => {
    const model = modelWith(0);
    const bare = entry(1);
    expect(projectNameOf(bare, model)).toBe('desconhecido');
    model.sessions.s1 = {
      id: 's1',
      projectId: 'p1',
      profession: 'tech-lead',
      status: 'working',
      recentSteps: [],
      usage: { inputTokens: 0, outputTokens: 0 },
      agentIds: [],
    };
    model.projects.p1 = {
      id: 'p1',
      name: 'live-proj',
      cwd: '/x',
      sessionIds: ['s1'],
      lastActivityTs: iso(0),
    };
    expect(projectNameOf(bare, model)).toBe('live-proj');
  });

  it('tolerates entries without a finish time', () => {
    const model = modelWith(0);
    const { finishedTs: _f, ...open } = entry(1, { projectName: 'a' });
    model.hallOfFame = [open];
    expect(hallOfFamePages(model)[1]?.[0]).toBe('1/1 Desenvolvedor - ? - --:--');
  });
});
