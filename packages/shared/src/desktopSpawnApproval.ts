// Contract of the spawn-approval bridge that the desktop shell exposes to the web app
// (`window.agentsOfficeDesktop.spawnApproval`): the card the user answers before an orchestrator
// creates an agent (spec 073).
import { z } from 'zod';
import { PROFILE_INSTRUCTIONS_MAX } from './desktopProfiles';
import type { Profession } from './model';

/** A creation waiting for the user's decision. */
export interface SpawnApprovalRequest {
  id: string;
  /** Project path. */
  cwd: string;
  orchestratorId: string;
  orchestratorName: string;
  name: string;
  profession: Profession;
  instructions: string;
  task?: string;
  /** ISO timestamp of the request. */
  createdAt: string;
}

/** The user's answer; `instructions` carries the edited text (approval only). */
export const SpawnApprovalResponseSchema = z.object({
  id: z.string().min(1).max(200),
  approved: z.boolean(),
  /** "Permitir sem perguntar" for this orchestrator in this project (approval only). */
  allowAlways: z.boolean().optional(),
  instructions: z.string().trim().min(1).max(PROFILE_INSTRUCTIONS_MAX).optional(),
});
export type SpawnApprovalResponse = z.infer<typeof SpawnApprovalResponseSchema>;

export interface SpawnApprovalBridge {
  /** Requests still waiting (the window may have been reloaded). */
  pending(): Promise<SpawnApprovalRequest[]>;
  /** Answers a request; false when it is not pending anymore. */
  respond(response: SpawnApprovalResponse): Promise<boolean>;
  /** A creation needs approval; returns unsubscribe. */
  onRequest(listener: (request: SpawnApprovalRequest) => void): () => void;
  /** A request left the queue (answered elsewhere or timed out); returns unsubscribe. */
  onResolved(listener: (id: string) => void): () => void;
}
