// Doc callouts, slash commands, starter templates and Markdown import/export (item 79). Pure.
// Evidence: feature map — Doc slash prompt and four starting templates observed live; callouts and Markdown
// export (November 2025) and Markdown upload as Docs (April 2026) documented.

export const DOC_MAX = 60000;
export const DOC_FILE_MAX = 1024 * 1024;

export const calloutKinds = ['note', 'tip', 'important', 'warning'] as const;
export type CalloutKind = (typeof calloutKinds)[number];
export const calloutLabels: Record<CalloutKind, string> = {
  note: 'Note',
  tip: 'Tip',
  important: 'Important',
  warning: 'Warning',
};
/** GitHub-style alert syntax: `> [!NOTE]` followed by quoted lines. */
export const calloutMarkdown = (kind: CalloutKind, text = '') =>
  `> [!${kind.toUpperCase()}]\n${(text || calloutLabels[kind] + ' text')
    .split('\n')
    .map(l => `> ${l}`)
    .join('\n')}\n`;
/** Recognise a callout marker at the start of blockquote text. */
export function calloutOf(text: string): { kind: CalloutKind; rest: string } | null {
  const m = text.match(/^\s*\[!(NOTE|TIP|IMPORTANT|WARNING)\]\s*\n?([\s\S]*)$/i);
  return m ? { kind: m[1].toLowerCase() as CalloutKind, rest: m[2] } : null;
}

export type SlashCommand = {
  id: string;
  label: string;
  hint: string;
  /** execCommand-based block change, or HTML to insert. */
  block?: 'h1' | 'h2' | 'h3' | 'p' | 'blockquote' | 'pre';
  list?: 'bullet' | 'number' | 'check';
  callout?: CalloutKind;
  divider?: boolean;
};
export const slashCommands: SlashCommand[] = [
  { id: 'text', label: 'Text', hint: 'Plain paragraph', block: 'p' },
  { id: 'h1', label: 'Heading 1', hint: 'Large section heading', block: 'h1' },
  { id: 'h2', label: 'Heading 2', hint: 'Medium heading', block: 'h2' },
  { id: 'h3', label: 'Heading 3', hint: 'Small heading', block: 'h3' },
  { id: 'bullet', label: 'Bulleted list', hint: 'Simple list', list: 'bullet' },
  { id: 'number', label: 'Numbered list', hint: 'Ordered steps', list: 'number' },
  { id: 'check', label: 'Checklist', hint: 'Tasks with checkboxes', list: 'check' },
  { id: 'quote', label: 'Quote', hint: 'Quoted text', block: 'blockquote' },
  ...calloutKinds.map(kind => ({
    id: `callout-${kind}`,
    label: `${calloutLabels[kind]} callout`,
    hint: 'Highlighted block',
    callout: kind,
  })),
  { id: 'code', label: 'Code', hint: 'Monospaced block', block: 'pre' as const },
  { id: 'divider', label: 'Divider', hint: 'Horizontal line', divider: true },
];
/** Commands whose label or id contains the query (after the slash). */
export const filterSlash = (query: string) => {
  const q = query.trim().toLowerCase();
  return slashCommands.filter(c => !q || c.label.toLowerCase().includes(q) || c.id.includes(q));
};

export const docTemplates: { id: string; label: string; markdown: string }[] = [
  {
    id: 'meeting',
    label: 'Meeting notes',
    markdown:
      '# Meeting notes\n\n**Date:** \n**Attendees:** \n\n## Agenda\n\n1. \n2. \n\n## Notes\n\n- \n\n## Action items\n\n- [ ] Owner — task\n- [ ] Owner — task\n',
  },
  {
    id: 'brief',
    label: 'Project brief',
    markdown:
      '# Project brief\n\n> [!NOTE]\n> One-sentence summary of the project.\n\n## Problem\n\n## Goals\n\n- \n\n## Scope\n\n**In:** \n**Out:** \n\n## Milestones\n\n| Milestone | Date |\n| --- | --- |\n|  |  |\n\n## Risks\n\n> [!WARNING]\n> Main risk and mitigation.\n',
  },
  {
    id: 'retro',
    label: 'Retrospective',
    markdown:
      '# Retrospective\n\n## What went well\n\n- \n\n## What could be improved\n\n- \n\n## What we will try next\n\n- [ ] \n\n> [!TIP]\n> Keep actions small and give each one an owner.\n',
  },
  {
    id: 'decision',
    label: 'Decision record',
    markdown:
      '# Decision: \n\n**Status:** Proposed\n**Date:** \n\n## Context\n\n## Options considered\n\n1. \n2. \n\n## Decision\n\n> [!IMPORTANT]\n> The decision and its main reason.\n\n## Consequences\n\n- \n',
  },
];

/** Plain-text title of a Markdown document: its first heading, else the file name. */
export function docTitle(md: string, fileName = ''): string {
  const heading = md.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/m)?.[1];
  const base = fileName.replace(/\.(md|markdown|txt)$/i, '');
  return (heading?.replace(/[*_`[\]]/g, '').trim() || base || 'Untitled doc').slice(0, 200);
}
/** Prepare uploaded Markdown for a Doc: normalise line endings, strip a BOM and enforce the size limit. */
export function docFromMarkdown(text: string, fileName = ''): { markdown: string; title: string; truncated: boolean } {
  const clean = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).replace(/\r\n?/g, '\n');
  if (clean.includes(String.fromCharCode(0))) throw new Error('This file does not contain Markdown text.');
  return { markdown: clean.slice(0, DOC_MAX), title: docTitle(clean, fileName), truncated: clean.length > DOC_MAX };
}
/** Safe download name for a Doc export. */
export function markdownFileName(title: string): string {
  const base = title
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/[^ -￿]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return `${base || 'doc'}.md`;
}
/** Markdown with a trailing newline, as written to an exported file. */
export const exportMarkdown = (md: string) => (md.endsWith('\n') ? md : md + '\n');

// ---- Keyboard shortcuts in Docs (gap list I1) ----------------------------------------------------------
export type DocShortcut =
  | { kind: 'strike' }
  | { kind: 'code' }
  | { kind: 'block'; block: 'h1' | 'h2' | 'h3' | 'p' }
  | { kind: 'list'; list: 'bullet' | 'number' | 'check' };
type KeyLike = { key: string; code?: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean };
/**
 * Doc editing shortcut for a key press, or null: Ctrl+Shift+X strikethrough, Ctrl+E inline code,
 * Ctrl+Alt+1–3 headings, Ctrl+Alt+0 normal text and Ctrl+Alt+4–6 bulleted, numbered and check lists
 * (Cmd instead of Ctrl on a Mac).
 */
export function docShortcut(e: KeyLike): DocShortcut | null {
  if (!(e.ctrlKey || e.metaKey)) return null;
  const key = e.key.toLowerCase(),
    digit = e.code?.match(/^(?:Digit|Numpad)([0-6])$/)?.[1] ?? (/^[0-6]$/.test(e.key) ? e.key : null);
  if (e.altKey && !e.shiftKey && digit !== null)
    return Number(digit) >= 4
      ? { kind: 'list', list: (['bullet', 'number', 'check'] as const)[Number(digit) - 4] }
      : { kind: 'block', block: digit === '0' ? 'p' : (`h${digit}` as 'h1' | 'h2' | 'h3') };
  if (e.altKey) return null;
  if (e.shiftKey && (key === 'x' || e.code === 'KeyX')) return { kind: 'strike' };
  if (!e.shiftKey && (key === 'e' || e.code === 'KeyE')) return { kind: 'code' };
  return null;
}
/** Shortcut list for the Doc toolbar help. */
export const docShortcutHelp = [
  ['Ctrl+B', 'Bold'],
  ['Ctrl+I', 'Italic'],
  ['Ctrl+U', 'Underline'],
  ['Ctrl+Shift+X', 'Strikethrough'],
  ['Ctrl+E', 'Inline code'],
  ['Ctrl+K', 'Link'],
  ['@', 'Mention someone'],
  ['Ctrl+Alt+1–3', 'Heading 1–3'],
  ['Ctrl+Alt+0', 'Normal text'],
  ['Ctrl+Alt+4', 'Bulleted list'],
  ['Ctrl+Alt+5', 'Numbered list'],
  ['Ctrl+Alt+6', 'Checklist'],
  ['Esc', 'Select the current block'],
  ['Shift+Up/Down', 'Extend the block selection'],
  ['Alt+Up/Down', 'Move the selected blocks'],
  ['Delete', 'Delete the selected blocks'],
] as const;

/** The ":name" being typed right before the caret (at least two characters), or null. */
export function emojiQuery(textBefore: string): { query: string; length: number } | null {
  const m = /(?:^|\s):([a-z0-9_+-]{2,30})$/i.exec(textBefore);
  return m ? { query: m[1].replace(/_/g, ' '), length: m[1].length + 1 } : null;
}

// ---- Block selection in Docs (track L) ------------------------------------------------------------------
/** Selected top-level blocks of a Doc, from the block where selection started (anchor) to its other end. */
export type BlockRange = { anchor: number; focus: number };
/** First and last selected block. */
export const blockSpan = (r: BlockRange): [number, number] => [
  Math.min(r.anchor, r.focus),
  Math.max(r.anchor, r.focus),
];
/** Arrow Up/Down in block mode: move the selection one block, or with Shift extend it; clamped to the Doc. */
export function stepBlockRange(r: BlockRange, delta: -1 | 1, extend: boolean, count: number): BlockRange {
  const focus = Math.max(0, Math.min(count - 1, r.focus + delta));
  return extend ? { anchor: r.anchor, focus } : { anchor: focus, focus };
}
/** Alt+Up/Down: move the selected blocks past their neighbour. Null at the top or bottom of the Doc. */
export function moveBlocks<T>(blocks: T[], r: BlockRange, delta: -1 | 1): { blocks: T[]; range: BlockRange } | null {
  const [start, end] = blockSpan(r);
  if (start < 0 || end >= blocks.length || (delta < 0 ? start === 0 : end === blocks.length - 1)) return null;
  const next = [...blocks],
    moved = next.splice(start, end - start + 1);
  next.splice(start + delta, 0, ...moved);
  return { blocks: next, range: { anchor: r.anchor + delta, focus: r.focus + delta } };
}
/** Delete the selected blocks; `caret` is the block that takes their place (or -1 when none is left). */
export function removeBlocks<T>(blocks: T[], r: BlockRange): { blocks: T[]; caret: number } {
  const [start, end] = blockSpan(r),
    next = blocks.filter((_, k) => k < start || k > end);
  return { blocks: next, caret: next.length ? Math.min(start, next.length - 1) : -1 };
}
/** Where the caret was among a document's top-level blocks (P2-Q13a): before, after or in place of a block. */
export type BlockSpot = { index: number; place: 'before' | 'after' | 'replace' };
/**
 * Insert Markdown (for example a template) among per-block Markdown at a caret spot and return the joined text.
 * Without a spot, or with one outside the blocks, the Markdown goes at the end.
 */
export function insertBlocksAt(blocks: string[], spot: BlockSpot | null, markdown: string): string {
  if (!spot || spot.index < 0 || spot.index >= blocks.length) return joinBlocks([...blocks, markdown]);
  const { index, place } = spot,
    at = place === 'after' ? index + 1 : index;
  return joinBlocks([...blocks.slice(0, at), markdown, ...blocks.slice(place === 'replace' ? index + 1 : at)]);
}
/** Join per-block Markdown (each ends with its own blank line) into a Doc's stored text. */
export const joinBlocks = (parts: string[]) =>
  parts
    .map(p => p.trim())
    .filter(Boolean)
    .join('\n\n');
