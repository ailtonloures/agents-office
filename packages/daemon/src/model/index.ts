// The reducer and the profession rules live in `shared` so the web client folds events with the
// exact same code; re-exported here for the daemon's own imports.
export {
  createProfessionsConfig,
  DEFAULT_PROFESSIONS,
  HALL_OF_FAME_SIZE,
  type ProfessionRule,
  type ProfessionsConfig,
  type ProfessionsOverride,
  parseProfessionsOverride,
  RECENT_STEPS_LIMIT,
  type ReduceOptions,
  reduce,
  resolveProfession,
  SESSION_PROFESSION,
} from '@agents-office/shared';
export { DEFAULT_LIVENESS_CONFIG, type LivenessConfig, tick } from './liveness';
