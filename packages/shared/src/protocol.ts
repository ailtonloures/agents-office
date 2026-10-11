import { z } from 'zod';
import { OfficeEventSchema } from './events';
import { OfficeModelSchema } from './model';
import {
  PermissionRequestedMessageSchema,
  PermissionResolvedMessageSchema,
  PermissionSnapshotMessageSchema,
} from './permissions';

// ---------------------------------------------------------------------------
// WebSocket stream (daemon -> web)
// ---------------------------------------------------------------------------

/** Sent once when a client connects: the full current model. */
export const SnapshotMessageSchema = z.object({
  kind: z.literal('snapshot'),
  model: OfficeModelSchema,
});

/** Sent for every event applied after the snapshot. */
export const EventMessageSchema = z.object({
  kind: z.literal('event'),
  event: OfficeEventSchema,
});

export const ServerMessageSchema = z.discriminatedUnion('kind', [
  SnapshotMessageSchema,
  EventMessageSchema,
  PermissionRequestedMessageSchema,
  PermissionResolvedMessageSchema,
  PermissionSnapshotMessageSchema,
]);

export type SnapshotMessage = z.infer<typeof SnapshotMessageSchema>;
export type EventMessage = z.infer<typeof EventMessageSchema>;
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

/** Validates a decoded WebSocket message. Never throws. */
export function parseServerMessage(input: unknown) {
  return ServerMessageSchema.safeParse(input);
}

// ---------------------------------------------------------------------------
// Hook payload (Claude Code hook -> daemon `POST /hook`)
// ---------------------------------------------------------------------------

/**
 * Hook events the normalizer understands. Other names are accepted but ignored. `PermissionRequest`
 * is deliberately absent: it is a long-poll handled by `/hook/permission`, never normalized.
 */
export const KNOWN_HOOK_EVENTS = [
  'SessionStart',
  'SessionEnd',
  'SubagentStart',
  'SubagentStop',
  'PreToolUse',
  'PostToolUse',
  'Notification',
  'Stop',
  'UserPromptSubmit',
] as const;
export type KnownHookEvent = (typeof KNOWN_HOOK_EVENTS)[number];

/**
 * Payload a Claude Code hook writes to stdin, forwarded as-is by `agents-office hook`.
 * Tolerant by design: only `hook_event_name` and `session_id` are required, every other field is
 * optional and unknown fields are preserved, since the hook format is not a stable public API.
 */
export const HookPayloadSchema = z.looseObject({
  hook_event_name: z.string().min(1),
  session_id: z.string().min(1),
  transcript_path: z.string().optional(),
  cwd: z.string().optional(),
  permission_mode: z.string().optional(),
  // PreToolUse / PostToolUse
  tool_name: z.string().optional(),
  tool_input: z.unknown().optional(),
  tool_response: z.unknown().optional(),
  tool_use_id: z.string().optional(),
  // SubagentStart / SubagentStop
  agent_id: z.string().optional(),
  agent_type: z.string().optional(),
  agent_transcript_path: z.string().optional(),
  // Notification
  message: z.string().optional(),
  notification_type: z.string().optional(),
  // UserPromptSubmit
  prompt: z.string().optional(),
  // SessionStart (`startup` | `resume` | ...) / SessionEnd (`clear` | `logout` | ...)
  source: z.string().optional(),
  reason: z.string().optional(),
  // Stop / SubagentStop
  stop_hook_active: z.boolean().optional(),
  // Added by `agents-office hook` from AGENTS_OFFICE_TERMINAL_ID (embedded terminal tab id)
  terminalId: z.string().min(1).optional(),
});
export type HookPayload = z.infer<typeof HookPayloadSchema>;

/** Validates a hook payload. Never throws. */
export function parseHookPayload(input: unknown) {
  return HookPayloadSchema.safeParse(input);
}

export function isKnownHookEvent(name: string): name is KnownHookEvent {
  return (KNOWN_HOOK_EVENTS as readonly string[]).includes(name);
}
