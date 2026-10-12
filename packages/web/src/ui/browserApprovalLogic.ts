import type { BrowserApprovalRequest } from '@agents-office/shared';

export function dequeue(
  queue: readonly BrowserApprovalRequest[],
  id: string,
): BrowserApprovalRequest[] {
  return queue.filter((r) => r.id !== id);
}
