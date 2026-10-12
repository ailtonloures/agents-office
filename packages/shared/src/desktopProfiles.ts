// Contracts of agent profiles (global library), appearance and per-project rosters ("elenco").
// Validated with zod: the desktop main process parses what it reads from disk and what the renderer sends.

import { z } from 'zod';
import { TERMINAL_PERMISSION_MODES } from './desktopTerminal';
import { type Profession, ProfessionSchema } from './model';

/** Limits shared by the main process, the renderer and the Agent Bus tools. */
export const PROFILE_NAME_MAX = 40;
export const PROFILE_DESCRIPTION_MAX = 200;
export const PROFILE_INSTRUCTIONS_MAX = 20_000;
export const PROFILE_MODEL_MAX = 100;
export const AGENT_NOTES_MAX = 8_000;
export const HAIR_STYLE_MAX = 31;
export const ROSTER_MAX_ENTRIES = 50;
export const ROSTER_MAX_CONNECTIONS = 50;
/** Max length of the initial task an orchestrator gives a spawned agent. */
export const SPAWN_TASK_MAX = 4_000;

/** Id of the built-in default profile (the Tech Lead). Immutable. */
export const TECH_LEAD_PROFILE_ID = 'tech-lead';

export const PROFILE_ROLES = ['padrao', 'orquestrador'] as const;
export const ProfileRoleSchema = z.enum(PROFILE_ROLES);
export type ProfileRole = z.infer<typeof ProfileRoleSchema>;

export const ProfilePermissionModeSchema = z.enum(TERMINAL_PERMISSION_MODES);

const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'expected #rrggbb');
const ProfileIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, 'invalid id');
/** Display name: trimmed, 1..PROFILE_NAME_MAX characters. */
export const ProfileNameSchema = z.string().trim().min(1).max(PROFILE_NAME_MAX);

/** Avatar look: visual base (an existing profession), hair style index and colors. */
export const AppearanceSchema = z.object({
  base: ProfessionSchema,
  hairStyle: z.number().int().min(0).max(HAIR_STYLE_MAX).default(0),
  hairColor: HexColorSchema,
  skinColor: HexColorSchema,
  outfitColor: HexColorSchema,
});
export type Appearance = z.infer<typeof AppearanceSchema>;

export const AgentProfileSchema = z.object({
  id: ProfileIdSchema,
  name: ProfileNameSchema,
  description: z.string().trim().max(PROFILE_DESCRIPTION_MAX).default(''),
  appearance: AppearanceSchema,
  instructions: z.string().max(PROFILE_INSTRUCTIONS_MAX).default(''),
  permissionMode: ProfilePermissionModeSchema.default('default'),
  model: z.string().trim().min(1).max(PROFILE_MODEL_MAX).optional(),
  role: ProfileRoleSchema.default('padrao'),
});
export type AgentProfile = z.infer<typeof AgentProfileSchema>;
/** Input shape (before defaults), e.g. what the editor sends. */
export type AgentProfileInput = z.input<typeof AgentProfileSchema>;
/** Editor payload: the id is assigned by the library, never sent. */
export type AgentProfileDraft = Omit<AgentProfileInput, 'id'>;

const NotesSchema = z.string().max(AGENT_NOTES_MAX).default('');
/**
 * True only while the session is open (set when it starts, cleared when it ends on purpose).
 * Entries written before this field existed default to false so they never reopen as ghosts.
 */
const ReopenSchema = z.boolean().default(false);
const ConnectionsSchema = z.array(ProfileIdSchema).max(ROSTER_MAX_CONNECTIONS).default([]);

/** Roster entry that references a profile of the global library. */
export const RosterProfileEntrySchema = z.object({
  kind: z.literal('profile'),
  profileId: ProfileIdSchema,
  /** Entry id of the creator (orchestrator) or null when added by the user. */
  createdBy: ProfileIdSchema.nullable().default(null),
  /** Entry ids this agent may talk to. */
  connections: ConnectionsSchema,
  notes: NotesSchema,
  reopen: ReopenSchema,
});
export type RosterProfileEntry = z.infer<typeof RosterProfileEntrySchema>;

/** Roster entry of an agent created inline (by an orchestrator); not part of the library. */
export const RosterInlineEntrySchema = z.object({
  kind: z.literal('inline'),
  id: ProfileIdSchema,
  name: ProfileNameSchema,
  profession: ProfessionSchema,
  instructions: z.string().max(PROFILE_INSTRUCTIONS_MAX).default(''),
  /** Initial task given at creation; shown to the user, never re-sent on reopen. */
  task: z.string().max(SPAWN_TASK_MAX).optional(),
  createdBy: ProfileIdSchema.nullable().default(null),
  connections: ConnectionsSchema,
  notes: NotesSchema,
  reopen: ReopenSchema,
});
export type RosterInlineEntry = z.infer<typeof RosterInlineEntrySchema>;

export const RosterEntrySchema = z.discriminatedUnion('kind', [
  RosterProfileEntrySchema,
  RosterInlineEntrySchema,
]);
export type RosterEntry = z.infer<typeof RosterEntrySchema>;

/** Roster of one project: active entries plus the auto-reopen switch. */
export const ProjectRosterSchema = z.object({
  entries: z.array(RosterEntrySchema).max(ROSTER_MAX_ENTRIES).default([]),
  autoReopen: z.boolean().default(true),
});
export type ProjectRoster = z.infer<typeof ProjectRosterSchema>;

/** Id by which a roster entry is addressed: the profile id or the inline agent id. */
export function rosterEntryId(entry: RosterEntry): string {
  return entry.kind === 'profile' ? entry.profileId : entry.id;
}

/** Case-insensitive, trimmed name key used to enforce unique names. */
export function normalizeProfileName(name: string): string {
  return name.trim().toLocaleLowerCase();
}

/** True when `name` collides with any of `existing` (case-insensitive). */
export function isProfileNameTaken(name: string, existing: readonly string[]): boolean {
  const key = normalizeProfileName(name);
  return existing.some((n) => normalizeProfileName(n) === key);
}

/** Built-in default profile. Editable (name, look, instructions, ...) but never its id or role. */
export const DEFAULT_TECH_LEAD_PROFILE: AgentProfile = Object.freeze({
  id: TECH_LEAD_PROFILE_ID,
  name: 'Tech Lead',
  description: 'Default agent of the office.',
  appearance: Object.freeze({
    base: 'tech-lead' as Profession,
    hairStyle: 0,
    hairColor: '#3b2a1e',
    skinColor: '#f1c9a5',
    outfitColor: '#3a6ea5',
  }),
  instructions: '',
  permissionMode: 'default' as const,
  role: 'padrao' as const,
}) as AgentProfile;

/** True for the built-in profile id (cannot be deleted nor change id/role). */
export function isDefaultProfileId(id: string): boolean {
  return id === TECH_LEAD_PROFILE_ID;
}

/** Applies an edit to a profile keeping the immutable fields of the built-in Tech Lead. */
export function enforceProfileInvariants(profile: AgentProfile): AgentProfile {
  if (!isDefaultProfileId(profile.id)) return profile;
  return { ...profile, id: TECH_LEAD_PROFILE_ID, role: 'padrao' };
}

/** Result of deleting a profile from the library. */
export interface ProfileDeleteResult {
  deleted: boolean;
  /** Project paths whose roster references the profile (when not deleted, they block the delete). */
  usedBy: string[];
}

/** Agent-to-agent communication safety state of a project (spec 069). */
export interface CommsStatus {
  /** Roster entry ids muted: they neither send nor receive messages. */
  mutedEntryIds: string[];
  /** Deliveries are paused because the hop limit was reached. */
  paused: boolean;
  /** Messages exchanged since the user last typed in a terminal of the project. */
  hops: number;
  hopLimit: number;
}

/** One creation/dismissal of an agent made by an orchestrator (or removed by the user). */
export interface SpawnAuditEvent {
  type: 'criado' | 'encerrado';
  cwd: string;
  orchestratorId: string;
  /** Display name of the creator at the time of the event. */
  orchestratorName?: string;
  agentId: string;
  agentName: string;
  at: string;
  /** Who ended the agent; absent on creations and on dismissals by the orchestrator. */
  by?: 'usuario';
}

/** Bridge (`window.agentsOfficeDesktop.profiles`) over the profile library and project rosters. */
export interface ProfilesBridge {
  list(): Promise<AgentProfile[]>;
  create(input: AgentProfileDraft): Promise<AgentProfile>;
  update(id: string, input: AgentProfileDraft): Promise<AgentProfile>;
  duplicate(id: string): Promise<AgentProfile>;
  /** Without `force`, a profile in use is kept and the affected projects are returned. */
  remove(id: string, force?: boolean): Promise<ProfileDeleteResult>;
  /** Agents created by orchestrators: audit log and promotion to the global library. */
  agents: {
    /** Creations and dismissals of the project, oldest first. */
    history(cwd: string): Promise<SpawnAuditEvent[]>;
    /** Copies an inline agent to the library as a default-role profile. */
    saveAsProfile(cwd: string, entryId: string): Promise<AgentProfile>;
  };
  comms: {
    status(cwd: string): Promise<CommsStatus>;
    mute(cwd: string, entryId: string, muted: boolean): Promise<CommsStatus>;
    /** "Continuar": resumes paused deliveries. */
    resume(cwd: string): Promise<CommsStatus>;
    /** "Encerrar": drops waiting messages and resumes. */
    stop(cwd: string): Promise<CommsStatus>;
  };
  roster: {
    get(cwd: string): Promise<ProjectRoster>;
    addProfile(cwd: string, profileId: string): Promise<ProjectRoster>;
    remove(cwd: string, entryId: string): Promise<ProjectRoster>;
    /** Connects two roster entries in both directions. */
    connect(cwd: string, a: string, b: string): Promise<ProjectRoster>;
    disconnect(cwd: string, a: string, b: string): Promise<ProjectRoster>;
    setNotes(cwd: string, entryId: string, notes: string): Promise<ProjectRoster>;
    setAutoReopen(cwd: string, autoReopen: boolean): Promise<ProjectRoster>;
  };
}
