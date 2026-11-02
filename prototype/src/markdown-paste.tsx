// Choice panel shown when pasted text looks like Markdown (item 34). Plain text paste is unaffected.
import React, { useEffect, useMemo, useRef } from 'react';
import { X, Type, StickyNote, FileText } from 'lucide-react';
import { markdownSummary } from './markdown';

export function MarkdownPastePanel({
  text,
  onChoose,
  onClose,
}: {
  text: string;
  onChoose: (mode: 'text' | 'notes' | 'doc') => void;
  onClose: () => void;
}) {
  const summary = useMemo(() => markdownSummary(text), [text]),
    first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const prior = document.activeElement as HTMLElement;
    first.current?.focus();
    return () => {
      if (prior?.isConnected) prior.focus();
    };
  }, []);
  return (
    <aside
      className="markdown-paste floating"
      role="dialog"
      aria-label="Paste formatted text"
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="panel-heading">
        <h2>Paste formatted text as…</h2>
        <button className="icon-button" aria-label="Cancel paste" onClick={onClose}>
          <X size={17} />
        </button>
      </div>
      <div className="markdown-paste-options">
        <button ref={first} onClick={() => onChoose('text')}>
          <Type size={18} />
          <span>
            <strong>Text</strong>
            <small>
              {summary.text} text block{summary.text === 1 ? '' : 's'}, headings keep their size
            </small>
          </span>
        </button>
        <button disabled={!summary.notes} onClick={() => onChoose('notes')}>
          <StickyNote size={18} />
          <span>
            <strong>Sticky notes</strong>
            <small>
              {summary.notes
                ? `${summary.notes} note${summary.notes === 1 ? '' : 's'}, one per list item`
                : 'No list items or paragraphs'}
            </small>
          </span>
        </button>
        <button onClick={() => onChoose('doc')}>
          <FileText size={18} />
          <span>
            <strong>Doc</strong>
            <small>One document with the full formatting</small>
          </span>
        </button>
      </div>
      <pre className="markdown-paste-sample" aria-label="Pasted text">
        {text.slice(0, 400)}
        {text.length > 400 ? '…' : ''}
      </pre>
      <p>One undo removes the whole paste.</p>
    </aside>
  );
}
