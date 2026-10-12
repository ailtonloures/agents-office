import type { BrowserApprovalBridge, BrowserApprovalRequest } from '@agents-office/shared';
import { BROWSER_APPROVAL_CHANNELS } from '../main/browserApprovalChannels';
import type { Invoke } from './bridge';
import type { Subscribe } from './terminalBridge';

/** Typed, minimal surface over IPC for the browser confirmation cards. */
export function createBrowserApprovalBridge(
  invoke: Invoke,
  subscribe: Subscribe,
): BrowserApprovalBridge {
  return {
    pending: () => invoke(BROWSER_APPROVAL_CHANNELS.pending) as Promise<BrowserApprovalRequest[]>,
    respond: (response) => invoke(BROWSER_APPROVAL_CHANNELS.respond, response) as Promise<boolean>,
    onRequest: (listener) =>
      subscribe(BROWSER_APPROVAL_CHANNELS.request, (p) => listener(p as BrowserApprovalRequest)),
    onResolved: (listener) =>
      subscribe(BROWSER_APPROVAL_CHANNELS.resolved, (p) => listener(p as string)),
  };
}
