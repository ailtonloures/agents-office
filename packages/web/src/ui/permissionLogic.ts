import type { OfficeModel, PermissionDecision, PermissionRequest } from '@agents-office/shared';
import { sanitize, truncate, wrapLines } from './dialogContent';
import { agentDisplayNames, prettyAgentType } from './identity';

/** Characters per line inside the card (the bitmap font is 6 px wide). */
export const CARD_COLS = 42;
/** Lines of the tool summary shown in the card. */
export const CARD_SUMMARY_LINES = 3;
/** Longest reason the user can type for a denial. */
export const REASON_MAX = 80;

// --- queue ----------------------------------------------------------------------------------

/** Oldest request first (the id breaks ties so the order is stable). */
export function sortQueue(requests: readonly PermissionRequest[]): PermissionRequest[] {
  return [...requests].sort((a, b) => a.ts.localeCompare(b.ts) || (a.id < b.id ? -1 : 1));
}

/** The queue after a `permission.snapshot`: exactly the daemon's pending list. */
export function applySnapshot(pending: readonly PermissionRequest[]): PermissionRequest[] {
  const seen = new Set<string>();
  return sortQueue(pending.filter((r) => !seen.has(r.id) && seen.add(r.id)));
}

/** The queue after a `permission.requested` (a repeated id is ignored). */
export function applyRequested(
  queue: readonly PermissionRequest[],
  request: PermissionRequest,
): PermissionRequest[] {
  if (queue.some((r) => r.id === request.id)) return [...queue];
  return sortQueue([...queue, request]);
}

/** The queue after a `permission.resolved` (unknown ids are fine: nothing changes). */
export function applyResolved(
  queue: readonly PermissionRequest[],
  id: string,
): PermissionRequest[] {
  return queue.filter((r) => r.id !== id);
}

/** The request the card shows and how many wait behind it. */
export function queueView(queue: readonly PermissionRequest[]): {
  current: PermissionRequest | undefined;
  more: number;
} {
  return { current: queue[0], more: Math.max(0, queue.length - 1) };
}

/** Actors (Tech Leads and subagents) that have a request pending: they get the `!` balloon. */
export function pendingActorIds(queue: readonly PermissionRequest[]): Set<string> {
  return new Set(queue.map((r) => r.actorId));
}

// --- text -----------------------------------------------------------------------------------

const TOOL_LABEL: Readonly<Record<string, string>> = {
  Bash: 'Rodar comando',
  Edit: 'Editar arquivo',
  MultiEdit: 'Editar arquivo',
  Write: 'Criar arquivo',
  NotebookEdit: 'Editar notebook',
  Read: 'Ler arquivo',
  Glob: 'Buscar arquivos',
  Grep: 'Buscar no código',
  WebFetch: 'Acessar a web',
  WebSearch: 'Pesquisar na web',
  Agent: 'Convocar subagente',
  Task: 'Convocar subagente',
};

/** What the tool does, in Portuguese (`mcp__x__y` and unknown tools show their own name). */
export function toolLabel(tool: string): string {
  const known = TOOL_LABEL[tool];
  if (known) return known;
  if (tool.startsWith('mcp__')) return `Ferramenta MCP ${tool.slice(5).replace(/__/g, ' / ')}`;
  return `Usar ${tool}`;
}

/** Who is asking: the Tech Lead (no subagent id) or the subagent by its display name. */
export function requesterName(model: OfficeModel, request: PermissionRequest): string {
  if (request.actorId === request.sessionId) return 'Tech Lead';
  const named = agentDisplayNames(model).get(request.actorId);
  if (named) return named;
  return request.agentType ? prettyAgentType(request.agentType) : 'Agente';
}

/** Name of the project (room) the request comes from, if the model knows it. */
export function requesterProject(
  model: OfficeModel,
  request: PermissionRequest,
): string | undefined {
  const projectId = request.projectId ?? model.sessions[request.sessionId]?.projectId;
  return projectId ? model.projects[projectId]?.name : undefined;
}

export const TERMINAL_HINT = 'O terminal também está perguntando.';

export interface CardContent {
  /** `Tech Lead · meu-projeto`. */
  who: string;
  /** Tool in words and by name: `Rodar comando (Bash)`. */
  tool: string;
  /** The (short) input summary, wrapped. */
  summary: string[];
  /** `+2 na fila` or empty. */
  queue: string;
}

/** Everything the card writes for `request`, with `more` requests waiting behind it. */
export function cardContent(
  model: OfficeModel,
  request: PermissionRequest,
  more: number,
): CardContent {
  const project = requesterProject(model, request);
  const who = project
    ? `${requesterName(model, request)} · ${project}`
    : requesterName(model, request);
  const label = toolLabel(request.tool);
  const name = truncate(request.tool, 18);
  return {
    who: truncate(who, CARD_COLS),
    tool: label === `Usar ${request.tool}` ? label : truncate(`${label} (${name})`, CARD_COLS),
    summary: wrapLines(request.inputSummary || '(sem detalhes)', CARD_COLS, CARD_SUMMARY_LINES),
    queue: more > 0 ? `+${more} na fila` : '',
  };
}

// --- input ----------------------------------------------------------------------------------

export type CardChoice = 'allow' | 'deny' | 'defer';

/** Y approves, N denies (asks for a reason first), T leaves it to the terminal. */
export function shortcutFor(key: string): CardChoice | undefined {
  switch (key.toLowerCase()) {
    case 'y':
      return 'allow';
    case 'n':
      return 'deny';
    case 't':
      return 'defer';
    default:
      return undefined;
  }
}

/** The decision for a choice; a blank reason sends a plain deny. */
export function decisionFor(choice: CardChoice, reason = ''): PermissionDecision {
  if (choice === 'allow') return { behavior: 'allow' };
  if (choice === 'defer') return { behavior: 'defer' };
  const message = sanitize(reason);
  return message ? { behavior: 'deny', message } : { behavior: 'deny' };
}

/** The subset of a `KeyboardEvent` the reason field looks at. */
export interface KeyLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

/** One keystroke in the reason field: printable characters append, Backspace deletes. */
export function editReason(text: string, event: KeyLike): string {
  if (event.ctrlKey || event.metaKey || event.altKey) return text;
  if (event.key === 'Backspace') return Array.from(text).slice(0, -1).join('');
  if (Array.from(event.key).length !== 1) return text;
  const next = text + event.key;
  return Array.from(next).length > REASON_MAX ? text : next.replace(/\s+/g, ' ').trimStart();
}
