import { useRef } from 'react';
import type { Item } from './model';
import type { WidgetCtx } from './widget-types';
import { renderMarkdown } from './markdown';
import { canvasControl } from './canvas-fields';

/** Serialize only supported rich-text elements. Pasted HTML is never persisted. */
function markdownFrom(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? '').replace(/([\\`*_[\]])/g, '\\$1');
  if (!(node instanceof HTMLElement)) return '';
  const body = Array.from(node.childNodes).map(markdownFrom).join('');
  switch (node.tagName) {
    case 'BR':
      return '\n';
    case 'STRONG':
    case 'B':
      return `**${body}**`;
    case 'EM':
    case 'I':
      return `*${body}*`;
    case 'H1':
    case 'H2':
    case 'H3':
      return `${'#'.repeat(Number(node.tagName[1]))} ${body.trim()}\n\n`;
    case 'P':
    case 'DIV':
      return `${body}\n\n`;
    case 'LI':
      return `- ${body.trim()}\n`;
    case 'UL':
    case 'OL':
      return `${body}\n`;
    case 'BLOCKQUOTE':
      return `> ${body.trim().replace(/\n/g, '\n> ')}\n\n`;
    case 'CODE':
      return '`' + body + '`';
    case 'A': {
      const href = node.getAttribute('href') ?? '';
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
      return body;
  }
}

export function CanvasDoc({ item, ctx }: { item: Item; ctx: WidgetCtx }) {
  const editor = useRef<HTMLDivElement>(null);
  const md = String(item.data?.markdown ?? '');
  const commit = () => {
    if (!editor.current || item.locked) return;
    const next = Array.from(editor.current.childNodes).map(markdownFrom).join('').trim().slice(0, 60000);
    if (next !== md.trim())
      ctx.update(b => ({
        ...b,
        items: b.items.map(i => (i.id === item.id ? { ...i, data: { ...i.data, markdown: next } } : i)),
      }));
  };
  const command = (name: string, value?: string) => {
    editor.current?.focus();
    document.execCommand(name, false, value);
  };
  return (
    <div className="rich-object canvas-interactive" onDoubleClick={e => e.stopPropagation()}>
      <div className="rich-title canvas-widget-header">
        <span>{item.text || 'Doc'}</span>
        <div {...canvasControl} onMouseDown={e => e.preventDefault()}>
          <button disabled={!!item.locked} aria-label="Bold document text" onClick={() => command('bold')}>
            B
          </button>
          <button disabled={!!item.locked} aria-label="Italic document text" onClick={() => command('italic')}>
            I
          </button>
          <button disabled={!!item.locked} onClick={() => command('formatBlock', 'h1')}>
            H1
          </button>
          <button disabled={!!item.locked} onClick={() => command('insertUnorderedList')}>
            List
          </button>
        </div>
      </div>
      <div
        ref={editor}
        key={md}
        className="canvas-doc doc-content"
        role="textbox"
        aria-label="Document content"
        aria-multiline="true"
        contentEditable={!item.locked}
        suppressContentEditableWarning
        {...canvasControl}
        dangerouslySetInnerHTML={{ __html: renderMarkdown(md) }}
        onBlur={commit}
        onPaste={e => {
          e.preventDefault();
          document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
        }}
        onKeyDown={e => {
          e.stopPropagation();
          if (e.key === 'Escape') {
            e.preventDefault();
            if (editor.current) editor.current.innerHTML = renderMarkdown(md);
            e.currentTarget.blur();
          } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
      />
    </div>
  );
}
