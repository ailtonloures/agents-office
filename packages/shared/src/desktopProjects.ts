// Contract of the projects bridge that the desktop shell exposes to the web app
// (`window.agentsOfficeDesktop.projects`): the catalog of folders where a terminal session can start.

export type ProjectSource = 'office' | 'history' | 'added';

export interface CatalogProject {
  /** Absolute, normalized directory. */
  cwd: string;
  /** Last path segment. */
  name: string;
  favorite: boolean;
  /** Last time a session was started here from the app (ISO), or null. */
  lastUsedAt: string | null;
  /** Last transcript activity in `~/.claude/projects` (ISO), or null. */
  lastActivityAt: string | null;
  sources: ProjectSource[];
}

/** A past Claude Code session of a project (a transcript on disk), for `claude --resume <id>`. */
export interface ProjectSessionInfo {
  id: string;
  modifiedAt: string;
  /** Start of the first user prompt, or null. */
  summary: string | null;
}

export interface ProjectsBridge {
  /** `known` are the cwds the office already shows (the web app has the model). */
  list(known?: string[]): Promise<CatalogProject[]>;
  /** Opens the system folder picker; the chosen folder joins the catalog. Null when cancelled. */
  pickFolder(): Promise<CatalogProject | null>;
  setFavorite(cwd: string, favorite: boolean): Promise<void>;
  /** Records that a session was started in `cwd` (recents). */
  markUsed(cwd: string): Promise<void>;
  /** Past sessions of the project, newest first. */
  sessions(cwd: string): Promise<ProjectSessionInfo[]>;
}
