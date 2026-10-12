import type { Agent, OfficeModel, Session } from '@agents-office/shared';
import { createEmptyModel } from '@agents-office/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setLocale } from '../src/i18n/i18n';
import {
  actionLine,
  agentPages,
  DIALOG_COLS,
  DIALOG_LINES,
  formatDuration,
  formatTokens,
  pageLength,
  pagesFor,
  revealLines,
  sessionActions,
  sessionPages,
  truncate,
  wrapLines,
} from '../src/ui/dialogContent';

beforeEach(() => setLocale('pt-BR'));
afterEach(() => setLocale('en'));

const NOW = Date.parse('2026-01-01T00:10:00.000Z');

function agent(patch: Partial<Agent> = {}): Agent {
  return {
    id: 'a1',
    sessionId: 's1',
    agentType: 'general-purpose',
    description: 'Implement the login form',
    spawnDepth: 1,
    profession: 'developer',
    status: 'working',
    currentTool: 'Edit',
    recentSteps: [
      {
        toolUseId: 't1',
        tool: 'Read',
        summary: 'src/a.ts',
        ts: '2026-01-01T00:05:00.000Z',
        ok: true,
      },
      { toolUseId: 't2', tool: 'Edit', summary: 'src/login.ts', ts: '2026-01-01T00:09:00.000Z' },
    ],
    usage: { inputTokens: 12_345, outputTokens: 987 },
    startedTs: '2026-01-01T00:06:48.000Z',
    ...patch,
  };
}

function session(patch: Partial<Session> = {}): Session {
  return {
    id: 'abcdef12-3456-7890',
    projectId: 'p1',
    profession: 'tech-lead',
    status: 'working',
    recentSteps: [],
    usage: { inputTokens: 0, outputTokens: 0 },
    agentIds: ['a1'],
    lastPromptSummary: 'Add a login form',
    ...patch,
  };
}

function modelWith(s: Session, agents: Agent[]): OfficeModel {
  const model = createEmptyModel();
  model.projects.p1 = {
    id: 'p1',
    name: 'my-app',
    cwd: '/x/my-app',
    sessionIds: [s.id],
    lastActivityTs: '2026-01-01T00:09:00.000Z',
  };
  model.sessions[s.id] = s;
  for (const a of agents) model.agents[a.id] = a;
  return model;
}

function expectWellFormed(pages: string[][]): void {
  expect(pages.length).toBeGreaterThan(0);
  for (const page of pages) {
    expect(page.length).toBeGreaterThan(0);
    expect(page.length).toBeLessThanOrEqual(DIALOG_LINES);
    for (const line of page) expect(line.length).toBeLessThanOrEqual(DIALOG_COLS);
  }
}

describe('formatTokens', () => {
  it('formats small, thousands and millions', () => {
    expect(formatTokens(0)).toBe('0');
    expect(formatTokens(950)).toBe('950');
    expect(formatTokens(12_345)).toBe('12.3k');
    expect(formatTokens(1000)).toBe('1.0k');
    expect(formatTokens(1_250_000)).toBe('1.2M');
  });
});

describe('formatDuration', () => {
  it('formats seconds, minutes and hours', () => {
    expect(formatDuration(45_000)).toBe('45s');
    expect(formatDuration(192_000)).toBe('3m 12s');
    expect(formatDuration(3_900_000)).toBe('1h 05m');
    expect(formatDuration(-5)).toBe('0s');
  });
});

describe('truncate / wrapLines', () => {
  it('truncates with an ellipsis and sanitizes', () => {
    expect(truncate('abcdefghij', 5)).toBe('abcd…');
    expect(truncate('short', 5)).toBe('short');
    expect(truncate('a\n\tb   c', 20)).toBe('a b c');
    expect(truncate('x { y } @', 20)).toBe('x ? y ? ?');
  });

  it('wraps on words and splits very long words', () => {
    expect(wrapLines('aaa bbb ccc', 7)).toEqual(['aaa bbb', 'ccc']);
    expect(wrapLines('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij']);
  });

  it('limits the number of lines, marking the cut', () => {
    const lines = wrapLines('one two three four five six', 8, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1]?.endsWith('…')).toBe(true);
    expect(lines.every((l) => l.length <= 8)).toBe(true);
  });
});

describe('agentPages', () => {
  it('shows profession and type, task, current tool, steps, time and tokens', () => {
    const pages = agentPages(agent(), NOW);
    expectWellFormed(pages);
    const text = pages.flat().join('\n');
    expect(pages[0]?.[0]).toBe('Desenvolvedor (general-purpose)');
    expect(text).toContain('Implement the login form');
    expect(text).toContain('Agora: Edit src/login.ts');
    expect(text).toContain('- Edit src/login.ts');
    expect(text).toContain('- Read src/a.ts');
    expect(text).toContain('Tempo ativo: 3m 12s');
    expect(text).toContain('Tokens: 12.3k entrada / 987 saida');
  });

  it('keeps only the last 5 steps, newest first', () => {
    const steps = Array.from({ length: 8 }, (_, i) => ({
      toolUseId: `t${i}`,
      tool: 'Bash',
      summary: `cmd-${i}`,
      ts: '2026-01-01T00:09:00.000Z',
      ok: true,
    }));
    const text = agentPages(agent({ recentSteps: steps }), NOW).flat();
    const listed = text.filter((l) => l.startsWith('- Bash'));
    expect(listed).toEqual([
      '- Bash cmd-7',
      '- Bash cmd-6',
      '- Bash cmd-5',
      '- Bash cmd-4',
      '- Bash cmd-3',
    ]);
  });

  it('never shows a full huge text: everything is truncated and wrapped', () => {
    const huge = 'x'.repeat(5000);
    const pages = agentPages(
      agent({
        description: huge,
        recentSteps: [
          { toolUseId: 't', tool: 'Write', summary: huge, ts: '2026-01-01T00:09:00.000Z' },
        ],
        currentTool: 'Write',
      }),
      NOW,
    );
    expectWellFormed(pages);
    expect(pages.flat().join('').length).toBeLessThan(900);
  });

  it('handles an agent with no tool, steps or description', () => {
    const pages = agentPages(
      agent({ currentTool: undefined, recentSteps: [], description: '', agentType: '' }),
      NOW,
    );
    expectWellFormed(pages);
    expect(pages.flat().join('\n')).toContain('Agora: nada em execucao');
    expect(pages[0]?.[0]).toBe('Desenvolvedor');
  });

  it('uses the finish time for finished agents', () => {
    const pages = agentPages(
      agent({ status: 'finished', finishedTs: '2026-01-01T00:08:48.000Z' }),
      NOW,
    );
    expect(pages.flat().join('\n')).toContain('Tempo ativo: 2m 00s');
  });
});

describe('sessionPages', () => {
  it('shows project, short session id, last prompt and active subordinates', () => {
    const s = session();
    const model = modelWith(s, [agent(), agent({ id: 'a2', status: 'finished' })]);
    s.agentIds = ['a1', 'a2'];
    const pages = sessionPages(s, model);
    expectWellFormed(pages);
    const text = pages.flat().join('\n');
    expect(text).toContain('Projeto: my-app');
    expect(text).toContain('Sessao: abcdef12');
    expect(text).not.toContain('3456');
    expect(text).toContain('Ultimo pedido: Add a login form');
    expect(text).toContain('Equipe ativa (1):');
    expect(text).toContain('- Desenvolvedor: trabalhando');
  });

  it('lists at most 5 subordinates and counts the rest', () => {
    const agents = Array.from({ length: 8 }, (_, i) => agent({ id: `a${i}` }));
    const s = session({ agentIds: agents.map((a) => a.id) });
    const text = sessionPages(s, modelWith(s, agents)).flat().join('\n');
    expect(text).toContain('Equipe ativa (8):');
    expect(text).toContain('+3 outros');
  });

  it('copes with no prompt and no team', () => {
    const s = session({ agentIds: [], lastPromptSummary: undefined });
    const pages = sessionPages(s, modelWith(s, []));
    expectWellFormed(pages);
    expect(pages.flat().join('\n')).toContain('Equipe ativa: ninguem');
  });
});

describe('sessionPages header', () => {
  it('uses the cast profile name instead of Tech Lead', () => {
    const s = session();
    const header = sessionPages(s, modelWith(s, []), {
      desktop: true,
      managedName: 'Designer',
      managedProfession: 'architect',
    })[0]?.[0];
    expect(header?.startsWith('Designer')).toBe(true);
    expect(header).not.toContain('Tech Lead');
    expect(header).toContain('Arquiteto');
  });

  it('truncates a long profile name to the dialog width', () => {
    const s = session();
    const header = sessionPages(s, modelWith(s, []), {
      desktop: false,
      managedName: 'N'.repeat(80),
    })[0]?.[0];
    expect(header?.length).toBe(DIALOG_COLS);
  });

  it('keeps Tech Lead for an unmanaged session', () => {
    const s = session();
    expect(sessionPages(s, modelWith(s, []))[0]?.[0]).toContain('Tech Lead');
  });
});

describe('pagesFor', () => {
  it('finds sessions and agents by id', () => {
    const s = session();
    const model = modelWith(s, [agent()]);
    expect(pagesFor(model, s.id, NOW)?.[0]?.[0]).toContain('Tech Lead');
    expect(pagesFor(model, 'a1', NOW)?.[0]?.[0]).toContain('Desenvolvedor');
    expect(pagesFor(model, 'nope', NOW)).toBeUndefined();
  });
});

describe('typewriter helpers', () => {
  it('reveals characters progressively across lines', () => {
    const lines = ['abc', 'de'];
    expect(pageLength(lines)).toBe(5);
    expect(revealLines(lines, 0)).toEqual(['', '']);
    expect(revealLines(lines, 2)).toEqual(['ab', '']);
    expect(revealLines(lines, 4)).toEqual(['abc', 'd']);
    expect(revealLines(lines, 99)).toEqual(lines);
  });
});

describe('session actions (spec 023)', () => {
  const desktop = { desktop: true };
  const bound = session({ terminalId: 'term-1' });

  it('a session bound to a tab offers "Abrir terminal" inside the app', () => {
    expect(sessionActions(bound, desktop, '/x/my-app')).toEqual([
      { id: 'open-terminal', key: 'T', label: 'Abrir terminal', terminalId: 'term-1' },
      { id: 'open-vscode', key: 'V', label: 'Abrir no VS Code', cwd: '/x/my-app' },
    ]);
    const pages = sessionPages(bound, modelWith(bound, []), desktop);
    expectWellFormed(pages);
    expect(pages.at(-1)).toEqual(['[T] Abrir terminal', '[V] Abrir no VS Code']);
    const [action] = sessionActions(bound, desktop, '/x/my-app');
    expect(action && actionLine(action)).toBe('[T] Abrir terminal');
  });

  it('external sessions (no terminalId) never show the terminal action, only VS Code', () => {
    const external = session();
    expect(sessionActions(external, desktop, '/x/my-app').map((a) => a.id)).toEqual([
      'open-vscode',
    ]);
    const text = sessionPages(external, modelWith(external, []), desktop).flat().join('\n');
    expect(text).not.toContain('Abrir terminal');
    expect(text).toContain('[V] Abrir no VS Code');
  });

  it('a session without a folder has no VS Code action', () => {
    expect(sessionActions(session(), desktop, '')).toEqual([]);
  });

  it('outside the app (browser) the action is not offered even when bound', () => {
    expect(sessionActions(bound, { desktop: false })).toEqual([]);
    const text = pagesFor(modelWith(bound, []), bound.id, NOW)?.flat().join('\n');
    expect(text).not.toContain('Abrir terminal');
    expect(text).not.toContain('VS Code');
  });

  it('subagents have no actions', () => {
    const text = agentPages(agent(), NOW).flat().join('\n');
    expect(text).not.toContain('Abrir terminal');
  });

  it('pagesFor passes the context to the session dialog', () => {
    const pages = pagesFor(modelWith(bound, []), bound.id, NOW, desktop);
    expect(pages?.flat()).toContain('[T] Abrir terminal');
  });
});

describe('dialog text in other languages', () => {
  it('uses English and keeps lines within the dialog width', () => {
    setLocale('en');
    const bound = session({ terminalId: 'term-1' });
    const pages = sessionPages(bound, modelWith(bound, [agent()]), { desktop: true });
    expectWellFormed(pages);
    const text = pages.flat().join('\n');
    expect(text).toContain('Project: my-app');
    expect(text).toContain('- Developer: working');
    expect(text).toContain('[T] Open terminal');
    expect(agentPages(agent(), NOW).flat().join('\n')).toContain('Active time: 3m 12s');
  });

  it('uses Spanish', () => {
    setLocale('es');
    const s = session();
    const pages = sessionPages(s, modelWith(s, [agent()]));
    expectWellFormed(pages);
    const text = pages.flat().join('\n');
    expect(text).toContain('Proyecto: my-app');
    expect(text).toContain('- Desarrollador: trabajando');
    expect(agentPages(agent(), NOW)[0]?.[0]).toBe('Desarrollador (general-purpose)');
  });
});
