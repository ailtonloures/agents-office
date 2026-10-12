import {
  type AgentProfile,
  DEFAULT_TECH_LEAD_PROFILE,
  type ProjectRoster,
  rosterEntryId,
} from '@agents-office/shared';
import type { ProfileLibrary } from '../profileLibrary';

/**
 * "Salvar como perfil": copies an agent created inline to the global library as a default-role
 * profile (never an orchestrator). The roster entry stays as it is; the copy is independent.
 */
export function promoteInlineAgent(
  deps: { roster: { get(cwd: string): ProjectRoster }; library: ProfileLibrary },
  cwd: string,
  entryId: string,
): AgentProfile {
  const entry = deps.roster.get(cwd).entries.find((e) => rosterEntryId(e) === entryId);
  if (entry?.kind !== 'inline') {
    throw new Error('Only agents created by an orchestrator can be saved as a profile.');
  }
  return deps.library.create({
    name: entry.name,
    description: 'Salvo a partir de um agente criado por um orquestrador.',
    appearance: { ...DEFAULT_TECH_LEAD_PROFILE.appearance, base: entry.profession },
    instructions: entry.instructions,
    permissionMode: 'default',
    role: 'padrao',
  });
}
