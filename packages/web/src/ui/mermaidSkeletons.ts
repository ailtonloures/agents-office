// Mermaid -> whiteboard skeletons (spec 079). `@excalidraw/mermaid-to-excalidraw` yields
// Excalidraw skeletons; the shell takes a simpler, validated subset (what agents also send), so
// this keeps the known fields and drops the rest. Pure: no Excalidraw import, safe in the main bundle.

const SHAPES = new Set(['rectangle', 'ellipse', 'diamond', 'text', 'arrow', 'line']);
const STROKE_STYLES = new Set(['solid', 'dashed', 'dotted']);
const FILL_STYLES = new Set(['solid', 'hachure', 'cross-hatch']);
const ARROWHEADS = new Set(['arrow', 'bar', 'dot', 'triangle']);
const COLOR = /^(#[0-9a-fA-F]{3,8}|transparent|[a-zA-Z]+)$/;
/** Same cap the shell enforces per call. */
export const MERMAID_MAX_ELEMENTS = 200;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

export type Skeleton = Record<string, unknown>;

/**
 * Keeps the shapes, text, arrows and lines of a converter result in the shell's skeleton format.
 * Images (what Mermaid falls back to for diagram types it cannot draw natively) are dropped.
 * Throws when nothing drawable is left or the diagram is too big for one call.
 */
export function toBoardSkeletons(raw: readonly unknown[]): Skeleton[] {
  const kept = raw.filter(
    (item): item is Record<string, unknown> =>
      isRecord(item) && typeof item.type === 'string' && SHAPES.has(item.type),
  );
  if (kept.length === 0) {
    throw new Error('This kind of Mermaid diagram cannot be drawn as editable shapes.');
  }
  if (kept.length > MERMAID_MAX_ELEMENTS) {
    throw new Error(
      `The diagram has ${kept.length} elements; the limit is ${MERMAID_MAX_ELEMENTS}. Split it into smaller diagrams.`,
    );
  }
  const ids = new Set(kept.flatMap((e) => (typeof e.id === 'string' && e.id ? [e.id] : [])));
  return kept.map((e) => {
    const out: Skeleton = { type: e.type };
    if (typeof e.id === 'string' && e.id) out.id = e.id.slice(0, 80);
    for (const key of ['x', 'y', 'width', 'height', 'fontSize'] as const) {
      const n = num(e[key]);
      if (n !== undefined) out[key] = key === 'width' || key === 'height' ? Math.abs(n) : n;
    }
    if (typeof e.text === 'string' && e.text) out.text = e.text;
    if (e.type === 'text' && !out.text) out.text = ' ';
    if (isRecord(e.label) && typeof e.label.text === 'string' && e.label.text) {
      const label: Skeleton = { text: e.label.text };
      const fontSize = num(e.label.fontSize);
      if (fontSize !== undefined) label.fontSize = fontSize;
      out.label = label;
    }
    for (const key of ['strokeColor', 'backgroundColor'] as const) {
      const v = e[key];
      if (typeof v === 'string' && v.length <= 40 && COLOR.test(v)) out[key] = v;
    }
    if (typeof e.strokeStyle === 'string' && STROKE_STYLES.has(e.strokeStyle)) {
      out.strokeStyle = e.strokeStyle;
    }
    if (typeof e.fillStyle === 'string' && FILL_STYLES.has(e.fillStyle)) {
      out.fillStyle = e.fillStyle;
    }
    if (e.type === 'arrow' || e.type === 'line') {
      for (const [from, key] of [
        ['start', 'from'],
        ['end', 'to'],
      ] as const) {
        const end = e[from];
        if (isRecord(end) && typeof end.id === 'string' && ids.has(end.id)) out[key] = end.id;
      }
      if (
        Array.isArray(e.points) &&
        e.points.length >= 2 &&
        e.points.length <= 100 &&
        e.points.every(
          (p) => Array.isArray(p) && p.length === 2 && p.every((n) => num(n) !== undefined),
        )
      ) {
        out.points = e.points;
      }
      for (const key of ['startArrowhead', 'endArrowhead'] as const) {
        const v = e[key];
        if (v === null || (typeof v === 'string' && ARROWHEADS.has(v))) out[key] = v;
      }
      if (out.x === undefined) out.x = 0;
      if (out.y === undefined) out.y = 0;
      if (!out.points && !(out.from && out.to)) {
        out.points = [
          [0, 0],
          [num(e.width) ?? 100, num(e.height) ?? 0],
        ];
      }
    }
    return out;
  });
}
