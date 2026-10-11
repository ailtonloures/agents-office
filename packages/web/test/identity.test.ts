import type { Agent, OfficeModel, Step } from '@agents-office/shared';
import { createEmptyModel } from '@agents-office/shared';
import { describe, expect, it } from 'vitest';
import { actionLine, agentDisplayNames, clip, NAME_MAX, prettyAgentType } from '../src/ui/identity';
import { labelText, tagText } from '../src/ui/nameTag';

const usage = { inputTokens: 0, outputTokens: 0 };

function agent(id: string, sessionId: string, agentType: string, startedTs: string): Agent {
  return {
    id,
    sessionId,
    agentType,
    description: '',
    spawnDepth: 1,
    profession: 'developer',
    status: 'working',
    recentSteps: [],
    usage,
    startedTs,
  };
}

function model(agents: Agent[]): OfficeModel {
  const m = createEmptyModel();
  for (const a of agents) m.agents[a.id] = a;
  return m;
}

describe('prettyAgentType', () => {
  it('title-cases kebab names and uses friendly aliases', () => {
    expect(prettyAgentType('code-reviewer')).toBe('Code Reviewer');
    expect(prettyAgentType('general-purpose')).toBe('Generalista');
    expect(prettyAgentType('Explore')).toBe('Explorer');
    expect(prettyAgentType('qa-tester')).toBe('QA Tester');
    expect(prettyAgentType('plugin:security-audit')).toBe('Security Audit');
    expect(prettyAgentType('  ')).toBe('Agente');
  });
});

describe('agentDisplayNames', () => {
  it('numbers agents of the same type in a session by start order', () => {
    const names = agentDisplayNames(
      model([
        agent('b', 's1', 'Explore', '2026-01-01T00:00:02Z'),
        agent('a', 's1', 'Explore', '2026-01-01T00:00:01Z'),
        agent('c', 's1', 'Plan', '2026-01-01T00:00:03Z'),
        agent('d', 's2', 'Explore', '2026-01-01T00:00:04Z'),
      ]),
    );
    expect(names.get('a')).toBe('Explorer 1');
    expect(names.get('b')).toBe('Explorer 2');
    expect(names.get('c')).toBe('Planner');
    // Another session has its own numbering.
    expect(names.get('d')).toBe('Explorer');
  });

  it('keeps names short, the number included', () => {
    const names = agentDisplayNames(
      model([
        agent('a', 's', 'very-long-specialised-agent', '2026-01-01T00:00:01Z'),
        agent('b', 's', 'very-long-specialised-agent', '2026-01-01T00:00:02Z'),
      ]),
    );
    const b = names.get('b') ?? '';
    expect(Array.from(b).length).toBeLessThanOrEqual(NAME_MAX);
    expect(b.endsWith(' 2')).toBe(true);
  });
});

describe('actionLine', () => {
  const step = (tool: string, summary: string, ok?: boolean): Step => ({
    toolUseId: `${tool}-${summary}`,
    tool,
    summary,
    ts: '2026-01-01T00:00:00Z',
    ...(ok === undefined ? {} : { ok }),
  });

  it('names the running tool and the file it works on', () => {
    const steps = [step('Edit', 'Edit src/payments/pix.ts')];
    expect(actionLine('working', 'Edit', steps, 'task')).toBe('Editando pix.ts');
    expect(actionLine('working', 'Bash', [step('Bash', 'Bash pnpm test')], 'task')).toBe(
      'Terminal pnpm test',
    );
  });

  it('falls back to the task between tools and asks for the user while waiting', () => {
    expect(actionLine('thinking', undefined, [], 'Revisar o diff')).toBe('Revisar o diff');
    expect(actionLine('waiting', undefined, [], 'x')).toBe('Aguarda sua resposta');
  });

  it('clips with an ellipsis', () => {
    expect(clip('abcdefghij', 5)).toBe('abcd…');
    expect(clip('abc', 5)).toBe('abc');
  });
});

describe('tag text', () => {
  it('keeps the accents the label font draws and drops the others', () => {
    expect(labelText('Você, ação', 20)).toBe('Você, ação');
    expect(labelText('Über naïve', 20)).toBe('Uber naive');
    expect(labelText('a😀b', 20)).toBe('a?b');
    expect(labelText('Generalista Especial', 10)).toBe('Generalis…');
  });

  it('upper-cases plain ASCII for the tiny font', () => {
    expect(tagText('Aguarda você…', 20)).toBe('AGUARDA VOCE.');
  });
});
