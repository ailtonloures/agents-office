import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  AGENT_NOTES_MAX,
  type Profession,
  type ProjectRoster,
  ProjectRosterSchema,
  ROSTER_MAX_ENTRIES,
  rosterEntryId,
} from '@agents-office/shared';
import { z } from 'zod';
import { conectar, desconectar, podeFalar, removerEntrada } from './connectionGraph';
import { backupCorrupt, writeJsonAtomic } from './profileLibrary';

const StoreSchema = z.object({ projects: z.record(z.string(), z.unknown()).default({}) });

const emptyRoster = (): ProjectRoster => ProjectRosterSchema.parse({});

/** Per-project rosters ("elenco") in one JSON file in the app data folder. */
export class RosterStore {
  private projects = new Map<string, ProjectRoster>();

  constructor(
    private readonly path: string,
    private readonly now: () => number = Date.now,
    private readonly newId: () => string = () => randomBytes(6).toString('hex'),
  ) {
    this.load();
  }

  private load(): void {
    let text: string;
    try {
      text = readFileSync(this.path, 'utf8');
    } catch {
      return; // first run
    }
    try {
      const raw = StoreSchema.parse(JSON.parse(text));
      for (const [cwd, value] of Object.entries(raw.projects)) {
        const parsed = ProjectRosterSchema.safeParse(value);
        if (parsed.success) this.projects.set(cwd, parsed.data);
      }
    } catch {
      this.projects.clear();
      backupCorrupt(this.path, this.now());
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    writeJsonAtomic(this.path, { projects: Object.fromEntries(this.projects) });
  }

  get(cwd: string): ProjectRoster {
    return structuredClone(this.projects.get(cwd) ?? emptyRoster());
  }

  private mutate(cwd: string, fn: (roster: ProjectRoster) => void): ProjectRoster {
    const roster = this.projects.get(cwd) ?? emptyRoster();
    fn(roster);
    this.projects.set(cwd, roster);
    this.persist();
    return structuredClone(roster);
  }

  /** Adds a library profile to the roster (idempotent). */
  addProfile(cwd: string, profileId: string, createdBy: string | null = null): ProjectRoster {
    return this.mutate(cwd, (roster) => {
      if (roster.entries.some((e) => rosterEntryId(e) === profileId)) return;
      if (roster.entries.length >= ROSTER_MAX_ENTRIES) throw new Error('Roster is full.');
      roster.entries.push({
        kind: 'profile',
        profileId,
        createdBy,
        connections: [],
        notes: '',
        reopen: true,
      });
    });
  }

  /** Adds an agent created inline (by an orchestrator); returns the roster and the new entry id. */
  addInline(
    cwd: string,
    input: {
      name: string;
      profession: Profession;
      instructions: string;
      task?: string;
      createdBy: string | null;
    },
  ): { roster: ProjectRoster; entryId: string } {
    const entryId = `agent-${this.newId()}`;
    const roster = this.mutate(cwd, (r) => {
      if (r.entries.length >= ROSTER_MAX_ENTRIES) throw new Error('Roster is full.');
      r.entries.push({
        kind: 'inline',
        id: entryId,
        name: input.name,
        profession: input.profession,
        instructions: input.instructions,
        ...(input.task ? { task: input.task } : {}),
        createdBy: input.createdBy,
        connections: [],
        notes: '',
        reopen: true,
      });
    });
    return { roster, entryId };
  }

  /** Removes an entry and every connection that pointed at it. */
  remove(cwd: string, entryId: string): ProjectRoster {
    return this.mutate(cwd, (roster) => removerEntrada(roster, entryId));
  }

  /** Connects two entries in both directions. */
  connect(cwd: string, a: string, b: string): ProjectRoster {
    return this.mutate(cwd, (roster) => conectar(roster, a, b));
  }

  /** Removes the connection between two entries in both directions. */
  disconnect(cwd: string, a: string, b: string): ProjectRoster {
    return this.mutate(cwd, (roster) => desconectar(roster, a, b));
  }

  /** True when the two entries of the project may talk to each other. */
  canTalk(cwd: string, a: string, b: string): boolean {
    return podeFalar(this.projects.get(cwd) ?? emptyRoster(), a, b);
  }

  setNotes(cwd: string, entryId: string, notes: string): ProjectRoster {
    if (notes.length > AGENT_NOTES_MAX) throw new Error('Notes too long.');
    return this.mutate(cwd, (roster) => {
      const entry = roster.entries.find((e) => rosterEntryId(e) === entryId);
      if (!entry) throw new Error(`Unknown roster entry: ${entryId}`);
      entry.notes = notes;
    });
  }

  /** Remembers whether the entry's session was open (true) or ended (false) for the next launch. */
  setReopen(cwd: string, entryId: string, reopen: boolean): void {
    const entry = this.projects.get(cwd)?.entries.find((e) => rosterEntryId(e) === entryId);
    if (!entry || entry.reopen === reopen) return;
    entry.reopen = reopen;
    this.persist();
  }

  setAutoReopen(cwd: string, autoReopen: boolean): ProjectRoster {
    return this.mutate(cwd, (roster) => {
      roster.autoReopen = autoReopen;
    });
  }

  /** Project paths that have a roster, in the order they were first created. */
  projectCwds(): string[] {
    return [...this.projects.keys()];
  }

  /** Project paths whose roster references the library profile. */
  projectsUsing(profileId: string): string[] {
    return [...this.projects.entries()]
      .filter(([, r]) => r.entries.some((e) => e.kind === 'profile' && e.profileId === profileId))
      .map(([cwd]) => cwd)
      .sort();
  }

  /** Drops a deleted profile from every roster. */
  purgeProfile(profileId: string): void {
    for (const cwd of this.projectsUsing(profileId)) this.remove(cwd, profileId);
  }
}
