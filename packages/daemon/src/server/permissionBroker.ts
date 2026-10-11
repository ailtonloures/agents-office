import { basename, dirname } from 'node:path';
import type {
  HookPayload,
  PermissionDecision,
  PermissionRequest,
  PermissionResolvedBy,
  ServerMessage,
} from '@agents-office/shared';
import { summarizeToolInput } from '../normalizer/summary';

/** What the long-poll route answers: a decision, or `release` (empty 204; the terminal decides). */
export type PermissionOutcome = PermissionDecision | 'release';

export interface PermissionBrokerOptions {
  /** Epoch milliseconds. */
  now(): number;
  /** Unique id of a new pending request. */
  generateId(): string;
  /** Whether at least one UI client is connected right now. */
  hasUi(): boolean;
  /** Sends a message to every UI client. */
  emit(message: ServerMessage): void;
  log?: (message: string) => void;
}

export interface PermissionBroker {
  /**
   * Registers a request and emits `permission.requested`. Resolves with the decision, or with
   * `release` when nobody can decide (no UI), the UI released it, it was answered in the terminal
   * or the hook connection went away (`signal` aborted).
   */
  request(payload: HookPayload, signal?: AbortSignal): Promise<PermissionOutcome>;
  /** Resolves a pending request with the user's decision. False when the id is not pending. */
  decide(id: string, decision: PermissionDecision): boolean;
  /** Releases every pending request (the terminal prompt, already on screen, takes over). */
  releaseAll(): void;
  /**
   * Handles a regular hook event that proves a pending request was answered outside the UI (in the
   * terminal): releases the matching pendings with `by: 'terminal'`. Never produces a decision.
   * Returns how many requests were resolved.
   */
  resolveExternally(payload: HookPayload): number;
  /** Pending requests, oldest first. */
  snapshot(): PermissionRequest[];
  readonly pendingCount: number;
}

interface Pending {
  request: PermissionRequest;
  /** Raw `tool_input`, kept in memory only to correlate with PostToolUse. Never logged. */
  toolInput: string;
  settle(outcome: PermissionOutcome, by: PermissionResolvedBy): void;
}

/** JSON with sorted object keys, so equal inputs compare equal whatever the key order. */
function stableStringify(value: unknown): string {
  if (typeof value !== 'object' || value === null) return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const fields = value as Record<string, unknown>;
  const keys = Object.keys(fields)
    .filter((key) => fields[key] !== undefined)
    .sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(fields[key])}`).join(',')}}`;
}

const TOOL_DONE_EVENTS: ReadonlySet<string> = new Set([
  'PostToolUse',
  'PostToolUseFailure',
  'PermissionDenied',
]);
const SESSION_PROGRESS_EVENTS: ReadonlySet<string> = new Set([
  'Stop',
  'UserPromptSubmit',
  'SessionEnd',
]);

export function createPermissionBroker(options: PermissionBrokerOptions): PermissionBroker {
  const log = options.log ?? (() => {});
  const pending = new Map<string, Pending>();

  function finish(id: string, outcome: PermissionOutcome, by: PermissionResolvedBy): boolean {
    const entry = pending.get(id);
    if (!entry) return false;
    entry.settle(outcome, by);
    return true;
  }

  return {
    request(payload, signal) {
      const toolName = payload.tool_name;
      if (toolName === undefined || toolName === '' || !options.hasUi()) {
        return Promise.resolve('release');
      }
      if (signal?.aborted) return Promise.resolve('release');

      const id = options.generateId();
      const actorId = payload.agent_id ?? payload.session_id;
      const projectId = payload.transcript_path
        ? basename(dirname(payload.transcript_path))
        : undefined;
      const request: PermissionRequest = {
        id,
        sessionId: payload.session_id,
        actorId,
        ...(payload.agent_type !== undefined ? { agentType: payload.agent_type } : {}),
        tool: toolName,
        inputSummary: summarizeToolInput(toolName, payload.tool_input, payload.cwd),
        ...(projectId ? { projectId } : {}),
        ts: new Date(options.now()).toISOString(),
      };

      return new Promise<PermissionOutcome>((resolve) => {
        const onAbort = () => finish(id, 'release', 'hook-gone');
        pending.set(id, {
          request,
          toolInput: stableStringify(payload.tool_input),
          settle(outcome, by) {
            pending.delete(id);
            signal?.removeEventListener('abort', onAbort);
            options.emit({
              kind: 'permission.resolved',
              id,
              by,
              ...(outcome !== 'release' ? { decision: outcome } : {}),
            });
            log(
              `permission ${id} resolved by ${by}${outcome === 'release' ? '' : ` (${outcome.behavior})`}`,
            );
            resolve(outcome);
          },
        });
        signal?.addEventListener('abort', onAbort, { once: true });
        options.emit({ kind: 'permission.requested', request });
        log(`permission ${id} requested: ${toolName} by ${actorId}`);
      });
    },

    decide(id, decision) {
      return finish(id, decision, 'ui');
    },

    releaseAll() {
      for (const id of [...pending.keys()]) finish(id, 'release', 'released');
    },

    resolveExternally(payload) {
      const event = payload.hook_event_name;
      const matches: string[] = [];
      if (TOOL_DONE_EVENTS.has(event)) {
        const actorId = payload.agent_id ?? payload.session_id;
        const input = stableStringify(payload.tool_input);
        // One tool result answers one request: take the oldest matching pending.
        for (const [id, entry] of pending) {
          if (
            entry.request.sessionId === payload.session_id &&
            entry.request.actorId === actorId &&
            entry.request.tool === payload.tool_name &&
            entry.toolInput === input
          ) {
            matches.push(id);
            break;
          }
        }
      } else if (SESSION_PROGRESS_EVENTS.has(event)) {
        for (const [id, entry] of pending) {
          if (entry.request.sessionId === payload.session_id) matches.push(id);
        }
      } else if (event === 'SubagentStop' && payload.agent_id !== undefined) {
        for (const [id, entry] of pending) {
          if (entry.request.actorId === payload.agent_id) matches.push(id);
        }
      }
      for (const id of matches) finish(id, 'release', 'terminal');
      return matches.length;
    },

    snapshot: () => [...pending.values()].map((entry) => entry.request),

    get pendingCount() {
      return pending.size;
    },
  };
}
