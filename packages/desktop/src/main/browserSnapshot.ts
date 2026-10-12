/** Node of the DevTools `Accessibility.getFullAXTree` result (only what the snapshot reads). */
export interface AxValue {
  value?: unknown;
}

export interface AxNode {
  nodeId: string;
  ignored?: boolean;
  role?: AxValue;
  name?: AxValue;
  value?: AxValue;
  description?: AxValue;
  properties?: Array<{ name: string; value?: AxValue }>;
  childIds?: string[];
  parentId?: string;
  backendDOMNodeId?: number;
}

export interface PageSnapshot {
  /** Indented outline of the page, one node per line; interactive nodes carry `[ref=eN]`. */
  text: string;
  /** ref -> backend DOM node id, valid until the next snapshot of the same workspace. */
  refs: Map<string, number>;
  nodeCount: number;
  truncated: boolean;
}

export const SNAPSHOT_MAX_NODES = 1500;
export const SNAPSHOT_MAX_TEXT = 60;
const NAME_MAX = 200;

const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'textbox',
  'searchbox',
  'checkbox',
  'radio',
  'combobox',
  'listbox',
  'option',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'tab',
  'switch',
  'slider',
  'spinbutton',
  'treeitem',
  'textarea',
  'DisclosureTriangle',
  'PopUpButton',
]);

/** Roles that only wrap other nodes: skipped when they carry no name. */
const TRANSPARENT_ROLES = new Set([
  'generic',
  'none',
  'presentation',
  'GenericContainer',
  'Section',
]);

const PROPERTY_FLAGS = [
  'checked',
  'disabled',
  'expanded',
  'selected',
  'pressed',
  'required',
  'invalid',
  'focused',
  'level',
] as const;

const str = (v: AxValue | undefined): string => {
  const value = v?.value;
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
};

const clean = (text: string, max = NAME_MAX): string => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}...` : flat;
};

/**
 * Builds the text outline and the ref table from an accessibility tree. Refs are `e1`, `e2`, ... in
 * document order, so the same page yields the same refs; they only mean something inside the
 * snapshot that created them.
 */
export function buildSnapshot(nodes: AxNode[], maxNodes = SNAPSHOT_MAX_NODES): PageSnapshot {
  const byId = new Map(nodes.map((node) => [node.nodeId, node]));
  const root = nodes.find((node) => !node.parentId || !byId.has(node.parentId)) ?? nodes[0];
  const lines: string[] = [];
  const refs = new Map<string, number>();
  let counter = 0;
  let emitted = 0;
  let truncated = false;

  const visit = (node: AxNode, depth: number): void => {
    if (truncated) return;
    const role = str(node.role);
    const name = clean(str(node.name));
    const skipSelf = node.ignored === true || role === 'InlineTextBox';
    const transparent = TRANSPARENT_ROLES.has(role) && name === '';
    let childDepth = depth;
    if (!skipSelf && !transparent && role !== '') {
      if (emitted >= maxNodes) {
        truncated = true;
        return;
      }
      emitted++;
      const interactive = INTERACTIVE_ROLES.has(role) && node.backendDOMNodeId !== undefined;
      let line = `${'  '.repeat(depth)}- ${role}`;
      if (name !== '') line += ` "${name.replace(/"/g, "'")}"`;
      const value = clean(str(node.value), SNAPSHOT_MAX_TEXT);
      if (value !== '') line += ` value="${value.replace(/"/g, "'")}"`;
      for (const prop of node.properties ?? []) {
        if (!(PROPERTY_FLAGS as readonly string[]).includes(prop.name)) continue;
        const v = prop.value?.value;
        if (v === false || v === undefined || v === 'false') continue;
        line += v === true || v === 'true' ? ` [${prop.name}]` : ` [${prop.name}=${String(v)}]`;
      }
      if (interactive && node.backendDOMNodeId !== undefined) {
        counter++;
        const ref = `e${counter}`;
        refs.set(ref, node.backendDOMNodeId);
        line += ` [ref=${ref}]`;
      }
      lines.push(line);
      childDepth = depth + 1;
    }
    for (const id of node.childIds ?? []) {
      const child = byId.get(id);
      if (child) visit(child, childDepth);
    }
  };

  if (root) visit(root, 0);
  return { text: lines.join('\n'), refs, nodeCount: emitted, truncated };
}
