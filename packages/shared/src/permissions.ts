import { z } from 'zod';
import { IsoTimestampSchema } from './events';

// ---------------------------------------------------------------------------
// Permission requests (Claude Code `PermissionRequest` hook <-> daemon <-> UI)
// ---------------------------------------------------------------------------

/**
 * A pending permission request shown to the user as a card. The raw `tool_input` is deliberately
 * not part of it: only a short summary travels to the UI and nothing is logged.
 */
export const PermissionRequestSchema = z.looseObject({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  /** `agent_id ?? session_id` of the hook payload: who is asking (no `agent_id` = Tech Lead). */
  actorId: z.string().min(1),
  /** Present only when a subagent asks (`agent_type` of the payload). */
  agentType: z.string().optional(),
  /** Tool name (`tool_name` of the payload). */
  tool: z.string().min(1),
  inputSummary: z.string(),
  projectId: z.string().min(1).optional(),
  ts: IsoTimestampSchema,
});
export type PermissionRequest = z.infer<typeof PermissionRequestSchema>;

/** What the user chose. `defer` leaves the question to the terminal prompt (which is always there). */
export const PermissionDecisionSchema = z.discriminatedUnion('behavior', [
  z.looseObject({ behavior: z.literal('allow') }),
  z.looseObject({ behavior: z.literal('deny'), message: z.string().optional() }),
  z.looseObject({ behavior: z.literal('defer') }),
]);
export type PermissionDecision = z.infer<typeof PermissionDecisionSchema>;

/**
 * How a pending request ended: `ui` (the user decided or deferred), `released` (daemon released it,
 * e.g. no UI connected), `terminal` (answered in the terminal prompt), `hook-gone` (the hook
 * process went away).
 */
export const PermissionResolvedBySchema = z.enum(['ui', 'released', 'terminal', 'hook-gone']);
export type PermissionResolvedBy = z.infer<typeof PermissionResolvedBySchema>;

// Envelope messages are plain objects (like `snapshot`/`event`) so `kind` narrows the union; the
// payloads inside (request, decision) are tolerant loose objects.

/** Daemon -> UI: a new pending request. */
export const PermissionRequestedMessageSchema = z.object({
  kind: z.literal('permission.requested'),
  request: PermissionRequestSchema,
});

/** Daemon -> UI: a request is no longer pending (remove the card). */
export const PermissionResolvedMessageSchema = z.object({
  kind: z.literal('permission.resolved'),
  id: z.string().min(1),
  by: PermissionResolvedBySchema,
  decision: PermissionDecisionSchema.optional(),
});

/** Daemon -> UI: all pending requests, sent right after `snapshot` when a UI client connects. */
export const PermissionSnapshotMessageSchema = z.object({
  kind: z.literal('permission.snapshot'),
  pending: z.array(PermissionRequestSchema),
});

/** UI -> daemon: the user's decision. Accepted only from clients that connected as `?role=ui`. */
export const PermissionDecideMessageSchema = z.object({
  kind: z.literal('permission.decide'),
  id: z.string().min(1),
  decision: PermissionDecisionSchema,
});

export const ClientMessageSchema = z.discriminatedUnion('kind', [PermissionDecideMessageSchema]);

export type PermissionRequestedMessage = z.infer<typeof PermissionRequestedMessageSchema>;
export type PermissionResolvedMessage = z.infer<typeof PermissionResolvedMessageSchema>;
export type PermissionSnapshotMessage = z.infer<typeof PermissionSnapshotMessageSchema>;
export type PermissionDecideMessage = z.infer<typeof PermissionDecideMessageSchema>;
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

/** Validates a decoded client -> server WebSocket message. Never throws. */
export function parseClientMessage(input: unknown) {
  return ClientMessageSchema.safeParse(input);
}

// ---------------------------------------------------------------------------
// Hook response
// ---------------------------------------------------------------------------

/** Stdout JSON of the `PermissionRequest` hook for an allow/deny decision. */
export interface PermissionHookOutput {
  hookSpecificOutput: {
    hookEventName: 'PermissionRequest';
    decision: { behavior: 'allow' } | { behavior: 'deny'; message?: string };
  };
}

/**
 * Builds the hook output for a decision. `defer` has no output: the hook must exit 0 with an empty
 * stdout so the terminal prompt (already on screen) keeps going. Never use exit 2.
 */
export function permissionHookOutput(decision: PermissionDecision): PermissionHookOutput | null {
  if (decision.behavior === 'allow') {
    return {
      hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } },
    };
  }
  if (decision.behavior === 'deny') {
    return {
      hookSpecificOutput: {
        hookEventName: 'PermissionRequest',
        decision:
          decision.message !== undefined
            ? { behavior: 'deny', message: decision.message }
            : { behavior: 'deny' },
      },
    };
  }
  return null;
}
