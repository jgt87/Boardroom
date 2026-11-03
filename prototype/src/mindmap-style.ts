// Mind-map layout and branch style (item 40). Pure: shared by previews, the dialog editor and the canvas editor.
import type { Item, MindNode } from './model.ts';

export type MindStyle = { branchStyle: 'curved' | 'straight' | 'elbow'; colorful: boolean; autoLayout?: boolean };
export const MIND_NODE_W = 180,
  MIND_NODE_H = 50,
  MIND_COL = 210,
  MIND_ROW = 76;
export const mindPalette = ['#4262ff', '#e5484d', '#12a594', '#f76b15', '#8e4ec6', '#0090ff', '#d6409f', '#46a758'];
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
    (d.autoLayout !== undefined && typeof d.autoLayout !== 'boolean')
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
/** Topic positions: depth sets the column, leaves take consecutive rows, parents centre on their children. */
export function mindLayout(nodes: MindNode[], autoLayout = true): Map<string, { x: number; y: number }> {
  let row = 0;
  const positions = new Map<string, { x: number; y: number }>();
  function visit(n: MindNode, depth: number): number {
    const children = nodes.filter(c => c.parent === n.id);
    const ys = children.map(c => visit(c, depth + 1));
    const y = ys.length ? (ys[0] + ys.at(-1)!) / 2 : row++ * MIND_ROW;
    positions.set(n.id, { x: depth * MIND_COL, y });
    return y;
  }
  const root = nodes.find(n => n.parent === null);
  if (root) visit(root, 0);
  if (!autoLayout) for (const n of nodes) if (n.position) positions.set(n.id, { ...n.position });
  return positions;
}

export function manualMindNodes(nodes: MindNode[]): MindNode[] {
  const positions = mindLayout(nodes);
  return nodes.map(n => ({ ...n, position: positions.get(n.id)! }));
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
    const p = positions.get(n.id)!;
    return { ...n, position: { x: p.x + (ids.has(n.id) ? dx : 0), y: p.y + (ids.has(n.id) ? dy : 0) } };
  });
  return next.some(n => Math.abs(n.position.x) > 100000 || Math.abs(n.position.y) > 100000) ? nodes : next;
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
): string {
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
