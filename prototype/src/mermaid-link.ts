// A diagram converted from Mermaid code stays linked to that code. The shapes sit in a frame whose
// `data.mermaid` holds the code plus a hash of each side at the last sync; every generated object carries its
// Mermaid key (`mermaidNode`), so rebuilding from code keeps what the person changed on the canvas.
//
// Sync rules:
// - Code to shapes (every diagram type): rebuilding keeps the objects whose key still exists (same object id,
//   position, size and style; text, shape kind and table rows come from the code), lays out new keys, deletes
//   keys that disappeared and rebuilds connectors (keeping their routing and colour). Sequence diagrams keep only
//   colours and styles: their messages hang off the participant columns, so the layout is always redone.
// - Shapes to code (flowcharts only): labels, shape kinds, added or deleted shapes, frames (subgraphs) and
//   connectors (label, dotted, thick, arrowhead) are written back to the code; positions and colours are not.
// - Sequence, class, state and ER diagrams sync from code to shapes only: canvas edits are kept until the next
//   rebuild and are never written into the code.
import type { Board, ConnectorFormat, Item, Point } from './model.ts';
import { createItem } from './model.ts';
import { brackets, edgeKey, mermaidKind, mermaidToNative } from './mermaid-native.ts';
import type { MermaidKind } from './mermaid-native.ts';
import { contains, itemBounds } from './interactions.ts';
import type { Bounds } from './interactions.ts';
import { isShapeKind } from './shapes.ts';
import { editableIds } from './arrange.ts';
import { MERMAID_CODE_MAX, hasLinks, hashText, linkOf, linkedMembers } from './mermaid-link-rules.ts';
import type { LinkKind, MermaidLink } from './mermaid-link-rules.ts';

export { linkOf, linkedMembers, MERMAID_CODE_MAX } from './mermaid-link-rules.ts';
export type { MermaidLink } from './mermaid-link-rules.ts';

/** Space between the frame edge and the diagram. */
const PAD = 40;
export const kindLabels: Record<LinkKind, string> = {
  flowchart: 'Flowchart',
  sequence: 'Sequence diagram',
  class: 'Class diagram',
  state: 'State diagram',
  er: 'ER diagram',
};
/** What syncs in which direction, in words for the edit panel. */
export function syncSummary(kind: LinkKind): string {
  return kind === 'flowchart'
    ? 'Two-way: renaming, adding or deleting shapes, frames and connectors inside the frame updates the code, and applying the code updates the shapes. Positions and colours stay on the canvas only, and shapes without a Mermaid form are written as rectangles. Styling lines (classDef, class, style, click) are kept; linkStyle lines and comments are dropped when the code is rewritten.'
    : `Code to shapes only: applying the code rebuilds the ${kindLabels[kind].toLowerCase()} and ${
        kind === 'sequence'
          ? 'keeps the colours of existing objects (the layout is redone)'
          : 'keeps moved objects in place'
      }. Edits on the canvas are not written back into ${kindLabels[kind].toLowerCase()} code.`;
}

const keyOf = (i: Item, frameId: string) => (i.mermaidNode?.frame === frameId ? i.mermaidNode.id : '');
const area = (b: Bounds) => b.w * b.h;
/**
 * The smallest member frame (subgraph) that holds the object, or undefined at the top level. Between two frames of
 * the same size, the one painted first holds the other.
 */
function parentFrame(item: Item, frames: Item[], items: Item[]): Item | undefined {
  const box = itemBounds(item, items),
    order = (i: Item) => items.findIndex(n => n.id === i.id);
  return frames
    .filter(
      f =>
        f.id !== item.id &&
        contains(f, box) &&
        (item.type !== 'frame' || area(f) > area(box) || order(f) < order(item)),
    )
    .sort((a, b) => area(a) - area(b) || order(b) - order(a))[0];
}

/** A text fingerprint of the diagram as the code sees it (no positions or colours), used for change detection. */
export function shapesSignature(board: Board, frame: Item, members = linkedMembers(board, frame)): string {
  const link = linkOf(frame);
  if (!link) return '';
  const byId = new Map(members.map(m => [m.id, m])),
    frames = members.filter(m => m.type === 'frame'),
    key = (i: Item | undefined) => (i ? keyOf(i, frame.id) || '?' : '');
  const lines = members.map(m => {
    if (m.type === 'arrow') {
      const c = m.connector ?? {};
      const style = [c.dash === 'dotted' || c.dash === 'dashed' ? 'dot' : '', (c.width ?? 2) >= 4 ? 'thick' : ''];
      const heads = link.kind === 'flowchart' ? [c.endHead === 'none' ? 'open' : ''] : [c.startHead, c.endHead];
      const ends = `${key(byId.get(m.from ?? ''))}>${key(byId.get(m.to ?? ''))}`;
      return ['E', link.kind === 'flowchart' ? ends : `${key(m)}:${ends}`, m.text, ...style, ...heads].join('|');
    }
    const rows = m.type === 'entity' ? JSON.stringify(m.data?.rows ?? []) : '';
    return [
      m.type === 'frame' ? 'F' : 'N',
      key(m),
      m.type,
      m.text,
      rows,
      key(parentFrame(m, frames, board.items)),
    ].join('|');
  });
  return lines.sort().join('\n');
}

export type LinkState = 'synced' | 'code' | 'shapes' | 'both' | 'empty';
/** Which side changed since the last sync; `empty` when the frame holds no diagram objects. */
export function linkState(board: Board, frameId: string): LinkState {
  const frame = board.items.find(i => i.id === frameId),
    link = linkOf(frame);
  if (!link || !frame) return 'synced';
  const members = linkedMembers(board, frame);
  if (!members.some(m => m.type !== 'arrow')) return 'empty';
  const code = hashText(link.code) !== link.codeHash,
    shapes = hashText(shapesSignature(board, frame, members)) !== link.shapesHash;
  return code && shapes ? 'both' : code ? 'code' : shapes ? 'shapes' : 'synced';
}
export const stateLabels: Record<LinkState, string> = {
  synced: 'Mermaid · linked',
  code: 'Mermaid · code not applied',
  shapes: 'Mermaid · shapes edited',
  both: 'Mermaid · both changed',
  empty: 'Mermaid · no shapes',
};

const withLink = (frame: Item, link: MermaidLink): Item => ({ ...frame, data: { ...frame.data, mermaid: link } });
const union = (boxes: Bounds[]): Bounds | null => {
  if (!boxes.length) return null;
  const x = Math.min(...boxes.map(b => b.x)),
    y = Math.min(...boxes.map(b => b.y));
  return { x, y, w: Math.max(...boxes.map(b => b.x + b.w)) - x, h: Math.max(...boxes.map(b => b.y + b.h)) - y };
};
/** Seal the link: store the code and the hashes of both sides as they are now. */
function sealed(board: Board, frameId: string, code: string, kind: LinkKind): Board {
  const frame = board.items.find(i => i.id === frameId)!;
  const draft = withLink(frame, { code, kind, codeHash: hashText(code), shapesHash: '00000000' });
  const temp = { ...board, items: board.items.map(i => (i.id === frameId ? draft : i)) };
  const link = { code, kind, codeHash: hashText(code), shapesHash: hashText(shapesSignature(temp, draft)) };
  return { ...board, items: board.items.map(i => (i.id === frameId ? withLink(frame, link) : i)) };
}

function mark(items: Item[], keys: Record<string, string>, frameId: string): Item[] {
  return items.map(i => (keys[i.id] ? { ...i, mermaidNode: { frame: frameId, id: keys[i.id].slice(0, 200) } } : i));
}

/**
 * Convert code into a frame holding linked shapes and connectors (origin is the frame's top-left).
 * Returns the frame first, then the diagram. Throws when the code cannot be converted.
 */
export function convertToLinked(code: string, origin: Point): { items: Item[]; frame: Item; notes: string[] } {
  if (code.length > MERMAID_CODE_MAX) throw new Error('Mermaid code is limited to 6,000 characters.');
  const kind = mermaidKind(code);
  const made = mermaidToNative(code, { x: origin.x + PAD, y: origin.y + PAD });
  if (!kind) throw new Error('Only flowcharts, sequence, class, state and ER diagrams can be converted to shapes.');
  const base = createItem('frame', origin.x, origin.y),
    items = mark(made.items, made.keys, base.id),
    box = union(items.map(i => itemBounds(i, items)))!;
  const frame: Item = {
    ...base,
    x: Math.round(box.x - PAD),
    y: Math.round(box.y - PAD),
    w: Math.round(box.w + PAD * 2),
    h: Math.round(box.h + PAD * 2),
    text: kindLabels[kind],
  };
  const board = sealed({ version: 1, title: '', items: [frame, ...items] }, frame.id, code, kind);
  return { items: board.items, frame: board.items[0], notes: made.notes };
}

/** Throw unless the frame and all of its diagram objects can be edited (locks and locked layers). */
function assertEditable(board: Board, frame: Item, members: Item[]) {
  const ids = [frame.id, ...members.map(m => m.id)];
  const editable = new Set(editableIds(board, ids));
  if (ids.some(id => !editable.has(id))) throw new Error('Unlock the frame and the shapes in this diagram to sync it.');
}

/** Merge an existing object into its regenerated counterpart, keeping what the person changed on the canvas. */
function merge(old: Item, made: Item, kind: MermaidKind): Item {
  const node = (i: Item) => i.type !== 'arrow' && i.type !== 'frame';
  const keepStyle = (i: Item) => {
    const out: Item = { ...i, id: old.id, fill: old.fill };
    for (const k of ['style', 'format', 'opacity', 'layer', 'name', 'tags', 'link', 'createdAt'] as const)
      if (old[k] !== undefined) (out as Record<string, unknown>)[k] = old[k];
    return out;
  };
  if (kind === 'sequence') return keepStyle(made);
  if (made.type === 'frame' && old.type === 'frame') return { ...old, text: made.text, mermaidNode: made.mermaidNode };
  if (made.type === 'arrow' && old.type === 'arrow') {
    const c: ConnectorFormat = { ...old.connector },
      m = made.connector ?? {};
    if (kind === 'flowchart') {
      if (m.dash) c.dash = c.dash === 'dashed' || c.dash === 'dotted' ? c.dash : m.dash;
      else if (c.dash !== 'solid') delete c.dash;
      if (m.width) c.width = Math.max(m.width, c.width ?? 0);
      else if ((c.width ?? 2) >= 4) delete c.width;
      if (m.endHead === 'none') c.endHead = 'none';
      else if (c.endHead === 'none') delete c.endHead;
    } else {
      for (const k of ['dash', 'width', 'startHead', 'endHead'] as const) {
        if (m[k] !== undefined) (c as Record<string, unknown>)[k] = m[k];
        else delete c[k];
      }
    }
    return { ...old, text: made.text, from: made.from, to: made.to, connector: c, mermaidNode: made.mermaidNode };
  }
  if (node(made) && node(old) && (made.type === 'entity') === (old.type === 'entity')) {
    const out: Item = { ...old, type: made.type, text: made.text, mermaidNode: made.mermaidNode };
    if (made.type === 'entity') {
      out.data = { ...old.data, ...made.data };
      out.h = made.h;
    }
    return out;
  }
  return { ...keepStyle(made), x: old.x, y: old.y };
}

/**
 * Rebuild the linked diagram from code in one board change: objects whose Mermaid key is still in the code keep
 * their id, position, size and style; new keys are placed by the layout; keys no longer in the code are deleted.
 */
export function rebuildFromCode(board: Board, frameId: string, code: string): { board: Board; notes: string[] } {
  const frame = board.items.find(i => i.id === frameId);
  if (!frame || !linkOf(frame)) throw new Error('This frame is not linked to Mermaid code.');
  if (code.length > MERMAID_CODE_MAX) throw new Error('Mermaid code is limited to 6,000 characters.');
  const kind = mermaidKind(code);
  if (!kind) throw new Error('Only flowcharts, sequence, class, state and ER diagrams can be converted to shapes.');
  const members = linkedMembers(board, frame);
  assertEditable(board, frame, members);
  const made = mermaidToNative(code, { x: frame.x + PAD, y: frame.y + PAD });
  const generated = mark(made.items, made.keys, frame.id);
  const old = new Map<string, Item>();
  for (const m of members) {
    const k = keyOf(m, frame.id);
    if (k && !old.has(k)) old.set(k, m);
  }
  const idMap = new Map<string, string>(),
    reused = new Set<string>();
  let next = generated.map(g => {
    const o = old.get(g.mermaidNode!.id);
    if (!o) return g;
    old.delete(g.mermaidNode!.id);
    reused.add(o.id);
    idMap.set(g.id, o.id);
    return merge(o, g, kind);
  });
  next = next.map(i =>
    i.type === 'arrow'
      ? { ...i, from: i.from && (idMap.get(i.from) ?? i.from), to: i.to && (idMap.get(i.to) ?? i.to) }
      : i,
  );
  // Subgraph frames wrap their members where they are now (members as laid out by the generator).
  if (kind !== 'sequence') {
    const genFrames = generated.filter(g => g.type === 'frame').sort((a, b) => area(a) - area(b));
    const finalOf = (genId: string) => next.find(n => n.id === (idMap.get(genId) ?? genId))!;
    for (const gf of genFrames) {
      const inside = generated.filter(g => g.id !== gf.id && g.type !== 'arrow' && contains(gf, g));
      const box = union(inside.map(g => finalOf(g.id)));
      if (!box) continue;
      const target = finalOf(gf.id);
      Object.assign(target, { x: box.x - 30, y: box.y - 30, w: box.w + 60, h: box.h + 60 });
    }
  }
  const removed = new Set(members.filter(m => !reused.has(m.id)).map(m => m.id));
  const memberIds = new Set(members.map(m => m.id));
  // Other objects inside the frame (images, notes) keep their place, and the frame grows to keep holding them.
  const others = board.items.filter(
    i =>
      i.id !== frameId &&
      !memberIds.has(i.id) &&
      i.type !== 'arrow' &&
      !(i.mermaidNode?.frame === frameId) &&
      contains(frame, itemBounds(i, board.items)),
  );
  const kept = board.items
    .filter(i => !memberIds.has(i.id))
    .filter(i => !(i.type === 'arrow' && ((i.from && removed.has(i.from)) || (i.to && removed.has(i.to)))))
    .map(i => {
      if (i.mermaidNode?.frame !== frameId) return i;
      // Marked objects dragged out of the frame are no longer part of the diagram.
      const copy = { ...i };
      delete copy.mermaidNode;
      return copy;
    });
  const at = kept.findIndex(i => i.id === frameId);
  const items = [...kept.slice(0, at + 1), ...next, ...kept.slice(at + 1)];
  const box = union([...next, ...others].map(i => itemBounds(i, items)));
  const fitted: Item = box
    ? {
        ...frame,
        x: Math.round(box.x - PAD),
        y: Math.round(box.y - PAD),
        w: Math.max(200, Math.round(box.w + PAD * 2)),
        h: Math.max(120, Math.round(box.h + PAD * 2)),
      }
    : frame;
  if (linkOf(frame)!.kind !== kind && frame.text === kindLabels[linkOf(frame)!.kind]) fitted.text = kindLabels[kind];
  const result = { ...board, items: items.map(i => (i.id === frameId ? fitted : i)) };
  return { board: sealed(result, frameId, code, kind), notes: made.notes };
}

// ---- Shapes to code (flowcharts) ----------------------------------------------------------------
const idPattern = /^[A-Za-z0-9_]+$/;
const reserved = new Set(['end', 'subgraph', 'graph', 'flowchart', 'style', 'class', 'classDef', 'click', 'linkStyle']);
const encode = (text: string) =>
  text
    .replace(/"/g, '#quot;')
    .replace(/[[\](){}|]/g, ch => `#${ch.charCodeAt(0)};`)
    .replace(/\r?\n/g, '<br/>');
/** A label as written in code: plain when it is safe to, otherwise quoted with entity codes. */
const label = (text: string) =>
  /^[\p{L}\p{N}_][\p{L}\p{N} _.,:!?'&+*%@$-]*$/u.test(text) && text === text.trim() && !/--|==|-\./.test(text)
    ? text
    : `"${encode(text) || ' '}"`;

/**
 * Write the flowchart back from the shapes in its frame. New or duplicated shapes get fresh ids (n1, n2, … and
 * g1, g2, … for frames), objects moved out of the frame leave the diagram. Throws when the code would be too long.
 */
export function codeFromShapes(board: Board, frameId: string): { board: Board; code: string } {
  const frame = board.items.find(i => i.id === frameId),
    link = linkOf(frame);
  if (!frame || !link) throw new Error('This frame is not linked to Mermaid code.');
  if (link.kind !== 'flowchart') throw new Error(`${kindLabels[link.kind]} code is not updated from shapes.`);
  const members = linkedMembers(board, frame),
    used = new Set<string>(),
    ids = new Map<string, string>();
  let counter = 0;
  const fresh = (prefix: string) => {
    while (used.has(`${prefix}${counter + 1}`)) counter++;
    return `${prefix}${++counter}`;
  };
  for (const m of members.filter(m => m.type !== 'arrow')) {
    const k = keyOf(m, frameId);
    if (k && idPattern.test(k) && !reserved.has(k) && !used.has(k)) {
      used.add(k);
      ids.set(m.id, k);
    }
  }
  for (const m of members.filter(m => m.type !== 'arrow' && !ids.has(m.id))) {
    const k = fresh(m.type === 'frame' ? 'g' : 'n');
    used.add(k);
    ids.set(m.id, k);
  }
  const nodes = members.filter(m => m.type !== 'arrow' && m.type !== 'frame'),
    frames = members.filter(m => m.type === 'frame'),
    arrows = members.filter(m => m.type === 'arrow');
  const header = link.code.split('\n').find(l => l.trim() && !l.trim().startsWith('%%')) ?? '';
  const out = [/^\s*(flowchart|graph)\b/i.test(header) ? header.trim() : 'flowchart TB'];
  const emit = (parent: Item | undefined, indent: string) => {
    for (const f of frames.filter(f => parentFrame(f, frames, board.items) === parent)) {
      out.push(`${indent}subgraph ${ids.get(f.id)} [${label(f.text || 'Frame')}]`);
      emit(f, indent + '  ');
      out.push(`${indent}end`);
    }
    for (const n of nodes.filter(n => parentFrame(n, frames, board.items) === parent)) {
      const id = ids.get(n.id)!,
        [open, close] = (isShapeKind(n.type) && brackets[n.type]) || ['[', ']'];
      out.push(indent + (n.type === 'rectangle' && n.text === id ? id : `${id}${open}${label(n.text)}${close}`));
    }
  };
  emit(undefined, '  ');
  const edgeCount = new Map<string, number>(),
    edgeIds = new Map<string, string>();
  for (const e of arrows) {
    const c = e.connector ?? {},
      from = ids.get(e.from!)!,
      to = ids.get(e.to!)!,
      noHead = c.endHead === 'none',
      text = e.text.trim() ? `|${label(e.text)}|` : '';
    const arrow =
      c.dash === 'dotted' || c.dash === 'dashed'
        ? noHead
          ? '-.-'
          : '-.->'
        : (c.width ?? 2) >= 4
          ? noHead
            ? '==='
            : '==>'
          : noHead
            ? '---'
            : '-->';
    out.push(`  ${from} ${arrow}${text} ${to}`);
    const n = edgeCount.get(`${from}>${to}`) ?? 0;
    edgeCount.set(`${from}>${to}`, n + 1);
    edgeIds.set(e.id, edgeKey(from, to, n));
  }
  // Styling lines survive when every id they name is still in the diagram.
  for (const line of link.code.split('\n').map(l => l.trim())) {
    const style = /^(classDef|class|style|click)\s+(\S+)/.exec(line);
    if (!style) continue;
    if (style[1] === 'classDef' || style[2].split(',').every(id => used.has(id))) out.push(`  ${line}`);
  }
  const code = out.join('\n');
  if (code.length > MERMAID_CODE_MAX)
    throw new Error('The code for these shapes would be longer than 6,000 characters, so it was not updated.');
  const memberIds = new Set(members.map(m => m.id));
  const items = board.items.map(i => {
    const id = ids.get(i.id) ?? edgeIds.get(i.id);
    if (id) return keyOf(i, frameId) === id ? i : { ...i, mermaidNode: { frame: frameId, id } };
    if (i.mermaidNode?.frame === frameId && !memberIds.has(i.id)) {
      const copy = { ...i };
      delete copy.mermaidNode;
      return copy;
    }
    return i;
  });
  return { board: sealed({ ...board, items }, frameId, code, 'flowchart'), code };
}

/**
 * Automatic shapes-to-code sync, run on every board change: a linked flowchart whose shapes changed while its code
 * did not gets new code. Nothing happens when both sides changed (the edit panel asks which side wins).
 */
export function syncMermaidLinks(board: Board): Board {
  if (!hasLinks(board)) return board;
  let next = board;
  for (const frame of board.items.filter(i => linkOf(i)?.kind === 'flowchart'))
    // A locked frame keeps its code: the badge keeps showing that the shapes changed.
    if (editableIds(next, [frame.id]).includes(frame.id) && linkState(next, frame.id) === 'shapes')
      try {
        next = codeFromShapes(next, frame.id).board;
      } catch {
        // Too long: the badge keeps showing that the shapes changed.
      }
  return next;
}

const updateLink = (board: Board, frameId: string, change: (l: MermaidLink) => MermaidLink): Board => ({
  ...board,
  items: board.items.map(i => (i.id === frameId && linkOf(i) ? withLink(i, change(linkOf(i)!)) : i)),
});
/** Keep edited code without applying it (the link then shows that the code changed). */
export const storeCode = (board: Board, frameId: string, code: string): Board =>
  updateLink(board, frameId, l => ({ ...l, code: code.slice(0, MERMAID_CODE_MAX) }));
/** Accept the canvas edits of a code-to-shapes-only diagram as the new shapes state. */
export function keepShapes(board: Board, frameId: string): Board {
  const frame = board.items.find(i => i.id === frameId)!;
  return updateLink(board, frameId, l => ({ ...l, shapesHash: hashText(shapesSignature(board, frame)) }));
}
/** Drop the link: the shapes stay, the code and the Mermaid keys go. */
export function unlinkMermaid(board: Board, frameId: string): Board {
  if (!editableIds(board, [frameId]).includes(frameId)) throw new Error('Unlock the frame to unlink it.');
  return {
    ...board,
    items: board.items.map(i => {
      if (i.id === frameId && linkOf(i)) {
        const data = { ...i.data };
        delete data.mermaid;
        const copy: Item = { ...i, data };
        if (!Object.keys(data).length) delete copy.data;
        return copy;
      }
      if (i.mermaidNode?.frame !== frameId) return i;
      const copy = { ...i };
      delete copy.mermaidNode;
      return copy;
    }),
  };
}
