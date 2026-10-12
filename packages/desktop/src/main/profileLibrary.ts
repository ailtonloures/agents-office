import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  type AgentProfile,
  type AgentProfileDraft,
  AgentProfileSchema,
  DEFAULT_TECH_LEAD_PROFILE,
  enforceProfileInvariants,
  isDefaultProfileId,
  isProfileNameTaken,
  PROFILE_NAME_MAX,
  type ProfileDeleteResult,
} from '@agents-office/shared';

export interface ProfileLibraryOptions {
  /** Folder with one `<id>.json` per profile. */
  dir: string;
  /** Project paths whose roster references a profile (see RosterStore.projectsUsing). */
  usage?: (profileId: string) => string[];
  now?: () => number;
  random?: () => number;
}

/** Atomic JSON write (tmp + rename), like AppConfigStore. */
export function writeJsonAtomic(path: string, value: unknown): void {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, path);
}

/** Moves an unreadable file aside (`.corrupt-<ts>`) so the store starts clean without losing it. */
export function backupCorrupt(path: string, now: number): void {
  try {
    renameSync(path, `${path}.corrupt-${now}`);
  } catch {
    /* best effort */
  }
}

function slug(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base || 'perfil';
}

/** Global library of agent profiles: one JSON file per profile, the Tech Lead always present. */
export class ProfileLibrary {
  private readonly profiles = new Map<string, AgentProfile>();
  private readonly now: () => number;
  private readonly random: () => number;

  constructor(private readonly options: ProfileLibraryOptions) {
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.load();
  }

  private file(id: string): string {
    return join(this.options.dir, `${id}.json`);
  }

  private load(): void {
    mkdirSync(this.options.dir, { recursive: true });
    for (const name of readdirSync(this.options.dir)) {
      if (!name.endsWith('.json')) continue;
      const path = join(this.options.dir, name);
      try {
        const parsed = AgentProfileSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
        if (`${parsed.id}.json` !== name) throw new Error('id does not match the file name');
        this.profiles.set(parsed.id, enforceProfileInvariants(parsed));
      } catch {
        backupCorrupt(path, this.now());
      }
    }
    if (!this.profiles.has(DEFAULT_TECH_LEAD_PROFILE.id)) {
      const seed = structuredClone(DEFAULT_TECH_LEAD_PROFILE);
      this.profiles.set(seed.id, seed);
      writeJsonAtomic(this.file(seed.id), seed);
    }
  }

  list(): AgentProfile[] {
    return [...this.profiles.values()]
      .sort((a, b) => {
        if (isDefaultProfileId(a.id) !== isDefaultProfileId(b.id)) {
          return isDefaultProfileId(a.id) ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      })
      .map((p) => structuredClone(p));
  }

  get(id: string): AgentProfile | undefined {
    const found = this.profiles.get(id);
    return found ? structuredClone(found) : undefined;
  }

  private assertNameFree(name: string, exceptId?: string): void {
    const others = [...this.profiles.values()].filter((p) => p.id !== exceptId).map((p) => p.name);
    if (isProfileNameTaken(name, others)) throw new Error(`Profile name already in use: ${name}`);
  }

  private newId(name: string): string {
    const base = slug(name);
    let id = base;
    while (this.profiles.has(id) || existsSync(this.file(id))) {
      id = `${base}-${Math.floor(this.random() * 0xffffff)
        .toString(36)
        .padStart(4, '0')}`;
    }
    return id;
  }

  create(input: AgentProfileDraft): AgentProfile {
    const draft = AgentProfileSchema.parse({ ...input, id: this.newId(String(input.name ?? '')) });
    this.assertNameFree(draft.name);
    const profile = enforceProfileInvariants(draft);
    this.save(profile);
    return structuredClone(profile);
  }

  update(id: string, input: AgentProfileDraft): AgentProfile {
    if (!this.profiles.has(id)) throw new Error(`Unknown profile: ${id}`);
    const parsed = AgentProfileSchema.parse({ ...input, id });
    this.assertNameFree(parsed.name, id);
    const profile = enforceProfileInvariants(parsed);
    this.save(profile);
    return structuredClone(profile);
  }

  duplicate(id: string): AgentProfile {
    const source = this.profiles.get(id);
    if (!source) throw new Error(`Unknown profile: ${id}`);
    const suffix = ' (cópia)';
    const taken = [...this.profiles.values()].map((p) => p.name);
    let name = `${source.name.slice(0, PROFILE_NAME_MAX - suffix.length)}${suffix}`;
    for (let n = 2; isProfileNameTaken(name, taken); n++) {
      const tail = `${suffix} ${n}`;
      name = `${source.name.slice(0, PROFILE_NAME_MAX - tail.length)}${tail}`;
    }
    const { id: _id, ...rest } = structuredClone(source);
    // The copy is a regular profile, even when the source is the built-in one.
    return this.create({ ...rest, name });
  }

  /** The Tech Lead cannot be deleted. A profile in use is kept unless `force`; `usedBy` lists the projects. */
  remove(id: string, force = false): ProfileDeleteResult {
    if (isDefaultProfileId(id)) throw new Error('The default profile cannot be deleted.');
    if (!this.profiles.has(id)) return { deleted: false, usedBy: [] };
    const usedBy = this.options.usage?.(id) ?? [];
    if (usedBy.length > 0 && !force) return { deleted: false, usedBy };
    this.profiles.delete(id);
    try {
      unlinkSync(this.file(id));
    } catch {
      /* already gone */
    }
    return { deleted: true, usedBy };
  }

  private save(profile: AgentProfile): void {
    mkdirSync(this.options.dir, { recursive: true });
    writeJsonAtomic(this.file(profile.id), profile);
    this.profiles.set(profile.id, profile);
  }
}
