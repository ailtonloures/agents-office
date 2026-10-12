/** IPC channel names of the browser-approval bridge (shared by the main process and the preload). */
export const BROWSER_APPROVAL_CHANNELS = {
  pending: 'agents-office:browser-approval:pending',
  respond: 'agents-office:browser-approval:respond',
  /** Push (main -> window): a `BrowserApprovalRequest` that needs an answer. */
  request: 'agents-office:browser-approval:request',
  /** Push (main -> window): the id of a request that left the queue. */
  resolved: 'agents-office:browser-approval:resolved',
} as const;
