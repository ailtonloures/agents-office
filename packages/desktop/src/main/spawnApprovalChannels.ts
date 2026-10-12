/** IPC channel names of the spawn-approval bridge (shared by the main process and the preload). */
export const SPAWN_APPROVAL_CHANNELS = {
  pending: 'agents-office:spawn-approval:pending',
  respond: 'agents-office:spawn-approval:respond',
  /** Push (main -> window): a `SpawnApprovalRequest` that needs an answer. */
  request: 'agents-office:spawn-approval:request',
  /** Push (main -> window): the id of a request that left the queue. */
  resolved: 'agents-office:spawn-approval:resolved',
} as const;
