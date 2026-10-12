import type {
  AgentProfile,
  CommsStatus,
  ProfileDeleteResult,
  ProfilesBridge,
  ProjectRoster,
  SpawnAuditEvent,
} from '@agents-office/shared';
import { PROFILES_CHANNELS } from '../main/profilesChannels';
import type { Invoke } from './bridge';

/** Typed, minimal surface over IPC for the profile library and project rosters. */
export function createProfilesBridge(invoke: Invoke): ProfilesBridge {
  const roster = (channel: string, ...args: unknown[]) =>
    invoke(channel, ...args) as Promise<ProjectRoster>;
  return {
    list: () => invoke(PROFILES_CHANNELS.list) as Promise<AgentProfile[]>,
    create: (input) => invoke(PROFILES_CHANNELS.create, input) as Promise<AgentProfile>,
    update: (id, input) => invoke(PROFILES_CHANNELS.update, id, input) as Promise<AgentProfile>,
    duplicate: (id) => invoke(PROFILES_CHANNELS.duplicate, id) as Promise<AgentProfile>,
    remove: (id, force) =>
      invoke(PROFILES_CHANNELS.remove, id, force ?? false) as Promise<ProfileDeleteResult>,
    agents: {
      history: (cwd) => invoke(PROFILES_CHANNELS.agentsHistory, cwd) as Promise<SpawnAuditEvent[]>,
      saveAsProfile: (cwd, entryId) =>
        invoke(PROFILES_CHANNELS.agentsSaveAsProfile, cwd, entryId) as Promise<AgentProfile>,
    },
    comms: {
      status: (cwd) => invoke(PROFILES_CHANNELS.commsStatus, cwd) as Promise<CommsStatus>,
      mute: (cwd, entryId, muted) =>
        invoke(PROFILES_CHANNELS.commsMute, cwd, entryId, muted) as Promise<CommsStatus>,
      resume: (cwd) => invoke(PROFILES_CHANNELS.commsResume, cwd) as Promise<CommsStatus>,
      stop: (cwd) => invoke(PROFILES_CHANNELS.commsStop, cwd) as Promise<CommsStatus>,
    },
    roster: {
      get: (cwd) => roster(PROFILES_CHANNELS.rosterGet, cwd),
      addProfile: (cwd, profileId) => roster(PROFILES_CHANNELS.rosterAddProfile, cwd, profileId),
      remove: (cwd, entryId) => roster(PROFILES_CHANNELS.rosterRemove, cwd, entryId),
      connect: (cwd, a, b) => roster(PROFILES_CHANNELS.rosterConnect, cwd, a, b),
      disconnect: (cwd, a, b) => roster(PROFILES_CHANNELS.rosterDisconnect, cwd, a, b),
      setNotes: (cwd, entryId, notes) =>
        roster(PROFILES_CHANNELS.rosterSetNotes, cwd, entryId, notes),
      setAutoReopen: (cwd, autoReopen) =>
        roster(PROFILES_CHANNELS.rosterSetAutoReopen, cwd, autoReopen),
    },
  };
}
