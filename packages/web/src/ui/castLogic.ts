import {
  type AgentProfile,
  type AgentProfileDraft,
  type AgentsOfficeDesktop,
  type Appearance,
  isDefaultProfileId,
  isProfileNameTaken,
  type ManagedBridge,
  type ManagedChange,
  type ManagedSessionFailure,
  type ManagedSessionInfo,
  PROFILE_DESCRIPTION_MAX,
  PROFILE_INSTRUCTIONS_MAX,
  PROFILE_MODEL_MAX,
  PROFILE_NAME_MAX,
  type Profession,
  type ProfileRole,
  type ProfilesBridge,
  type ProjectRoster,
  type RosterEntry,
  rosterEntryId,
  type SpawnAuditEvent,
  type TerminalPermissionMode,
} from '@agents-office/shared';
import { APPEARANCE_RANGES } from '../characters/appearance';

// Pure logic of the cast ("Elenco") panel and the profile editor: form model and validation,
// random look, roster rows, and the messages shown for failures. No DOM: `castPanel.ts` renders
// it. Tested with Vitest.

/** Professions a profile can use as its visual base. */
export const BASE_OPTIONS: ReadonlyArray<{ base: Profession; label: string }> = [
  { base: 'tech-lead', label: 'Tech Lead' },
  { base: 'analyst', label: 'Analista' },
  { base: 'architect', label: 'Arquiteto' },
  { base: 'developer', label: 'Desenvolvedor' },
  { base: 'qa', label: 'QA' },
  { base: 'support', label: 'Suporte' },
];

export const SKIN_COLORS = ['#f6d3b3', '#f1c9a5', '#e0ac82', '#c68642', '#8d5524', '#5a3a22'];
export const HAIR_COLORS = [
  '#1c1410',
  '#3b2a1e',
  '#6b4423',
  '#a0522d',
  '#d9a441',
  '#c8c8c8',
  '#b5301f',
];
export const OUTFIT_COLORS = [
  '#3a6ea5',
  '#b04a4a',
  '#4f8f5b',
  '#8a5fb0',
  '#d08a2e',
  '#2f8f9d',
  '#7a7f8c',
  '#c25f8f',
];

export interface ProfileForm {
  name: string;
  description: string;
  instructions: string;
  permissionMode: TerminalPermissionMode;
  /** Empty = the CLI default model. */
  model: string;
  appearance: Appearance;
  /** Kept from the edited profile; the editor does not change it. */
  role: ProfileRole;
}

export type FormErrors = Partial<
  Record<'name' | 'description' | 'instructions' | 'model' | 'hairStyle', string>
>;

const pickFrom = <T>(list: readonly T[], random: () => number): T =>
  list[Math.min(list.length - 1, Math.floor(random() * list.length))] as T;

/** Random look ("sortear"): base, hair style and the three colors. */
export function randomAppearance(random: () => number = Math.random): Appearance {
  return {
    base: pickFrom(BASE_OPTIONS, random).base,
    hairStyle: Math.min(
      APPEARANCE_RANGES.hairStyle - 1,
      Math.floor(random() * APPEARANCE_RANGES.hairStyle),
    ),
    hairColor: pickFrom(HAIR_COLORS, random),
    skinColor: pickFrom(SKIN_COLORS, random),
    outfitColor: pickFrom(OUTFIT_COLORS, random),
  };
}

/** Blank form of a new profile, already with a random look so the preview is never empty. */
export function emptyForm(random: () => number = Math.random): ProfileForm {
  return {
    name: '',
    description: '',
    instructions: '',
    permissionMode: 'default',
    model: '',
    appearance: randomAppearance(random),
    role: 'padrao',
  };
}

export function formFromProfile(profile: AgentProfile): ProfileForm {
  return {
    name: profile.name,
    description: profile.description,
    instructions: profile.instructions,
    permissionMode: profile.permissionMode,
    model: profile.model ?? '',
    appearance: { ...profile.appearance },
    role: profile.role,
  };
}

/** Field errors (pt-BR) of the form; empty when it can be saved. */
export function validateForm(form: ProfileForm, otherNames: readonly string[]): FormErrors {
  const errors: FormErrors = {};
  const name = form.name.trim();
  if (name === '') errors.name = 'Informe um nome.';
  else if (name.length > PROFILE_NAME_MAX) {
    errors.name = `O nome deve ter no máximo ${PROFILE_NAME_MAX} caracteres.`;
  } else if (isProfileNameTaken(name, otherNames)) {
    errors.name = 'Já existe um perfil com esse nome.';
  }
  if (form.description.trim().length > PROFILE_DESCRIPTION_MAX) {
    errors.description = `A descrição deve ter no máximo ${PROFILE_DESCRIPTION_MAX} caracteres.`;
  }
  if (form.instructions.length > PROFILE_INSTRUCTIONS_MAX) {
    errors.instructions = `As instruções devem ter no máximo ${PROFILE_INSTRUCTIONS_MAX} caracteres.`;
  }
  if (form.model.trim().length > PROFILE_MODEL_MAX) {
    errors.model = `O modelo deve ter no máximo ${PROFILE_MODEL_MAX} caracteres.`;
  }
  return errors;
}

export function hasErrors(errors: FormErrors): boolean {
  return Object.keys(errors).length > 0;
}

/** What the editor sends to `profiles.create` / `profiles.update`. */
export function formToDraft(form: ProfileForm): AgentProfileDraft {
  const model = form.model.trim();
  return {
    name: form.name.trim(),
    description: form.description.trim(),
    appearance: { ...form.appearance },
    instructions: form.instructions,
    permissionMode: form.permissionMode,
    ...(model === '' ? {} : { model }),
    role: form.role,
  };
}

/** Names of the library profiles except the one being edited (uniqueness check). */
export function otherProfileNames(
  profiles: readonly AgentProfile[],
  editingId: string | undefined,
): string[] {
  return profiles.filter((profile) => profile.id !== editingId).map((profile) => profile.name);
}

// ---- Roster ----

export type CastState = 'running' | 'stopped' | 'failed' | 'missing';

export interface CastRow {
  entryId: string;
  name: string;
  /** Short description (profile) or profession (inline agent). */
  subtitle: string;
  kind: RosterEntry['kind'];
  state: CastState;
  /** Why the entry has no session (failed) or why it cannot start (missing). */
  message: string;
  notes: string;
  /** Terminal tab of the running session. */
  terminalId: string | undefined;
  /** The library profile; absent for inline agents and for missing profiles. */
  profile: AgentProfile | undefined;
  /** Name of the orchestrator that created the agent (inline agents only). */
  createdBy: string | undefined;
  /** Original task of a created agent (display only, never re-sent). */
  task: string | undefined;
}

/** One row per roster entry of `cwd`, joined with the library and the managed sessions. */
export function buildCastRows(
  cwd: string,
  roster: ProjectRoster,
  profiles: readonly AgentProfile[],
  change: ManagedChange,
): CastRow[] {
  const running = new Map<string, ManagedSessionInfo>();
  for (const info of change.sessions) if (info.cwd === cwd) running.set(info.entryId, info);
  const failures = new Map<string, ManagedSessionFailure>();
  for (const failure of change.failures)
    if (failure.cwd === cwd) failures.set(failure.entryId, failure);
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));

  const nameOf = (entryId: string): string | undefined => {
    const entry = roster.entries.find((e) => rosterEntryId(e) === entryId);
    if (!entry) return undefined;
    return entry.kind === 'inline' ? entry.name : byId.get(entry.profileId)?.name;
  };

  return roster.entries.map((entry): CastRow => {
    const entryId = rosterEntryId(entry);
    const session = running.get(entryId);
    const failure = failures.get(entryId);
    const creator = entry.createdBy ? nameOf(entry.createdBy) : undefined;
    const base = {
      entryId,
      kind: entry.kind,
      notes: entry.notes,
      createdBy: creator,
      task: entry.kind === 'inline' ? entry.task : undefined,
    };
    if (entry.kind === 'inline') {
      return {
        ...base,
        name: entry.name,
        subtitle: entry.profession,
        state: session ? 'running' : failure ? 'failed' : 'stopped',
        message: !session && failure ? startFailureMessage(failure) : '',
        terminalId: session?.terminalId,
        profile: undefined,
      };
    }
    const profile = byId.get(entry.profileId);
    if (!profile) {
      return {
        ...base,
        name: session?.name ?? entry.profileId,
        subtitle: '',
        state: 'missing',
        message: 'O perfil deste agente não existe mais. Remova-o do elenco.',
        terminalId: session?.terminalId,
        profile: undefined,
      };
    }
    return {
      ...base,
      name: profile.name,
      subtitle: profile.description,
      state: session ? 'running' : failure ? 'failed' : 'stopped',
      message: !session && failure ? startFailureMessage(failure) : '',
      terminalId: session?.terminalId,
      profile,
    };
  });
}

/** Library profiles that are not in the roster yet, in library order. */
export function availableProfiles(
  roster: ProjectRoster,
  profiles: readonly AgentProfile[],
): AgentProfile[] {
  const inRoster = new Set(roster.entries.map(rosterEntryId));
  return profiles.filter((profile) => !inRoster.has(profile.id));
}

export const STATE_LABELS: Record<CastState, string> = {
  running: 'em execução',
  stopped: 'parado',
  failed: 'falhou ao iniciar',
  missing: 'perfil ausente',
};

/** Clear message (pt-BR) for a session that could not start. */
export function startFailureMessage(
  failure: Pick<ManagedSessionFailure, 'code' | 'message'> & { cwd?: string },
): string {
  switch (failure.code) {
    case 'claude-not-found':
      return `Claude Code não encontrado. Instale o Claude Code ou defina o caminho (claudePath) no config.json do app. (${failure.message})`;
    case 'invalid-cwd':
      return `A pasta do projeto não existe ou não é válida${failure.cwd ? `: ${failure.cwd}` : ''}. Escolha outro projeto ou recrie a pasta. (${failure.message})`;
    case 'unknown-entry':
      return 'O perfil deste agente não existe mais. Remova-o do elenco.';
    case 'session-limit':
      return `Limite de sessões atingido. Encerre alguma sessão e tente de novo. (${failure.message})`;
    default:
      return failure.message;
  }
}

/** Confirmation text before deleting a profile; `usedBy` lists the projects whose roster has it. */
export function deleteProfileWarning(name: string, usedBy: readonly string[]): string {
  if (usedBy.length === 0) return `Apagar o perfil "${name}"?`;
  const where = usedBy.map((cwd) => `- ${cwd}`).join('\n');
  return `O perfil "${name}" está no elenco de ${usedBy.length} projeto(s):\n${where}\n\nApagar mesmo assim? Ele sai desses elencos e as sessões dele em execução são encerradas.`;
}

/** The default Tech Lead cannot be deleted. */
export function canDeleteProfile(profile: AgentProfile): boolean {
  return !isDefaultProfileId(profile.id);
}

/** Soft limit hint for the notes box (the main process enforces the real limit). */
export function notesCounter(notes: string, max: number): string {
  return `${notes.length}/${max}`;
}

// ---- Bridges ----

export interface CastBridges {
  profiles: ProfilesBridge;
  managed: ManagedBridge;
}

/** Both bridges, or undefined outside the desktop shell. */
export function castBridgesOf(win: object): CastBridges | undefined {
  const desktop = (win as { agentsOfficeDesktop?: Partial<AgentsOfficeDesktop> })
    .agentsOfficeDesktop;
  const profiles = desktop?.profiles;
  const managed = desktop?.managed;
  if (!profiles || typeof profiles.list !== 'function') return undefined;
  if (!managed || typeof managed.start !== 'function') return undefined;
  return { profiles, managed };
}

/** One checkbox of the "pode falar com" checklist. */
export interface LinkOption {
  entryId: string;
  name: string;
  connected: boolean;
}

/** True when the roster links the two entries (stored on either side; connections are symmetric). */
export function areConnected(roster: ProjectRoster, a: string, b: string): boolean {
  if (a === b) return false;
  const byId = new Map(roster.entries.map((e) => [rosterEntryId(e), e]));
  return !!(byId.get(a)?.connections.includes(b) || byId.get(b)?.connections.includes(a));
}

/** Every other agent of the roster with whether `entryId` may talk to it. */
export function linkOptions(
  roster: ProjectRoster,
  rows: readonly CastRow[],
  entryId: string,
): LinkOption[] {
  return rows
    .filter((row) => row.entryId !== entryId)
    .map((row) => ({
      entryId: row.entryId,
      name: row.name,
      connected: areConnected(roster, entryId, row.entryId),
    }));
}

/** Short summary shown on the toggle, e.g. "Pode falar com (2)". */
export function linksLabel(options: readonly LinkOption[]): string {
  return `Pode falar com (${options.filter((o) => o.connected).length})`;
}

// ---- Agents created by orchestrators (spec 074) ----

/** One line of the creation/dismissal log. */
export function auditLine(event: SpawnAuditEvent): string {
  const when = new Date(event.at);
  const stamp = Number.isNaN(when.getTime())
    ? event.at
    : when.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const who = event.orchestratorName ?? event.orchestratorId;
  const what =
    event.type === 'criado'
      ? `${who} criou ${event.agentName}`
      : event.by === 'usuario'
        ? `${event.agentName} (criado por ${who}) foi removido por você`
        : `${who} encerrou ${event.agentName}`;
  return `${stamp} · ${what}`;
}

/** Log shown newest first. */
export function auditNewestFirst(events: readonly SpawnAuditEvent[]): SpawnAuditEvent[] {
  return [...events].reverse();
}

/** Tab tooltips: the original task of each created agent, by terminal id. */
export function taskHints(sessions: readonly ManagedSessionInfo[]): Record<string, string> {
  const hints: Record<string, string> = {};
  for (const s of sessions) if (s.task) hints[s.terminalId] = `Tarefa original: ${s.task}`;
  return hints;
}
