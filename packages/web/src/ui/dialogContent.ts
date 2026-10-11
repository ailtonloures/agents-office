import type {
  ActorStatus,
  Agent,
  OfficeModel,
  Profession,
  Session,
  Step,
} from '@agents-office/shared';

/** Characters per dialog line (the bitmap font is 6 px wide; see DialogBox for the box size). */
export const DIALOG_COLS = 46;
/** Lines per dialog page. */
export const DIALOG_LINES = 3;
/** Steps listed in an agent's dialog. */
export const MAX_STEPS = 5;
/** Longest piece of free text (description, prompt, tool summary) before it is cut with `…`. */
export const MAX_TEXT = 120;
const MAX_SUBORDINATES = 5;
const ELLIPSIS = '…';

/** One dialog screen: at most {@link DIALOG_LINES} lines of at most {@link DIALOG_COLS} chars. */
export type DialogPage = string[];

export const PROFESSION_LABEL: Record<Profession, string> = {
  'tech-lead': 'Tech Lead',
  analyst: 'Analista',
  architect: 'Arquiteto',
  developer: 'Desenvolvedor',
  qa: 'QA',
  support: 'Suporte',
};

export const STATUS_LABEL: Record<ActorStatus, string> = {
  spawning: 'chegando',
  thinking: 'pensando',
  working: 'trabalhando',
  waiting: 'esperando voce',
  error: 'com erro',
  idle: 'ocioso',
  finished: 'concluido',
  ended: 'encerrado',
};

/** Glyphs the default bitmap font can draw (besides letters of both cases and digits). */
const UNSUPPORTED = /[^0-9A-Za-zÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç .,:;!?\-+/()'"_=%#*<>[\]&…▼·]/g;

/** Collapses whitespace/control chars and replaces glyphs the font lacks, so lines stay aligned. */
export function sanitize(text: string): string {
  return text.replace(/\s+/g, ' ').trim().replace(UNSUPPORTED, '?');
}

/** Cuts `text` to `max` characters, ending in `…` when something was dropped. */
export function truncate(text: string, max: number): string {
  const clean = sanitize(text);
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(0, max - 1)).trimEnd()}${ELLIPSIS}`;
}

/** Token count as `950`, `12.3k` or `1.2M`. */
export function formatTokens(count: number): string {
  if (count < 1000) return String(Math.max(0, Math.floor(count)));
  if (count < 1_000_000) return `${(Math.floor(count / 100) / 10).toFixed(1)}k`;
  return `${(Math.floor(count / 100_000) / 10).toFixed(1)}M`;
}

/** Duration as `45s`, `3m 12s` or `1h 05m`. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  return `${seconds}s`;
}

/**
 * Word-wraps `text` to `cols` columns (long words are split). With `maxLines`, anything beyond is
 * dropped and the last line ends in `…`.
 */
export function wrapLines(text: string, cols = DIALOG_COLS, maxLines = Number.POSITIVE_INFINITY) {
  const words = sanitize(text).split(' ').filter(Boolean);
  const lines: string[] = [];
  let line = '';
  const flush = () => {
    if (line) lines.push(line);
    line = '';
  };
  for (let word of words) {
    while (word.length > cols) {
      if (line) flush();
      lines.push(word.slice(0, cols));
      word = word.slice(cols);
    }
    if (!line) line = word;
    else if (line.length + 1 + word.length <= cols) line += ` ${word}`;
    else {
      flush();
      line = word;
    }
  }
  flush();
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  const last = kept[maxLines - 1] ?? '';
  kept[maxLines - 1] =
    last.length >= cols ? `${last.slice(0, cols - 1)}${ELLIPSIS}` : `${last}${ELLIPSIS}`;
  return kept;
}

/** Splits lines into pages of {@link DIALOG_LINES} lines. */
export function paginate(lines: readonly string[]): DialogPage[] {
  const pages: DialogPage[] = [];
  for (let i = 0; i < lines.length; i += DIALOG_LINES) pages.push(lines.slice(i, i + DIALOG_LINES));
  return pages;
}

const stepLine = (step: Step): string => {
  const text = truncate(`${step.tool} ${step.summary}`, DIALOG_COLS - 2);
  return `- ${step.ok === false ? truncate(`${text} (ERRO)`, DIALOG_COLS - 2) : text}`;
};

const nowLine = (tool: string | undefined, steps: readonly Step[]): string => {
  if (!tool) return 'Agora: nada em execucao';
  const step = [...steps].reverse().find((s) => s.tool === tool && s.ok === undefined);
  return `Agora: ${tool}${step?.summary ? ` ${truncate(step.summary, MAX_TEXT)}` : ''}`;
};

const usageLine = (usage: { inputTokens: number; outputTokens: number }): string =>
  `Tokens: ${formatTokens(usage.inputTokens)} entrada / ${formatTokens(usage.outputTokens)} saida`;

/** Dialog pages of a subagent. `now` is epoch milliseconds. */
export function agentPages(agent: Agent, now: number): DialogPage[] {
  const title = `${PROFESSION_LABEL[agent.profession]}${agent.agentType ? ` (${agent.agentType})` : ''}`;
  const description = agent.description ? truncate(agent.description, MAX_TEXT) : 'Sem descricao';
  const end = agent.finishedTs ? Date.parse(agent.finishedTs) : now;
  const active = formatDuration(end - Date.parse(agent.startedTs));
  const steps = agent.recentSteps.slice(-MAX_STEPS).reverse();

  return [
    ...paginate([truncate(title, DIALOG_COLS), ...wrapLines(description, DIALOG_COLS, 2)]),
    ...paginate(
      wrapLines(nowLine(agent.currentTool, agent.recentSteps), DIALOG_COLS, DIALOG_LINES),
    ),
    ...paginate(
      steps.length > 0
        ? ['Ultimos passos:', ...steps.map(stepLine)]
        : ['Ultimos passos:', '- nenhum ainda'],
    ),
    [`Tempo ativo: ${active}`, usageLine(agent.usage)],
  ];
}

/** Something the player can do from an open dialog, bound to a key. */
export type DialogAction =
  | {
      id: 'open-terminal';
      /** Phaser key name (`T`). */
      key: string;
      label: string;
      /** Terminal tab the action focuses. */
      terminalId: string;
    }
  | {
      id: 'open-vscode';
      key: string;
      label: string;
      /** Folder opened in VS Code (the session's cwd). */
      cwd: string;
    };

/** Where the game runs: the actions only exist inside the desktop app. */
export interface DialogContext {
  desktop: boolean;
}

/**
 * Actions of a session's Tech Lead dialog, only inside the desktop shell: the terminal tab (only
 * for sessions started by the app, bound to a tab) and "open the folder in VS Code" (any session).
 */
export function sessionActions(
  session: Session,
  context: DialogContext,
  cwd?: string,
): DialogAction[] {
  if (!context.desktop) return [];
  const actions: DialogAction[] = [];
  if (session.terminalId !== undefined) {
    actions.push({
      id: 'open-terminal',
      key: 'T',
      label: 'Abrir terminal',
      terminalId: session.terminalId,
    });
  }
  // VS Code opens the folder of any session, also the ones started outside the app.
  if (cwd) {
    actions.push({ id: 'open-vscode', key: 'V', label: 'Abrir no VS Code', cwd });
  }
  return actions;
}

/** The footer line of an action, as shown in the dialog (`[T] Abrir terminal`). */
export function actionLine(action: DialogAction): string {
  return `[${action.key}] ${action.label}`;
}

/** Dialog pages of a session's Tech Lead. */
export function sessionPages(
  session: Session,
  model: OfficeModel,
  context: DialogContext = { desktop: false },
): DialogPage[] {
  const project = model.projects[session.projectId]?.name ?? session.projectId;
  const subordinates = session.agentIds
    .map((id) => model.agents[id])
    .filter((a): a is Agent => a !== undefined && a.status !== 'finished' && a.status !== 'ended');
  const prompt = session.lastPromptSummary
    ? truncate(session.lastPromptSummary, MAX_TEXT)
    : 'nenhum ainda';

  const listed = subordinates
    .slice(0, MAX_SUBORDINATES)
    .map((a) =>
      truncate(`- ${PROFESSION_LABEL[a.profession]}: ${STATUS_LABEL[a.status]}`, DIALOG_COLS),
    );
  const hidden = subordinates.length - listed.length;
  return [
    ...paginate([
      truncate(`Tech Lead - ${PROFESSION_LABEL[session.profession]}`, DIALOG_COLS),
      truncate(`Projeto: ${project}`, DIALOG_COLS),
      `Sessao: ${session.id.slice(0, 8)}`,
    ]),
    ...paginate(wrapLines(`Ultimo pedido: ${prompt}`, DIALOG_COLS, DIALOG_LINES)),
    ...paginate([
      subordinates.length > 0 ? `Equipe ativa (${subordinates.length}):` : 'Equipe ativa: ninguem',
      ...listed,
      ...(hidden > 0 ? [`+${hidden} outros`] : []),
    ]),
    ...paginate(
      sessionActions(session, context, model.projects[session.projectId]?.cwd).map(actionLine),
    ),
  ];
}

/** Pages for the actor with this id (a session's Tech Lead or a subagent), if it still exists. */
export function pagesFor(
  model: OfficeModel,
  id: string,
  now: number,
  context: DialogContext = { desktop: false },
): DialogPage[] | undefined {
  const session = model.sessions[id];
  if (session) return sessionPages(session, model, context);
  const agent = model.agents[id];
  return agent ? agentPages(agent, now) : undefined;
}

/** Total characters of a page (what the typewriter has to reveal). */
export function pageLength(lines: readonly string[]): number {
  return lines.reduce((sum, line) => sum + line.length, 0);
}

/** The lines of a page with only the first `count` characters revealed (typewriter effect). */
export function revealLines(lines: readonly string[], count: number): string[] {
  let left = Math.max(0, Math.floor(count));
  return lines.map((line) => {
    const shown = line.slice(0, left);
    left = Math.max(0, left - line.length);
    return shown;
  });
}
