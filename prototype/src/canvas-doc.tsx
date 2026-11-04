import React, { useMemo, useRef, useState } from 'react';
import type { Item } from './model';
import type { WidgetCtx } from './widget-types';
import { renderMarkdown } from './markdown';
import { canvasControl } from './canvas-fields';
import { useLatest } from './use-latest';
import { filterSlash, docTemplates, calloutLabels, DOC_MAX, docShortcut, emojiQuery } from './doc-tools';
import { loadEmojiGroups, searchEmojis } from './emoji-data';
import type { EmojiEntry, EmojiGroup } from './emoji-data';
import { StatusChip } from './status-chip';
import type { SlashCommand, CalloutKind } from './doc-tools';

/** Serialize only supported rich-text elements. Pasted HTML is never persisted. */
export function markdownFrom(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE)
    return (node.textContent ?? '').replace(/([\\`*_[\]~])/g, '\\$1').replace(/\+(?=\+)/g, '\\+');
  if (!(node instanceof HTMLElement)) return '';
  if (node.classList.contains('doc-callout-title')) return '';
  const children = () => Array.from(node.childNodes).map(markdownFrom).join('');
  switch (node.tagName) {
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

export function CanvasDoc({ item, ctx }: { item: Item; ctx: WidgetCtx }) {
  const editor = useRef<HTMLDivElement>(null),
    [slash, setSlash] = useState<{ query: string; top: number; active: number } | null>(null),
    [emoji, setEmoji] = useState<{
      query: string;
      length: number;
      top: number;
      active: number;
      results: EmojiEntry[];
    } | null>(null),
    emojiGroups = useRef<EmojiGroup[] | null>(null);
  const md = String(item.data?.markdown ?? '');
  const save = (next: string) => {
    if (item.locked || next === md.trim()) return;
    ctx.update(b => ({
      ...b,
      items: b.items.map(i => (i.id === item.id ? { ...i, data: { ...i.data, markdown: next.slice(0, DOC_MAX) } } : i)),
    }));
  };
  const commit = () => {
    if (!editor.current) return;
    save(Array.from(editor.current.childNodes).map(markdownFrom).join('').trim().slice(0, DOC_MAX));
  };
  const command = (name: string, value?: string) => {
    editor.current?.focus();
    document.execCommand(name, false, value);
  };
  /** Show the slash menu when the caret's block starts with "/". */
  const watchSlash = () => {
    const root = editor.current;
    if (!root || item.locked) return setSlash(null);
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
      top = (range.getBoundingClientRect().bottom - wrap.top) / (ctx.zoom || 1);
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
      return ctx.display('Select text on one line to format it as code.');
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
  /** Show emoji suggestions while ":name" is typed right before the caret. */
  const watchEmoji = () => {
    const root = editor.current,
      sel = getSelection(),
      node = sel?.anchorNode;
    if (!root || item.locked || !node || node.nodeType !== Node.TEXT_NODE || !root.contains(node))
      return setEmoji(null);
    const q = emojiQuery((node.textContent ?? '').slice(0, sel!.anchorOffset));
    if (!q) return setEmoji(null);
    const range = document.createRange();
    range.setStart(node, sel!.anchorOffset);
    range.collapse(true);
    const wrap = root.parentElement!.getBoundingClientRect(),
      rect = range.getBoundingClientRect(),
      top = (rect.bottom - wrap.top) / (ctx.zoom || 1);
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
    const shortcut = item.locked ? null : docShortcut(e);
    if (shortcut) {
      e.preventDefault();
      if (shortcut.kind === 'strike') document.execCommand('strikethrough');
      else if (shortcut.kind === 'block') document.execCommand('formatBlock', false, shortcut.block);
      else if (shortcut.kind === 'list') insertList(shortcut.list);
      else toggleCode();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (editor.current) editor.current.innerHTML = renderMarkdown(md);
      e.currentTarget.blur();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      e.currentTarget.blur();
    }
  };
  const live = useLatest({
    watchSlash,
    watchEmoji,
    keyDown,
    blur: () => {
      setSlash(null);
      setEmoji(null);
      commit();
    },
  });
  // The editable element only re-renders when its saved content or lock changes, so menu state
  // updates never reset what the person is typing.
  const locked = !!item.locked;
  const editable = useMemo(
    () => (
      <div
        ref={editor}
        key={md}
        className="canvas-doc doc-content"
        role="textbox"
        aria-label="Document content. Type / on an empty line for blocks."
        aria-multiline="true"
        aria-haspopup="listbox"
        contentEditable={!item.locked}
        suppressContentEditableWarning
        {...canvasControl}
        dangerouslySetInnerHTML={{ __html: renderMarkdown(md) }}
        onBlur={() => live.current.blur()}
        onInput={() => {
          live.current.watchSlash();
          live.current.watchEmoji();
        }}
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
    <div className="rich-object canvas-interactive canvas-doc-object" onDoubleClick={e => e.stopPropagation()}>
      <div className="rich-title canvas-widget-header">
        <span>{item.text || 'Doc'}</span>
        <StatusChip status={item.data?.status} />
        <div {...canvasControl} onMouseDown={e => e.preventDefault()} className="canvas-doc-tools">
          <button disabled={!!item.locked} aria-label="Bold document text" onClick={() => command('bold')}>
            B
          </button>
          <button disabled={!!item.locked} aria-label="Italic document text" onClick={() => command('italic')}>
            I
          </button>
          <button
            disabled={!!item.locked}
            aria-label="Underline document text"
            title="Underline (Ctrl+U)"
            onClick={() => command('underline')}
          >
            <u>U</u>
          </button>
          <button
            disabled={!!item.locked}
            aria-label="Strikethrough document text"
            title="Strikethrough (Ctrl+Shift+X)"
            onClick={() => command('strikethrough')}
          >
            <s>S</s>
          </button>
          <button disabled={!!item.locked} onClick={() => command('formatBlock', 'h1')}>
            H1
          </button>
          <button disabled={!!item.locked} onClick={() => command('insertUnorderedList')}>
            List
          </button>
          <select
            aria-label="Apply a doc template"
            value=""
            disabled={!!item.locked}
            onMouseDown={e => e.stopPropagation()}
            onChange={e => {
              const t = docTemplates.find(t => t.id === e.target.value);
              e.target.value = '';
              if (!t) return;
              save(t.markdown.trim());
              ctx.display(`${t.label} template applied. Undo restores the previous content.`);
            }}
          >
            <option value="">Templates…</option>
            {docTemplates.map(t => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="canvas-doc-wrap">
        {editable}
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
