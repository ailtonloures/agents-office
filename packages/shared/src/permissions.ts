import { z } from 'zod';
import { IsoTimestampSchema } from './events';

// ---------------------------------------------------------------------------
// Permission requests (Claude Code `PermissionRequest` hook <-> daemon <-> UI)
// ---------------------------------------------------------------------------

/**
 * A pending permission request the user is notified about (the answer is given in the terminal). The raw `tool_input` is deliberately
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

// Envelope messages are plain objects (like `snapshot`/`event`) so `kind` narrows the union; the
// payload inside (request) is a tolerant loose object.

/** Daemon -> UI: a new pending request. */
export const PermissionRequestedMessageSchema = z.object({
  kind: z.literal('permission.requested'),
  request: PermissionRequestSchema,
});

/** Daemon -> UI: a request is no longer pending (answered in the terminal or the session moved on). */
export const PermissionResolvedMessageSchema = z.object({
  kind: z.literal('permission.resolved'),
  id: z.string().min(1),
});

/** Daemon -> UI: all pending requests, sent right after `snapshot` when a UI client connects. */
export const PermissionSnapshotMessageSchema = z.object({
  kind: z.literal('permission.snapshot'),
  pending: z.array(PermissionRequestSchema),
});

export type PermissionRequestedMessage = z.infer<typeof PermissionRequestedMessageSchema>;
export type PermissionResolvedMessage = z.infer<typeof PermissionResolvedMessageSchema>;
export type PermissionSnapshotMessage = z.infer<typeof PermissionSnapshotMessageSchema>;
