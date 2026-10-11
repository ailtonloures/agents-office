import { z } from 'zod';

/** Where an event came from: a transcript line, a Claude Code hook, or the liveness clock. */
export const EventSourceSchema = z.enum(['jsonl', 'hook', 'clock']);
export type EventSource = z.infer<typeof EventSourceSchema>;

/** ISO 8601 timestamp taken from the source (never the receive time, except for liveness events). */
export const IsoTimestampSchema = z.iso.datetime({ offset: true });

const base = {
  ts: IsoTimestampSchema,
  source: EventSourceSchema,
};

// Every event schema is a loose object: unknown fields are preserved (passthrough) so that
// newer producers never break older consumers.

export const SessionStartedEventSchema = z.looseObject({
  ...base,
  type: z.literal('session.started'),
  sessionId: z.string().min(1),
  projectId: z.string().min(1),
  cwd: z.string(),
});

/**
 * Links a session to the desktop app terminal tab that runs it. Emitted by the normalizer from
 * the `terminalId` the `hook` command adds to the payload (hooks may arrive before or after the
 * transcript lines, so this is separate from `session.started`).
 */
export const SessionBoundEventSchema = z.looseObject({
  ...base,
  type: z.literal('session.bound'),
  sessionId: z.string().min(1),
  terminalId: z.string().min(1),
});

export const AgentSpawnedEventSchema = z.looseObject({
  ...base,
  type: z.literal('agent.spawned'),
  agentId: z.string().min(1),
  sessionId: z.string().min(1),
  parentAgentId: z.string().min(1).optional(),
  agentType: z.string(),
  description: z.string(),
  spawnDepth: z.number().int().min(1),
});

export const ToolStartedEventSchema = z.looseObject({
  ...base,
  type: z.literal('tool.started'),
  actorId: z.string().min(1),
  toolUseId: z.string().min(1),
  tool: z.string().min(1),
  summary: z.string(),
});

export const ToolFinishedEventSchema = z.looseObject({
  ...base,
  type: z.literal('tool.finished'),
  actorId: z.string().min(1),
  toolUseId: z.string().min(1),
  ok: z.boolean(),
});

export const ActorThinkingEventSchema = z.looseObject({
  ...base,
  type: z.literal('actor.thinking'),
  actorId: z.string().min(1),
  /** Truncated summary of the user prompt, set when the thinking was triggered by UserPromptSubmit. */
  lastPromptSummary: z.string().optional(),
});

export const ActorWaitingEventSchema = z.looseObject({
  ...base,
  type: z.literal('actor.waiting'),
  actorId: z.string().min(1),
});

export const ActorIdleEventSchema = z.looseObject({
  ...base,
  type: z.literal('actor.idle'),
  actorId: z.string().min(1),
});

/**
 * Late enrichment of an already spawned agent, emitted at most once per agent when a second
 * source brings fields the first one lacked (e.g. the SubagentStart hook arrives before the
 * `.meta.json`, which carries the description, spawnDepth and parent). Only present fields apply.
 */
export const AgentUpdatedEventSchema = z.looseObject({
  ...base,
  type: z.literal('agent.updated'),
  agentId: z.string().min(1),
  parentAgentId: z.string().min(1).optional(),
  agentType: z.string().optional(),
  description: z.string().optional(),
  spawnDepth: z.number().int().min(1).optional(),
});

export const AgentFinishedEventSchema = z.looseObject({
  ...base,
  type: z.literal('agent.finished'),
  agentId: z.string().min(1),
});

export const SessionEndReasonSchema = z.enum(['hook', 'expired']);
export type SessionEndReason = z.infer<typeof SessionEndReasonSchema>;

export const SessionEndedEventSchema = z.looseObject({
  ...base,
  type: z.literal('session.ended'),
  sessionId: z.string().min(1),
  reason: SessionEndReasonSchema,
});

export const UsageEventSchema = z.looseObject({
  ...base,
  type: z.literal('usage'),
  actorId: z.string().min(1),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
});

export const OfficeEventSchema = z.discriminatedUnion('type', [
  SessionStartedEventSchema,
  SessionBoundEventSchema,
  AgentSpawnedEventSchema,
  AgentUpdatedEventSchema,
  ToolStartedEventSchema,
  ToolFinishedEventSchema,
  ActorThinkingEventSchema,
  ActorWaitingEventSchema,
  ActorIdleEventSchema,
  AgentFinishedEventSchema,
  SessionEndedEventSchema,
  UsageEventSchema,
]);

export type SessionStartedEvent = z.infer<typeof SessionStartedEventSchema>;
export type SessionBoundEvent = z.infer<typeof SessionBoundEventSchema>;
export type AgentSpawnedEvent = z.infer<typeof AgentSpawnedEventSchema>;
export type AgentUpdatedEvent = z.infer<typeof AgentUpdatedEventSchema>;
export type ToolStartedEvent = z.infer<typeof ToolStartedEventSchema>;
export type ToolFinishedEvent = z.infer<typeof ToolFinishedEventSchema>;
export type ActorThinkingEvent = z.infer<typeof ActorThinkingEventSchema>;
export type ActorWaitingEvent = z.infer<typeof ActorWaitingEventSchema>;
export type ActorIdleEvent = z.infer<typeof ActorIdleEventSchema>;
export type AgentFinishedEvent = z.infer<typeof AgentFinishedEventSchema>;
export type SessionEndedEvent = z.infer<typeof SessionEndedEventSchema>;
export type UsageEvent = z.infer<typeof UsageEventSchema>;

export type OfficeEvent = z.infer<typeof OfficeEventSchema>;
export type OfficeEventType = OfficeEvent['type'];

export const OFFICE_EVENT_TYPES = [
  'session.started',
  'session.bound',
  'agent.spawned',
  'agent.updated',
  'tool.started',
  'tool.finished',
  'actor.thinking',
  'actor.waiting',
  'actor.idle',
  'agent.finished',
  'session.ended',
  'usage',
] as const satisfies readonly OfficeEventType[];

/** Narrows an `OfficeEvent` to one of its variants by `type`. */
export type OfficeEventOf<T extends OfficeEventType> = Extract<OfficeEvent, { type: T }>;

/** Validates unknown input as an `OfficeEvent`. Never throws. */
export function parseOfficeEvent(input: unknown) {
  return OfficeEventSchema.safeParse(input);
}
