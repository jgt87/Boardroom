// Org chart model and tidy top-down layout (item 35).
// Evidence: ComputeOrgChartWidget (SIBLING_BEFORE, SIBLING_AFTER, PARENT, layoutService, nodesToReorder).
export type OrgNode = { id: string; parent: string | null; name: string; role: string; collapsed?: boolean };
export const ORG_NODE_W = 170,
  ORG_NODE_H = 64,
  ORG_GAP_X = 24,
  ORG_GAP_Y = 56,
  ORG_MAX = 200;

export function validateOrgNodes(nodes: unknown): asserts nodes is OrgNode[] {
  if (!Array.isArray(nodes) || !nodes.length || nodes.length > ORG_MAX)
    throw new Error('An org chart needs 1 to 200 people.');
  if (
    nodes.some(
      n =>
        !n ||
        typeof n.id !== 'string' ||
        !n.id ||
        (n.parent !== null && typeof n.parent !== 'string') ||
        typeof n.name !== 'string' ||
        n.name.length > 200 ||
        typeof n.role !== 'string' ||
        n.role.length > 200 ||
        (n.collapsed !== undefined && typeof n.collapsed !== 'boolean'),
    )
  )
    throw new Error('Invalid org chart node.');
  if (new Set(nodes.map(n => n.id)).size !== nodes.length) throw new Error('Org chart nodes must have unique ids.');
  if (nodes.filter(n => n.parent === null).length !== 1) throw new Error('An org chart needs exactly one top person.');
  const map = new Map(nodes.map(n => [n.id, n]));
  for (const node of nodes) {
    const seen = new Set<string>();
    for (let n: OrgNode | undefined = node; n; n = n.parent === null ? undefined : map.get(n.parent)) {
      if (seen.has(n.id)) throw new Error('Org chart reporting lines cannot form a cycle.');
      if (n.parent !== null && !map.has(n.parent)) throw new Error('An org chart node reports to a missing person.');
      seen.add(n.id);
    }
  }
}

const childrenOf = (nodes: OrgNode[], id: string) => nodes.filter(n => n.parent === id);
/** Visible nodes (descendants of collapsed nodes are hidden). */
export function visibleOrgNodes(nodes: OrgNode[]): OrgNode[] {
  const root = nodes.find(n => n.parent === null);
  if (!root) return [];
  const out: OrgNode[] = [],
    visit = (n: OrgNode) => {
      out.push(n);
      if (!n.collapsed) childrenOf(nodes, n.id).forEach(visit);
    };
  visit(root);
  return out;
}

/**
 * Tidy layout: leaves take consecutive horizontal slots, parents centre over their children.
 * Slots never overlap, so the layout is collision-free for any tree.
 */
export function layoutOrgChart(nodes: OrgNode[]): {
  positions: Map<string, { x: number; y: number }>;
  width: number;
  height: number;
} {
  const positions = new Map<string, { x: number; y: number }>(),
    root = nodes.find(n => n.parent === null);
  let slot = 0,
    depthMax = 0;
  const visit = (n: OrgNode, depth: number): number => {
    depthMax = Math.max(depthMax, depth);
    const kids = n.collapsed ? [] : childrenOf(nodes, n.id),
      xs = kids.map(k => visit(k, depth + 1));
    const x = xs.length ? (xs[0] + xs[xs.length - 1]) / 2 : slot++ * (ORG_NODE_W + ORG_GAP_X);
    positions.set(n.id, { x, y: depth * (ORG_NODE_H + ORG_GAP_Y) });
    return x;
  };
  if (root) visit(root, 0);
  return {
    positions,
    width: Math.max(ORG_NODE_W, slot * (ORG_NODE_W + ORG_GAP_X) - ORG_GAP_X),
    height: (depthMax + 1) * (ORG_NODE_H + ORG_GAP_Y) - ORG_GAP_Y,
  };
}

const fresh = (parent: string | null, name = 'New person'): OrgNode => ({
  id: crypto.randomUUID(),
  parent,
  name,
  role: '',
});
function insertAfterSubtreeOrder(nodes: OrgNode[], node: OrgNode, index: number): OrgNode[] {
  return [...nodes.slice(0, index), node, ...nodes.slice(index)];
}
export function addChild(nodes: OrgNode[], parentId: string): { nodes: OrgNode[]; id: string } {
  if (nodes.length >= ORG_MAX) throw new Error('An org chart holds up to 200 people.');
  if (!nodes.some(n => n.id === parentId)) throw new Error('Choose an existing person.');
  const node = fresh(parentId);
  return {
    nodes: [...nodes.map(n => (n.id === parentId && n.collapsed ? { ...n, collapsed: false } : n)), node],
    id: node.id,
  };
}
export function addSibling(nodes: OrgNode[], id: string, where: 'before' | 'after'): { nodes: OrgNode[]; id: string } {
  if (nodes.length >= ORG_MAX) throw new Error('An org chart holds up to 200 people.');
  const index = nodes.findIndex(n => n.id === id),
    target = nodes[index];
  if (!target) throw new Error('Choose an existing person.');
  if (target.parent === null) throw new Error('The top person cannot have siblings. Add a report instead.');
  const node = fresh(target.parent);
  return { nodes: insertAfterSubtreeOrder(nodes, node, where === 'before' ? index : index + 1), id: node.id };
}
export function removeNode(nodes: OrgNode[], id: string): OrgNode[] {
  const target = nodes.find(n => n.id === id);
  if (!target) return nodes;
  if (target.parent === null) throw new Error('The top person cannot be removed.');
  const removed = new Set([id]);
  for (let changed = true; changed;) {
    changed = false;
    for (const n of nodes)
      if (n.parent && removed.has(n.parent) && !removed.has(n.id)) {
        removed.add(n.id);
        changed = true;
      }
  }
  return nodes.filter(n => !removed.has(n.id));
}
/** Move a person earlier/later among their siblings (array order defines sibling order). */
export function moveSibling(nodes: OrgNode[], id: string, delta: -1 | 1): OrgNode[] {
  const target = nodes.find(n => n.id === id);
  if (!target) return nodes;
  const siblings = nodes.filter(n => n.parent === target.parent),
    i = siblings.indexOf(target),
    other = siblings[i + delta];
  if (!other) return nodes;
  const next = [...nodes],
    a = nodes.indexOf(target),
    b = nodes.indexOf(other);
  next[a] = other;
  next[b] = target;
  return next;
}
/** Make `id` report to `parentId`, optionally placed before sibling `beforeId`. Cycles are rejected. */
export function reparent(nodes: OrgNode[], id: string, parentId: string, beforeId: string | null = null): OrgNode[] {
  const target = nodes.find(n => n.id === id);
  if (!target || !nodes.some(n => n.id === parentId)) throw new Error('Choose an existing person.');
  if (target.parent === null) throw new Error('The top person cannot report to anyone.');
  const map = new Map(nodes.map(n => [n.id, n]));
  for (let n: OrgNode | undefined = map.get(parentId); n; n = n.parent === null ? undefined : map.get(n.parent))
    if (n.id === id) throw new Error('A person cannot report to someone in their own team.');
  const moved = { ...target, parent: parentId },
    rest = nodes.filter(n => n.id !== id);
  let index = beforeId ? rest.findIndex(n => n.id === beforeId) : -1;
  if (index < 0) index = rest.length;
  return [...rest.slice(0, index), moved, ...rest.slice(index)];
}
export const toggleCollapse = (nodes: OrgNode[], id: string): OrgNode[] =>
  nodes.map(n => {
    if (n.id !== id) return n;
    const next = { ...n };
    if (n.collapsed) delete next.collapsed;
    else next.collapsed = true;
    return next;
  });
export const starterOrg = (): OrgNode[] => {
  const root = fresh(null, 'Director');
  root.role = 'Leadership';
  const a = fresh(root.id, 'Team lead'),
    b = fresh(root.id, 'Team lead');
  a.role = b.role = 'Delivery';
  return [root, a, b];
};
