// Mind-map layout and branch style (item 40). Pure: shared by previews, the dialog editor and the canvas editor.
import type { Item, MindNode } from './model.ts';

export type MindStyle = { branchStyle: 'curved' | 'straight' | 'elbow'; colorful: boolean };
export const MIND_NODE_W = 180,
  MIND_NODE_H = 50,
  MIND_COL = 210,
  MIND_ROW = 76;
export const mindPalette = ['#4262ff', '#e5484d', '#12a594', '#f76b15', '#8e4ec6', '#0090ff', '#d6409f', '#46a758'];
export const mindStyleOf = (item: Pick<Item, 'data'>): MindStyle => ({
  branchStyle: item.data?.branchStyle ?? 'curved',
  colorful: item.data?.colorful ?? false,
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
    (d.colorful !== undefined && typeof d.colorful !== 'boolean')
  )
    throw new Error('Invalid mind map style.');
}
/** Topic positions: depth sets the column, leaves take consecutive rows, parents centre on their children. */
export function mindLayout(nodes: MindNode[]): Map<string, { x: number; y: number }> {
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
  return positions;
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
