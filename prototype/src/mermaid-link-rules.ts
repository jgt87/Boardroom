// Data rules for diagrams linked to their Mermaid code: the link stored on a frame, the per-object Mermaid key,
// validation for parseBoard, and which objects belong to a linked frame. The sync itself is in mermaid-link.ts.
import type { Board, Item } from './model.ts';
import { contains, itemBounds } from './interactions.ts';
import { isShapeKind } from './shapes.ts';

export const MERMAID_CODE_MAX = 6000;
export const mermaidLinkKinds = ['flowchart', 'sequence', 'class', 'state', 'er'] as const;
export type LinkKind = (typeof mermaidLinkKinds)[number];
/**
 * Stored in `frame.data.mermaid`. `codeHash` and `shapesHash` describe both sides at the last sync, so a later
 * difference shows which side changed: code edited (not applied), shapes edited, or both.
 */
export type MermaidLink = { code: string; kind: LinkKind; codeHash: string; shapesHash: string };

const hashPattern = /^[0-9a-f]{8}$/;
const hasControl = (text: string) => [...text].some(ch => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127);

export function validateMermaidLink(value: unknown): void {
  const l = value as MermaidLink;
  if (
    !l ||
    typeof l !== 'object' ||
    Array.isArray(l) ||
    Object.keys(l).some(k => !['code', 'kind', 'codeHash', 'shapesHash'].includes(k)) ||
    typeof l.code !== 'string' ||
    l.code.length > MERMAID_CODE_MAX ||
    !(mermaidLinkKinds as readonly string[]).includes(l.kind) ||
    typeof l.codeHash !== 'string' ||
    !hashPattern.test(l.codeHash) ||
    typeof l.shapesHash !== 'string' ||
    !hashPattern.test(l.shapesHash)
  )
    throw new Error('Invalid Mermaid link.');
}
export function validateMermaidNode(value: unknown): void {
  const n = value as Item['mermaidNode'];
  if (
    !n ||
    typeof n !== 'object' ||
    Array.isArray(n) ||
    Object.keys(n).some(k => k !== 'frame' && k !== 'id') ||
    typeof n.frame !== 'string' ||
    !n.frame ||
    n.frame.length > 100 ||
    typeof n.id !== 'string' ||
    !n.id ||
    n.id.length > 200 ||
    hasControl(n.id)
  )
    throw new Error('Invalid Mermaid diagram reference.');
}

export const linkOf = (item: Item | undefined): MermaidLink | undefined =>
  item?.type === 'frame' && item.data?.mermaid ? (item.data.mermaid as MermaidLink) : undefined;
export const hasLinks = (board: Board) => board.items.some(i => i.type === 'frame' && !!i.data?.mermaid);

/** FNV-1a, 32 bits, as 8 hex digits. */
export function hashText(text: string): string {
  let h = 0x811c9dc5;
  for (let k = 0; k < text.length; k++) {
    h ^= text.charCodeAt(k);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Objects that make up a linked diagram, all inside its frame: objects created from the code (marked with
 * `mermaidNode.frame`) and, for flowcharts, shapes and frames added on the canvas that no other linked diagram
 * owns. Connectors belong when they are marked, or (flowcharts) join two member objects.
 */
export function linkedMembers(board: Board, frame: Item): Item[] {
  const link = linkOf(frame);
  if (!link) return [];
  const linked = new Set(board.items.filter(i => linkOf(i)).map(i => i.id));
  const nodes = board.items.filter(i => {
    if (i.id === frame.id || i.type === 'arrow' || linked.has(i.id)) return false;
    const mine = i.mermaidNode?.frame === frame.id,
      free = !i.mermaidNode || !linked.has(i.mermaidNode.frame);
    if (!mine && !(link.kind === 'flowchart' && free && (isShapeKind(i.type) || i.type === 'frame'))) return false;
    return contains(frame, itemBounds(i, board.items));
  });
  const ids = new Set(nodes.map(n => n.id));
  const arrows = board.items.filter(i => {
    if (i.type !== 'arrow') return false;
    const bound = !!i.from && !!i.to && ids.has(i.from) && ids.has(i.to);
    if (link.kind === 'flowchart') return bound;
    if (i.mermaidNode?.frame !== frame.id) return false;
    return bound || (!i.from && !i.to && contains(frame, itemBounds(i, board.items)));
  });
  return [...nodes, ...arrows];
}

/** The ids plus every object of each linked frame among them, so duplicate and copy take the whole diagram. */
export function expandLinked(board: Board, ids: string[]): string[] {
  const chosen = new Set(ids);
  if (!hasLinks(board)) return ids;
  for (const id of ids) {
    const frame = board.items.find(i => i.id === id);
    if (linkOf(frame)) for (const m of linkedMembers(board, frame!)) chosen.add(m.id);
  }
  return board.items.filter(i => chosen.has(i.id)).map(i => i.id);
}

/** Drop or remap the diagram reference of copied objects: kept only when their frame is copied too. */
export function remapMermaidNode(item: Item, map: Map<string, string>): Item {
  if (!item.mermaidNode) return item;
  const frame = map.get(item.mermaidNode.frame);
  if (frame) return { ...item, mermaidNode: { ...item.mermaidNode, frame } };
  const copy = { ...item };
  delete copy.mermaidNode;
  return copy;
}
