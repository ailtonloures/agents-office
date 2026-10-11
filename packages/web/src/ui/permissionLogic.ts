import type { PermissionRequest } from '@agents-office/shared';

// --- queue ----------------------------------------------------------------------------------

/** Oldest request first (the id breaks ties so the order is stable). */
export function sortQueue(requests: readonly PermissionRequest[]): PermissionRequest[] {
  return [...requests].sort((a, b) => a.ts.localeCompare(b.ts) || (a.id < b.id ? -1 : 1));
}

/** The queue after a `permission.snapshot`: exactly the daemon's pending list. */
export function applySnapshot(pending: readonly PermissionRequest[]): PermissionRequest[] {
  const seen = new Set<string>();
  return sortQueue(pending.filter((r) => !seen.has(r.id) && seen.add(r.id)));
}

/** The queue after a `permission.requested` (a repeated id is ignored). */
export function applyRequested(
  queue: readonly PermissionRequest[],
  request: PermissionRequest,
): PermissionRequest[] {
  if (queue.some((r) => r.id === request.id)) return [...queue];
  return sortQueue([...queue, request]);
}

/** The queue after a `permission.resolved` (unknown ids are fine: nothing changes). */
export function applyResolved(
  queue: readonly PermissionRequest[],
  id: string,
): PermissionRequest[] {
  return queue.filter((r) => r.id !== id);
}

/** The oldest pending request and how many wait behind it. */
export function queueView(queue: readonly PermissionRequest[]): {
  current: PermissionRequest | undefined;
  more: number;
} {
  return { current: queue[0], more: Math.max(0, queue.length - 1) };
}

/** Actors (Tech Leads and subagents) that have a request pending: they get the `!` balloon. */
export function pendingActorIds(queue: readonly PermissionRequest[]): Set<string> {
  return new Set(queue.map((r) => r.actorId));
}
