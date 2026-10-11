import type { OfficeModel } from '@agents-office/shared';
import type { LayoutProjectInput } from './roomLayout';

interface KnownSession {
  projectId: string;
  agentCount: number;
}

/**
 * Turns the model into layout generator input and keeps rooms alive while characters are still
 * leaving: the daemon drops a session (and its project) from the model the moment it ends, but the
 * scene needs the room, its desks and its door until everybody has walked out. Sessions in
 * `retained` that are no longer in the model are kept with their last known shape and order.
 */
export class LayoutInputBuilder {
  /** Project id -> order of first appearance, the stable room ordering key. */
  private readonly firstSeen = new Map<string, number>();
  private readonly names = new Map<string, string>();
  private readonly sessions = new Map<string, KnownSession>();
  private readonly order = new Map<string, string[]>();

  build(model: OfficeModel, retained: ReadonlySet<string> = new Set()): LayoutProjectInput[] {
    const fresh = Object.values(model.projects)
      .filter((project) => !this.firstSeen.has(project.id))
      .sort(
        (a, b) =>
          a.lastActivityTs.localeCompare(b.lastActivityTs) ||
          (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      );
    for (const project of fresh) this.firstSeen.set(project.id, this.firstSeen.size);

    const byProject = new Map<string, string[]>();
    for (const project of Object.values(model.projects)) {
      this.names.set(project.id, project.name);
      const ids = project.sessionIds.filter((id) => model.sessions[id]);
      byProject.set(project.id, ids);
      for (const id of ids) {
        const session = model.sessions[id];
        if (!session) continue;
        const agentCount = session.agentIds.filter(
          (agentId) => model.agents[agentId] && model.agents[agentId].status !== 'ended',
        ).length;
        this.sessions.set(id, { projectId: project.id, agentCount });
      }
    }

    // Ghost sessions: retained, gone from the model, but still known.
    for (const id of retained) {
      const known = this.sessions.get(id);
      if (!known || model.sessions[id]) continue;
      const list = byProject.get(known.projectId) ?? [];
      list.push(id);
      byProject.set(known.projectId, list);
    }

    const result: LayoutProjectInput[] = [];
    const nextOrder = new Map<string, string[]>();
    for (const [projectId, present] of byProject) {
      const presentSet = new Set(present);
      const previous = (this.order.get(projectId) ?? []).filter((id) => presentSet.has(id));
      const ordered = [...previous, ...present.filter((id) => !previous.includes(id))];
      nextOrder.set(projectId, ordered);
      result.push({
        id: projectId,
        name: this.names.get(projectId) ?? projectId,
        firstSeen: this.firstSeen.get(projectId) ?? this.firstSeen.size,
        sessions: ordered.flatMap((id) => {
          const known = this.sessions.get(id);
          return known ? [{ id, agentCount: known.agentCount }] : [];
        }),
      });
    }

    this.order.clear();
    for (const [projectId, ids] of nextOrder) this.order.set(projectId, ids);
    const alive = new Set([...nextOrder.values()].flat());
    for (const id of [...this.sessions.keys()]) if (!alive.has(id)) this.sessions.delete(id);
    for (const id of [...this.names.keys()]) if (!nextOrder.has(id)) this.names.delete(id);
    return result;
  }
}
