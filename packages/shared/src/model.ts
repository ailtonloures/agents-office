import { z } from 'zod';
import { IsoTimestampSchema } from './events';

/** Lifecycle status of an actor (a session's Tech Lead or a subagent). */
export const ActorStatusSchema = z.enum([
  'spawning',
  'thinking',
  'working',
  'waiting',
  'error',
  'idle',
  'finished',
  'ended',
]);
export type ActorStatus = z.infer<typeof ActorStatusSchema>;

/** IT profession of an actor: the session is the `tech-lead`, subagents derive it from their type. */
export const ProfessionSchema = z.enum([
  'tech-lead',
  'analyst',
  'architect',
  'developer',
  'qa',
  'support',
]);
export type Profession = z.infer<typeof ProfessionSchema>;

/** Accumulated token usage of an actor. */
export const UsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
});
export type Usage = z.infer<typeof UsageSchema>;

/** One tool invocation shown in an actor's recent steps (e.g. `Edit src/app.ts`). */
export const StepSchema = z.object({
  toolUseId: z.string().min(1),
  tool: z.string().min(1),
  summary: z.string(),
  ts: IsoTimestampSchema,
  /** Undefined while the tool is still running. */
  ok: z.boolean().optional(),
});
export type Step = z.infer<typeof StepSchema>;

export const AgentSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  parentAgentId: z.string().min(1).optional(),
  agentType: z.string(),
  description: z.string(),
  spawnDepth: z.number().int().min(1),
  profession: ProfessionSchema,
  status: ActorStatusSchema,
  currentTool: z.string().optional(),
  recentSteps: z.array(StepSchema),
  usage: UsageSchema,
  startedTs: IsoTimestampSchema,
  finishedTs: IsoTimestampSchema.optional(),
  /** Timestamp of the last event that touched this agent (clock events excluded). */
  lastActivityTs: IsoTimestampSchema.optional(),
});
export type Agent = z.infer<typeof AgentSchema>;

/**
 * A finished agent as kept in the Hall of Fame. `projectName` is captured when the agent
 * finishes, because its session (and project) may be gone by the time the mural is read.
 */
export const HallOfFameEntrySchema = AgentSchema.extend({
  projectName: z.string().optional(),
});
export type HallOfFameEntry = z.infer<typeof HallOfFameEntrySchema>;

export const SessionSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  profession: ProfessionSchema,
  status: ActorStatusSchema,
  currentTool: z.string().optional(),
  recentSteps: z.array(StepSchema),
  usage: UsageSchema,
  /** Timestamp of the last event that touched this session (clock events excluded). */
  lastActivityTs: IsoTimestampSchema.optional(),
  /** Ids of this session's subagents (see `OfficeModel.agents`), in spawn order. */
  agentIds: z.array(z.string()),
  lastPromptSummary: z.string().optional(),
  /**
   * Id of the desktop app terminal tab that runs this session (`AGENTS_OFFICE_TERMINAL_ID` seen by
   * the hook). Absent for sessions started outside the app.
   */
  terminalId: z.string().min(1).optional(),
});
export type Session = z.infer<typeof SessionSchema>;

/** A session started by the desktop app, as the bridge between a terminal tab and the office. */
export const AppSessionSchema = z.object({
  terminalId: z.string().min(1),
  cwd: z.string(),
  startedTs: IsoTimestampSchema,
  /** Claude Code session id, once the first hook linked it to the tab. */
  sessionId: z.string().min(1).optional(),
});
export type AppSession = z.infer<typeof AppSessionSchema>;

export const ProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  cwd: z.string(),
  /** Ids of this project's sessions (see `OfficeModel.sessions`), in start order. */
  sessionIds: z.array(z.string()),
  lastActivityTs: IsoTimestampSchema,
});
export type Project = z.infer<typeof ProjectSchema>;

export type ProjectId = Project['id'];
export type SessionId = Session['id'];
export type AgentId = Agent['id'];

/**
 * The whole office. Projects are rooms; sessions and agents are stored in flat maps keyed by id
 * so that events addressed by `actorId` resolve in O(1). `Project.sessionIds` and
 * `Session.agentIds` hold the hierarchy.
 */
export const OfficeModelSchema = z.object({
  projects: z.record(z.string(), ProjectSchema),
  sessions: z.record(z.string(), SessionSchema),
  agents: z.record(z.string(), AgentSchema),
  /** Snapshots of the last (up to 20) agents that finished, oldest first. */
  hallOfFame: z.array(HallOfFameEntrySchema),
});
export type OfficeModel = z.infer<typeof OfficeModelSchema>;

/** An empty office with no projects. */
export function createEmptyModel(): OfficeModel {
  return { projects: {}, sessions: {}, agents: {}, hallOfFame: [] };
}
