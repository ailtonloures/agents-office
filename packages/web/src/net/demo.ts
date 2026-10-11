import type { OfficeEvent } from '@agents-office/shared';
import type { OfficeClient } from './officeClient';

interface DemoProject {
  id: string;
  cwd: string;
  prompts: string[];
}

const PROJECTS: DemoProject[] = [
  {
    id: '-home-dev-checkout-service',
    cwd: '/home/dev/checkout-service',
    prompts: ['Adicionar pagamento via PIX', 'Corrigir timeout no webhook'],
  },
  {
    id: '-home-dev-landing-page',
    cwd: '/home/dev/landing-page',
    prompts: ['Redesenhar a secao de precos'],
  },
  {
    id: '-home-dev-data-pipeline',
    cwd: '/home/dev/data-pipeline',
    prompts: ['Migrar jobs para o novo scheduler', 'Revisar testes de ingestao'],
  },
  {
    id: '-home-dev-mobile-app',
    cwd: '/home/dev/mobile-app',
    prompts: ['Implementar login biometrico'],
  },
];

const AGENT_KINDS = [
  { type: 'Explore', task: 'Mapear modulos de pagamento' },
  { type: 'Plan', task: 'Desenhar a arquitetura do fluxo' },
  { type: 'general-purpose', task: 'Implementar o endpoint novo' },
  { type: 'general-purpose', task: 'Escrever migracao do banco' },
  { type: 'code-reviewer', task: 'Revisar o diff da branch' },
  { type: 'qa-tester', task: 'Rodar a suite de testes e2e' },
  { type: 'claude-code-guide', task: 'Consultar a documentacao da API' },
  { type: 'Explore', task: 'Procurar usos da funcao legada' },
];

const TOOLS = [
  { tool: 'Read', summary: 'Read src/index.ts' },
  { tool: 'Edit', summary: 'Edit src/payment.ts' },
  { tool: 'Bash', summary: 'Bash pnpm test' },
  { tool: 'Grep', summary: 'Grep "handleWebhook"' },
  { tool: 'WebSearch', summary: 'WebSearch pix api docs' },
  { tool: 'Write', summary: 'Write src/pix.ts' },
  { tool: 'Bash', summary: 'Bash pnpm build' },
  { tool: 'Read', summary: 'Read docs/arquitetura.md' },
  { tool: 'WebFetch', summary: 'WebFetch https://docs.pix.dev' },
];

/** Tiny deterministic PRNG so a demo run always tells the same story. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * `?demo`: fakes a daemon. Projects open one after the other, each with Tech Leads, and subagents
 * keep being born, working and leaving, so the office can be seen growing without Claude Code.
 */
export function startDemo(client: OfficeClient): () => void {
  const random = mulberry32(7);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)] as T;
  const ts = () => new Date().toISOString();
  const emit = (event: Omit<OfficeEvent, 'ts' | 'source'> & Record<string, unknown>) =>
    client.feedEvent({ ts: ts(), source: 'hook', ...event } as OfficeEvent);

  let counter = 0;
  const sessions: { id: string; live: string[] }[] = [];
  const timers: ReturnType<typeof setTimeout>[] = [];
  const later = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));

  client.feedSnapshot({ projects: {}, sessions: {}, agents: {}, hallOfFame: [] });
  client.feedConnection(true);

  function openSession(project: DemoProject, prompt: string): void {
    counter += 1;
    const id = `demo-session-${counter}`;
    sessions.push({ id, live: [] });
    emit({ type: 'session.started', sessionId: id, projectId: project.id, cwd: project.cwd });
    emit({ type: 'actor.thinking', actorId: id, lastPromptSummary: prompt });
  }

  function spawnAgent(sessionId: string): void {
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return;
    counter += 1;
    const id = `demo-agent-${counter}`;
    const kind = pick(AGENT_KINDS);
    session.live.push(id);
    emit({
      type: 'agent.spawned',
      agentId: id,
      sessionId,
      agentType: kind.type,
      description: kind.task,
      spawnDepth: 1,
    });
    emit({ type: 'actor.thinking', actorId: id });
  }

  function finishAgent(sessionId: string): void {
    const session = sessions.find((s) => s.id === sessionId);
    const id = session?.live.shift();
    if (id) emit({ type: 'agent.finished', agentId: id });
  }

  /** Actors with a tool running: a second one never starts on top of it. */
  const busy = new Set<string>();

  function work(actorId: string): void {
    if (busy.has(actorId)) return;
    busy.add(actorId);
    counter += 1;
    const toolUseId = `tool-${counter}`;
    // Tech Leads now and then summon a subagent (the Agent tool); everybody else uses the rest.
    const lead = actorId.startsWith('demo-session-');
    const tool = lead && random() < 0.3 ? { tool: 'Agent', summary: 'Agent Explore' } : pick(TOOLS);
    emit({ type: 'tool.started', actorId, toolUseId, tool: tool.tool, summary: tool.summary });
    later(3000 + random() * 5000, () => {
      busy.delete(actorId);
      emit({ type: 'tool.finished', actorId, toolUseId, ok: random() > 0.1 });
    });
    emit({
      type: 'usage',
      actorId,
      inputTokens: Math.floor(2000 + random() * 9000),
      outputTokens: Math.floor(300 + random() * 2500),
    });
  }

  // Scripted opening: the office grows project by project.
  PROJECTS.forEach((project, index) => {
    later(600 + index * 6500, () => {
      openSession(project, project.prompts[0] as string);
      const sessionId = sessions[sessions.length - 1]?.id as string;
      for (let i = 0; i < 2 + index; i += 1) later(1400 + i * 1500, () => spawnAgent(sessionId));
      if (project.prompts[1]) {
        later(5200, () => openSession(project, project.prompts[1] as string));
      }
    });
  });

  // Ambient life: tools, new agents, agents leaving, someone asking for attention.
  const ambient = setInterval(() => {
    const session = pick(sessions.length > 0 ? sessions : [{ id: '', live: [] }]);
    if (!session.id) return;
    const roll = random();
    if (roll < 0.28 && session.live.length < 7) spawnAgent(session.id);
    else if (roll < 0.4) finishAgent(session.id);
    else if (roll < 0.46) emit({ type: 'actor.waiting', actorId: session.id });
    // Several people at work at once, so most monitors show something.
    for (let i = 0; i < 4; i += 1) {
      const team = pick(sessions);
      work(pick([team.id, ...team.live]));
    }
  }, 1300);

  return () => {
    clearInterval(ambient);
    for (const timer of timers) clearTimeout(timer);
  };
}
