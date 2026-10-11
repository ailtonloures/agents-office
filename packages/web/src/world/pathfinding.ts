import type { Tile } from './roomLayout';

export interface PathOptions {
  /** Extra, dynamic obstacles (e.g. other characters). The goal tile is never considered blocked. */
  blocked?: (x: number, y: number) => boolean;
}

interface Node {
  key: number;
  g: number;
  f: number;
}

/** Binary min-heap ordered by `f`, then by the greater `g` (prefers longer, straighter paths). */
class Heap {
  private readonly items: Node[] = [];

  get size(): number {
    return this.items.length;
  }

  private less(a: Node, b: Node): boolean {
    return a.f < b.f || (a.f === b.f && a.g > b.g);
  }

  push(node: Node): void {
    const items = this.items;
    items.push(node);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      const p = items[parent] as Node;
      if (!this.less(node, p)) break;
      items[i] = p;
      i = parent;
    }
    items[i] = node;
  }

  pop(): Node | undefined {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (!last || items.length === 0) return top;
    let i = 0;
    for (;;) {
      const left = 2 * i + 1;
      if (left >= items.length) break;
      const right = left + 1;
      let child = left;
      if (right < items.length && this.less(items[right] as Node, items[left] as Node)) {
        child = right;
      }
      const c = items[child] as Node;
      if (!this.less(c, last)) break;
      items[i] = c;
      i = child;
    }
    items[i] = last;
    return top;
  }
}

const NEIGHBOURS = [
  [0, -1],
  [-1, 0],
  [1, 0],
  [0, 1],
] as const;

/**
 * A* over a tile grid (4-neighbourhood, unit cost, Manhattan heuristic). `collision[y][x]` is true
 * for blocked tiles. Returns the tiles to walk (excluding `from`, including `to`), `[]` when
 * already there, or `null` when `to` cannot be reached. Deterministic.
 */
export function findPath(
  collision: readonly (readonly boolean[])[],
  from: Tile,
  to: Tile,
  options: PathOptions = {},
): Tile[] | null {
  const height = collision.length;
  const width = collision[0]?.length ?? 0;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height;
  if (!inside(from.x, from.y) || !inside(to.x, to.y)) return null;
  if (collision[to.y]?.[to.x]) return null;
  if (from.x === to.x && from.y === to.y) return [];

  const { blocked } = options;
  const index = (x: number, y: number) => y * width + x;
  const goal = index(to.x, to.y);
  const best = new Map<number, number>();
  const parent = new Map<number, number>();
  const closed = new Set<number>();
  const heap = new Heap();
  const h = (x: number, y: number) => Math.abs(x - to.x) + Math.abs(y - to.y);

  const start = index(from.x, from.y);
  best.set(start, 0);
  heap.push({ key: start, g: 0, f: h(from.x, from.y) });

  while (heap.size > 0) {
    const node = heap.pop() as Node;
    if (closed.has(node.key)) continue;
    if (node.key === goal) {
      const path: Tile[] = [];
      for (let key = goal; key !== start; key = parent.get(key) as number) {
        path.push({ x: key % width, y: Math.floor(key / width) });
      }
      return path.reverse();
    }
    closed.add(node.key);
    const x = node.key % width;
    const y = Math.floor(node.key / width);
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inside(nx, ny) || collision[ny]?.[nx]) continue;
      const key = index(nx, ny);
      if (closed.has(key)) continue;
      if (key !== goal && blocked?.(nx, ny)) continue;
      const g = node.g + 1;
      if (g >= (best.get(key) ?? Number.POSITIVE_INFINITY)) continue;
      best.set(key, g);
      parent.set(key, node.key);
      heap.push({ key, g, f: g + h(nx, ny) });
    }
  }
  return null;
}
