import { SpawnApprovalResponseSchema } from '@agents-office/shared';
import { z } from 'zod';
import type { SpawnApprovals } from './agentBus/spawnApproval';
import type { IpcMainLike } from './ipc';
import { SPAWN_APPROVAL_CHANNELS } from './spawnApprovalChannels';

const noArgs = z.tuple([]);
const oneResponse = z.tuple([SpawnApprovalResponseSchema]);

export interface SpawnApprovalIpcDeps<E> {
  ipcMain: IpcMainLike<E>;
  approvals: Pick<SpawnApprovals, 'pending' | 'respond'>;
  /** Throws unless the event comes from the office window served by our own daemon. */
  trusted(event: E): void;
}

/** Registers the approval channels: sender checked, arguments parsed with zod. */
export function registerSpawnApprovalIpc<E>(deps: SpawnApprovalIpcDeps<E>): void {
  deps.ipcMain.handle(SPAWN_APPROVAL_CHANNELS.pending, (event: E, ...args: unknown[]) => {
    deps.trusted(event);
    if (!noArgs.safeParse(args).success) throw new Error('Invalid approval request.');
    return deps.approvals.pending();
  });
  deps.ipcMain.handle(SPAWN_APPROVAL_CHANNELS.respond, (event: E, ...args: unknown[]) => {
    deps.trusted(event);
    const parsed = oneResponse.safeParse(args);
    if (!parsed.success) throw new Error('Invalid approval response.');
    return deps.approvals.respond(parsed.data[0]);
  });
}
