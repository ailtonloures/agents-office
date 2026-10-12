import { BrowserApprovalResponseSchema } from '@agents-office/shared';
import { z } from 'zod';
import { BROWSER_APPROVAL_CHANNELS } from './browserApprovalChannels';
import type { BrowserApprovals } from './browserApprovals';
import type { IpcMainLike } from './ipc';

const noArgs = z.tuple([]);
const oneResponse = z.tuple([BrowserApprovalResponseSchema]);

export interface BrowserApprovalIpcDeps<E> {
  ipcMain: IpcMainLike<E>;
  approvals: Pick<BrowserApprovals, 'pending' | 'respond'>;
  /** Throws unless the event comes from the office window served by our own daemon. */
  trusted(event: E): void;
}

export function registerBrowserApprovalIpc<E>(deps: BrowserApprovalIpcDeps<E>): void {
  deps.ipcMain.handle(BROWSER_APPROVAL_CHANNELS.pending, (event: E, ...args: unknown[]) => {
    deps.trusted(event);
    if (!noArgs.safeParse(args).success) throw new Error('Invalid approval request.');
    return deps.approvals.pending();
  });
  deps.ipcMain.handle(BROWSER_APPROVAL_CHANNELS.respond, (event: E, ...args: unknown[]) => {
    deps.trusted(event);
    const parsed = oneResponse.safeParse(args);
    if (!parsed.success) throw new Error('Invalid approval response.');
    return deps.approvals.respond(parsed.data[0]);
  });
}
