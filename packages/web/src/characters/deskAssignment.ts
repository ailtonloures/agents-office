import type { Desk } from '../world/roomLayout';

const distance = (a: Desk, b: Desk): number =>
  Math.abs(a.tile.x - b.tile.x) + Math.abs(a.tile.y - b.tile.y);

/**
 * Stable desk allocation for subagents. Tech Leads sit at the desk bound to their session
 * (`Desk.sessionId`); subagents get the free cubicle of their room closest to an anchor desk (the
 * parent's), keep it until released and never share it.
 */
export class DeskAssignments {
  private readonly byActor = new Map<string, string>();
  private readonly byDesk = new Map<string, string>();

  deskIdOf(actorId: string): string | undefined {
    return this.byActor.get(actorId);
  }

  isTaken(deskId: string): boolean {
    return this.byDesk.has(deskId);
  }

  /**
   * Returns the actor's desk (existing assignment first), or the free cubicle of `roomId` nearest
   * to `anchorDeskId`. `undefined` when the room has no free cubicle.
   */
  assign(
    actorId: string,
    roomId: string,
    desks: readonly Desk[],
    anchorDeskId?: string,
  ): Desk | undefined {
    const current = this.byActor.get(actorId);
    if (current !== undefined) {
      const kept = desks.find((desk) => desk.id === current);
      if (kept) return kept;
      this.release(actorId);
    }
    const anchor =
      desks.find((desk) => desk.id === anchorDeskId) ??
      desks.find((desk) => desk.roomId === roomId);
    let chosen: Desk | undefined;
    for (const desk of desks) {
      if (desk.roomId !== roomId || desk.sessionId !== undefined || this.byDesk.has(desk.id)) {
        continue;
      }
      if (!chosen || (anchor && distance(anchor, desk) < distance(anchor, chosen))) chosen = desk;
    }
    if (chosen) {
      this.byActor.set(actorId, chosen.id);
      this.byDesk.set(chosen.id, actorId);
    }
    return chosen;
  }

  release(actorId: string): void {
    const deskId = this.byActor.get(actorId);
    if (deskId === undefined) return;
    this.byActor.delete(actorId);
    if (this.byDesk.get(deskId) === actorId) this.byDesk.delete(deskId);
  }

  /** Drops assignments whose desk no longer exists; returns the actors that lost their desk. */
  reconcile(desks: readonly Desk[]): string[] {
    const alive = new Set(desks.map((desk) => desk.id));
    const lost: string[] = [];
    for (const [actorId, deskId] of this.byActor) {
      if (!alive.has(deskId)) lost.push(actorId);
    }
    for (const actorId of lost) this.release(actorId);
    return lost;
  }
}
