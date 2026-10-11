import { basename, dirname } from 'node:path';
import type { HookPayload, PermissionRequest, ServerMessage } from '@agents-office/shared';
import { summarizeToolInput } from '../normalizer/summary';

export interface PermissionBrokerOptions {
  /** Epoch milliseconds. */
  now(): number;
  /** Unique id of a new pending request. */
  generateId(): string;
  /** Sends a message to every UI client. */
  emit(message: ServerMessage): void;
  log?: (message: string) => void;
}

/**
 * Notify-only tracker of pending permission requests. It never decides anything: the answer is
 * given in the terminal, and the broker only notices it (through later hook events).
 */
export interface PermissionBroker {
  /**
   * Registers a pending request and emits `permission.requested`. Returns the request, or
   * `undefined` when the payload has no tool name.
   */
  track(payload: HookPayload): PermissionRequest | undefined;
  /**
   * Handles a regular hook event that proves a pending request was answered in the terminal (or
   * that the session moved on): drops the matching pendings and emits `permission.resolved`.
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

  function resolve(id: string): void {
    if (!pending.delete(id)) return;
    options.emit({ kind: 'permission.resolved', id });
    log(`permission ${id} resolved`);
  }

  return {
    track(payload) {
      const toolName = payload.tool_name;
      if (toolName === undefined || toolName === '') return undefined;
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
      pending.set(id, { request, toolInput: stableStringify(payload.tool_input) });
      options.emit({ kind: 'permission.requested', request });
      log(`permission ${id} requested: ${toolName} by ${actorId}`);
      return request;
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
      for (const id of matches) resolve(id);
      return matches.length;
    },

    snapshot: () => [...pending.values()].map((entry) => entry.request),

    get pendingCount() {
      return pending.size;
    },
  };
}
