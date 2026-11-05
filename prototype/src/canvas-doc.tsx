import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Board, Item } from './model';
import type { WidgetCtx } from './widget-types';
import { mentionMarkdown, renderMarkdown } from './markdown';
import { cleanMentionName, isSafeHref } from './rich-text';
import { mentionMatches, mentionQuery } from './mentions';
import { LinkPopover, MentionMenu, SwatchRow, mentionPeople, textColors } from './rich-editing';
import { canvasControl } from './canvas-fields';
import { useLatest } from './use-latest';
import { filterSlash, docTemplates, calloutLabels, DOC_MAX, docShortcut, emojiQuery } from './doc-tools';
import {
  blockSpan,
  insertBlocksAt,
  joinBlocks,
  moveBlocks,
  removeBlocks,
  stepBlockRange,
  type BlockRange,
  type BlockSpot,
} from './doc-tools';
import { announce } from './announce';
import { loadEmojiGroups, searchEmojis } from './emoji-data';
import type { EmojiEntry, EmojiGroup } from './emoji-data';
import { StatusChip } from './status-chip';
import { clearInlineFormatting } from './doc-clear';
import { RemoveFormatting } from 'lucide-react';
import type { SlashCommand, CalloutKind } from './doc-tools';

/** `#rrggbb` for a CSS colour value (`rgb()` or hex), or null. */
export function hexColor(css: string | null | undefined): string | null {
  const value = (css ?? '').trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(value)) return value;
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(value);
  if (!m || (m[4] !== undefined && Number(m[4]) === 0) || [m[1], m[2], m[3]].some(n => Number(n) > 255)) return null;
  return '#' + [m[1], m[2], m[3]].map(n => Number(n).toString(16).padStart(2, '0')).join('');
}
/** Wrap inline Markdown around `inner`, keeping surrounding spaces outside the markers. */
const wrapInline = (open: string, close: string, inner: string) => {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner)!;
  return m[2] ? `${m[1]}${open}${m[2]}${close}${m[3]}` : inner;
};
/** Serialize only supported rich-text elements. Pasted HTML is never persisted. */
export function markdownFrom(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE)
    return (node.textContent ?? '')
      .replace(/([\\`*_[\]~])/g, '\\$1')
      .replace(/\+(?=\+)/g, '\\+')
      .replace(/=(?==)/g, '\\=')
      .replace(/\{(?=\/?color)/g, '\\{');
  if (!(node instanceof HTMLElement)) return '';
  if (node.classList.contains('doc-callout-title')) return '';
  const children = () => Array.from(node.childNodes).map(markdownFrom).join('');
  if (node.dataset.mention !== undefined) {
    const name = cleanMentionName(node.dataset.mention);
    return name ? mentionMarkdown(name) : '';
  }
  switch (node.tagName) {
    case 'MARK':
      return wrapInline('==', '==', children());
    case 'FONT':
    case 'SPAN': {
      const color =
        node.tagName === 'FONT'
          ? hexColor(node.getAttribute('color'))
          : node.classList.contains('doc-color')
            ? hexColor(node.style.color)
            : null;
      return color ? wrapInline(`{color:${color}}`, '{/color}', children()) : children();
    }
    case 'BR':
      return '\n';
    case 'STRONG':
    case 'B':
      return `**${children()}**`;
    case 'EM':
    case 'I':
      return `*${children()}*`;
    case 'U':
      return `++${children()}++`;
    case 'S':
    case 'DEL':
    case 'STRIKE':
      return `~~${children()}~~`;
    case 'H1':
    case 'H2':
    case 'H3':
      return `${'#'.repeat(Number(node.tagName[1]))} ${children().trim()}\n\n`;
    case 'HR':
      return '---\n\n';
    case 'PRE':
      return '```\n' + (node.textContent ?? '').replace(/\n$/, '') + '\n```\n\n';
    case 'P':
      return `${children()}\n\n`;
    case 'DIV': {
      const kind = node.dataset.callout as CalloutKind | undefined;
      if (kind && kind in calloutLabels) {
        const body = children().trim() || calloutLabels[kind];
        return `> [!${kind.toUpperCase()}]\n${body
          .split('\n')
          .map(l => `> ${l}`.trimEnd())
          .join('\n')}\n\n`;
      }
      return `${children()}\n\n`;
    }
    case 'LI': {
      const ordered = node.parentElement?.tagName === 'OL',
        index = ordered ? Array.from(node.parentElement!.children).indexOf(node) + 1 : 0;
      return `${ordered ? `${index}.` : '-'} ${children().trim()}\n`;
    }
    case 'UL':
    case 'OL':
      return `${children()}\n`;
    case 'BLOCKQUOTE':
      return `> ${children().trim().replace(/\n/g, '\n> ')}\n\n`;
    case 'CODE': {
      // Code spans are literal in Markdown: keep the raw text (backticks cannot be represented and are dropped).
      const code = (node.textContent ?? '').replace(/`/g, '');
      return code.trim() ? '`' + code + '`' : code;
    }
    case 'A': {
      const href = node.getAttribute('href') ?? '';
      const body = children();
      return /^(https?:|mailto:)/i.test(href) ? `[${body}](${href.replace(/[()\s]/g, encodeURIComponent)})` : body;
    }
    case 'SCRIPT':
    case 'STYLE':
    case 'IMG':
    case 'IFRAME':
      return '';
    case 'INPUT':
      return node instanceof HTMLInputElement && node.type === 'checkbox' ? `[${node.checked ? 'x' : ' '}] ` : '';
    default:
      return children();
  }
}

/** Colour the browser's highlight command uses before the words become <mark> elements. */
const HIGHLIGHT_MARKER = '#fff27b';

/** Top-level elements that count as Doc blocks; loose text and inline elements are wrapped in paragraphs. */
const BLOCK_TAGS = new Set([
  'P',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'UL',
  'OL',
  'BLOCKQUOTE',
  'PRE',
  'HR',
  'DIV',
  'TABLE',
]);
function normalizeBlocks(root: HTMLElement) {
  let p: HTMLParagraphElement | null = null;
  for (const n of Array.from(root.childNodes)) {
    if (n instanceof HTMLElement && BLOCK_TAGS.has(n.tagName)) {
      p = null;
      continue;
    }
    if (!p && n.nodeType === Node.TEXT_NODE && !(n.textContent ?? '').trim()) {
      n.remove();
      continue;
    }
    if (!p) {
      p = document.createElement('p');
      root.insertBefore(p, n);
    }
    p.appendChild(n);
  }
}
const SELECTED_BLOCK = 'doc-block-selected';

export type DocTemplateOption = { id: string; label: string; markdown: string };
/** The canvas Doc object: the rich document editor bound to the item's Markdown. */
export function CanvasDoc({ item, ctx }: { item: Item; ctx: WidgetCtx }) {
  return (
    <RichDocEditor
      markdown={String(item.data?.markdown ?? '')}
      locked={!!item.locked}
      zoom={ctx.zoom}
      board={ctx.board}
      display={ctx.display}
      templates={docTemplates}
      onSave={next =>
        ctx.update(b => ({
          ...b,
          items: b.items.map(i => (i.id === item.id ? { ...i, data: { ...i.data, markdown: next } } : i)),
        }))
      }
      title={
        <>
          <span>{item.text || 'Doc'}</span>
          <StatusChip status={item.data?.status} />
        </>
      }
    />
  );
}

/**
 * Rich Markdown document editor shared by Doc objects and the board notes panel (track L). Edits are saved
 * on blur through `onSave` (one undo step). Esc selects the current block; see the block keys in keyDown.
 */
export function RichDocEditor({
  markdown: md,
  locked,
  zoom,
  board,
  display,
  onSave,
  title,
  templates,
  templateMode = 'replace',
  label = 'Document content. Type / on an empty line for blocks, @ to mention someone. Esc selects the block.',
  placeholder,
  className = 'canvas-doc-object',
}: {
  markdown: string;
  locked: boolean;
  zoom: number;
  board: Board;
  display: (message: string) => void;
  onSave: (markdown: string) => void;
  title: React.ReactNode;
  templates: DocTemplateOption[];
  /**
   * 'replace' (Docs): a template replaces the content. 'insert' (board notes, P2-Q13a): it goes in at the caret
   * the editor had when the template menu was opened, or at the end when the editor had no caret.
   */
  templateMode?: 'replace' | 'insert';
  label?: string;
  placeholder?: string;
  className?: string;
}) {
  const editor = useRef<HTMLDivElement>(null),
    [slash, setSlash] = useState<{ query: string; top: number; active: number } | null>(null),
    [emoji, setEmoji] = useState<{
      query: string;
      length: number;
      top: number;
      active: number;
      results: EmojiEntry[];
    } | null>(null),
    emojiGroups = useRef<EmojiGroup[] | null>(null),
    [link, setLink] = useState<{ top: number; initial: string; hasLink: boolean } | null>(null),
    [mention, setMention] = useState<{ start: number; names: string[]; top: number; active: number } | null>(null),
    [palette, setPalette] = useState(false),
    savedRange = useRef<Range | null>(null),
    popoverOpen = useRef(false),
    // Block selection (track L): the selected top-level blocks, and the selection to restore after a save.
    blockSel = useRef<BlockRange | null>(null),
    pendingBlocks = useRef<BlockRange | null>(null),
    // Template insertion (P2-Q13a): the template menu, and the blocks and caret spot when the editor left for it.
    templateMenu = useRef<HTMLSelectElement>(null),
    templateSpot = useRef<{ blocks: string[]; spot: BlockSpot | null } | null>(null);
  /** Save new Markdown; false when nothing changed (or the Doc is locked). */
  const save = (next: string) => {
    if (locked || next === md.trim()) return false;
    onSave(next.slice(0, DOC_MAX));
    return true;
  };
  const commit = () => {
    if (!editor.current) return false;
    // Line breaks between rendered blocks are layout only; typing never makes such top-level text nodes.
    const nodes = Array.from(editor.current.childNodes).filter(
      n => !(n.nodeType === Node.TEXT_NODE && /^\s*\n\s*$/.test(n.textContent ?? '')),
    );
    return save(nodes.map(markdownFrom).join('').trim().slice(0, DOC_MAX));
  };
  const blockEls = () => Array.from(editor.current?.children ?? []) as HTMLElement[];
  const clearBlocks = () => {
    blockSel.current = null;
    editor.current?.querySelectorAll(`.${SELECTED_BLOCK}`).forEach(el => el.classList.remove(SELECTED_BLOCK));
  };
  /** Mark blocks as selected and select their whole content, so the selection is visible and copyable. */
  const showBlocks = (r: BlockRange, speak = true) => {
    const els = blockEls();
    if (!els.length) return clearBlocks();
    const clamp = (n: number) => Math.max(0, Math.min(els.length - 1, n)),
      range = { anchor: clamp(r.anchor), focus: clamp(r.focus) },
      [start, end] = blockSpan(range);
    clearBlocks();
    blockSel.current = range;
    els.slice(start, end + 1).forEach(el => el.classList.add(SELECTED_BLOCK));
    const dom = document.createRange();
    dom.setStartBefore(els[start]);
    dom.setEndAfter(els[end]);
    const sel = getSelection();
    sel?.removeAllRanges();
    sel?.addRange(dom);
    els[range.focus].scrollIntoView?.({ block: 'nearest' });
    if (speak) {
      const count = end - start + 1;
      announce(
        `${count} block${count === 1 ? '' : 's'} selected. Shift+Up or Down extends, Alt+Up or Down moves, Delete removes, Enter edits.`,
      );
    }
  };
  /** Esc while typing: select the block holding the caret. False when the Doc has no blocks. */
  const enterBlocks = () => {
    const root = editor.current,
      sel = getSelection();
    if (!root || !sel?.rangeCount) return false;
    const node =
      sel.anchorNode === root
        ? (root.childNodes[Math.min(sel.anchorOffset, root.childNodes.length - 1)] ?? null)
        : sel.anchorNode;
    normalizeBlocks(root);
    const els = blockEls();
    if (!els.length) return false;
    let top: Node | null = node;
    while (top && top.parentNode !== root) top = top.parentNode;
    const index = Math.max(0, els.indexOf(top as HTMLElement));
    showBlocks({ anchor: index, focus: index });
    return true;
  };
  /**
   * The top-level block holding the caret, and whether a template goes before it (caret at its start), after it
   * or in its place (an empty block). Null when the caret is not in the editor.
   */
  const caretSpot = (): BlockSpot | null => {
    const root = editor.current,
      sel = getSelection();
    if (!root || !sel?.rangeCount || !sel.anchorNode || !root.contains(sel.anchorNode)) return null;
    const els = blockEls();
    if (!els.length) return null;
    let top: Node | null =
      sel.anchorNode === root
        ? (root.childNodes[Math.min(sel.anchorOffset, root.childNodes.length - 1)] ?? null)
        : sel.anchorNode;
    while (top && top.parentNode !== root) top = top.parentNode;
    const index = els.indexOf(top as HTMLElement);
    if (index < 0) return null;
    const el = els[index];
    if (!el.textContent?.trim()) return { index, place: 'replace' };
    const before = document.createRange();
    before.setStart(el, 0);
    if (sel.anchorNode === root) before.setEnd(el, 0);
    else before.setEnd(sel.anchorNode, sel.anchorOffset);
    return { index, place: before.toString().trim() ? 'after' : 'before' };
  };
  /** Save the (already updated) editor content, then select `next` again once the Doc re-renders. */
  const persistBlocks = (next: BlockRange | null) => {
    pendingBlocks.current = next;
    if (!commit()) {
      pendingBlocks.current = null;
      if (next) showBlocks(next, false);
    }
  };
  // A save re-renders the editor from the stored Markdown: restore the block selection in the new content.
  useLayoutEffect(() => {
    const next = pendingBlocks.current;
    if (!next || !editor.current) return;
    pendingBlocks.current = null;
    editor.current.focus();
    showBlocks(next, false);
    // Only a new saved text re-renders the editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [md]);
  const selectedMarkdown = () => {
    const r = blockSel.current;
    if (!r) return '';
    const [start, end] = blockSpan(r);
    return joinBlocks(
      blockEls()
        .slice(start, end + 1)
        .map(markdownFrom),
    );
  };
  const deleteBlocks = () => {
    const r = blockSel.current;
    if (!r || locked) return;
    const els = blockEls(),
      [start, end] = blockSpan(r),
      { caret } = removeBlocks(els, r);
    els.slice(start, end + 1).forEach(el => el.remove());
    clearBlocks();
    announce(`${end - start + 1} block${end === start ? '' : 's'} deleted.`);
    persistBlocks(caret < 0 ? null : { anchor: caret, focus: caret });
  };
  const moveSelectedBlocks = (delta: -1 | 1) => {
    const r = blockSel.current;
    if (!r || locked) return;
    const els = blockEls(),
      moved = moveBlocks(els, r, delta);
    if (!moved) return announce(delta < 0 ? 'Already at the top.' : 'Already at the bottom.');
    // Reorder the editor's own elements too, so the content matches what is saved.
    editor.current!.replaceChildren(...moved.blocks);
    announce(delta < 0 ? 'Moved up.' : 'Moved down.');
    persistBlocks(moved.range);
  };
  /** Keys while blocks are selected. Returns true when the key was handled here. */
  const blockKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): boolean => {
    const r = blockSel.current;
    if (!r) return false;
    const mod = e.ctrlKey || e.metaKey,
      key = e.key;
    if (key === 'Escape') {
      e.preventDefault();
      clearBlocks();
      e.currentTarget.blur();
      return true;
    }
    if (key === 'Enter' && !mod) {
      // Back to typing, at the end of the focused block.
      e.preventDefault();
      const el = blockEls()[r.focus];
      clearBlocks();
      if (el) {
        const caret = document.createRange();
        caret.selectNodeContents(el);
        caret.collapse(false);
        getSelection()?.removeAllRanges();
        getSelection()?.addRange(caret);
      }
      return true;
    }
    if ((key === 'ArrowUp' || key === 'ArrowDown') && !mod) {
      e.preventDefault();
      const delta = key === 'ArrowUp' ? -1 : 1;
      if (e.altKey) moveSelectedBlocks(delta);
      else showBlocks(stepBlockRange(r, delta, e.shiftKey, blockEls().length));
      return true;
    }
    if ((key === 'Delete' || key === 'Backspace') && !mod) {
      e.preventDefault();
      deleteBlocks();
      return true;
    }
    if (mod && !e.altKey && (key.toLowerCase() === 'a' || e.code === 'KeyA')) {
      e.preventDefault();
      showBlocks({ anchor: 0, focus: blockEls().length - 1 });
      return true;
    }
    // Copy and cut run through the clipboard events below; modifier presses keep the selection.
    if (mod || ['Shift', 'Control', 'Alt', 'Meta'].includes(key)) return true;
    // Any other key returns to typing; printable keys are swallowed so they never replace whole blocks.
    clearBlocks();
    if (key.length === 1) {
      e.preventDefault();
      return true;
    }
    return false;
  };
  const command = (name: string, value?: string) => {
    editor.current?.focus();
    document.execCommand(name, false, value);
  };
  /** Show the slash menu when the caret's block starts with "/". */
  const watchSlash = () => {
    const root = editor.current;
    if (!root || locked) return setSlash(null);
    const sel = getSelection(),
      node = sel?.anchorNode,
      text = node?.nodeType === Node.TEXT_NODE ? (node.textContent ?? '') : '',
      block = node?.parentElement;
    const m = text.match(/^\/([\w -]{0,20})$/);
    if (!m || !node || !root.contains(node) || !block || (block !== root && block.textContent !== text))
      return setSlash(null);
    // Screen coordinates are scaled by the board zoom; the menu is positioned in local pixels.
    const range = document.createRange();
    range.selectNodeContents(node);
    const wrap = root.parentElement!.getBoundingClientRect(),
      top = (range.getBoundingClientRect().bottom - wrap.top) / (zoom || 1);
    setSlash(s => ({ query: m[1], top, active: s && s.query === m[1] ? s.active : 0 }));
  };
  const insertList = (list: 'bullet' | 'number' | 'check') => {
    if (list === 'number') document.execCommand('insertOrderedList');
    else {
      document.execCommand('insertUnorderedList');
      if (list === 'check') document.execCommand('insertText', false, '[ ] ');
    }
  };
  const apply = (c: SlashCommand) => {
    const root = editor.current;
    setSlash(null);
    if (!root) return;
    root.focus();
    const sel = getSelection();
    // Clear the "/query" text, keeping the caret in the (now empty) block.
    if (sel?.anchorNode && sel.anchorNode.nodeType === Node.TEXT_NODE) {
      sel.anchorNode.textContent = '';
      const range = document.createRange();
      range.setStart(sel.anchorNode, 0);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    if (c.block) document.execCommand('formatBlock', false, c.block === 'p' ? 'p' : c.block);
    else if (c.list) insertList(c.list);
    else if (c.callout) {
      const label = calloutLabels[c.callout];
      document.execCommand(
        'insertHTML',
        false,
        `<div class="doc-callout doc-callout-${c.callout}" data-callout="${c.callout}"><p class="doc-callout-title" contenteditable="false">${label}</p><p>${label} text</p></div><p><br></p>`,
      );
    } else if (c.divider) document.execCommand('insertHTML', false, '<hr><p><br></p>');
  };
  /** Ctrl+E: wrap the selected text in inline code, or unwrap the code span the caret is in. */
  const toggleCode = () => {
    const root = editor.current,
      sel = getSelection();
    if (!root || !sel?.rangeCount) return;
    const range = sel.getRangeAt(0),
      start = range.startContainer,
      code = (start.nodeType === Node.TEXT_NODE ? start.parentElement : (start as Element))?.closest('code');
    if (code && root.contains(code)) {
      code.replaceWith(document.createTextNode(code.textContent ?? ''));
      return;
    }
    const text = range.toString();
    if (!text.trim() || text.includes('\n') || !root.contains(range.commonAncestorContainer))
      return display('Select text on one line to format it as code.');
    // Inserted directly: the browser's insertHTML turns <code> into a styled span.
    const el = document.createElement('code');
    el.textContent = text.replace(/`/g, '');
    range.deleteContents();
    range.insertNode(el);
    range.setStartAfter(el);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  };
  const inEditor = (n: Node | null | undefined) => !!n && !!editor.current?.contains(n);
  const currentRange = () => {
    const sel = getSelection();
    if (!sel?.rangeCount) return null;
    const r = sel.getRangeAt(0);
    return inEditor(r.commonAncestorContainer) ? r : null;
  };
  const anchorOf = (r: Range) => {
    const n = r.startContainer,
      a = (n.nodeType === Node.TEXT_NODE ? n.parentElement : (n as Element))?.closest('a');
    return a && inEditor(a) ? (a as HTMLAnchorElement) : null;
  };
  /** Local (unzoomed) offset below a rectangle, for menus positioned inside the Doc. */
  const below = (rect: DOMRect) => {
    const wrap = editor.current!.parentElement!.getBoundingClientRect();
    return (rect.bottom - wrap.top) / (zoom || 1);
  };
  const unwrap = (el: Element) => el.replaceWith(...Array.from(el.childNodes));
  const touching = (r: Range, selector: string) =>
    Array.from(editor.current?.querySelectorAll(selector) ?? []).filter(el => r.intersectsNode(el));
  const restoreSelection = () => {
    editor.current?.focus();
    const sel = getSelection();
    if (savedRange.current && sel) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
  };
  /** Ctrl+K or the Link button: add, change or remove the link at the selection. */
  const openLink = () => {
    if (locked) return;
    const r = currentRange();
    if (!r) return display('Place the cursor in the document to add a link.');
    savedRange.current = r.cloneRange();
    const a = anchorOf(r);
    popoverOpen.current = true;
    setSlash(null);
    setEmoji(null);
    setMention(null);
    setPalette(false);
    setLink({ top: below((a ?? r).getBoundingClientRect()), initial: a?.getAttribute('href') ?? '', hasLink: !!a });
  };
  const closeLink = () => {
    setLink(null);
    popoverOpen.current = false;
    restoreSelection();
  };
  const applyLink = (href: string) => {
    closeLink();
    const r = currentRange();
    if (!r) return;
    const a = anchorOf(r);
    if (a) a.setAttribute('href', href);
    else if (r.collapsed) {
      const el = document.createElement('a');
      el.setAttribute('href', href);
      el.textContent = href.replace(/^mailto:/i, '');
      r.insertNode(el);
      r.setStartAfter(el);
      r.collapse(true);
      const sel = getSelection()!;
      sel.removeAllRanges();
      sel.addRange(r);
    } else document.execCommand('createLink', false, href);
  };
  const removeLink = () => {
    closeLink();
    const r = currentRange(),
      a = r && anchorOf(r);
    if (a) unwrap(a);
  };
  /** Highlight the selection, or remove the highlight it touches. */
  const toggleHighlight = () => {
    const r = currentRange();
    if (!r || locked) return;
    const marks = touching(r, 'mark');
    if (marks.length) return marks.forEach(unwrap);
    if (r.collapsed) return display('Select text to highlight it.');
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand('hiliteColor', false, HIGHLIGHT_MARKER);
    document.execCommand('styleWithCSS', false, 'false');
    // The browser marks the words with a background colour; store them as <mark> (==text==).
    editor.current?.querySelectorAll<HTMLElement>('span').forEach(span => {
      if (hexColor(span.style.backgroundColor) !== HIGHLIGHT_MARKER) return;
      const mark = document.createElement('mark');
      mark.append(...Array.from(span.childNodes));
      span.replaceWith(mark);
    });
  };
  /** Clear formatting (Ctrl+\): inline marks leave the selection; links and mentions stay. */
  const clearFormatting = () => {
    const r = currentRange();
    if (!r || locked || !editor.current) return;
    setPalette(false);
    if (r.collapsed) return display('Select text to clear its formatting.');
    const cleared = clearInlineFormatting(editor.current, r);
    if (!cleared) return;
    const sel = getSelection();
    sel?.removeAllRanges();
    sel?.addRange(cleared);
  };
  /** Colour the selection (undefined: back to the default colour). */
  const setColor = (color: string | undefined) => {
    setPalette(false);
    const r = currentRange();
    if (!r || locked) return;
    // Nested colours cannot be written as Markdown: clear the colours the selection touches first.
    touching(r, 'span.doc-color, font[color]').forEach(unwrap);
    if (!color || r.collapsed) return;
    document.execCommand('styleWithCSS', false, 'false');
    document.execCommand('foreColor', false, color);
    editor.current?.querySelectorAll<HTMLElement>('font[color], span').forEach(el => {
      const value = el.tagName === 'FONT' ? hexColor(el.getAttribute('color')) : hexColor(el.style.color);
      if (value !== color || el.classList.contains('doc-color')) return;
      const span = document.createElement('span');
      span.className = 'doc-color';
      span.style.color = color;
      span.append(...Array.from(el.childNodes));
      el.replaceWith(span);
    });
  };
  /** Show people while "@name" is typed right before the caret. */
  const watchMention = () => {
    const root = editor.current,
      sel = getSelection(),
      node = sel?.anchorNode;
    if (!root || locked || !sel?.isCollapsed || !node || node.nodeType !== Node.TEXT_NODE || !root.contains(node))
      return setMention(null);
    const q = mentionQuery(node.textContent ?? '', sel.anchorOffset),
      names = q ? mentionMatches(mentionPeople(board), q.query) : [];
    if (!q || !names.length) return setMention(null);
    const range = document.createRange();
    range.setStart(node, sel.anchorOffset);
    range.collapse(true);
    const top = below(range.getBoundingClientRect());
    setMention(m => ({
      start: q.start,
      names,
      top,
      active: m && m.start === q.start ? Math.min(m.active, names.length - 1) : 0,
    }));
  };
  const applyMention = (name: string) => {
    const sel = getSelection(),
      node = sel?.anchorNode,
      state = mention,
      clean = cleanMentionName(name);
    setMention(null);
    if (!state || !clean || !node || node.nodeType !== Node.TEXT_NODE || !inEditor(node)) return;
    const range = document.createRange();
    range.setStart(node, Math.min(state.start, sel!.anchorOffset));
    range.setEnd(node, sel!.anchorOffset);
    range.deleteContents();
    const chip = document.createElement('span'),
      space = document.createTextNode('\u00a0');
    chip.className = 'doc-mention';
    chip.contentEditable = 'false';
    chip.dataset.mention = clean;
    chip.textContent = `@${clean}`;
    range.insertNode(space);
    range.insertNode(chip);
    range.setStartAfter(space);
    range.collapse(true);
    sel!.removeAllRanges();
    sel!.addRange(range);
  };
  /** Show emoji suggestions while ":name" is typed right before the caret. */
  const watchEmoji = () => {
    const root = editor.current,
      sel = getSelection(),
      node = sel?.anchorNode;
    if (!root || locked || !node || node.nodeType !== Node.TEXT_NODE || !root.contains(node)) return setEmoji(null);
    const q = emojiQuery((node.textContent ?? '').slice(0, sel!.anchorOffset));
    if (!q) return setEmoji(null);
    const range = document.createRange();
    range.setStart(node, sel!.anchorOffset);
    range.collapse(true);
    const wrap = root.parentElement!.getBoundingClientRect(),
      rect = range.getBoundingClientRect(),
      top = (rect.bottom - wrap.top) / (zoom || 1);
    const show = (groups: EmojiGroup[]) =>
      setEmoji(s => ({
        query: q.query,
        length: q.length,
        top,
        results: searchEmojis(groups, q.query, 6),
        active: s && s.query === q.query ? s.active : 0,
      }));
    if (emojiGroups.current) show(emojiGroups.current);
    else
      loadEmojiGroups()
        .then(groups => {
          emojiGroups.current = groups;
          show(groups);
        })
        .catch(() => setEmoji(null));
  };
  const applyEmoji = (entry: EmojiEntry) => {
    const sel = getSelection(),
      node = sel?.anchorNode,
      length = emoji?.length ?? 0;
    setEmoji(null);
    if (!node || node.nodeType !== Node.TEXT_NODE || !editor.current?.contains(node)) return;
    const end = sel!.anchorOffset,
      range = document.createRange();
    range.setStart(node, Math.max(0, end - length));
    range.setEnd(node, end);
    sel!.removeAllRanges();
    sel!.addRange(range);
    document.execCommand('insertText', false, entry.emoji);
  };
  const matches = slash ? filterSlash(slash.query) : [];
  const keyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (blockKeyDown(e)) return;
    if (mention && mention.names.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        setMention({ ...mention, active: (mention.active + step + mention.names.length) % mention.names.length });
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        applyMention(mention.names[Math.min(mention.active, mention.names.length - 1)]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMention(null);
        return;
      }
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key.toLowerCase() === 'k' || e.code === 'KeyK')) {
      e.preventDefault();
      openLink();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === '\\' || e.code === 'Backslash')) {
      e.preventDefault();
      clearFormatting();
      return;
    }
    if (emoji && emoji.results.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        setEmoji({ ...emoji, active: (emoji.active + step + emoji.results.length) % emoji.results.length });
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        applyEmoji(emoji.results[Math.min(emoji.active, emoji.results.length - 1)]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setEmoji(null);
        return;
      }
    }
    if (slash && matches.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        setSlash({ ...slash, active: (slash.active + step + matches.length) % matches.length });
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        apply(matches[Math.min(slash.active, matches.length - 1)]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlash(null);
        return;
      }
    }
    const shortcut = locked ? null : docShortcut(e);
    if (shortcut) {
      e.preventDefault();
      if (shortcut.kind === 'strike') document.execCommand('strikethrough');
      else if (shortcut.kind === 'block') document.execCommand('formatBlock', false, shortcut.block);
      else if (shortcut.kind === 'list') insertList(shortcut.list);
      else toggleCode();
      return;
    }
    if (e.key === 'Escape') {
      // Esc selects the current block (track L); Esc again leaves the Doc. An empty Doc is left at once.
      e.preventDefault();
      if (!enterBlocks()) e.currentTarget.blur();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      e.currentTarget.blur();
    }
  };
  const live = useLatest({
    watchSlash,
    watchEmoji,
    keyDown,
    watchMention,
    clearBlocks,
    blur: (to: EventTarget | null) => {
      if (popoverOpen.current) return;
      // Leaving for the template menu: remember where the caret was, before the save re-renders the content.
      templateSpot.current =
        templateMode === 'insert' && to && to === templateMenu.current
          ? { blocks: blockEls().map(markdownFrom), spot: caretSpot() }
          : null;
      clearBlocks();
      setSlash(null);
      setEmoji(null);
      setMention(null);
      commit();
    },
    /** Copy or cut selected blocks as Markdown text. */
    clipboard: (e: React.ClipboardEvent, cut: boolean) => {
      if (!blockSel.current) return;
      e.preventDefault();
      e.clipboardData.setData('text/plain', selectedMarkdown());
      if (cut) deleteBlocks();
      else announce('Blocks copied.');
    },
    click: (e: React.MouseEvent) => {
      const a = (e.target as Element).closest?.('a[href]');
      if (!a || !(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const href = a.getAttribute('href');
      if (isSafeHref(href)) window.open(href, '_blank', 'noopener,noreferrer');
    },
  });
  // The editable element only re-renders when its saved content or lock changes, so menu state
  // updates never reset what the person is typing.
  const editable = useMemo(
    () => (
      <div
        ref={editor}
        key={md}
        className="canvas-doc doc-content"
        role="textbox"
        aria-label={label}
        data-placeholder={placeholder}
        aria-multiline="true"
        aria-haspopup="listbox"
        contentEditable={!locked}
        suppressContentEditableWarning
        {...canvasControl}
        dangerouslySetInnerHTML={{ __html: renderMarkdown(md) }}
        onBlur={e => live.current.blur(e.relatedTarget)}
        onInput={() => {
          live.current.watchSlash();
          live.current.watchEmoji();
          live.current.watchMention();
        }}
        onClick={e => live.current.click(e)}
        onMouseDown={() => live.current.clearBlocks()}
        onCopy={e => live.current.clipboard(e, false)}
        onCut={e => live.current.clipboard(e, true)}
        onPaste={e => {
          e.preventDefault();
          document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
        }}
        onKeyDown={e => live.current.keyDown(e)}
      />
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [md, locked],
  );
  return (
    <div className={`rich-object canvas-interactive ${className}`} onDoubleClick={e => e.stopPropagation()}>
      <div className="rich-title canvas-widget-header">
        {title}
        <div {...canvasControl} onMouseDown={e => e.preventDefault()} className="canvas-doc-tools">
          <button disabled={locked} aria-label="Bold document text" onClick={() => command('bold')}>
            B
          </button>
          <button disabled={locked} aria-label="Italic document text" onClick={() => command('italic')}>
            I
          </button>
          <button
            disabled={locked}
            aria-label="Underline document text"
            title="Underline (Ctrl+U)"
            onClick={() => command('underline')}
          >
            <u>U</u>
          </button>
          <button
            disabled={locked}
            aria-label="Strikethrough document text"
            title="Strikethrough (Ctrl+Shift+X)"
            onClick={() => command('strikethrough')}
          >
            <s>S</s>
          </button>
          <button disabled={locked} aria-label="Highlight document text" title="Highlight" onClick={toggleHighlight}>
            <mark>H</mark>
          </button>
          <span className="doc-palette-anchor">
            <button
              disabled={locked}
              aria-label="Document text colour"
              aria-expanded={palette}
              title="Text colour"
              onClick={() => setPalette(p => !p)}
            >
              <span className="doc-color-letter">A</span>
            </button>
            {palette && (
              <span className="doc-palette">
                <SwatchRow label="Document text colour" colors={textColors} onPick={setColor} />
              </span>
            )}
          </span>
          <button disabled={locked} aria-label="Insert link" title="Link (Ctrl+K)" onClick={openLink}>
            Link
          </button>
          <button
            disabled={locked}
            aria-label="Clear formatting"
            title="Clear formatting (Ctrl+\)"
            onClick={clearFormatting}
          >
            <RemoveFormatting size={14} aria-hidden="true" />
          </button>
          <button disabled={locked} onClick={() => command('formatBlock', 'h1')}>
            H1
          </button>
          <button disabled={locked} onClick={() => command('insertUnorderedList')}>
            List
          </button>
          <select
            ref={templateMenu}
            aria-label="Apply a doc template"
            value=""
            disabled={locked}
            onMouseDown={e => e.stopPropagation()}
            onBlur={() => (templateSpot.current = null)}
            onChange={e => {
              const t = templates.find(t => t.id === e.target.value);
              e.target.value = '';
              if (!t) return;
              if (templateMode === 'insert') {
                // One save, so one undo step; without a caret the template goes at the end.
                const at = templateSpot.current;
                templateSpot.current = null;
                save(at ? insertBlocksAt(at.blocks, at.spot, t.markdown) : insertBlocksAt([md], null, t.markdown));
                display(`${t.label} template inserted. Undo removes it.`);
                return;
              }
              save(t.markdown.trim());
              display(`${t.label} template applied. Undo restores the previous content.`);
            }}
          >
            <option value="">Templates…</option>
            {templates.map(t => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="canvas-doc-wrap">
        {editable}
        {link && (
          <LinkPopover
            initial={link.initial}
            hasLink={link.hasLink}
            style={{ top: link.top + 6 }}
            onApply={applyLink}
            onRemove={removeLink}
            onCancel={closeLink}
            onLeave={to => {
              setLink(null);
              popoverOpen.current = false;
              if (!to || !editor.current?.contains(to)) commit();
            }}
          />
        )}
        {mention && mention.names.length > 0 && (
          <MentionMenu
            names={mention.names}
            active={mention.active}
            style={{ top: mention.top + 4 }}
            onPick={applyMention}
            onHover={k => setMention({ ...mention, active: k })}
          />
        )}
        {emoji && emoji.results.length > 0 && (
          <ul
            className="doc-slash-menu doc-emoji-menu"
            role="listbox"
            aria-label="Insert emoji"
            style={{ top: emoji.top + 4 }}
            onMouseDown={e => e.preventDefault()}
            {...canvasControl}
          >
            {emoji.results.map((entry, k) => (
              <li
                key={entry.emoji}
                role="option"
                aria-selected={k === emoji.active}
                onMouseEnter={() => setEmoji({ ...emoji, active: k })}
                onClick={() => applyEmoji(entry)}
              >
                <b>{entry.emoji}</b>
                <small>{entry.name}</small>
              </li>
            ))}
          </ul>
        )}
        {slash && matches.length > 0 && (
          <ul
            className="doc-slash-menu"
            role="listbox"
            aria-label="Insert block"
            style={{ top: slash.top + 4 }}
            onMouseDown={e => e.preventDefault()}
            {...canvasControl}
          >
            {matches.map((c, k) => (
              <li
                key={c.id}
                role="option"
                aria-selected={k === slash.active}
                onMouseEnter={() => setSlash({ ...slash, active: k })}
                onClick={() => apply(c)}
              >
                <b>{c.label}</b>
                <small>{c.hint}</small>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
