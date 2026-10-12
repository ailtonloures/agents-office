import type {
  AgentsOfficeDesktop,
  BrowserApprovalBridge,
  SpawnApprovalBridge,
  SpawnApprovalRequest,
  SpawnApprovalResponse,
} from '@agents-office/shared';
import { PROFILE_INSTRUCTIONS_MAX } from '@agents-office/shared';

/** The approval bridge exposed by the desktop shell; undefined in a plain browser (no card). */
export function spawnApprovalBridgeOf(win: object): SpawnApprovalBridge | undefined {
  const desktop = (win as { agentsOfficeDesktop?: unknown }).agentsOfficeDesktop as
    | Partial<AgentsOfficeDesktop>
    | undefined;
  const bridge = desktop?.spawnApproval;
  return bridge &&
    typeof bridge.pending === 'function' &&
    typeof bridge.respond === 'function' &&
    typeof bridge.onRequest === 'function' &&
    typeof bridge.onResolved === 'function'
    ? bridge
    : undefined;
}

/** Adds a request to the queue (no duplicates, oldest first). */
export function enqueue(
  queue: readonly SpawnApprovalRequest[],
  request: SpawnApprovalRequest,
): SpawnApprovalRequest[] {
  return queue.some((r) => r.id === request.id) ? [...queue] : [...queue, request];
}

export function dequeue(
  queue: readonly SpawnApprovalRequest[],
  id: string,
): SpawnApprovalRequest[] {
  return queue.filter((r) => r.id !== id);
}

/** Whether the edited instructions can be sent (non-empty, within the profile limit). */
export function instructionsValid(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length > 0 && trimmed.length <= PROFILE_INSTRUCTIONS_MAX;
}

/**
 * The answer for a card. Approval carries the edited instructions only when they changed, and
 * "allow without asking" only when ticked; a denial carries neither.
 */
export function buildResponse(
  request: SpawnApprovalRequest,
  input: { approved: boolean; instructions: string; allowAlways: boolean },
): SpawnApprovalResponse {
  if (!input.approved) return { id: request.id, approved: false };
  const edited = input.instructions.trim();
  return {
    id: request.id,
    approved: true,
    ...(input.allowAlways ? { allowAlways: true } : {}),
    ...(edited !== request.instructions ? { instructions: edited } : {}),
  };
}

/** The browser-approval bridge of the desktop shell; undefined in a plain browser or an older shell. */
export function browserApprovalBridgeOf(win: object): BrowserApprovalBridge | undefined {
  const desktop = (win as { agentsOfficeDesktop?: unknown }).agentsOfficeDesktop as
    | Partial<AgentsOfficeDesktop>
    | undefined;
  const bridge = desktop?.browserApproval;
  return bridge &&
    typeof bridge.pending === 'function' &&
    typeof bridge.respond === 'function' &&
    typeof bridge.onRequest === 'function' &&
    typeof bridge.onResolved === 'function'
    ? bridge
    : undefined;
}
