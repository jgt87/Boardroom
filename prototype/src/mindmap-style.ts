// Mind-map layout and branch style (item 40). Pure: shared by previews, the dialog editor and the canvas editor.
import type { Item, MindNode, MindNodeShape } from './model.ts';
import { normalizeNoteLink } from './model.ts';

/** `layout`: topics grow to the right (default), to both sides of the central topic, or downwards (gap E7). */
export type MindLayoutKind = 'right' | 'both' | 'down';
export const mindLayoutKinds: MindLayoutKind[] = ['right', 'both', 'down'];
export type MindStyle = {
  branchStyle: 'curved' | 'straight' | 'elbow';
  colorful: boolean;
  autoLayout?: boolean;
  layout?: MindLayoutKind;
};
export const MIND_NODE_W = 180,
  MIND_NODE_H = 50,
  MIND_COL = 210,
  MIND_ROW = 76;
export const mindPalette = ['#4262ff', '#e5484d', '#12a594', '#f76b15', '#8e4ec6', '#0090ff', '#d6409f', '#46a758'];
/** Names for `mindPalette`, in the same order. */
export const mindColorNames = ['Blue', 'Red', 'Teal', 'Orange', 'Purple', 'Sky', 'Pink', 'Green'];
export const mindLabelLines = (text: string): string[] =>
  (text || 'Untitled topic')
    .split(/\r?\n/)
    .slice(0, 3)
    .map((line, index, lines) => {
      const truncated = line.length > 22 || (index === lines.length - 1 && text.split(/\r?\n/).length > 3);
      return truncated ? line.slice(0, 21) + '…' : line || ' ';
    });
export const mindStyleOf = (item: Pick<Item, 'data'>): MindStyle => ({
  branchStyle: item.data?.branchStyle ?? 'curved',
  colorful: item.data?.colorful ?? false,
  autoLayout: item.data?.autoLayout ?? true,
  layout: item.data?.layout ?? 'right',
});
/** Validates the optional style payload on mind-map items. Older maps have no data and keep curved, single-colour branches. */
export function validateMindStyle(item: Item): void {
  if (item.type !== 'mindmap' || item.data === undefined) return;
  const d = item.data;
  if (
    !d ||
    typeof d !== 'object' ||
    Array.isArray(d) ||
    (d.branchStyle !== undefined && !['curved', 'straight', 'elbow'].includes(d.branchStyle)) ||
    (d.colorful !== undefined && typeof d.colorful !== 'boolean') ||
    (d.autoLayout !== undefined && typeof d.autoLayout !== 'boolean') ||
    (d.layout !== undefined && !(mindLayoutKinds as string[]).includes(d.layout))
  )
    throw new Error('Invalid mind map style.');
  if (d.manualViewport !== undefined) {
    const v = d.manualViewport;
    if (
      !v ||
      typeof v !== 'object' ||
      ![v.x, v.y, v.w, v.h].every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1e7) ||
      v.w <= 0 ||
      v.h <= 0
    )
      throw new Error('Invalid manual mind map viewport.');
  }
}
/** Descendants of collapsed topics (they are not laid out or drawn). */
export function mindHiddenIds(nodes: MindNode[]): Set<string> {
  const hidden = new Set<string>();
  for (const n of nodes) if (n.collapsed) for (const id of mindBranchIds(nodes, n.id)) if (id !== n.id) hidden.add(id);
  return hidden;
}
/** Number of topics hidden under a collapsed topic. */
export const mindHiddenCount = (nodes: MindNode[], id: string) => mindBranchIds(nodes, id).size - 1;
/** Topic positions: depth sets the column, leaves take consecutive rows, parents centre on their children. */
export function mindLayout(
  nodes: MindNode[],
  autoLayout = true,
  layout: MindLayoutKind = 'right',
): Map<string, { x: number; y: number }> {
  const hidden = mindHiddenIds(nodes),
    shown = hidden.size ? nodes.filter(n => !hidden.has(n.id)) : nodes,
    childrenOf = (id: string) => shown.filter(c => c.parent === id);
  const positions = new Map<string, { x: number; y: number }>();
  const root = shown.find(n => n.parent === null);
  if (root && layout === 'down') {
    let col = 0;
    const visit = (n: MindNode, depth: number): number => {
      const xs = childrenOf(n.id).map(c => visit(c, depth + 1));
      const x = xs.length ? (xs[0] + xs.at(-1)!) / 2 : col++ * (MIND_NODE_W + 30);
      positions.set(n.id, { x, y: depth * (MIND_NODE_H + 60) });
      return x;
    };
    visit(root, 0);
  } else if (root) {
    const side = (dir: 1 | -1, children: MindNode[]) => {
      let row = 0;
      const visit = (n: MindNode, depth: number): number => {
        const ys = childrenOf(n.id).map(c => visit(c, depth + 1));
        const y = ys.length ? (ys[0] + ys.at(-1)!) / 2 : row++ * MIND_ROW;
        positions.set(n.id, { x: dir * depth * MIND_COL, y });
        return y;
      };
      return children.map(c => visit(c, 1));
    };
    const top = childrenOf(root.id),
      split = layout === 'both' ? Math.ceil(top.length / 2) : top.length,
      right = side(1, top.slice(0, split)),
      left = side(-1, top.slice(split));
    // Centre the left side on the right side, then the central topic on both.
    const span = (ys: number[]) => (ys.length ? (ys[0] + ys.at(-1)!) / 2 : 0);
    if (left.length) {
      const shift = span(right) - span(left);
      for (const n of top.slice(split))
        for (const id of mindBranchIds(shown, n.id)) {
          const p = positions.get(id);
          if (p) p.y += shift;
        }
    }
    positions.set(root.id, { x: 0, y: span(right) });
  }
  if (!autoLayout) for (const n of shown) if (n.position) positions.set(n.id, { ...n.position });
  return positions;
}

export function manualMindNodes(nodes: MindNode[], layout: MindLayoutKind = 'right'): MindNode[] {
  const positions = mindLayout(nodes, true, layout),
    parents = new Map(nodes.map(n => [n.id, n.parent]));
  const at = (id: string): { x: number; y: number } => {
    const p = positions.get(id);
    if (p) return p;
    const parent = parents.get(id);
    return parent ? at(parent) : { x: 0, y: 0 };
  };
  return nodes.map(n => ({ ...n, position: { ...at(n.id) } }));
}
/** Collapse or expand a topic's branch. Topics without children are unchanged. */
export function toggleMindCollapse(nodes: MindNode[], id: string): MindNode[] {
  if (!nodes.some(n => n.parent === id)) return nodes;
  return nodes.map(n => {
    if (n.id !== id) return n;
    const next = { ...n };
    if (n.collapsed) delete next.collapsed;
    else next.collapsed = true;
    return next;
  });
}
/** Expand every collapsed ancestor of `id` (and `id` itself) so it and its children are visible. */
export function revealMindNode(nodes: MindNode[], id: string): MindNode[] {
  const open = new Set<string>(),
    map = new Map(nodes.map(n => [n.id, n]));
  for (let n = map.get(id); n && !open.has(n.id); n = n.parent ? map.get(n.parent) : undefined) open.add(n.id);
  if (!nodes.some(n => open.has(n.id) && n.collapsed)) return nodes;
  return nodes.map(n => {
    if (!open.has(n.id) || !n.collapsed) return n;
    const next = { ...n };
    delete next.collapsed;
    return next;
  });
}
/** Set (or with an empty value clear) a topic's colour override. */
export function setMindColor(nodes: MindNode[], id: string, color: string): MindNode[] {
  if (color && !/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Choose a colour such as #4262ff.');
  return nodes.map(n => {
    if (n.id !== id) return n;
    const next = { ...n };
    if (color) next.color = color.toLowerCase();
    else delete next.color;
    return next;
  });
}
/** Corner radius of a topic box for its shape (track R5); `underline` draws no box. */
export const mindShapeRx = (shape: MindNodeShape | undefined): number =>
  shape === 'rect' ? 0 : shape === 'pill' ? MIND_NODE_H / 2 : 9;
export const mindShapeLabels: Record<MindNodeShape, string> = {
  rounded: 'Rounded',
  rect: 'Square',
  pill: 'Pill',
  underline: 'Line',
};
/**
 * Set a topic's shape (the default 'rounded' is stored as no shape) or web link (an empty link clears it).
 * Links are normalised to http(s); anything else throws a readable error.
 */
export function setMindTopic(
  nodes: MindNode[],
  id: string,
  patch: { shape?: MindNodeShape; link?: string },
): MindNode[] {
  const link = 'link' in patch ? normalizeNoteLink(patch.link ?? '') : undefined;
  return nodes.map(n => {
    if (n.id !== id) return n;
    const next = { ...n };
    if ('shape' in patch) {
      if (patch.shape && patch.shape !== 'rounded') next.shape = patch.shape;
      else delete next.shape;
    }
    if ('link' in patch) {
      if (link) next.link = link;
      else delete next.link;
    }
    return next;
  });
}
/** Markdown outline of the map (gap B14): the central topic is a heading, branches are nested bullets. */
export function mindOutlineMarkdown(nodes: MindNode[]): string {
  const root = nodes.find(n => n.parent === null);
  if (!root) return '';
  const line = (text: string) => (text.trim() || 'Untitled topic').replace(/\s*\r?\n\s*/g, ' ');
  const out = ['# ' + line(root.text), ''];
  const visit = (id: string, depth: number) => {
    for (const c of nodes.filter(n => n.parent === id)) {
      out.push('  '.repeat(depth) + '- ' + line(c.text));
      visit(c.id, depth + 1);
    }
  };
  visit(root.id, 0);
  return out.join('\n').trimEnd() + '\n';
}
/** Fill and stroke of a topic: its own colour, else its branch colour. */
export function mindTopicColor(nodes: MindNode[], id: string, colorful: boolean): string {
  return nodes.find(n => n.id === id)?.color ?? mindBranchColor(nodes, id, colorful);
}
export function mindBranchIds(nodes: MindNode[], id: string): Set<string> {
  const ids = new Set([id]);
  for (let changed = true; changed;) {
    changed = false;
    for (const n of nodes)
      if (n.parent && ids.has(n.parent) && !ids.has(n.id)) {
        ids.add(n.id);
        changed = true;
      }
  }
  return ids;
}
export function moveMindBranch(nodes: MindNode[], id: string, dx: number, dy: number): MindNode[] {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return nodes;
  const ids = mindBranchIds(nodes, id),
    positions = mindLayout(nodes, false);
  const next = nodes.map(n => {
    const p = positions.get(n.id) ?? n.position;
    if (!p) return n;
    return { ...n, position: { x: p.x + (ids.has(n.id) ? dx : 0), y: p.y + (ids.has(n.id) ? dy : 0) } };
  });
  return next.some(n => n.position && (Math.abs(n.position.x) > 100000 || Math.abs(n.position.y) > 100000))
    ? nodes
    : next;
}
export function mindDropTarget(
  nodes: MindNode[],
  id: string,
  point: { x: number; y: number },
  positions = mindLayout(nodes, false),
): string | null {
  const branch = mindBranchIds(nodes, id);
  return (
    [...positions.entries()].find(
      ([key, p]) =>
        !branch.has(key) &&
        point.x >= p.x &&
        point.x <= p.x + MIND_NODE_W &&
        point.y >= p.y &&
        point.y <= p.y + MIND_NODE_H,
    )?.[0] ?? null
  );
}
export function mindBranchPath(
  style: MindStyle['branchStyle'],
  from: { x: number; y: number },
  to: { x: number; y: number },
  layout: MindLayoutKind = 'right',
): string {
  if (layout === 'down') {
    const x1 = from.x + MIND_NODE_W / 2,
      y1 = from.y + MIND_NODE_H,
      x2 = to.x + MIND_NODE_W / 2,
      y2 = to.y;
    if (style === 'straight') return `M${x1} ${y1} L${x2} ${y2}`;
    if (style === 'elbow') {
      const my = (y1 + y2) / 2;
      return `M${x1} ${y1} V${my} H${x2} V${y2}`;
    }
    return `M${x1} ${y1} C${x1} ${y1 + 15},${x2} ${y2 - 15},${x2} ${y2}`;
  }
  if (to.x + MIND_NODE_W <= from.x) {
    // Topic on the left of its parent (two-sided layout or a manual move).
    const x1 = from.x,
      y1 = from.y + MIND_NODE_H / 2,
      x2 = to.x + MIND_NODE_W,
      y2 = to.y + MIND_NODE_H / 2;
    if (style === 'straight') return `M${x1} ${y1} L${x2} ${y2}`;
    if (style === 'elbow') {
      const mx = (x1 + x2) / 2;
      return `M${x1} ${y1} H${mx} V${y2} H${x2}`;
    }
    return `M${x1} ${y1} C${x1 - 15} ${y1},${x2 + 15} ${y2},${x2} ${y2}`;
  }
  const x1 = from.x + MIND_NODE_W,
    y1 = from.y + MIND_NODE_H / 2,
    x2 = to.x,
    y2 = to.y + MIND_NODE_H / 2;
  if (style === 'straight') return `M${x1} ${y1} L${x2} ${y2}`;
  if (style === 'elbow') {
    const mx = (x1 + x2) / 2;
    return `M${x1} ${y1} H${mx} V${y2} H${x2}`;
  }
  return `M${x1} ${y1} C${x1 + 15} ${y1},${x2 - 15} ${y2},${x2} ${y2}`;
}
/** Branch colour: the colour of the top-level branch a topic belongs to (or the default blue). */
export function mindBranchColor(nodes: MindNode[], id: string, colorful: boolean): string {
  if (!colorful) return '#8e9bd6';
  const map = new Map(nodes.map(n => [n.id, n])),
    root = nodes.find(n => n.parent === null);
  let n = map.get(id);
  while (n && n.parent && n.parent !== root?.id) n = map.get(n.parent);
  const branches = nodes.filter(x => x.parent === root?.id);
  return mindPalette[
    Math.max(
      0,
      branches.findIndex(b => b.id === n?.id),
    ) % mindPalette.length
  ];
}
