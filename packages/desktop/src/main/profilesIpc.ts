import { isAbsolute } from 'node:path';
import {
  AGENT_NOTES_MAX,
  type AgentProfile,
  AgentProfileSchema,
  type CommsStatus,
  type ProfileDeleteResult,
  type ProjectRoster,
  rosterEntryId,
  type SpawnAuditEvent,
} from '@agents-office/shared';
import { z } from 'zod';
import { promoteInlineAgent } from './agentBus/promoteAgent';
import type { IpcMainLike } from './ipc';
import type { ProfileLibrary } from './profileLibrary';
import { PROFILES_CHANNELS } from './profilesChannels';
import type { RosterStore } from './rosterStore';

const cwd = z.string().min(1).max(4096).refine(isAbsolute, 'Invalid project path.');
const id = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);

export const profilesSchemas = {
  // `id` is assigned/kept by the library, never taken from the renderer.
  profileInput: AgentProfileSchema.omit({ id: true }).partial({
    description: true,
    instructions: true,
    permissionMode: true,
    role: true,
  }),
  id,
  remove: z.object({ id, force: z.boolean().default(false) }).strict(),
  rosterEntry: z.object({ cwd, entryId: id }).strict(),
  link: z.object({ cwd, a: id, b: id }).strict(),
  mute: z.object({ cwd, entryId: id, muted: z.boolean() }).strict(),
  cwdOnly: z.object({ cwd }).strict(),
  notes: z.object({ cwd, entryId: id, notes: z.string().max(AGENT_NOTES_MAX) }).strict(),
  autoReopen: z.object({ cwd, autoReopen: z.boolean() }).strict(),
};

/** What the comms channels drive (implemented in `main.ts` over Messaging + CircuitBreaker). */
export interface CommsControl {
  status(cwd: string): CommsStatus;
  mute(cwd: string, entryId: string, muted: boolean): void;
  resume(cwd: string): void;
  stop(cwd: string): void;
}

/** Audit log of the agents created by orchestrators (spec 074). */
export interface AgentsAudit {
  history(cwd: string): SpawnAuditEvent[];
  /** A created agent was removed by the user. */
  removedByUser(cwd: string, entry: { id: string; name: string; createdBy: string | null }): void;
}

export interface ProfilesIpcDeps<E> {
  ipcMain: IpcMainLike<E>;
  library: ProfileLibrary;
  roster: RosterStore;
  comms: CommsControl;
  audit?: AgentsAudit;
  /** Throws unless the event comes from the office window served by our own daemon. */
  trusted(event: E): void;
}

/** Registers the profile/roster channels: sender checked, payloads parsed with zod. */
export function registerProfilesIpc<E>(deps: ProfilesIpcDeps<E>): void {
  const { ipcMain, library, roster, comms } = deps;
  const guarded =
    <A extends unknown[], R>(fn: (...args: A) => R) =>
    (event: E, ...args: A): R => {
      deps.trusted(event);
      return fn(...args);
    };

  ipcMain.handle(
    PROFILES_CHANNELS.list,
    guarded((): AgentProfile[] => library.list()),
  );
  ipcMain.handle(
    PROFILES_CHANNELS.create,
    guarded(
      (input: unknown): AgentProfile => library.create(profilesSchemas.profileInput.parse(input)),
    ),
  );
  ipcMain.handle(
    PROFILES_CHANNELS.update,
    guarded(
      (profileId: unknown, input: unknown): AgentProfile =>
        library.update(
          profilesSchemas.id.parse(profileId),
          profilesSchemas.profileInput.parse(input),
        ),
    ),
  );
  ipcMain.handle(
    PROFILES_CHANNELS.duplicate,
    guarded(
      (profileId: unknown): AgentProfile => library.duplicate(profilesSchemas.id.parse(profileId)),
    ),
  );
  ipcMain.handle(
    PROFILES_CHANNELS.remove,
    guarded((profileId: unknown, force: unknown): ProfileDeleteResult => {
      const parsed = profilesSchemas.remove.parse({ id: profileId, force: force ?? false });
      const result = library.remove(parsed.id, parsed.force);
      if (result.deleted) roster.purgeProfile(parsed.id);
      return result;
    }),
  );
  ipcMain.handle(
    PROFILES_CHANNELS.rosterGet,
    guarded((path: unknown): ProjectRoster => roster.get(cwd.parse(path))),
  );
  ipcMain.handle(
    PROFILES_CHANNELS.rosterAddProfile,
    guarded((path: unknown, profileId: unknown): ProjectRoster => {
      const parsed = profilesSchemas.rosterEntry.parse({ cwd: path, entryId: profileId });
      if (!library.get(parsed.entryId)) throw new Error(`Unknown profile: ${parsed.entryId}`);
      return roster.addProfile(parsed.cwd, parsed.entryId);
    }),
  );
  ipcMain.handle(
    PROFILES_CHANNELS.rosterRemove,
    guarded((path: unknown, entryId: unknown): ProjectRoster => {
      const parsed = profilesSchemas.rosterEntry.parse({ cwd: path, entryId });
      const entry = roster.get(parsed.cwd).entries.find((e) => rosterEntryId(e) === parsed.entryId);
      const result = roster.remove(parsed.cwd, parsed.entryId);
      if (entry?.kind === 'inline') {
        deps.audit?.removedByUser(parsed.cwd, {
          id: entry.id,
          name: entry.name,
          createdBy: entry.createdBy,
        });
      }
      return result;
    }),
  );
  ipcMain.handle(
    PROFILES_CHANNELS.rosterConnect,
    guarded((path: unknown, a: unknown, b: unknown): ProjectRoster => {
      const parsed = profilesSchemas.link.parse({ cwd: path, a, b });
      return roster.connect(parsed.cwd, parsed.a, parsed.b);
    }),
  );
  ipcMain.handle(
    PROFILES_CHANNELS.rosterDisconnect,
    guarded((path: unknown, a: unknown, b: unknown): ProjectRoster => {
      const parsed = profilesSchemas.link.parse({ cwd: path, a, b });
      return roster.disconnect(parsed.cwd, parsed.a, parsed.b);
    }),
  );
  ipcMain.handle(
    PROFILES_CHANNELS.rosterSetNotes,
    guarded((path: unknown, entryId: unknown, notes: unknown): ProjectRoster => {
      const parsed = profilesSchemas.notes.parse({ cwd: path, entryId, notes });
      return roster.setNotes(parsed.cwd, parsed.entryId, parsed.notes);
    }),
  );
  ipcMain.handle(
    PROFILES_CHANNELS.rosterSetAutoReopen,
    guarded((path: unknown, autoReopen: unknown): ProjectRoster => {
      const parsed = profilesSchemas.autoReopen.parse({ cwd: path, autoReopen });
      return roster.setAutoReopen(parsed.cwd, parsed.autoReopen);
    }),
  );

  ipcMain.handle(
    PROFILES_CHANNELS.agentsHistory,
    guarded((path: unknown): SpawnAuditEvent[] => deps.audit?.history(cwd.parse(path)) ?? []),
  );
  ipcMain.handle(
    PROFILES_CHANNELS.agentsSaveAsProfile,
    guarded((path: unknown, entryId: unknown): AgentProfile => {
      const parsed = profilesSchemas.rosterEntry.parse({ cwd: path, entryId });
      return promoteInlineAgent({ roster, library }, parsed.cwd, parsed.entryId);
    }),
  );

  ipcMain.handle(
    PROFILES_CHANNELS.commsStatus,
    guarded(
      (c: unknown): CommsStatus => comms.status(profilesSchemas.cwdOnly.parse({ cwd: c }).cwd),
    ),
  );
  ipcMain.handle(
    PROFILES_CHANNELS.commsMute,
    guarded((c: unknown, entryId: unknown, muted: unknown): CommsStatus => {
      const p = profilesSchemas.mute.parse({ cwd: c, entryId, muted });
      comms.mute(p.cwd, p.entryId, p.muted);
      return comms.status(p.cwd);
    }),
  );
  ipcMain.handle(
    PROFILES_CHANNELS.commsResume,
    guarded((c: unknown): CommsStatus => {
      const { cwd: project } = profilesSchemas.cwdOnly.parse({ cwd: c });
      comms.resume(project);
      return comms.status(project);
    }),
  );
  ipcMain.handle(
    PROFILES_CHANNELS.commsStop,
    guarded((c: unknown): CommsStatus => {
      const { cwd: project } = profilesSchemas.cwdOnly.parse({ cwd: c });
      comms.stop(project);
      return comms.status(project);
    }),
  );
}
