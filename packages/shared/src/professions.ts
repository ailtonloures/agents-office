import { type Profession, ProfessionSchema } from './model';

/** A regex rule mapping agent types to a profession. */
export interface ProfessionRule {
  /** Regular expression source, matched against the agent type. */
  pattern: string;
  /** Regex flags (default `i`). */
  flags?: string;
  profession: Profession;
}

/** Contents of `professions.json` (every field optional): exact map plus regex rules. */
export interface ProfessionsOverride {
  exact?: Record<string, Profession>;
  rules?: ProfessionRule[];
  fallback?: Profession;
}

/** Resolved configuration handed to the reducer. */
export interface ProfessionsConfig {
  exact: Record<string, Profession>;
  rules: ProfessionRule[];
  fallback: Profession;
}

/** Profession of a session's own actor (the Tech Lead). */
export const SESSION_PROFESSION: Profession = 'tech-lead';

export const DEFAULT_PROFESSIONS: ProfessionsConfig = {
  exact: {
    Explore: 'analyst',
    Plan: 'architect',
    'general-purpose': 'developer',
    'claude-code-guide': 'support',
  },
  rules: [
    { pattern: 'review|judge|gate|qa|test', flags: 'i', profession: 'qa' },
    { pattern: 'guide|docs', flags: 'i', profession: 'support' },
  ],
  fallback: 'developer',
};

/**
 * Merges an override on top of the defaults: override entries win (exact map first, then
 * override rules before default rules, then the fallback).
 */
export function createProfessionsConfig(override: ProfessionsOverride = {}): ProfessionsConfig {
  return {
    exact: { ...DEFAULT_PROFESSIONS.exact, ...override.exact },
    rules: [...(override.rules ?? []), ...DEFAULT_PROFESSIONS.rules],
    fallback: override.fallback ?? DEFAULT_PROFESSIONS.fallback,
  };
}

/**
 * Validates the parsed JSON of a `professions.json`. Throws on a malformed file so the daemon
 * can report it; the caller does the file reading.
 */
export function parseProfessionsOverride(input: unknown): ProfessionsOverride {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('professions.json must be a JSON object');
  }
  const raw = input as Record<string, unknown>;
  const override: ProfessionsOverride = {};

  if (raw.exact !== undefined) {
    if (typeof raw.exact !== 'object' || raw.exact === null || Array.isArray(raw.exact)) {
      throw new Error('professions.json: "exact" must be an object');
    }
    override.exact = {};
    for (const [type, value] of Object.entries(raw.exact)) {
      override.exact[type] = parseProfession(value, `exact.${type}`);
    }
  }
  if (raw.rules !== undefined) {
    if (!Array.isArray(raw.rules)) throw new Error('professions.json: "rules" must be an array');
    override.rules = raw.rules.map((rule: unknown, index) => {
      const r = (rule ?? {}) as Record<string, unknown>;
      if (typeof r.pattern !== 'string') {
        throw new Error(`professions.json: rules[${index}].pattern must be a string`);
      }
      if (r.flags !== undefined && typeof r.flags !== 'string') {
        throw new Error(`professions.json: rules[${index}].flags must be a string`);
      }
      try {
        new RegExp(r.pattern, r.flags as string | undefined);
      } catch {
        throw new Error(`professions.json: rules[${index}] is not a valid regular expression`);
      }
      return {
        pattern: r.pattern,
        ...(r.flags !== undefined ? { flags: r.flags as string } : {}),
        profession: parseProfession(r.profession, `rules[${index}].profession`),
      };
    });
  }
  if (raw.fallback !== undefined) override.fallback = parseProfession(raw.fallback, 'fallback');
  return override;
}

function parseProfession(value: unknown, where: string): Profession {
  const parsed = ProfessionSchema.safeParse(value);
  if (!parsed.success) throw new Error(`professions.json: invalid profession at ${where}`);
  return parsed.data;
}

/** Resolves the profession of a subagent from its agent type. */
export function resolveProfession(
  agentType: string,
  config: ProfessionsConfig = DEFAULT_PROFESSIONS,
): Profession {
  const exact = Object.hasOwn(config.exact, agentType) ? config.exact[agentType] : undefined;
  if (exact !== undefined) return exact;
  for (const rule of config.rules) {
    if (new RegExp(rule.pattern, rule.flags ?? 'i').test(agentType)) return rule.profession;
  }
  return config.fallback;
}
