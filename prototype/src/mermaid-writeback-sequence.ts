// Shapes to code for linked sequence diagrams (item 132, decision R6c-Q2). What is read back from the canvas:
// - Participants: the top box of each column gives the name (`participant Id as Name`) and the kind (a rounded box
//   is an actor). A new rectangle or rounded box in the frame adds a participant (declared after the others); a
//   deleted top box removes the participant, its messages and notes, and lines that name it (activate, destroy).
// - Messages: each loose connector is a message between the columns nearest its two ends (an end far from every
//   column keeps the participant it had). Solid or dashed line, arrow, open or no head, and the label are written;
//   an unchanged message keeps its line as written (`-x`, activation `+`/`-`). A connector drawn between two
//   participant boxes is a message too and goes last.
// - Order: steps (messages and notes) follow their vertical position, so moving a line up or down reorders the
//   messages. Block lines (loop, alt, else, opt, par, critical, break, rect, box and their `end`) stay where they
//   are in the code; a step belongs to the block section its position falls in, measured on the converter's rows.
// - Notes: text; a new sticky note becomes `Note over` the nearest participant; existing notes keep their place.
// - Blocks: a renamed block frame rewrites its title; a deleted block frame removes its block lines (the steps in it
//   stay). Blocks are not created from the canvas.
// Other lines (comments, autonumber, activate/deactivate, styling) keep their place among the steps.
import type { Item } from './model.ts';
import { SEQ_BOX_H, SEQ_COL, SEQ_ROW, SEQ_TOP, parseSequence } from './mermaid-native.ts';
import type { ParsedSequence, SequenceMark, SequenceMessage, SequenceNote } from './mermaid-native.ts';
import { keyOf } from './mermaid-link-rules.ts';
import { freshId, isDashed, oneLine } from './mermaid-patch.ts';
import type { WriteInput, WriteResult } from './mermaid-writeback.ts';

type Column = { id: string; x: number };
/** The members of a linked sequence diagram by role, read from their Mermaid keys. */
type Parts = {
  tops: Map<string, Item>;
  bottoms: Map<string, Item>;
  steps: Map<number, Item>;
  blocks: Map<number, Item>;
  boxes: Item[];
  notes: Item[];
  arrows: Item[];
};
function partsOf(members: Item[], frameId: string): Parts {
  const parts: Parts = {
    tops: new Map(),
    bottoms: new Map(),
    steps: new Map(),
    blocks: new Map(),
    boxes: [],
    notes: [],
    arrows: [],
  };
  for (const m of members) {
    const k = keyOf(m, frameId),
      top = /^p:([^:]+)$/.exec(k),
      bottom = /^p:([^:]+):end$/.exec(k),
      step = /^s:(\d+)$/.exec(k),
      block = /^b:(\d+)$/.exec(k);
    if (top && !parts.tops.has(top[1])) parts.tops.set(top[1], m);
    else if (bottom) parts.bottoms.set(bottom[1], m);
    // Lifelines are drawn from the participants; detached objects (`x:`) wait for the next rebuild.
    else if (k.startsWith('l:') || k.startsWith('x:')) continue;
    else if (step && !parts.steps.has(+step[1])) parts.steps.set(+step[1], m);
    else if (block && m.type === 'frame') parts.blocks.set(+block[1], m);
    else if (m.type === 'arrow') parts.arrows.push(m);
    else if (m.type === 'note') parts.notes.push(m);
    else if (m.type === 'rectangle' || m.type === 'roundrect') parts.boxes.push(m);
  }
  return parts;
}
const centreX = (i: Item) => i.x + i.w / 2;
/** The column nearest x, if it is within half a column pitch. */
function nearest(columns: Column[], x: number): Column | undefined {
  let best: Column | undefined;
  for (const c of columns) if (!best || Math.abs(c.x - x) < Math.abs(best.x - x)) best = c;
  return best && Math.abs(best.x - x) <= SEQ_COL / 2 ? best : undefined;
}
/** Vertical position of a step: a message's start, a note's middle; connectors bound to boxes go last. */
const stepY = (i: Item) => (i.type === 'arrow' ? (i.from || i.to ? Infinity : i.y) : i.y + i.h / 2);

/**
 * Sequence-only parts of the shapes signature: the columns each message joins and the vertical order of steps and
 * block frames, so moving a message line (or one of its ends) counts as a change to write back.
 */
export function sequenceSignature(members: Item[], frameId: string): string[] {
  const parts = partsOf(members, frameId),
    columns = [...parts.tops].map(([id, top]) => ({ id, x: centreX(top) }));
  const key = (i: Item) => keyOf(i, frameId) || '?';
  const messages = [...parts.steps.values(), ...parts.arrows].filter(i => i.type === 'arrow' && !i.from && !i.to);
  const ends = messages.map(
    m => `M|${key(m)}|${nearest(columns, m.x)?.id ?? '?'}>${nearest(columns, m.x + m.w)?.id ?? '?'}`,
  );
  const tokens = [
    ...[...parts.steps.values(), ...parts.arrows, ...parts.notes].map(i => ({ y: stepY(i), t: key(i) })),
    ...[...parts.blocks.values()].flatMap(f => [
      { y: f.y, t: `[${key(f)}` },
      { y: f.y + f.h, t: `]${key(f)}` },
    ]),
  ].sort((a, b) => a.y - b.y || (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
  return [...ends.sort(), `O|${tokens.map(t => t.t).join(',')}`];
}

const participantId = /^[A-Za-z_]\w*$/;
const reserved = ['participant', 'actor', 'note', 'loop', 'alt', 'else', 'opt', 'par', 'and', 'end', 'rect', 'box'];
/** Message and note text on one line (`;` would end the statement). */
const stepText = (text: string) => oneLine(text).replace(/;/g, '#59;');
const arrowFor = (dashed: boolean, head: string) =>
  `${dashed ? '--' : '-'}${head === 'open' ? ')' : head === 'none' ? '>' : '>>'}`;
const headOf = (i: Item) => {
  const h = i.connector?.endHead;
  return h === 'open' || h === 'none' ? h : 'arrow';
};
const sides = { over: 'over', left: 'left of', right: 'right of' } as const;
const namingLine = /^(?:activate|deactivate|destroy|links?|create\s+(?:participant|actor))\s+([^\s:]+)/i;
/**
 * One step as written back: its line text, where it sorts and the item it came from; `at` is its old line, and
 * `same` says that line is kept as written.
 */
type Written = { item: Item; y: number; order: number; text: string; at?: number; same?: boolean };

export function writeSequence(input: WriteInput): WriteResult {
  let code = input.code,
    p: ParsedSequence;
  try {
    p = parseSequence(code);
  } catch {
    code = 'sequenceDiagram';
    p = { participants: [], steps: [], blocks: [], marks: [], notes: [] };
  }
  const lines = code.split(/\r?\n/),
    parts = partsOf(input.members, input.frameId);
  // Participants: existing ones whose top box is still there, then new boxes from left to right.
  const taken = new Set(p.participants.map(x => x.id)),
    present = p.participants.filter(x => parts.tops.has(x.id)),
    gone = new Set(p.participants.filter(x => !parts.tops.has(x.id)).map(x => x.id));
  const fresh = [...parts.boxes]
    .sort((a, b) => a.x - b.x || a.y - b.y)
    .map(box => {
      const id = freshId(box.text, taken, 'P', participantId, reserved);
      taken.add(id);
      return { id, box };
    });
  const boxOf = (id: string) => parts.tops.get(id) ?? fresh.find(f => f.id === id)?.box;
  // The name is the top box's text, or the bottom box's when only that one was renamed.
  const labelOf = (id: string) => {
    const old = p.participants.find(x => x.id === id),
      top = oneLine(boxOf(id)?.text ?? '') || id,
      bottom = oneLine(parts.bottoms.get(id)?.text ?? '') || top;
    return old && top === oneLine(old.label) && bottom !== top ? bottom : top;
  };
  const columns: Column[] = [
    ...present.map(x => ({ id: x.id, x: centreX(parts.tops.get(x.id)!) })),
    ...fresh.map(f => ({ id: f.id, x: centreX(f.box) })),
  ];
  const isPresent = (id: string) => columns.some(c => c.id === id);
  const resolve = (x: number, old?: string) =>
    nearest(columns, x)?.id ?? (old ? (isPresent(old) ? old : null) : columns[0] && closest(columns, x));
  const participantOfBox = (boxId: string | undefined) => {
    const box = input.members.find(m => m.id === boxId);
    const k = box ? /^p:([^:]+)(?::end)?$/.exec(keyOf(box, input.frameId))?.[1] : undefined;
    return k && isPresent(k) ? k : fresh.find(f => f.box.id === boxId)?.id;
  };
  // Steps as the canvas shows them.
  const written: Written[] = [];
  const message = (item: Item, old?: SequenceMessage) => {
    const bound = !!item.from || !!item.to;
    const from = bound ? participantOfBox(item.from) : resolve(item.x, old?.from),
      to = bound ? participantOfBox(item.to) : resolve(item.x + item.w, old?.to);
    if (!from || !to) return;
    const dashed = isDashed(item),
      head = headOf(item),
      text = stepText(item.text);
    const same =
      !!old &&
      old.from === from &&
      old.to === to &&
      old.dashed === dashed &&
      old.head === head &&
      stepText(old.text) === text;
    const arrow = old && old.dashed === dashed && old.head === head ? old.arrow : arrowFor(dashed, head);
    written.push({
      item,
      y: stepY(item),
      order: old ? p.steps.indexOf(old) : Infinity,
      text: `${from}${arrow}${old?.activation ?? ''}${to}: ${text}`,
      ...(old ? { at: old.at, same } : {}),
    });
  };
  const note = (item: Item, old?: SequenceNote) => {
    const over = old ? old.over.filter(isPresent) : [resolve(centreX(item))].filter((x): x is string => !!x);
    if (!over.length) return;
    const text = stepText(item.text),
      side = old?.side ?? 'over',
      same = !!old && over.length === old.over.length && stepText(old.text) === text;
    written.push({
      item,
      y: stepY(item),
      order: old ? p.steps.indexOf(old) : Infinity,
      text: `Note ${sides[side]} ${over.join(',')}: ${text}`,
      ...(old ? { at: old.at, same } : {}),
    });
  };
  for (const [k, item] of parts.steps) {
    const old = p.steps[k];
    if (old?.kind === 'message' && item.type === 'arrow') message(item, old);
    else if (old?.kind === 'note' && item.type === 'note') note(item, old);
    else if (item.type === 'arrow') message(item);
    else if (item.type === 'note') note(item);
  }
  parts.arrows.forEach(a => message(a));
  parts.notes.forEach(n => note(n));
  // Rows of the converter's layout, measured from the participant boxes.
  const tops = present.length ? present.map(x => parts.tops.get(x.id)!.y) : fresh.map(f => f.box.y);
  const firstRow = (tops.length ? Math.min(...tops) : 0) + SEQ_BOX_H + SEQ_TOP;
  const out = emit(input, p, lines, written, firstRow, {
    present: [...present.map(x => x.id), ...fresh.map(f => f.id)],
    gone,
    fresh: new Set(fresh.map(f => f.id)),
    labelOf,
    actorOf: id => boxOf(id)?.type === 'roundrect',
  });
  // Both boxes of a participant show its name, so the next read finds no rename.
  const texts = new Map<string, string>();
  for (const id of columns.map(c => c.id))
    for (const box of [boxOf(id), parts.bottoms.get(id)])
      if (box && oneLine(box.text) !== labelOf(id)) texts.set(box.id, labelOf(id).replace(/<br\/>/g, '\n'));
  return { code: out.code, keys: sequenceKeys(input, parts, out, fresh), texts };
}
/** The nearest column at any distance (for new messages and notes). */
const closest = (columns: Column[], x: number) =>
  [...columns].sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0].id;

type Who = {
  present: string[];
  gone: Set<string>;
  fresh: Set<string>;
  labelOf: (id: string) => string;
  actorOf: (id: string) => boolean;
};
type Emitted = { code: string; stepLine: Map<string, number>; blockLine: Map<string, number> };

/** Write the lines: structure lines in place, steps sorted into the block sections their positions fall in. */
function emit(input: WriteInput, p: ParsedSequence, lines: string[], written: Written[], firstRow: number, who: Who) {
  const indentOf = (at: number) => /^\s*/.exec(lines[at] ?? '')![0];
  const comment = (at: number) => /\s%%.*$/.exec(lines[at] ?? '')?.[0] ?? '';
  const blockKeyOf = (m: SequenceMark) => (m.block ? p.blocks.indexOf(m.block) : -1);
  const frameOf = (m: SequenceMark) => {
    const k = blockKeyOf(m);
    return k < 0 ? undefined : input.members.find(f => f.type === 'frame' && keyOf(f, input.frameId) === `b:${k}`);
  };
  // A drawn block whose frame was deleted loses its lines.
  const kept = (m: SequenceMark) => blockKeyOf(m) < 0 || !!frameOf(m);
  const marks = new Map(p.marks.filter(kept).map(m => [m.at, m]));
  const dropped = new Set(p.marks.filter(m => !kept(m)).map(m => m.at));
  const stepAt = new Set(p.steps.map(s => s.at));
  const boundary = (m: SequenceMark) => firstRow + m.steps * SEQ_ROW - SEQ_ROW / 2;
  const bounds = [...marks.values()].map(boundary);
  // Gaps between structure lines: their kept lines (with the number of steps before each) and their steps.
  type Gap = { lines: { text: string; anchor: number }[]; steps: Written[]; indent: string };
  const gaps: Gap[] = [{ lines: [], steps: [], indent: '  ' }],
    separators: { text: string; at: number }[] = [];
  let count = 0;
  const header = Math.max(
      0,
      lines.findIndex(l => l.replace(/%%.*$/, '').trim()),
    ),
    firstStep = Math.min(...p.steps.map(s => s.at), ...p.marks.map(m => m.at), lines.length);
  const topEnd = Math.max(
    header,
    ...p.participants.filter(x => x.at !== undefined && x.at < firstStep).map(x => x.at!),
  );
  const block = declarations(p, who, topEnd);
  lines.forEach((raw, at) => {
    const gap = gaps[gaps.length - 1];
    const m = marks.get(at);
    if (m) {
      separators.push({ text: separatorText(m, raw, frameOf(m), indentOf(at), comment(at)), at });
      gaps.push({ lines: [], steps: [], indent: m.role === 'end' ? indentOf(at) : indentOf(at) + '  ' });
      count = 0;
      return;
    }
    if (dropped.has(at)) return;
    if (stepAt.has(at)) {
      if (count === 0) gap.indent = indentOf(at);
      count++;
      return;
    }
    const text = lineText(p, who, raw, at, indentOf(at), comment(at));
    if (text !== null) gap.lines.push({ text, anchor: count });
    if (at === topEnd) gap.lines.push(...block.map(text => ({ text, anchor: 0 })));
  });
  // Steps into gaps by position, in order.
  for (const w of written) gaps[bounds.filter(b => b < w.y).length].steps.push(w);
  const out: string[] = [],
    stepLine = new Map<string, number>(),
    blockLine = new Map<string, number>();
  gaps.forEach((gap, g) => {
    if (g > 0) {
      const s = separators[g - 1],
        m = marks.get(s.at)!,
        f = m.role === 'open' ? frameOf(m) : undefined;
      if (f) blockLine.set(f.id, out.length);
      out.push(s.text);
    }
    const steps = gap.steps.sort((a, b) => a.y - b.y || a.order - b.order || a.item.x - b.item.x);
    let j = 0;
    const put = (w: Written) => {
      stepLine.set(w.item.id, out.length);
      // A step moved into another block section takes that section's indentation.
      const raw = w.at !== undefined ? lines[w.at] : '';
      if (w.same) out.push(indentOf(w.at!) === gap.indent ? raw : gap.indent + raw.trimStart());
      else out.push(gap.indent + w.text + (w.at !== undefined ? comment(w.at) : ''));
    };
    for (const l of gap.lines) {
      while (j < l.anchor && j < steps.length) put(steps[j++]);
      out.push(l.text);
    }
    while (j < steps.length) put(steps[j++]);
  });
  return { code: out.join('\n'), stepLine, blockLine } satisfies Emitted;
}

/** A structure line; an open line of a renamed block frame gets the new title. */
function separatorText(m: SequenceMark, raw: string, frame: Item | undefined, indent: string, comment: string) {
  const b = m.block;
  if (m.role !== 'open' || !b || !frame || b.keyword === 'rect') return raw;
  const title = oneLine(frame.text);
  if (title === b.title) return raw;
  const rest = title.toLowerCase().startsWith(b.keyword) ? title.slice(b.keyword.length).trim() : title;
  return `${indent}${b.keyword}${rest ? ' ' + rest : ''}${comment}`;
}

/** A kept line: participant declarations take the new name; lines naming a deleted participant go (null). */
function lineText(p: ParsedSequence, who: Who, raw: string, at: number, indent: string, comment: string) {
  const decl = p.participants.find(x => x.at === at);
  if (decl) {
    if (who.gone.has(decl.id)) return null;
    const label = who.labelOf(decl.id),
      actor = who.actorOf(decl.id);
    if (label === oneLine(decl.label) && actor === decl.actor) return raw;
    return `${indent}${actor ? 'actor' : 'participant'} ${decl.id}${label !== decl.id ? ` as ${label}` : ''}${comment}`;
  }
  const named = namingLine.exec(raw.replace(/%%.*$/, '').trim())?.[1];
  return named && who.gone.has(named) ? null : raw;
}

/**
 * New declarations after the last one at the top: needed for new participants, and for participants that get a
 * name or kind but have no declaration line. Every participant without a declaration at the top is declared there
 * too, in order, so the order of the columns stays the same.
 */
function declarations(p: ParsedSequence, who: Who, topEnd: number): string[] {
  const atTop = (id: string) => {
    const x = p.participants.find(y => y.id === id);
    return x?.at !== undefined && x.at <= topEnd;
  };
  const needs = (id: string) => {
    if (who.fresh.has(id)) return true;
    const x = p.participants.find(y => y.id === id)!;
    if (x.at !== undefined) return false;
    return who.labelOf(id) !== oneLine(x.label) || who.actorOf(id) !== x.actor;
  };
  if (!who.present.some(needs)) return [];
  return who.present
    .filter(id => !atTop(id))
    .map(id => {
      const label = who.labelOf(id),
        x = p.participants.find(y => y.id === id);
      const named = (needs(id) || !x?.at) && label !== id ? ` as ${label}` : '';
      return `  ${who.actorOf(id) ? 'actor' : 'participant'} ${id}${named}`;
    });
}

/** Keys after writing: participants by id, steps and blocks by their new index in the written code. */
function sequenceKeys(input: WriteInput, parts: Parts, out: Emitted, fresh: { id: string; box: Item }[]) {
  const next = parseSequence(out.code),
    keys = new Map<string, string>();
  for (const x of next.participants) {
    const top = parts.tops.get(x.id) ?? fresh.find(f => f.id === x.id)?.box;
    if (top) keys.set(top.id, `p:${x.id}`);
    const bottom = parts.bottoms.get(x.id);
    if (bottom) keys.set(bottom.id, `p:${x.id}:end`);
    const life = input.members.find(m => keyOf(m, input.frameId) === `l:${x.id}`);
    if (life) keys.set(life.id, `l:${x.id}`);
  }
  for (const [id, line] of out.stepLine) {
    const k = next.steps.findIndex(s => s.at === line);
    if (k >= 0) keys.set(id, `s:${k}`);
  }
  for (const [id, line] of out.blockLine) {
    const k = next.blocks.findIndex(b => b.at === line);
    if (k >= 0) keys.set(id, `b:${k}`);
  }
  return keys;
}
