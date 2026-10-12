import type {
  ManagedBridge,
  ManagedSessionInfo,
  OfficeModel,
  Profession,
  ProjectRoster,
  RosterEntry,
} from '@agents-office/shared';
import { rosterEntryId } from '@agents-office/shared';
import { type Appearance, explicitAppearance } from '../characters/appearance';

// Pure helpers that tie managed sessions (started by the app for a roster entry) to the office
// model: which session is managed, what name and look its avatar gets, and whether a roster entry
// currently has anybody working. Sessions without a link stay external (read-only).

/** What the avatar of a managed session shows instead of the generic Tech Lead. */
export interface ManagedLook {
  entryId: string;
  /** Project path of the session (message visits are scoped by it). */
  cwd: string;
  /** Name of the profile (tag and dialogs). */
  name: string;
  /** Visual base: the profile's base, or the inline agent's profession. */
  profession: Profession | undefined;
  /** Explicit appearance; undefined keeps the hash-based look. */
  look: Appearance | undefined;
}

/** Look of one managed session. The hash traits use the entry id, so they are stable across runs. */
export function lookOf(info: ManagedSessionInfo): ManagedLook {
  const look = info.appearance ? explicitAppearance(info.entryId, info.appearance) : undefined;
  return {
    entryId: info.entryId,
    cwd: info.cwd,
    name: info.name,
    profession: look?.profession ?? info.profession ?? undefined,
    look,
  };
}

/**
 * Office session id -> look, for every session whose terminal tab runs a managed session. The link
 * is the terminal id the hook reported (`AGENTS_OFFICE_TERMINAL_ID`), the same one the tab uses.
 */
export function managedLooks(
  model: OfficeModel,
  managed: readonly ManagedSessionInfo[],
): Map<string, ManagedLook> {
  const byTerminal = new Map(managed.map((info) => [info.terminalId, info]));
  const result = new Map<string, ManagedLook>();
  for (const session of Object.values(model.sessions)) {
    if (session.terminalId === undefined) continue;
    const info = byTerminal.get(session.terminalId);
    if (info) result.set(session.id, lookOf(info));
  }
  return result;
}

/** True when the session runs in a terminal the app started for a roster entry. */
export function isManagedSession(
  model: OfficeModel,
  managed: readonly ManagedSessionInfo[],
  sessionId: string,
): boolean {
  const terminalId = model.sessions[sessionId]?.terminalId;
  return terminalId !== undefined && managed.some((info) => info.terminalId === terminalId);
}

export type EntryPresence = 'active' | 'absent';

/**
 * Presence of each roster entry of `cwd`: an entry without a running managed session is `absent`
 * (it is never shown as working), whatever the office model says.
 */
export function rosterPresence(
  cwd: string,
  roster: ProjectRoster,
  managed: readonly ManagedSessionInfo[],
): Map<string, EntryPresence> {
  const running = new Set(managed.filter((info) => info.cwd === cwd).map((info) => info.entryId));
  const result = new Map<string, EntryPresence>();
  for (const entry of roster.entries) {
    const id = rosterEntryId(entry as RosterEntry);
    result.set(id, running.has(id) ? 'active' : 'absent');
  }
  return result;
}

/** Registry key holding the current `ManagedSessionInfo[]` for the scene (it may boot later). */
export const REGISTRY_MANAGED = 'managedSessions';

/** The managed-sessions bridge of the desktop shell, or undefined outside it. */
export function managedBridgeOf(win: object): ManagedBridge | undefined {
  const managed = (win as { agentsOfficeDesktop?: { managed?: ManagedBridge } }).agentsOfficeDesktop
    ?.managed;
  return managed && typeof managed.list === 'function' ? managed : undefined;
}
