// WYSIWYG editor for canvas text (text, sticky notes, shapes). The DOM is painted from plain text plus
// spans (rich-text.ts) and read back into them; pasted HTML is never kept. Formatting commands work on the
// model and repaint, so the stored data never depends on what the browser's own editing produces.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Baseline,
  Highlighter,
  Link as LinkIcon,
  RemoveFormatting,
} from 'lucide-react';
import type { Item } from './model';
import { formatStyle, textLayout } from './text-format';
import {
  activeSpans,
  applyStyle,
  cleanMentionName,
  clearStyles,
  fromRuns,
  linkAt,
  pastedLink,
  replaceRange,
  runCss,
  runsOf,
  styleIn,
  toggleStyle,
} from './rich-text';
import type { Run, SpanStyle, TextSpan, ToggleKey } from './rich-text';
import { mentionMatches, mentionQuery } from './mentions';
import { LinkPopover, MentionMenu, SwatchRow, highlightColors, keepSelection, textColors } from './rich-editing';
import { useLatest } from './use-latest';

export const TEXT_MAX = 6000;

// ---- DOM <-> runs -------------------------------------------------------------------------------------

/** Paint text and spans into the editor element (text nodes only; no HTML strings). */
export function paintRich(root: HTMLElement, text: string, spans: readonly TextSpan[]) {
  const nodes: Node[] = [];
  for (const run of runsOf(text, spans)) {
    if (!run.text) continue;
    const s = run.style;
    if (s.mention) {
      const chip = document.createElement('span');
      chip.className = 'text-mention';
      chip.contentEditable = 'false';
      chip.dataset.mention = s.mention;
      chip.dataset.rt = '';
      styleElement(chip, s);
      chip.textContent = run.text;
      nodes.push(chip);
      continue;
    }
    const parts: Node[] = [];
    run.text.split('\n').forEach((part, k) => {
      if (k > 0) parts.push(document.createElement('br'));
      if (part) parts.push(document.createTextNode(part));
    });
    if (Object.keys(s).length) {
      const el = document.createElement(s.href ? 'a' : 'span');
      if (s.href) {
        el.setAttribute('href', s.href);
        el.className = 'text-link';
      }
      el.dataset.rt = '';
      styleElement(el, s);
      el.append(...parts);
      nodes.push(el);
    } else nodes.push(...parts);
  }
  // A line break at the very end needs a placeholder to show the empty last line.
  if (text.endsWith('\n')) nodes.push(document.createElement('br'));
  root.replaceChildren(...nodes);
}
function styleElement(el: HTMLElement, s: SpanStyle) {
  if (s.bold) el.dataset.b = '';
  if (s.italic) el.dataset.i = '';
  if (s.underline) el.dataset.u = '';
  if (s.strike) el.dataset.s = '';
  if (s.color) el.dataset.c = s.color;
  if (s.highlight) el.dataset.h = s.highlight;
  Object.assign(el.style, runCss(s));
}
const toHex = (css: string): string | undefined => {
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(css.trim());
  if (!m || (m[4] !== undefined && Number(m[4]) === 0))
    return /^#[0-9a-f]{6}$/i.test(css) ? css.toLowerCase() : undefined;
  return '#' + [m[1], m[2], m[3]].map(n => Number(n).toString(16).padStart(2, '0')).join('');
};
/** Style of an element's content: our own painted elements carry data attributes; anything else is read from tags. */
function styleFrom(el: HTMLElement, base: SpanStyle, rootColor: string): SpanStyle {
  const s: SpanStyle = { ...base };
  if (el.dataset.rt !== undefined) {
    if (el.dataset.b !== undefined) s.bold = true;
    if (el.dataset.i !== undefined) s.italic = true;
    if (el.dataset.u !== undefined) s.underline = true;
    if (el.dataset.s !== undefined) s.strike = true;
    if (el.dataset.c) s.color = el.dataset.c;
    if (el.dataset.h) s.highlight = el.dataset.h;
  } else {
    const tag = el.tagName,
      st = el.style;
    if (tag === 'B' || tag === 'STRONG' || st.fontWeight === 'bold' || Number(st.fontWeight) >= 600) s.bold = true;
    if (tag === 'I' || tag === 'EM' || st.fontStyle === 'italic') s.italic = true;
    if (tag === 'U' || /underline/.test(st.textDecorationLine || st.textDecoration)) s.underline = true;
    if (['S', 'STRIKE', 'DEL'].includes(tag) || /line-through/.test(st.textDecorationLine || st.textDecoration))
      s.strike = true;
    const color = toHex(el.getAttribute('color') ?? st.color ?? '');
    if (color && color !== rootColor) s.color = color;
    const bg = toHex(st.backgroundColor ?? '');
    if (bg) s.highlight = bg;
  }
  if (el.tagName === 'A' && el.getAttribute('href')) s.href = el.getAttribute('href')!;
  return s;
}
const blockTags = new Set(['DIV', 'P', 'LI', 'H1', 'H2', 'H3', 'BLOCKQUOTE', 'PRE']);
/** Read runs from editor DOM (or a fragment of it). `dropTrailingBreak`: ignore the placeholder line break. */
function readRuns(root: Node, rootColor: string, dropTrailingBreak: boolean): Run[] {
  const out: Run[] = [];
  const endsWithBreak = () => out.length > 0 && out[out.length - 1].text.endsWith('\n');
  const hasText = () => out.some(r => r.text);
  const walk = (node: Node, style: SpanStyle) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const t = (child.textContent ?? '').replace(/\u00a0/g, ' ').replace(/\u200b/g, '');
        if (t) out.push({ text: t, style });
      } else if (child instanceof HTMLElement) {
        if (child.tagName === 'BR') out.push({ text: '\n', style: {} });
        else if (child.dataset.mention !== undefined) {
          const name = cleanMentionName(child.dataset.mention);
          out.push({
            text: child.textContent ?? '',
            style: name ? { ...styleFrom(child, style, rootColor), mention: name } : style,
          });
        } else if (['SCRIPT', 'STYLE'].includes(child.tagName)) continue;
        else {
          const block = blockTags.has(child.tagName);
          if (block && hasText() && !endsWithBreak()) out.push({ text: '\n', style: {} });
          walk(child, styleFrom(child, style, rootColor));
        }
      }
    }
  };
  walk(root, {});
  if (dropTrailingBreak && root instanceof Element) {
    let leaf: Node | null = root.lastChild;
    while (leaf && leaf.lastChild && !(leaf instanceof HTMLElement && leaf.dataset.mention !== undefined))
      leaf = leaf.lastChild;
    if (leaf instanceof HTMLElement && leaf.tagName === 'BR' && endsWithBreak()) {
      const last = out[out.length - 1];
      if (last.text === '\n') out.pop();
      else last.text = last.text.slice(0, -1);
    }
  }
  return out;
}
/** Plain-text offset of a DOM position inside the editor. */
function offsetOf(root: HTMLElement, node: Node, offset: number, rootColor: string): number {
  const range = document.createRange();
  range.setStart(root, 0);
  try {
    range.setEnd(node, offset);
  } catch {
    return 0;
  }
  const holder = document.createElement('div');
  holder.append(range.cloneContents());
  return fromRuns(readRuns(holder, rootColor, false)).text.length;
}
/** DOM position for a plain-text offset. */
function pointAt(root: HTMLElement, target: number): [Node, number] {
  let count = 0,
    result: [Node, number] | null = null;
  const indexIn = (n: Node) => Array.prototype.indexOf.call(n.parentNode!.childNodes, n) as number;
  const visit = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (result) return;
      if (child.nodeType === Node.TEXT_NODE) {
        const len = (child.textContent ?? '').length;
        if (count + len >= target) {
          result = [child, target - count];
          return;
        }
        count += len;
      } else if (child instanceof HTMLElement) {
        if (child.tagName === 'BR' || child.dataset.mention !== undefined) {
          if (count >= target) {
            result = [node, indexIn(child)];
            return;
          }
          count += child.tagName === 'BR' ? 1 : (child.textContent ?? '').length;
          if (count === target && child.dataset.mention !== undefined) {
            result = [node, indexIn(child) + 1];
            return;
          }
        } else visit(child);
      }
    }
  };
  visit(root);
  return result ?? [root, root.childNodes.length];
}

// ---- Editor ------------------------------------------------------------------------------------------

type Pos = { x: number; y: number };
type LinkState = { start: number; end: number; initial: string; hasLink: boolean; at: Pos };
type MentionState = { start: number; caret: number; names: string[]; active: number; at: Pos };

export function CanvasTextEditor({
  item,
  initialText,
  onCommit,
  onTab,
  rich = true,
  people,
}: {
  item: Item;
  initialText?: string;
  onCommit: (text: string, spans: TextSpan[]) => void;
  /** Tab (without modifiers): save and hand over to the caller instead of committing on blur. */
  onTab?: (text: string, spans: TextSpan[]) => void;
  /** Per-word formatting, links and mentions (objects whose text is drawn with TextBody). */
  rich?: boolean;
  /** Names offered after "@". */
  people?: () => string[];
}) {
  const handedOver = useRef(false),
    done = useRef(false),
    popoverOpen = useRef(false);
  const [text, setText] = useState(initialText ?? item.text),
    [bar, setBar] = useState<{ at: Pos; style: SpanStyle } | null>(null),
    [palette, setPalette] = useState<'color' | 'highlight' | null>(null),
    [link, setLink] = useState<LinkState | null>(null),
    [mention, setMention] = useState<MentionState | null>(null);
  const live = { ...item, text },
    layout = textLayout(live),
    sticky = item.type === 'note';
  const editor = useRef<HTMLDivElement>(null);
  const rootColor = () => (editor.current ? (toHex(getComputedStyle(editor.current).color) ?? '') : '');
  /** Current content of the editor as text plus spans. */
  const model = () => {
    const r = fromRuns(readRuns(editor.current!, rootColor(), true));
    return { text: r.text.slice(0, TEXT_MAX), spans: r.spans };
  };
  const selection = (): { start: number; end: number } | null => {
    const root = editor.current,
      sel = getSelection();
    if (!root || !sel?.rangeCount) return null;
    const r = sel.getRangeAt(0);
    if (!root.contains(r.startContainer) || !root.contains(r.endContainer)) return null;
    const a = offsetOf(root, r.startContainer, r.startOffset, rootColor()),
      b = offsetOf(root, r.endContainer, r.endOffset, rootColor());
    return { start: Math.min(a, b), end: Math.max(a, b) };
  };
  const select = (start: number, end = start) => {
    const root = editor.current,
      sel = getSelection();
    if (!root || !sel) return;
    const [sn, so] = pointAt(root, start),
      [en, eo] = pointAt(root, end),
      range = document.createRange();
    range.setStart(sn, so);
    range.setEnd(en, eo);
    sel.removeAllRanges();
    sel.addRange(range);
  };
  /** Replace the content and selection in one go. */
  const show = (next: { text: string; spans: TextSpan[] }, start: number, end = start) => {
    if (!editor.current) return;
    paintRich(editor.current, next.text, next.spans);
    setText(next.text);
    if (document.activeElement !== editor.current) editor.current.focus({ preventScroll: true });
    select(start, end);
    refreshBar();
  };
  const commit = () => {
    if (done.current || handedOver.current || !editor.current) return;
    done.current = true;
    const m = model();
    onCommit(m.text, rich ? m.spans : []);
  };
  const refreshBar = () => {
    const root = editor.current,
      sel = getSelection();
    if (!rich || !root || !sel?.rangeCount || sel.isCollapsed || !root.contains(sel.anchorNode)) {
      if (!popoverOpen.current) setBar(null);
      return;
    }
    const range = sel.getRangeAt(0),
      rect = range.getBoundingClientRect(),
      box = root.getBoundingClientRect(),
      at = rect.width || rect.height ? rect : box,
      s = selection(),
      m = model();
    setBar({
      at: { x: at.left + at.width / 2, y: Math.max(8, at.top) },
      style: s ? styleIn(m.spans, s.start, s.end) : {},
    });
  };
  const toggle = (key: ToggleKey) => {
    const s = selection();
    if (!rich || !s || s.end <= s.start) return;
    const m = model();
    show({ text: m.text, spans: toggleStyle(m.text, m.spans, s.start, s.end, key) }, s.start, s.end);
  };
  /** Clear formatting (Ctrl+\): styles go from the selection, or from all the text when nothing is selected. */
  const clearFormatting = () => {
    const s = selection();
    if (!rich || !s) return;
    setPalette(null);
    const m = model();
    show({ text: m.text, spans: clearStyles(m.text, m.spans, s.start, s.end) }, s.start, s.end);
  };
  const setColor = (key: 'color' | 'highlight', value: string | undefined) => {
    const s = selection();
    setPalette(null);
    if (!s || s.end <= s.start) return;
    const m = model();
    show({ text: m.text, spans: applyStyle(m.text, m.spans, s.start, s.end, { [key]: value }) }, s.start, s.end);
  };
  const openLink = () => {
    const s = selection();
    if (!rich || !s || !editor.current) return;
    const m = model(),
      existing = linkAt(m.spans, s.start, s.end),
      start = existing && s.start === s.end ? existing.start : s.start,
      end = existing && s.start === s.end ? existing.end : s.end;
    const sel = getSelection(),
      rect = sel?.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : null,
      box = editor.current.getBoundingClientRect(),
      at = rect && (rect.width || rect.height) ? rect : box;
    popoverOpen.current = true;
    setPalette(null);
    setMention(null);
    setLink({
      start,
      end,
      initial: existing?.href ?? '',
      hasLink: !!existing,
      at: { x: at.left, y: at.bottom + 6 },
    });
  };
  const closeLink = (next?: { text: string; spans: TextSpan[] }, start?: number, end?: number) => {
    const state = link;
    setLink(null);
    popoverOpen.current = false;
    if (!editor.current || !state) return;
    editor.current.focus({ preventScroll: true });
    if (next) show(next, start ?? state.start, end ?? state.end);
    else select(state.start, state.end);
  };
  const applyLink = (href: string) => {
    if (!link) return;
    const m = model();
    if (link.end > link.start)
      closeLink({ text: m.text, spans: applyStyle(m.text, m.spans, link.start, link.end, { href }) });
    else {
      // No words selected: insert the address itself as the link text.
      const label = href.replace(/^mailto:/i, '');
      if (m.text.length + label.length > TEXT_MAX) return closeLink();
      const next = replaceRange(m.text, m.spans, link.start, link.start, label, { href });
      closeLink(next, link.start + label.length, link.start + label.length);
    }
  };
  const removeLink = () => {
    if (!link) return;
    const m = model();
    closeLink({ text: m.text, spans: applyStyle(m.text, m.spans, link.start, link.end, { href: undefined }) });
  };
  /** Insert plain text at the selection (paste, line breaks). */
  const insertPlain = (value: string) => {
    const s = selection();
    if (!s) return;
    const m = model(),
      room = TEXT_MAX - (m.text.length - (s.end - s.start)),
      add = value.slice(0, Math.max(0, room));
    if (!add && s.end === s.start) return;
    show(replaceRange(m.text, m.spans, s.start, s.end, add), s.start + add.length);
  };
  const watchMention = () => {
    if (!rich || !people) return setMention(null);
    const s = selection();
    if (!s || s.start !== s.end) return setMention(null);
    const m = model(),
      q = mentionQuery(m.text, s.start),
      names = q ? mentionMatches(people(), q.query) : [];
    if (!q || !names.length) return setMention(null);
    const sel = getSelection(),
      rect = sel?.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : null,
      box = editor.current!.getBoundingClientRect(),
      at = rect && (rect.height || rect.width) ? rect : box;
    setMention(previous => ({
      start: q.start,
      caret: s.start,
      names,
      active: previous && previous.start === q.start ? Math.min(previous.active, names.length - 1) : 0,
      at: { x: at.left, y: at.bottom + 4 },
    }));
  };
  const pickMention = (name: string) => {
    const state = mention;
    setMention(null);
    if (!state) return;
    const clean = cleanMentionName(name),
      m = model(),
      chip = `@${clean}`;
    if (!clean || m.text.length - (state.caret - state.start) + chip.length + 1 > TEXT_MAX) return;
    const withChip = replaceRange(m.text, m.spans, state.start, state.caret, chip, { mention: clean }),
      after = state.start + chip.length,
      next = replaceRange(withChip.text, withChip.spans, after, after, ' ');
    show(next, after + 1);
  };
  const keyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (mention && mention.names.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        setMention({ ...mention, active: (mention.active + step + mention.names.length) % mention.names.length });
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        pickMention(mention.names[mention.active]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMention(null);
        return;
      }
    }
    const mod = e.ctrlKey || e.metaKey,
      key = e.key.toLowerCase();
    if (onTab && e.key === 'Tab' && !e.shiftKey && !mod && !e.altKey) {
      e.preventDefault();
      const m = model();
      handedOver.current = true;
      onTab(m.text, rich ? m.spans : []);
      return;
    }
    if (mod && !e.altKey) {
      const flag: ToggleKey | null = e.shiftKey
        ? key === 'x' || e.code === 'KeyX'
          ? 'strike'
          : null
        : key === 'b'
          ? 'bold'
          : key === 'i'
            ? 'italic'
            : key === 'u'
              ? 'underline'
              : null;
      if (flag) {
        e.preventDefault();
        toggle(flag);
        return;
      }
      if (!e.shiftKey && key === 'k') {
        e.preventDefault();
        openLink();
        return;
      }
      if (!e.shiftKey && (e.key === '\\' || e.code === 'Backslash')) {
        e.preventDefault();
        clearFormatting();
        return;
      }
    }
    if (e.key === 'Escape' || (e.key === 'Enter' && mod)) {
      e.preventDefault();
      e.currentTarget.blur();
      return;
    }
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      insertPlain('\n');
    }
  };
  const latest = useLatest({ refreshBar, watchMention });
  // Paint once on open, focus, and select everything (or put the caret after a typed first character).
  useLayoutEffect(() => {
    const root = editor.current;
    if (!root) return;
    const start = initialText ?? item.text;
    paintRich(root, start, rich && initialText === undefined ? activeSpans(item) : []);
    root.focus({ preventScroll: true });
    const sel = getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.selectNodeContents(root);
    if (initialText !== undefined) range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const root = editor.current;
    if (!root) return;
    const changed = () => latest.current.refreshBar();
    // Keep typed text within the limit (IME composition is trimmed on save instead).
    const beforeInput = (e: InputEvent) => {
      if (e.inputType === 'insertFromDrop') return e.preventDefault();
      if (!e.inputType.startsWith('insert') || e.isComposing || !e.data) return;
      const sel = getSelection(),
        selected = sel?.rangeCount ? sel.getRangeAt(0).toString().length : 0;
      if ((root.textContent ?? '').length - selected + e.data.length > TEXT_MAX) e.preventDefault();
    };
    document.addEventListener('selectionchange', changed);
    root.addEventListener('beforeinput', beforeInput);
    return () => {
      document.removeEventListener('selectionchange', changed);
      root.removeEventListener('beforeinput', beforeInput);
    };
  }, [latest]);
  useLayoutEffect(() => {
    const el = editor.current;
    if (!el || !sticky) return;
    const auto = item.format?.fontSize === undefined || item.format.fontSize === 'auto',
      available = Math.max(1, item.h - 26 - 2 * Math.abs(item.format?.baselineOffsetY ?? 0));
    el.style.height = '0px';
    el.style.paddingTop = '0px';
    el.style.paddingBottom = '0px';
    // An empty editable box has no line at all, so measuring it would grow the font to the maximum and push
    // the (very tall) caret down to the bottom. Start an empty note at the size a short word gets instead.
    const empty = !text.trim();
    if (auto && empty) el.style.fontSize = `${textLayout({ ...item, text: 'Text' }).size}px`;
    else if (auto) {
      let low = 1,
        high = Math.min(512, available / 1.4);
      for (let i = 0; i < 11; i++) {
        const size = (low + high) / 2;
        el.style.fontSize = `${size}px`;
        if (el.scrollHeight <= available) low = size;
        else high = size;
      }
      el.style.fontSize = `${Math.floor(low * 10) / 10}px`;
    }
    // Always at least one line tall, so the caret of an empty note sits in the vertical middle.
    const natural = Math.max(el.scrollHeight, parseFloat(getComputedStyle(el).fontSize) * 1.4);
    el.style.height = '100%';
    el.style.paddingTop = `${Math.max(0, Math.max(4, item.format?.valign === 'top' ? 4 : item.format?.valign === 'bottom' ? item.h - 20 - natural : (item.h - 16 - natural) / 2) + (item.format?.baselineOffsetY ?? 0))}px`;
    el.style.paddingBottom = '4px';
  }, [text, item, sticky]);
  const barButtons: { key: ToggleKey; label: string; icon: typeof Bold; shortcut: string }[] = [
    { key: 'bold', label: 'Bold', icon: Bold, shortcut: 'Ctrl+B' },
    { key: 'italic', label: 'Italic', icon: Italic, shortcut: 'Ctrl+I' },
    { key: 'underline', label: 'Underline', icon: Underline, shortcut: 'Ctrl+U' },
    { key: 'strike', label: 'Strikethrough', icon: Strikethrough, shortcut: 'Ctrl+Shift+X' },
  ];
  return (
    <>
      <div
        ref={editor}
        role="textbox"
        aria-multiline="true"
        aria-label="Edit object text"
        contentEditable
        suppressContentEditableWarning
        spellCheck
        className={`object-editor rich-editor ${sticky ? 'sticky-editor' : ''}`}
        style={{
          ...formatStyle(live),
          ...(sticky
            ? { background: item.fill, paddingTop: Math.max(4, (item.h - 16 - layout.height) / 2), paddingBottom: 4 }
            : {}),
          lineHeight: 1.4,
          ...(!sticky && item.format?.baselineOffsetY
            ? { paddingTop: Math.max(0, 8 + item.format.baselineOffsetY) }
            : {}),
        }}
        onPointerDown={e => e.stopPropagation()}
        onInput={() => {
          if (editor.current) setText(model().text);
          watchMention();
        }}
        onPaste={e => {
          e.preventDefault();
          e.stopPropagation();
          const pasted = e.clipboardData.getData('text/plain'),
            s = rich ? selection() : null,
            href = s && s.end > s.start ? pastedLink(pasted) : null;
          // A web address pasted over selected words links them, like Ctrl+K, instead of replacing them.
          if (s && href) {
            const m = model();
            return show({ text: m.text, spans: applyStyle(m.text, m.spans, s.start, s.end, { href }) }, s.start, s.end);
          }
          insertPlain(pasted.replace(/\r\n?/g, '\n'));
        }}
        onDrop={e => e.preventDefault()}
        onBlur={e => {
          if (popoverOpen.current) return;
          const to = e.relatedTarget as Element | null;
          if (to?.closest('.rich-text-popup')) return;
          setMention(null);
          commit();
        }}
        onKeyDown={keyDown}
      />
      {rich &&
        createPortal(
          <div className="rich-text-popup" onKeyDown={e => e.stopPropagation()}>
            {bar && !link && (
              <div
                className="rich-toolbar"
                role="toolbar"
                aria-label="Selected text formatting"
                style={{ left: bar.at.x, top: bar.at.y }}
                {...keepSelection}
              >
                {barButtons.map(({ key, label, icon: Icon, shortcut }) => (
                  <button
                    key={key}
                    type="button"
                    className={`icon-button ${bar.style[key] ? 'active' : ''}`}
                    aria-label={label}
                    aria-pressed={!!bar.style[key]}
                    title={`${label} (${shortcut})`}
                    {...keepSelection}
                    onClick={e => {
                      e.stopPropagation();
                      toggle(key);
                    }}
                  >
                    <Icon size={15} />
                  </button>
                ))}
                <button
                  type="button"
                  className={`icon-button ${palette === 'color' ? 'active' : ''}`}
                  aria-label="Text colour"
                  aria-expanded={palette === 'color'}
                  title="Text colour"
                  {...keepSelection}
                  onClick={e => {
                    e.stopPropagation();
                    setPalette(p => (p === 'color' ? null : 'color'));
                  }}
                >
                  <Baseline size={15} />
                </button>
                <button
                  type="button"
                  className={`icon-button ${palette === 'highlight' ? 'active' : ''}`}
                  aria-label="Highlight"
                  aria-expanded={palette === 'highlight'}
                  title="Highlight"
                  {...keepSelection}
                  onClick={e => {
                    e.stopPropagation();
                    setPalette(p => (p === 'highlight' ? null : 'highlight'));
                  }}
                >
                  <Highlighter size={15} />
                </button>
                <button
                  type="button"
                  className={`icon-button ${bar.style.href ? 'active' : ''}`}
                  aria-label="Link"
                  aria-pressed={!!bar.style.href}
                  title="Link (Ctrl+K)"
                  {...keepSelection}
                  onClick={e => {
                    e.stopPropagation();
                    openLink();
                  }}
                >
                  <LinkIcon size={15} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Clear formatting"
                  title="Clear formatting (Ctrl+\)"
                  {...keepSelection}
                  onClick={e => {
                    e.stopPropagation();
                    clearFormatting();
                  }}
                >
                  <RemoveFormatting size={15} />
                </button>
                {palette && (
                  <SwatchRow
                    label={palette === 'color' ? 'Text colour' : 'Highlight'}
                    colors={palette === 'color' ? textColors : highlightColors}
                    onPick={value => setColor(palette, value)}
                  />
                )}
              </div>
            )}
            {link && (
              <LinkPopover
                initial={link.initial}
                hasLink={link.hasLink}
                style={{ left: link.at.x, top: link.at.y }}
                onApply={applyLink}
                onRemove={removeLink}
                onCancel={() => closeLink()}
                onLeave={to => {
                  if (to && editor.current?.contains(to)) {
                    setLink(null);
                    popoverOpen.current = false;
                    return;
                  }
                  setLink(null);
                  popoverOpen.current = false;
                  commit();
                }}
              />
            )}
            {mention && mention.names.length > 0 && (
              <MentionMenu
                names={mention.names}
                active={mention.active}
                style={{ left: mention.at.x, top: mention.at.y }}
                onPick={pickMention}
                onHover={k => setMention({ ...mention, active: k })}
              />
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
