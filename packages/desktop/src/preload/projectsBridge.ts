import type { CatalogProject, ProjectSessionInfo, ProjectsBridge } from '@agents-office/shared';
import { PROJECTS_CHANNELS } from '../main/projectsChannels';
import type { Invoke } from './bridge';

/** Typed, minimal surface over IPC for the project catalog. */
export function createProjectsBridge(invoke: Invoke): ProjectsBridge {
  return {
    list: (known) => invoke(PROJECTS_CHANNELS.list, known ?? []) as Promise<CatalogProject[]>,
    pickFolder: () => invoke(PROJECTS_CHANNELS.pickFolder) as Promise<CatalogProject | null>,
    setFavorite: (cwd, favorite) =>
      invoke(PROJECTS_CHANNELS.setFavorite, cwd, favorite) as Promise<void>,
    markUsed: (cwd) => invoke(PROJECTS_CHANNELS.markUsed, cwd) as Promise<void>,
    sessions: (cwd) => invoke(PROJECTS_CHANNELS.sessions, cwd) as Promise<ProjectSessionInfo[]>,
  };
}
