// Shapes to code for linked state, class and ER diagrams (item 132, decision R6c-Q2); sequence diagrams are in
// mermaid-writeback-sequence.ts and flowcharts in mermaid-link.ts. Each writer parses the stored code, compares
// every object with the line that made it, and patches only what changed (see mermaid-patch.ts):
// - State: state names (descriptions), new and deleted states (a new diamond becomes a choice, a new empty circle
//   a start or end marker), transitions (ends and label) and composite state titles. Moving a state into another
//   composite state, new composite states and shape kinds of existing states stay on the canvas only.
// - Class: class titles (as `class Id["Title"]`), members (one per table row), new and deleted classes, and
//   relations: ends, label, line style and the end marks (inheritance, composition, association). Cardinalities
//   stay with their class; a relation drawn with marks at both ends keeps only the start mark.
// - ER: entity names (as aliases), attribute rows (type, name, key; comments and extra keys of unchanged rows
//   stay), new and deleted entities, and relationships (ends, cardinalities, dashed, label).
// Lines the shapes do not show (comments, notes, styling, directions, namespaces) stay in place; lines that name
// only deleted objects (styling, notes for a class) go with them.
import type { ConnectorHead, Item } from './model.ts';
import {
  classDefaultLabel,
  edgeKeys,
  mermaidToNative,
  parseClassDiagram,
  parseErDiagram,
  parseStateDiagram,
} from './mermaid-native.ts';
import type { ClassRelation, ParsedClass, ParsedEr, ParsedState } from './mermaid-native.ts';
import type { EntityRow } from './specs-entity.ts';
import { keyOf, parentFrame } from './mermaid-link-rules.ts';
import type { LinkKind } from './mermaid-link-rules.ts';
import { LinePatch, align, freshId, isDashed, oneLine, patchList } from './mermaid-patch.ts';
import type { NewLine } from './mermaid-patch.ts';
import { writeSequence } from './mermaid-writeback-sequence.ts';

/** What a writer reads: the stored code, the frame, its member objects and every board object (for geometry). */
export type WriteInput = { code: string; frameId: string; members: Item[]; items: Item[] };
/**
 * The new code and the Mermaid key of every member object it describes (object id to key); `texts` are texts of
 * objects that show the same name as another one (the bottom box of a sequence participant).
 */
export type WriteResult = { code: string; keys: Map<string, string>; texts?: Map<string, string> };

/** Parse the stored code, or start from the bare header when it does not parse (then the shapes win). */
function base<T>(code: string, parse: (c: string) => T, header: string, empty: T): { code: string; parsed: T } {
  try {
    return { code, parsed: parse(code) };
  } catch {
    return { code: header, parsed: empty };
  }
}
const nodesOf = (input: WriteInput) => input.members.filter(m => m.type !== 'arrow' && m.type !== 'frame');
const arrowsOf = (input: WriteInput) => input.members.filter(m => m.type === 'arrow');
/** Keys the code draws (node, group and edge keys), from the converter itself. */
const drawnKeys = (code: string) => new Set(Object.values(mermaidToNative(code, { x: 0, y: 0 }).keys));
/** Output line of an object's line: replaced or kept lines are tagged `@<line>`, added ones by object id. */
const outLine = (lineOf: Map<string, number>, tags: Map<string, string>, id: string) => lineOf.get(tags.get(id) ?? id);
/** Edge keys of the written code by output line. */
function edgeKeysByLine(edges: { from: string; to: string; at: number }[], drawn: Set<string>) {
  const keys = edgeKeys(edges, id => drawn.has(id)),
    byLine = new Map<number, string>();
  edges.forEach((e, k) => keys[k] && byLine.set(e.at, keys[k]!));
  return byLine;
}

// ---- State diagrams -----------------------------------------------------------------------------------------
const stateId = /^[A-Za-z_][\w-]*$/;
const stateReserved = ['state', 'note', 'direction', 'end', 'as'];
const src = (id: string) => (id.startsWith('[*]') ? '[*]' : id);
const transition = (from: string, to: string, label: string) =>
  `${src(from)} --> ${src(to)}${oneLine(label) ? ` : ${oneLine(label)}` : ''}`;

export function writeState(input: WriteInput): WriteResult {
  const empty: ParsedState = {
    direction: 'TB',
    states: [],
    transitions: [],
    groups: [],
    groupLines: new Map(),
    notes: [],
  };
  const { code, parsed: p } = base(input.code, parseStateDiagram, 'stateDiagram-v2', empty);
  const patch = new LinePatch(code),
    nodes = nodesOf(input),
    arrows = arrowsOf(input),
    frames = input.members.filter(m => m.type === 'frame' && p.groups.some(g => g.id === keyOf(m, input.frameId)));
  const groupOf = (i: Item) => {
    const f = parentFrame(i, frames, input.items);
    return f ? keyOf(f, input.frameId) : undefined;
  };
  // Ids: kept keys, then new ids (start and end markers are `[*]` in the scope they are drawn in).
  const ids = new Map<string, string>(),
    taken = new Set([...p.states.map(s => s.id), ...p.groups.map(g => g.id)]);
  for (const n of nodes) {
    const k = keyOf(n, input.frameId);
    if (k && (p.states.some(s => s.id === k) || stateId.test(k)) && ![...ids.values()].includes(k)) ids.set(n.id, k);
  }
  for (const f of frames) ids.set(f.id, keyOf(f, input.frameId));
  for (const n of nodes.filter(n => !ids.has(n.id))) {
    const marker = n.type === 'ellipse' && !n.text.trim();
    const id = marker
      ? `[*]${arrows.some(a => a.to === n.id) ? 'end' : 'start'}:${groupOf(n) ?? 'root'}`
      : freshId(n.text, taken, 's', stateId, stateReserved);
    taken.add(id);
    ids.set(n.id, id);
  }
  const present = new Set(ids.values()),
    nodeById = new Map(nodes.map(n => [ids.get(n.id)!, n]));
  // Each scope's new lines: declarations first, then transitions.
  const decls = new Map<string, NewLine[]>(),
    edges = new Map<string, NewLine[]>();
  const add = (map: Map<string, NewLine[]>, scope: string | undefined, text: string, tag?: string) => {
    const k = scope ?? '';
    map.set(k, [...(map.get(k) ?? []), { text, ...(tag ? { tag } : {}) }]);
  };
  // Deleted states and composite states.
  for (const s of p.states.filter(s => !present.has(s.id))) {
    patch.remove(s.labelAt);
    patch.remove(s.declAt);
  }
  for (const g of p.groups.filter(g => !present.has(g.id))) {
    patch.remove(p.groupLines.get(g.id)?.at);
    patch.remove(p.groupLines.get(g.id)?.endAt);
  }
  // Titles of composite states, names of states.
  for (const g of p.groups.filter(g => present.has(g.id))) {
    const title = nodeOrFrame(input, g.id, ids)?.text.trim() || g.id;
    if (title !== g.title)
      patch.replace(
        p.groupLines.get(g.id)!.at,
        title === g.id ? `state ${g.id} {` : `state "${title.replace(/"/g, "'")}" as ${g.id} {`,
      );
  }
  for (const [id, n] of nodeById) {
    if (id.startsWith('[*]')) continue;
    const s = p.states.find(x => x.id === id),
      label = oneLine(n.text) || id;
    if (!s) {
      add(
        decls,
        groupOf(n),
        n.type === 'diamond' ? `state ${id} <<choice>>` : label === id ? `state ${id}` : `${id} : ${label}`,
      );
      continue;
    }
    if (s.kind !== 'state' || label === oneLine(s.label)) continue;
    if (s.labelAt === undefined) add(decls, s.group, `${id} : ${label}`);
    else if (label === id) patch.replace(s.labelAt, `state ${id}`);
    else
      patch.replace(
        s.labelAt,
        s.form === 'alias' ? `state "${label.replace(/"/g, '#quot;')}" as ${id}` : `${id} : ${label}`,
      );
  }
  // Transitions: kept, rewritten or removed by key, new ones added in their scope.
  const drawnBefore = drawnKeysSafe(code),
    keysBefore = edgeKeys(p.transitions, id => drawnBefore.has(id)),
    tags = new Map<string, string>(),
    byKey = new Map(arrows.map(a => [keyOf(a, input.frameId), a]));
  p.transitions.forEach((t, k) => {
    const a = keysBefore[k] ? byKey.get(keysBefore[k]!) : undefined;
    if (!a || tags.has(a.id)) return patch.remove(t.at);
    tags.set(a.id, `@${t.at}`);
    const from = ids.get(a.from!)!,
      to = ids.get(a.to!)!;
    if (from !== t.from || to !== t.to || oneLine(a.text) !== oneLine(t.label))
      patch.replace(t.at, transition(from, to, a.text));
  });
  for (const a of arrows.filter(a => !tags.has(a.id))) {
    const from = ids.get(a.from!),
      to = ids.get(a.to!);
    if (!from || !to) continue;
    const pseudo = [from, to].find(id => id.startsWith('[*]'))?.split(':')[1];
    const scope = pseudo
      ? pseudo === 'root'
        ? undefined
        : pseudo
      : groupOfId(from, nodeById, groupOf) === groupOfId(to, nodeById, groupOf)
        ? groupOfId(from, nodeById, groupOf)
        : undefined;
    add(edges, scope, transition(from, to, a.text), a.id);
  }
  // Place the new lines: before the closing brace of their composite state, or at the end.
  for (const scope of new Set([...decls.keys(), ...edges.keys()])) {
    const end = present.has(scope) ? p.groupLines.get(scope)?.endAt : undefined;
    const indent = end !== undefined ? patch.inner(end) : '  ',
      lines = [...(decls.get(scope) ?? []), ...(edges.get(scope) ?? [])].map(l => ({ ...l, text: indent + l.text }));
    if (end !== undefined) patch.insertBefore(end, ...lines);
    else patch.append(...lines);
  }
  const out = patch.build(),
    next = parseStateDiagram(out.code),
    edgeByLine = edgeKeysByLine(next.transitions, drawnKeys(out.code));
  // A start or end marker without transitions is not in the code (it is detached until the next rebuild).
  const keys = new Map<string, string>(),
    written = new Set([...next.states.map(s => s.id), ...next.groups.map(g => g.id)]);
  for (const [itemId, id] of ids) if (written.has(id)) keys.set(itemId, id);
  for (const a of arrows) {
    const key = edgeByLine.get(outLine(out.lineOf, tags, a.id) ?? -1);
    if (key) keys.set(a.id, key);
  }
  return { code: out.code, keys };
}
const nodeOrFrame = (input: WriteInput, id: string, ids: Map<string, string>) =>
  input.members.find(m => ids.get(m.id) === id);
const groupOfId = (id: string, nodes: Map<string, Item>, groupOf: (i: Item) => string | undefined) => {
  const n = nodes.get(id);
  return n ? groupOf(n) : undefined;
};
/** Keys the stored code draws; empty when it does not convert (then every transition counts as new). */
function drawnKeysSafe(code: string): Set<string> {
  try {
    return drawnKeys(code);
  } catch {
    return new Set();
  }
}

// ---- Class diagrams -----------------------------------------------------------------------------------------
const classId = /^[A-Za-z_]\w*$/;
const memberText = (r: EntityRow) =>
  [r.name, r.type]
    .map(s => (s ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/^[{}]$/, '');
/** Heads a class relation can be written with; others count as none. */
const classHead = (h: ConnectorHead | undefined): ConnectorHead =>
  h === 'open' || h === 'diamond' || h === 'arrow' ? h : 'none';
const leftMark: Partial<Record<ConnectorHead, string>> = { open: '<|', diamond: '*', arrow: '<' };
/** A relation as the parser reads it: the marked end first, one mark only. */
function canonical(from: string, to: string, start: ConnectorHead, end: ConnectorHead) {
  if (start === 'none' && end !== 'none') return { from: to, to: from, head: end };
  return { from, to, head: start };
}
function classRelationLine(
  r: ClassRelation | undefined,
  c: { from: string; to: string; head: ConnectorHead },
  dashed: boolean,
  label: string,
) {
  const sameMark = !!r && classHead(r.startHead) === c.head && !!r.dash === dashed;
  const swapped = !!r && r.from !== r.left;
  const [left, right] = sameMark && swapped ? [c.to, c.from] : [c.from, c.to];
  const arrow = sameMark ? r!.arrow : `${leftMark[c.head] ?? ''}${dashed ? '..' : '--'}`;
  const card = (name: string) => (!r ? '' : name === r.left ? r.cards[0] : name === r.right ? r.cards[1] : '');
  const text = oneLine(label).replace(/<br\/>/g, ' ');
  return [left, card(left), arrow, card(right), right].filter(Boolean).join(' ') + (text ? ` : ${text}` : '');
}

export function writeClass(input: WriteInput): WriteResult {
  const empty: ParsedClass = { direction: 'TB', classes: [], relations: [], notes: [] };
  const { code, parsed: p } = base(input.code, parseClassDiagram, 'classDiagram', empty);
  const patch = new LinePatch(code),
    nodes = nodesOf(input).filter(n => n.type === 'entity'),
    arrows = arrowsOf(input).filter(a => nodes.some(n => n.id === a.from) && nodes.some(n => n.id === a.to));
  const ids = new Map<string, string>(),
    taken = new Set(p.classes.map(c => c.id));
  for (const n of nodes) {
    const k = keyOf(n, input.frameId);
    if (p.classes.some(c => c.id === k) && ![...ids.values()].includes(k)) ids.set(n.id, k);
  }
  for (const n of nodes.filter(n => !ids.has(n.id))) {
    const id = freshId(n.text, taken, 'C', classId, ['class', 'namespace', 'direction', 'note']);
    taken.add(id);
    ids.set(n.id, id);
  }
  const present = new Set(ids.values()),
    gone = p.classes.filter(c => !present.has(c.id)).map(c => c.id),
    tail: NewLine[] = [];
  // Deleted classes: their declaration, member block and member lines, and lines that name only them.
  for (const c of p.classes.filter(c => gone.includes(c.id))) {
    if (c.declAt !== undefined) for (let at = c.declAt; at <= (c.blockEnd ?? c.declAt); at++) patch.remove(at);
    c.memberAt.forEach(at => patch.remove(at));
  }
  if (gone.length) removeNaming(patch, gone);
  for (const n of nodes) {
    const id = ids.get(n.id)!,
      c = p.classes.find(x => x.id === id),
      title = n.text.trim() || id,
      rows = ((n.data?.rows ?? []) as EntityRow[]).map(memberText).filter(Boolean);
    if (!c) {
      const named = title === id ? '' : `["${title.replace(/"/g, "'")}"]`;
      tail.push({ text: `  class ${id}${named}${rows.length ? ' {' : ''}` });
      if (rows.length) tail.push(...rows.map(r => ({ text: `    ${r}` })), { text: '  }' });
      continue;
    }
    if (title !== c.label) {
      const named = title === classDefaultLabel(c.raw) ? '' : `["${title.replace(/"/g, "'")}"]`;
      const decl = `class ${c.raw}${named}${c.declOpen ? ' {' : ''}`;
      if (c.declAt !== undefined) patch.replace(c.declAt, decl);
      else tail.push({ text: `  ${decl}` });
    }
    const steps = align(c.members, rows, (a, b) => a === b);
    const loose = patchList(patch, c.memberAt, steps, (k, like) =>
      c.memberInBlock[like] ? rows[k] : `${c.id} : ${rows[k]}`,
    );
    if (!loose.length) continue;
    if (c.declOpen && c.blockEnd !== undefined)
      patch.insertBefore(c.blockEnd, ...loose.map(k => ({ text: patch.inner(c.blockEnd!) + rows[k] })));
    else tail.push(...loose.map(k => ({ text: `  ${c.id} : ${rows[k]}` })));
  }
  // Relations by key.
  const keysBefore = edgeKeys(p.relations, id => taken.has(id)),
    tags = new Map<string, string>(),
    byKey = new Map(arrows.map(a => [keyOf(a, input.frameId), a]));
  const shaped = (a: Item) =>
    canonical(
      ids.get(a.from!)!,
      ids.get(a.to!)!,
      classHead(a.connector?.startHead),
      classHead(a.connector?.endHead ?? 'arrow'),
    );
  p.relations.forEach((r, k) => {
    const a = keysBefore[k] ? byKey.get(keysBefore[k]!) : undefined;
    if (!a || tags.has(a.id)) return patch.remove(r.at);
    tags.set(a.id, `@${r.at}`);
    const c = shaped(a);
    const same =
      c.from === r.from &&
      c.to === r.to &&
      c.head === classHead(r.startHead) &&
      isDashed(a) === !!r.dash &&
      oneLine(a.text) === oneLine(r.label);
    if (!same) patch.replace(r.at, classRelationLine(r, c, isDashed(a), a.text));
  });
  for (const a of arrows.filter(a => !tags.has(a.id)))
    tail.push({ text: `  ${classRelationLine(undefined, shaped(a), isDashed(a), a.text)}`, tag: a.id });
  patch.append(...tail);
  const out = patch.build(),
    next = parseClassDiagram(out.code),
    edgeByLine = edgeKeysByLine(next.relations, new Set(next.classes.map(c => c.id)));
  const keys = new Map(ids);
  for (const a of arrows) {
    const key = edgeByLine.get(outLine(out.lineOf, tags, a.id) ?? -1);
    if (key) keys.set(a.id, key);
  }
  return { code: out.code, keys };
}

/** Drop lines (styling, notes, links, annotations) that name a deleted class or entity. */
const naming = [
  /^(?:note\s+for|style|click|link|callback)\s+([\w~-]+)/i,
  /^cssClass\s+"([^"]+)"/,
  /^<<.*>>\s*([\w~]+)$/,
];
function removeNaming(patch: LinePatch, gone: string[]) {
  const names = new Set(gone);
  patch.lines.forEach((raw, at) => {
    const line = raw.replace(/%%.*$/, '').trim();
    const named = naming.map(r => r.exec(line)?.[1]).find(Boolean);
    if (named && named.split(',').some(n => names.has(n.trim().replace(/~.*~$/, '')))) patch.remove(at);
  });
}

// ---- ER diagrams --------------------------------------------------------------------------------------------
const erId = /^[A-Za-z_][\w-]*$/;
const erLeft: Partial<Record<ConnectorHead, string>> = {
  one: '||',
  'zero-one': '|o',
  'one-many': '}|',
  many: '}|',
  'zero-many': '}o',
};
const erRight: Partial<Record<ConnectorHead, string>> = {
  one: '||',
  'zero-one': 'o|',
  'one-many': '|{',
  many: '|{',
  'zero-many': 'o{',
};
const erLabel = (text: string) => {
  const t = text.replace(/\s+/g, ' ').trim();
  return /^[\w-]+$/.test(t) ? t : `"${t.replace(/"/g, "'")}"`;
};
const erRelation = (from: string, to: string, start?: ConnectorHead, end?: ConnectorHead, dashed = false, label = '') =>
  `${from} ${erLeft[start ?? 'one'] ?? '||'}${dashed ? '..' : '--'}${erRight[end ?? 'one'] ?? '||'} ${to} : ${erLabel(label)}`;
const erWord = (text: string, fallback: string, pattern = /[^\w-]/g) =>
  text.trim().replace(/\s+/g, '_').replace(pattern, '_') || fallback;
const rowEq = (a: EntityRow, b: EntityRow) => a.name === b.name && a.type === b.type && (a.key ?? '') === (b.key ?? '');

export function writeEr(input: WriteInput): WriteResult {
  const empty: ParsedEr = { entities: [], relations: [], notes: [] };
  const { code, parsed: p } = base(input.code, parseErDiagram, 'erDiagram', empty);
  const patch = new LinePatch(code),
    nodes = nodesOf(input).filter(n => n.type === 'entity'),
    arrows = arrowsOf(input).filter(a => nodes.some(n => n.id === a.from) && nodes.some(n => n.id === a.to));
  const ids = new Map<string, string>(),
    taken = new Set(p.entities.map(e => e.id));
  for (const n of nodes) {
    const k = keyOf(n, input.frameId);
    if (p.entities.some(e => e.id === k) && ![...ids.values()].includes(k)) ids.set(n.id, k);
  }
  for (const n of nodes.filter(n => !ids.has(n.id))) {
    const id = freshId(n.text, taken, 'E', erId, ['direction', 'title']);
    taken.add(id);
    ids.set(n.id, id);
  }
  const present = new Set(ids.values()),
    tail: NewLine[] = [];
  const gone = p.entities.filter(e => !present.has(e.id));
  for (const e of gone) {
    if (e.blockAt !== undefined) for (let at = e.blockAt; at <= (e.blockEnd ?? e.blockAt); at++) patch.remove(at);
    e.loneAt.forEach(at => patch.remove(at));
  }
  if (gone.length)
    removeNaming(
      patch,
      gone.map(e => e.id),
    );
  const rowLine = (r: EntityRow, old?: { keys: string; comment: string; key?: string }) => {
    const keys = r.key ? (old && old.key === r.key ? old.keys : r.key) : '';
    return [erWord(r.type, 'string', /[^\w()[\]-]/g), erWord(r.name, 'field'), keys, old?.comment ?? '']
      .filter(Boolean)
      .join(' ');
  };
  for (const n of nodes) {
    const id = ids.get(n.id)!,
      e = p.entities.find(x => x.id === id),
      title = n.text.trim() || id,
      alias = title === id ? '' : `["${title.replace(/"/g, "'").replace(/]/g, ')')}"]`,
      rows = ((n.data?.rows ?? []) as EntityRow[]).filter(r => r.name.trim() || r.type.trim());
    // Lines relative to the block's indentation.
    const block = [`${id}${alias} {`, ...rows.map(r => `  ${rowLine(r)}`), '}'];
    if (!e) {
      tail.push(...(rows.length ? block : [`${id}${alias}`]).map(text => ({ text: `  ${text}` })));
      continue;
    }
    if (e.blockAt === undefined && !e.rows.length && rows.length) {
      // The entity gets an attribute block, in place of a line that only named it.
      if (e.loneAt.length) patch.replace(e.loneAt[0], ...block);
      else tail.push(...block.map(text => ({ text: `  ${text}` })));
      continue;
    }
    if (title !== e.label) {
      if (e.blockAt !== undefined) patch.replace(e.blockAt, `${id}${alias} {`);
      else if (e.loneAt.length) patch.replace(e.loneAt[0], `${id}${alias}`);
      else tail.push({ text: `  ${id}${alias}` });
    }
    const steps = align(e.rows, rows, rowEq);
    const loose = patchList(patch, e.rowAt, steps, (k, like) =>
      rowLine(rows[k], { keys: e.rowKeys[like], comment: e.rowComment[like], key: e.rows[like]?.key }),
    );
    if (loose.length && e.blockEnd !== undefined)
      patch.insertBefore(e.blockEnd, ...loose.map(k => ({ text: patch.inner(e.blockEnd!) + rowLine(rows[k]) })));
  }
  const keysBefore = edgeKeys(p.relations, id => p.entities.some(e => e.id === id)),
    tags = new Map<string, string>(),
    byKey = new Map(arrows.map(a => [keyOf(a, input.frameId), a]));
  const lineOf = (a: Item) =>
    erRelation(ids.get(a.from!)!, ids.get(a.to!)!, a.connector?.startHead, a.connector?.endHead, isDashed(a), a.text);
  p.relations.forEach((r, k) => {
    const a = keysBefore[k] ? byKey.get(keysBefore[k]!) : undefined;
    if (!a || tags.has(a.id)) return patch.remove(r.at);
    tags.set(a.id, `@${r.at}`);
    if (lineOf(a) !== erRelation(r.from, r.to, r.startHead, r.endHead, !!r.dash, r.label))
      patch.replace(r.at, lineOf(a));
  });
  for (const a of arrows.filter(a => !tags.has(a.id))) tail.push({ text: `  ${lineOf(a)}`, tag: a.id });
  patch.append(...tail);
  const out = patch.build(),
    next = parseErDiagram(out.code),
    edgeByLine = edgeKeysByLine(next.relations, new Set(next.entities.map(e => e.id)));
  const keys = new Map(ids);
  for (const a of arrows) {
    const key = edgeByLine.get(outLine(out.lineOf, tags, a.id) ?? -1);
    if (key) keys.set(a.id, key);
  }
  return { code: out.code, keys };
}

/** The shapes-to-code writer of each diagram kind except flowcharts (written in mermaid-link.ts). */
export const writers: Record<Exclude<LinkKind, 'flowchart'>, (input: WriteInput) => WriteResult> = {
  state: writeState,
  class: writeClass,
  er: writeEr,
  sequence: writeSequence,
};
