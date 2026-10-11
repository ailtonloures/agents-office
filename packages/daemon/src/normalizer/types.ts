import type { OfficeEvent } from '@agents-office/shared';

/** One line of a session transcript: `<projectsDir>/<projectSlug>/<sessionId>.jsonl`. */
export interface SessionLineInput {
  kind: 'session-line';
  sessionId: string;
  /** Name of the transcript's parent directory (the Claude Code cwd slug). Used as projectId. */
  projectSlug: string;
  /** Raw JSONL line, possibly truncated or malformed. */
  line: string;
}

/** One line of a subagent transcript: `<sessionId>/subagents/agent-<agentId>.jsonl`. */
export interface AgentLineInput {
  kind: 'agent-line';
  sessionId: string;
  agentId: string;
  line: string;
}

/** Parsed content of `<sessionId>/subagents/agent-<agentId>.meta.json`. */
export interface AgentMetaInput {
  kind: 'agent-meta';
  sessionId: string;
  agentId: string;
  /** Decoded JSON of the meta file (unknown on purpose: the format is not a stable API). */
  meta: unknown;
  /**
   * Optional ISO timestamp observed by the caller for the meta file (e.g. its mtime). Only used
   * when the spawn time cannot be taken from the parent `tool_use` line or the agent transcript.
   */
  observedAt?: string;
}

/** A Claude Code hook payload received by the daemon. */
export interface HookInput {
  kind: 'hook';
  /** Raw payload as POSTed by `agents-office hook` (validated inside the normalizer). */
  payload: unknown;
  /** ISO timestamp at which the daemon received the hook: hooks carry no timestamp of their own. */
  receivedAt: string;
}

export type NormalizerInput = SessionLineInput | AgentLineInput | AgentMetaInput | HookInput;

export interface NormalizerStats {
  /** Inputs dropped because they were malformed, of an unknown type or failed validation. */
  skipped: number;
  /** Well-formed inputs of a known type that carry nothing the office shows (e.g. `system`). */
  ignored: number;
  /** JSONL lines already ingested (same `uuid`), e.g. after a watcher re-read. */
  duplicates: number;
}

export interface Normalizer {
  /** Converts one input into zero or more canonical events. Never throws. */
  ingest(input: NormalizerInput): OfficeEvent[];
  /** Live counters, updated by every `ingest` call. */
  readonly stats: Readonly<NormalizerStats>;
}
