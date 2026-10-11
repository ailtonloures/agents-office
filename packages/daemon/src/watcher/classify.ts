import { relative, sep } from 'node:path';

/** What a file under the projects directory is, as far as the watcher cares. */
export type WatchedPath =
  | { kind: 'session'; projectSlug: string; sessionId: string }
  | { kind: 'agent'; projectSlug: string; sessionId: string; agentId: string }
  | { kind: 'meta'; projectSlug: string; sessionId: string; agentId: string };

const JSONL = '.jsonl';
const META = '.meta.json';

/**
 * Classifies a path relative to `projectsDir`:
 * - `<slug>/<sessionId>.jsonl`                                -> session
 * - `<slug>/<sessionId>/subagents/agent-<id>.jsonl`           -> agent
 * - `<slug>/<sessionId>/subagents/agent-<id>.meta.json`       -> meta
 * Anything else yields `undefined`.
 */
export function classifyPath(projectsDir: string, path: string): WatchedPath | undefined {
  const parts = relative(projectsDir, path).split(sep);
  const [projectSlug, second, third, fourth] = parts;
  if (projectSlug === undefined || projectSlug === '' || projectSlug === '..') return undefined;

  if (parts.length === 2 && second?.endsWith(JSONL) && second.length > JSONL.length) {
    return { kind: 'session', projectSlug, sessionId: second.slice(0, -JSONL.length) };
  }
  if (parts.length === 4 && second !== undefined && third === 'subagents' && fourth) {
    if (!fourth.startsWith('agent-')) return undefined;
    if (fourth.endsWith(META)) {
      const agentId = fourth.slice('agent-'.length, -META.length);
      if (agentId === '') return undefined;
      return { kind: 'meta', projectSlug, sessionId: second, agentId };
    }
    if (fourth.endsWith(JSONL)) {
      const agentId = fourth.slice('agent-'.length, -JSONL.length);
      if (agentId === '') return undefined;
      return { kind: 'agent', projectSlug, sessionId: second, agentId };
    }
  }
  return undefined;
}
