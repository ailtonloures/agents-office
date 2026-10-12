import type { ActorStatus, Agent, OfficeModel, Step } from '@agents-office/shared';
import { t } from '../i18n/i18n';

/**
 * Who is who on screen (pure, no Phaser): the display name of every character, the short status
 * label and the "doing now" line of the name tags.
 */

/** Longest display name on a tag (the rest is cut with `…`). */
export const NAME_MAX = 13;
/** Longest action line on an expanded tag. */
export const ACTION_MAX = 22;
const ELLIPSIS = '…';

/** Friendly names of the common subagent types (anything else is title-cased). */
function typeAlias(key: string): string | undefined {
  switch (key) {
    case 'general-purpose':
      return t('identity.type.generalPurpose');
    case 'explore':
      return 'Explorer';
    case 'plan':
      return 'Planner';
    case 'claude-code-guide':
      return t('identity.type.guide');
    case 'statusline-setup':
      return 'Statusline';
    default:
      return undefined;
  }
}

/** Short status shown on a name tag (upper-case ASCII, what the tiny font draws). */
export function statusShort(status: ActorStatus): string {
  return t(`identity.status.${status}`);
}

/** What a tool is, in a word. */
function toolVerb(tool: string): string | undefined {
  switch (tool) {
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return t('identity.tool.edit');
    case 'Write':
      return t('identity.tool.write');
    case 'Read':
      return t('identity.tool.read');
    case 'Grep':
    case 'Glob':
      return t('identity.tool.search');
    case 'Bash':
      return t('identity.tool.terminal');
    case 'WebFetch':
      return t('identity.tool.web');
    case 'WebSearch':
      return t('identity.tool.webSearch');
    case 'Agent':
    case 'Task':
      return t('identity.tool.summon');
    case 'TodoWrite':
      return t('identity.tool.plan');
    default:
      return undefined;
  }
}

export function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  const chars = Array.from(clean);
  if (chars.length <= max) return clean;
  return `${chars
    .slice(0, Math.max(0, max - 1))
    .join('')
    .trimEnd()}${ELLIPSIS}`;
}

/** `code-reviewer` -> `Code Reviewer`; known types get a friendlier alias. */
export function prettyAgentType(agentType: string): string {
  const raw = agentType.trim();
  if (!raw) return t('identity.agent');
  const alias = typeAlias(raw.toLowerCase());
  if (alias) return alias;
  const base = raw.includes(':') ? (raw.split(':').pop() ?? raw) : raw;
  return base
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => (word.length <= 2 ? word.toUpperCase() : word[0]?.toUpperCase() + word.slice(1)))
    .join(' ');
}

/**
 * Display name of every subagent: its pretty type, numbered by start order when a session runs
 * several of the same type ("Explorer 1", "Explorer 2"), so each one can be told apart.
 */
export function agentDisplayNames(model: OfficeModel): Map<string, string> {
  const names = new Map<string, string>();
  const groups = new Map<string, Agent[]>();
  for (const agent of Object.values(model.agents)) {
    const key = `${agent.sessionId}\u0000${prettyAgentType(agent.agentType)}`;
    const list = groups.get(key) ?? [];
    list.push(agent);
    groups.set(key, list);
  }
  for (const list of groups.values()) {
    list.sort(
      (a, b) => a.startedTs.localeCompare(b.startedTs) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    list.forEach((agent, i) => {
      const base = prettyAgentType(agent.agentType);
      if (list.length === 1) {
        names.set(agent.id, clip(base, NAME_MAX));
        return;
      }
      const suffix = ` ${i + 1}`;
      names.set(agent.id, `${clip(base, NAME_MAX - suffix.length)}${suffix}`);
    });
  }
  return names;
}

/** The running step of `tool` (no result yet), if any. */
function runningStep(tool: string, steps: readonly Step[]): Step | undefined {
  return [...steps].reverse().find((s) => s.tool === tool && s.ok === undefined);
}

/** Last path segment of a file-looking argument (`src/a/payment.ts` -> `payment.ts`). */
function shortTarget(summary: string, tool: string): string {
  const rest = summary.startsWith(tool) ? summary.slice(tool.length).trim() : summary.trim();
  if (/^[^\s]+\/[^\s]+$/.test(rest)) return rest.split('/').pop() ?? rest;
  return rest;
}

/**
 * The "doing now" line of a tag: the running tool and its target (`Editando payment.ts`), or,
 * between tools, the task (`fallback`).
 */
export function actionLine(
  status: ActorStatus,
  currentTool: string | undefined,
  steps: readonly Step[],
  fallback: string,
): string {
  if (status === 'waiting') return clip(t('identity.waiting'), ACTION_MAX);
  if (currentTool) {
    const verb = toolVerb(currentTool) ?? currentTool.replace(/^mcp__/, '').replace(/__/g, ' ');
    const step = runningStep(currentTool, steps);
    const target = step ? shortTarget(step.summary, currentTool) : '';
    return clip(target ? `${verb} ${target}` : verb, ACTION_MAX);
  }
  return clip(fallback, ACTION_MAX);
}
