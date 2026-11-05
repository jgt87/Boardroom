// Org chart model and tidy top-down layout (item 35).
// Evidence: ComputeOrgChartWidget (SIBLING_BEFORE, SIBLING_AFTER, PARENT, layoutService, nodesToReorder).
import { parseDelimited } from './smart-paste.ts';
import { toCsv } from './csv.ts';

/**
 * `team` and `location` are optional extra fields (gap E8). `hiring` marks an open position, `description`
 * holds a longer note and `color` sets the branch colour for this person and their reports (track R5).
 */
export type OrgNode = {
  id: string;
  parent: string | null;
  name: string;
  role: string;
  collapsed?: boolean;
  team?: string;
  location?: string;
  hiring?: boolean;
  description?: string;
  color?: string;
  /** User-defined fields such as "Email" or "Start date" (track R2-H). */
  fields?: OrgField[];
};
export type OrgField = { name: string; value: string };
export const ORG_DESCRIPTION_MAX = 1000,
  ORG_FIELDS_MAX = 20,
  ORG_FIELD_NAME_MAX = 60;
/** Built-in fields that can be shown on cards; custom field names may not reuse them or other CSV columns. */
export const ORG_BUILTIN_CARD_FIELDS = ['Team', 'Location'];
/** Fields shown on cards when the chart has no setting: team and location, as before custom fields. */
export const ORG_DEFAULT_CARD_FIELDS = ['Team', 'Location'];
/** Branch colour: the nearest colour set on the person or one of their managers. */
export function orgBranchColor(nodes: OrgNode[], id: string): string | undefined {
  const map = new Map(nodes.map(n => [n.id, n]));
  for (
    let n = map.get(id), guard = 0;
    n && guard <= nodes.length;
    n = n.parent ? map.get(n.parent) : undefined, guard++
  )
    if (n.color) return n.color;
  return undefined;
}
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
        (n.collapsed !== undefined && typeof n.collapsed !== 'boolean') ||
        [n.team, n.location].some(v => v !== undefined && (typeof v !== 'string' || v.length > 200)) ||
        (n.hiring !== undefined && typeof n.hiring !== 'boolean') ||
        (n.description !== undefined &&
          (typeof n.description !== 'string' || n.description.length > ORG_DESCRIPTION_MAX)) ||
        (n.color !== undefined && (typeof n.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(n.color))) ||
        (n.fields !== undefined && !validFields(n.fields)),
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

/** Custom field names may not reuse a CSV column name or one of its aliases, so CSV files round-trip. */
const reservedName = (name: string) =>
  [...ORG_CSV_HEADER, ...Object.values(headerAliases).flat()].some(h => h.toLowerCase() === name.trim().toLowerCase());
function validFields(fields: unknown): boolean {
  if (!Array.isArray(fields) || fields.length > ORG_FIELDS_MAX) return false;
  const names = new Set<string>();
  for (const f of fields) {
    if (
      !f ||
      typeof f !== 'object' ||
      typeof f.name !== 'string' ||
      !f.name.trim() ||
      f.name !== f.name.trim() ||
      f.name.length > ORG_FIELD_NAME_MAX ||
      reservedName(f.name) ||
      typeof f.value !== 'string' ||
      f.value.length > 200 ||
      names.has(f.name.toLowerCase())
    )
      return false;
    names.add(f.name.toLowerCase());
  }
  return true;
}
/** The chart's "shown on cards" setting: the built-in and custom field names shown, in order (track R2-H). */
export function validateOrgCardFields(value: unknown): void {
  if (
    value !== undefined &&
    (!Array.isArray(value) ||
      value.length > ORG_FIELDS_MAX + ORG_BUILTIN_CARD_FIELDS.length ||
      value.some(v => typeof v !== 'string' || !v.trim() || v.length > ORG_FIELD_NAME_MAX) ||
      new Set(value.map(v => v.toLowerCase())).size !== value.length)
  )
    throw new Error('Invalid org chart card fields.');
}
/** Every custom field name used in the chart, in order of first use. */
export function orgFieldNames(nodes: OrgNode[]): string[] {
  const out: string[] = [];
  for (const n of nodes)
    for (const f of n.fields ?? []) if (!out.some(o => o.toLowerCase() === f.name.toLowerCase())) out.push(f.name);
  return out;
}
/** A person's value for a built-in or custom field name. */
export function orgFieldValue(n: OrgNode, name: string): string {
  const key = name.toLowerCase();
  if (key === 'team') return n.team ?? '';
  if (key === 'location') return n.location ?? '';
  return n.fields?.find(f => f.name.toLowerCase() === key)?.value ?? '';
}
/**
 * Line under the role (gap E8): the values of the fields chosen for cards, "Team · Location" by default.
 * `shown` is the chart's `cardFields` setting.
 */
export const orgMeta = (n: OrgNode, shown: string[] = ORG_DEFAULT_CARD_FIELDS) => {
  const text = shown
    .map(name => orgFieldValue(n, name).trim())
    .filter(Boolean)
    .join(' · ');
  return text.length > 30 ? text.slice(0, 29) + '…' : text;
};
/** Add, rename, change or remove one of a person's custom fields. Names stay unique per person. */
export function setOrgField(nodes: OrgNode[], id: string, index: number | null, field: OrgField | null): OrgNode[] {
  return nodes.map(n => {
    if (n.id !== id) return n;
    const fields = [...(n.fields ?? [])];
    if (field === null) {
      if (index !== null) fields.splice(index, 1);
    } else {
      const next = { name: field.name.trim().slice(0, ORG_FIELD_NAME_MAX), value: field.value.slice(0, 200) };
      if (!next.name) throw new Error('Give the field a name.');
      if (reservedName(next.name)) throw new Error(`"${next.name}" is a built-in field. Choose another name.`);
      if (fields.some((f, k) => k !== index && f.name.toLowerCase() === next.name.toLowerCase()))
        throw new Error(`This person already has a "${next.name}" field.`);
      if (index === null) {
        if (fields.length >= ORG_FIELDS_MAX) throw new Error(`A person holds up to ${ORG_FIELDS_MAX} custom fields.`);
        fields.push(next);
      } else fields[index] = next;
    }
    const out = { ...n };
    if (fields.length) out.fields = fields;
    else delete out.fields;
    return out;
  });
}
/** A field name not yet used by this person ("Field", "Field 2", ...). */
export function freshFieldName(n: OrgNode, base = 'Field'): string {
  const used = new Set((n.fields ?? []).map(f => f.name.toLowerCase()));
  for (let k = 1; ; k++) {
    const name = k === 1 ? base : `${base} ${k}`;
    if (!used.has(name.toLowerCase())) return name;
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

// ---- CSV import and export (gap B13) ---------------------------------------------------------
export const ORG_CSV_HEADER = ['ID', 'Name', 'Role', 'Team', 'Location', 'Manager ID', 'Hiring', 'Description'];
/** People as CSV, managers before their reports (tree order). */
export function orgToCsv(nodes: OrgNode[]): string {
  const out: OrgNode[] = [],
    visit = (n: OrgNode) => {
      out.push(n);
      nodes.filter(c => c.parent === n.id).forEach(visit);
    },
    root = nodes.find(n => n.parent === null);
  if (root) visit(root);
  // Custom fields follow the built-in columns, one column per field name (track R2-H).
  const custom = orgFieldNames(nodes);
  return toCsv([
    [...ORG_CSV_HEADER, ...custom],
    ...out.map(n => [
      n.id,
      n.name,
      n.role,
      n.team ?? '',
      n.location ?? '',
      n.parent ?? '',
      n.hiring ? 'Yes' : '',
      n.description ?? '',
      ...custom.map(name => orgFieldValue(n, name)),
    ]),
  ]);
}
type OrgColumn = 'id' | 'name' | 'role' | 'team' | 'location' | 'manager' | 'hiring' | 'description';
const headerAliases: Record<OrgColumn, string[]> = {
  id: ['id', 'employee id', 'person id', 'personid', 'employeeid'],
  name: ['name', 'full name', 'person', 'employee'],
  role: ['role', 'title', 'job title', 'position'],
  team: ['team', 'department', 'group'],
  location: ['location', 'office', 'city'],
  manager: [
    'manager id',
    'manager',
    'reports to',
    'parent',
    'parent id',
    'supervisor',
    'supervisor id',
    'supervisorid',
    'managerid',
  ],
  hiring: ['hiring', 'open role', 'vacancy', 'open position'],
  description: ['description', 'notes', 'about'],
};
const truthy = (v: string) => /^(true|yes|y|1|x|hiring|open)$/i.test(v.trim());
/** Undo the apostrophe the CSV writer puts before formula-like cells. */
const unguard = (v: string) => v.replace(/^'(?=[=+\-@\t])/, '').trim();
/**
 * People from CSV (or tab-separated) text with a header row. Needs a Name column; ID, Role, Team, Location
 * and Manager ID (or a manager's name) are optional. People without a known manager report to the first
 * top-level person. Ids are regenerated.
 */
export function orgFromCsv(text: string): OrgNode[] {
  const rows = parseDelimited(text);
  if (rows.length < 2) throw new Error('The CSV needs a header row and at least one person.');
  const head = rows[0].map(h => unguard(h).toLowerCase());
  const col = Object.fromEntries(
    Object.entries(headerAliases).map(([key, names]) => [key, head.findIndex(h => names.includes(h))]),
  ) as Record<keyof typeof headerAliases, number>;
  if (col.name < 0) throw new Error('The CSV needs a Name column.');
  // Columns that are not a known field become custom fields named after their header (track R2-H).
  const known = new Set(Object.values(col).filter(k => k >= 0)),
    extras: { index: number; name: string }[] = [];
  rows[0].forEach((h, index) => {
    const name = unguard(h).slice(0, ORG_FIELD_NAME_MAX).trim();
    if (
      known.has(index) ||
      !name ||
      reservedName(name) ||
      extras.length >= ORG_FIELDS_MAX ||
      extras.some(e => e.name.toLowerCase() === name.toLowerCase())
    )
      return;
    extras.push({ index, name });
  });
  const cell = (r: string[], key: keyof typeof headerAliases) =>
    col[key] < 0 ? '' : unguard(r[col[key]] ?? '').slice(0, 200);
  const people = rows.slice(1).filter(r => r.some(c => c.trim()));
  if (!people.length) throw new Error('The CSV needs at least one person.');
  if (people.length > ORG_MAX) throw new Error('An org chart holds up to 200 people.');
  const keyed = new Map<string, string>(),
    byName = new Map<string, string>();
  const nodes: (OrgNode & { manager: string })[] = people.map((r, index) => {
    const id = crypto.randomUUID(),
      key = cell(r, 'id'),
      name = cell(r, 'name');
    if (key) {
      if (keyed.has(key)) throw new Error(`The ID "${key}" appears more than once (row ${index + 2}).`);
      keyed.set(key, id);
    }
    if (name && !byName.has(name.toLowerCase())) byName.set(name.toLowerCase(), id);
    const node: OrgNode & { manager: string } = {
      id,
      parent: null,
      name,
      role: cell(r, 'role'),
      manager: cell(r, 'manager'),
    };
    const team = cell(r, 'team'),
      location = cell(r, 'location'),
      description = col.description < 0 ? '' : unguard(r[col.description] ?? '').slice(0, ORG_DESCRIPTION_MAX);
    if (team) node.team = team;
    if (location) node.location = location;
    if (truthy(cell(r, 'hiring'))) node.hiring = true;
    if (description) node.description = description;
    const fields = extras
      .map(e => ({ name: e.name, value: unguard(r[e.index] ?? '').slice(0, 200) }))
      .filter(f => f.value);
    if (fields.length) node.fields = fields;
    return node;
  });
  for (const n of nodes) {
    const parent = n.manager ? (keyed.get(n.manager) ?? byName.get(n.manager.toLowerCase())) : undefined;
    n.parent = parent && parent !== n.id ? parent : null;
  }
  const roots = nodes.filter(n => n.parent === null);
  if (!roots.length) throw new Error('Org chart reporting lines cannot form a cycle.');
  for (const n of roots.slice(1)) n.parent = roots[0].id;
  const result: OrgNode[] = nodes.map(({ manager: _manager, ...n }) => n);
  validateOrgNodes(result);
  return result;
}
