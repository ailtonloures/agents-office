import { isAbsolute } from 'node:path';
import type { CatalogProject, ProjectSessionInfo } from '@agents-office/shared';
import { z } from 'zod';
import type { IpcMainLike } from './ipc';
import type { ProjectCatalog } from './projectCatalog';
import { PROJECTS_CHANNELS } from './projectsChannels';

const cwd = z.string().min(1).max(4096);

export const projectsSchemas = {
  list: z.object({ known: z.array(cwd).max(500) }).strict(),
  cwd: z.object({ cwd }).strict(),
  favorite: z.object({ cwd, favorite: z.boolean() }).strict(),
};

export interface ProjectsIpcDeps<E> {
  ipcMain: IpcMainLike<E>;
  catalog: ProjectCatalog;
  /** Throws unless the event comes from the office window served by our own daemon. */
  trusted(event: E): void;
  /** The system folder picker (`dialog.showOpenDialog`); null when cancelled. */
  pickFolder(): Promise<string | null>;
}

/** Registers the projects channels: sender checked, payload parsed with zod, absolute paths only. */
export function registerProjectsIpc<E>(deps: ProjectsIpcDeps<E>): void {
  const { ipcMain, catalog } = deps;
  const guarded =
    <A extends unknown[], R>(fn: (...args: A) => R) =>
    (event: E, ...args: A): R => {
      deps.trusted(event);
      return fn(...args);
    };
  const absolute = (value: string): string => {
    if (!isAbsolute(value)) throw new Error('Invalid project path.');
    return value;
  };

  ipcMain.handle(
    PROJECTS_CHANNELS.list,
    guarded((known: unknown): CatalogProject[] => {
      const parsed = projectsSchemas.list.safeParse({ known: known ?? [] });
      return catalog.list(parsed.success ? parsed.data.known.filter(isAbsolute) : []);
    }),
  );
  ipcMain.handle(
    PROJECTS_CHANNELS.pickFolder,
    guarded(async (): Promise<CatalogProject | null> => {
      const chosen = await deps.pickFolder();
      return chosen ? (catalog.add(chosen) ?? null) : null;
    }),
  );
  ipcMain.handle(
    PROJECTS_CHANNELS.setFavorite,
    guarded((path: unknown, favorite: unknown): void => {
      const parsed = projectsSchemas.favorite.parse({ cwd: path, favorite });
      catalog.setFavorite(absolute(parsed.cwd), parsed.favorite);
    }),
  );
  ipcMain.handle(
    PROJECTS_CHANNELS.markUsed,
    guarded((path: unknown): void => {
      catalog.markUsed(absolute(projectsSchemas.cwd.parse({ cwd: path }).cwd));
    }),
  );
  ipcMain.handle(
    PROJECTS_CHANNELS.sessions,
    guarded((path: unknown): ProjectSessionInfo[] =>
      catalog.sessions(absolute(projectsSchemas.cwd.parse({ cwd: path }).cwd)),
    ),
  );
}
