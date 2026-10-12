import {
  type ProjectRoster,
  ROSTER_MAX_CONNECTIONS,
  type RosterEntry,
  rosterEntryId,
} from '@agents-office/shared';

// Undirected "can talk to" graph over a project's roster. Each entry stores the ids it is connected
// to (`connections`); the graph keeps both ends in sync so a connection holds in both directions.

const find = (roster: ProjectRoster, id: string): RosterEntry | undefined =>
  roster.entries.find((e) => rosterEntryId(e) === id);

/** True when `a` and `b` are different roster entries linked by a connection (either direction). */
export function podeFalar(roster: ProjectRoster, a: string, b: string): boolean {
  if (a === b) return false;
  const ea = find(roster, a);
  const eb = find(roster, b);
  if (!ea || !eb) return false;
  return ea.connections.includes(b) || eb.connections.includes(a);
}

/** Entry ids `id` can talk to, in roster order. */
export function vizinhos(roster: ProjectRoster, id: string): string[] {
  return roster.entries.map(rosterEntryId).filter((other) => podeFalar(roster, id, other));
}

/** Every connection once, as an unordered pair in roster order. */
export function pares(roster: ProjectRoster): Array<[string, string]> {
  const ids = roster.entries.map(rosterEntryId);
  const out: Array<[string, string]> = [];
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++)
      if (podeFalar(roster, ids[i] as string, ids[j] as string))
        out.push([ids[i] as string, ids[j] as string]);
  return out;
}

/** Connects two entries in both directions (idempotent). Mutates `roster`. */
export function conectar(roster: ProjectRoster, a: string, b: string): void {
  if (a === b) throw new Error('An agent cannot connect to itself.');
  const ea = find(roster, a);
  const eb = find(roster, b);
  if (!ea) throw new Error(`Unknown roster entry: ${a}`);
  if (!eb) throw new Error(`Unknown roster entry: ${b}`);
  for (const [from, to] of [
    [ea, b],
    [eb, a],
  ] as const) {
    if (from.connections.includes(to)) continue;
    if (from.connections.length >= ROSTER_MAX_CONNECTIONS) throw new Error('Too many connections.');
  }
  if (!ea.connections.includes(b)) ea.connections.push(b);
  if (!eb.connections.includes(a)) eb.connections.push(a);
}

/** Removes the connection in both directions (idempotent). Mutates `roster`. */
export function desconectar(roster: ProjectRoster, a: string, b: string): void {
  const ea = find(roster, a);
  const eb = find(roster, b);
  if (ea) ea.connections = ea.connections.filter((c) => c !== b);
  if (eb) eb.connections = eb.connections.filter((c) => c !== a);
}

/** Removes an entry and every connection (and creator link) that pointed at it. Mutates `roster`. */
export function removerEntrada(roster: ProjectRoster, id: string): void {
  roster.entries = roster.entries.filter((e) => rosterEntryId(e) !== id);
  for (const e of roster.entries) {
    e.connections = e.connections.filter((c) => c !== id);
    if (e.createdBy === id) e.createdBy = null;
  }
}
