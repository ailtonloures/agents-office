import type { SpawnApprovalBridge, SpawnApprovalRequest } from '@agents-office/shared';
import { SPAWN_APPROVAL_CHANNELS } from '../main/spawnApprovalChannels';
import type { Invoke } from './bridge';
import type { Subscribe } from './terminalBridge';

/** Typed, minimal surface over IPC for the creation-approval card. */
export function createSpawnApprovalBridge(
  invoke: Invoke,
  subscribe: Subscribe,
): SpawnApprovalBridge {
  return {
    pending: () => invoke(SPAWN_APPROVAL_CHANNELS.pending) as Promise<SpawnApprovalRequest[]>,
    respond: (response) => invoke(SPAWN_APPROVAL_CHANNELS.respond, response) as Promise<boolean>,
    onRequest: (listener) =>
      subscribe(SPAWN_APPROVAL_CHANNELS.request, (payload) =>
        listener(payload as SpawnApprovalRequest),
      ),
    onResolved: (listener) =>
      subscribe(SPAWN_APPROVAL_CHANNELS.resolved, (payload) => listener(payload as string)),
  };
}
