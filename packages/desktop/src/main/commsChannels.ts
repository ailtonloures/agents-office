/** IPC channel names of the communication-events bridge (shared by the main process and the preload). */
export const COMMS_CHANNELS = {
  history: 'agents-office:comms:history',
  /** Push (main -> window): a `CommEvent` on every message state change. */
  event: 'agents-office:comms:event',
} as const;
