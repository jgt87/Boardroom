// Parts of the richer Doc editor (decision R4-Q4, 2026-11-08): the date picker, the comment composer, the side
// list of comment threads and the bar for selected blocks. The logic lives in doc-rich.ts; these only render.
import React, { useState } from 'react';
import { ArrowDown, ArrowUp, Copy, Scissors, Trash2, X } from 'lucide-react';
import { commentIds, isIsoDate, todayIso, type DocThread } from './doc-rich';
import { AUTHOR_KEY, cleanAuthor } from './authors';
import './doc-editor.css';

/** Keep presses inside these parts away from the canvas (they are in a foreignObject on the board). */
const ownEvents = {
  onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
  onDoubleClick: (e: React.MouseEvent) => e.stopPropagation(),
  onClick: (e: React.MouseEvent) => e.stopPropagation(),
};
/** This device's profile name for new comments ('' when none is set or storage is blocked). */
export function ownAuthor(): string {
  try {
    return cleanAuthor(localStorage.getItem(AUTHOR_KEY) ?? '');
  } catch {
    return '';
  }
}

/** A small popover inside the Doc; Escape cancels, leaving it for elsewhere reports where focus went. */
function DocPopover({
  label,
  style,
  onCancel,
  onLeave,
  children,
}: {
  label: string;
  style?: React.CSSProperties;
  onCancel: () => void;
  onLeave?: (to: Element | null) => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rich-link-popover doc-popover"
      role="dialog"
      aria-label={label}
      style={style}
      {...ownEvents}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      }}
      onBlur={e => {
        const to = e.relatedTarget as Element | null;
        if (!to || !e.currentTarget.contains(to)) onLeave?.(to);
      }}
    >
      {children}
    </div>
  );
}

/** Pick a date with the browser's own date picker and insert it as a chip. */
export function DatePopover({
  style,
  onApply,
  onCancel,
  onLeave,
}: {
  style?: React.CSSProperties;
  onApply: (iso: string) => void;
  onCancel: () => void;
  onLeave?: (to: Element | null) => void;
}) {
  const [value, setValue] = useState(todayIso()),
    [error, setError] = useState(false);
  const apply = () => (isIsoDate(value) ? onApply(value) : setError(true));
  return (
    <DocPopover label="Insert date" style={style} onCancel={onCancel} onLeave={onLeave}>
      <input
        autoFocus
        type="date"
        aria-label="Date"
        aria-invalid={error || undefined}
        value={value}
        onChange={e => {
          setValue(e.target.value);
          setError(false);
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            apply();
          }
        }}
      />
      <button type="button" onMouseDown={e => e.preventDefault()} onClick={apply}>
        Insert date
      </button>
      {error && <small className="rich-link-error">Pick a full date.</small>}
    </DocPopover>
  );
}

/** Write the first message of a comment on the selected text. Enter adds it, Shift+Enter starts a new line. */
export function CommentComposer({
  quote,
  style,
  onAdd,
  onCancel,
  onLeave,
}: {
  quote: string;
  style?: React.CSSProperties;
  /** Returns an error message, or nothing when the comment was added. */
  onAdd: (text: string) => string | void;
  onCancel: () => void;
  onLeave?: (to: Element | null) => void;
}) {
  const [text, setText] = useState(''),
    [error, setError] = useState('');
  const add = () => setError(onAdd(text) || '');
  return (
    <DocPopover label="Add comment" style={style} onCancel={onCancel} onLeave={onLeave}>
      <q className="doc-comment-quote">{quote}</q>
      <textarea
        autoFocus
        aria-label="Comment"
        placeholder="Write a comment"
        maxLength={2000}
        rows={2}
        value={text}
        aria-invalid={!!error || undefined}
        onChange={e => {
          setText(e.target.value);
          setError('');
        }}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            add();
          }
        }}
      />
      <button type="button" className="doc-primary" onMouseDown={e => e.preventDefault()} onClick={add}>
        Comment
      </button>
      {error && <small className="rich-link-error">{error}</small>}
    </DocPopover>
  );
}

const timeOf = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

/** One thread in the side list: its text, messages, a reply box and resolve and delete. */
function ThreadView({
  thread,
  detached,
  active,
  locked,
  onShow,
  onReply,
  onResolve,
  onDelete,
}: {
  thread: DocThread;
  detached: boolean;
  active: boolean;
  locked: boolean;
  onShow: () => void;
  onReply: (text: string) => string | void;
  onResolve: (resolved: boolean) => void;
  onDelete: () => void;
}) {
  const [reply, setReply] = useState(''),
    [error, setError] = useState('');
  const send = () => {
    const why = onReply(reply);
    setError(why || '');
    if (!why) setReply('');
  };
  const quote = thread.quote || 'Commented text';
  return (
    <li
      className={`doc-thread${active ? ' active' : ''}${thread.resolved ? ' resolved' : ''}`}
      aria-label={`Comment on "${quote}"`}
      data-thread={thread.id}
    >
      {detached ? (
        <p className="doc-thread-quote detached">
          <q>{quote}</q> <span className="doc-thread-flag">Text removed</span>
        </p>
      ) : (
        <button type="button" className="doc-thread-quote" title="Show the commented text" onClick={onShow}>
          <q>{quote}</q>
        </button>
      )}
      {thread.resolved && <span className="doc-thread-flag">Resolved</span>}
      <ol className="doc-thread-messages">
        {thread.messages.map(m => (
          <li key={m.id}>
            <small>
              {m.author ? <b>{m.author}</b> : null} <time dateTime={m.at}>{timeOf(m.at)}</time>
            </small>
            <p>{m.text}</p>
          </li>
        ))}
      </ol>
      {!locked && (
        <>
          {!thread.resolved && (
            <div className="doc-thread-reply">
              <textarea
                aria-label={`Reply to the comment on "${quote}"`}
                placeholder="Reply"
                rows={1}
                maxLength={2000}
                value={reply}
                onChange={e => {
                  setReply(e.target.value);
                  setError('');
                }}
                onKeyDown={e => {
                  e.stopPropagation();
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send();
                  }
                }}
              />
              <button type="button" onClick={send}>
                Reply
              </button>
            </div>
          )}
          {error && <small className="rich-link-error">{error}</small>}
          <div className="doc-thread-actions">
            <button type="button" onClick={() => onResolve(!thread.resolved)}>
              {thread.resolved ? 'Reopen' : 'Resolve'}
            </button>
            <button type="button" className="doc-danger" onClick={onDelete}>
              Delete
            </button>
          </div>
        </>
      )}
    </li>
  );
}

/** Side list of a Doc's comment threads: those on text in document order, then those whose text is gone. */
export function DocCommentsPanel({
  threads,
  markdown,
  active,
  locked,
  onShow,
  onReply,
  onResolve,
  onDelete,
  onClose,
}: {
  threads: DocThread[];
  markdown: string;
  active: string | null;
  locked: boolean;
  onShow: (id: string) => void;
  onReply: (id: string, text: string) => string | void;
  onResolve: (id: string, resolved: boolean) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const order = [...new Set(commentIds(markdown))],
    anchored = order.map(id => threads.find(t => t.id === id)).filter((t): t is DocThread => !!t),
    detached = threads.filter(t => !order.includes(t.id));
  const view = (t: DocThread, isDetached: boolean) => (
    <ThreadView
      key={t.id}
      thread={t}
      detached={isDetached}
      active={t.id === active}
      locked={locked}
      onShow={() => onShow(t.id)}
      onReply={text => onReply(t.id, text)}
      onResolve={resolved => onResolve(t.id, resolved)}
      onDelete={() => onDelete(t.id)}
    />
  );
  return (
    <aside className="doc-comments-panel" aria-label="Doc comments" {...ownEvents} onKeyDown={e => e.stopPropagation()}>
      <header>
        <h3>Comments</h3>
        <button type="button" className="doc-icon-button" aria-label="Close comments" onClick={onClose}>
          <X size={14} aria-hidden="true" />
        </button>
      </header>
      {!threads.length && <p className="doc-comments-empty">Select text and press Comment to start a thread.</p>}
      {anchored.length > 0 && <ul className="doc-thread-list">{anchored.map(t => view(t, false))}</ul>}
      {detached.length > 0 && (
        <>
          <h4>Text removed</h4>
          <p className="doc-comments-empty">The text these comments were on is gone. Delete them when done.</p>
          <ul className="doc-thread-list">{detached.map(t => view(t, true))}</ul>
        </>
      )}
    </aside>
  );
}

/** Controls for selected blocks, mirroring the block keys (Alt+Shift+Up/Down, Ctrl+C, Ctrl+X, Delete, Enter). */
export function BlockBar({
  count,
  locked,
  onMove,
  onCopy,
  onCut,
  onDelete,
  onDone,
}: {
  count: number;
  locked: boolean;
  onMove: (delta: -1 | 1) => void;
  onCopy: () => void;
  onCut: () => void;
  onDelete: () => void;
  onDone: () => void;
}) {
  const tool = (label: string, keys: string, icon: React.ReactNode, run: () => void, disabled = false) => (
    <button
      type="button"
      className="doc-icon-button"
      aria-label={label}
      title={`${label} (${keys})`}
      disabled={disabled}
      onClick={run}
    >
      {icon}
    </button>
  );
  return (
    <div
      className="doc-block-bar"
      role="toolbar"
      aria-label="Selected blocks"
      {...ownEvents}
      onMouseDown={e => e.preventDefault()}
    >
      <span role="status">
        {count} block{count === 1 ? '' : 's'} selected
      </span>
      {tool('Move blocks up', 'Alt+Shift+Up', <ArrowUp size={14} aria-hidden="true" />, () => onMove(-1), locked)}
      {tool('Move blocks down', 'Alt+Shift+Down', <ArrowDown size={14} aria-hidden="true" />, () => onMove(1), locked)}
      {tool('Copy blocks', 'Ctrl+C', <Copy size={14} aria-hidden="true" />, onCopy)}
      {tool('Cut blocks', 'Ctrl+X', <Scissors size={14} aria-hidden="true" />, onCut, locked)}
      {tool('Delete blocks', 'Delete', <Trash2 size={14} aria-hidden="true" />, onDelete, locked)}
      <button type="button" onClick={onDone} title="Back to typing (Enter)">
        Done
      </button>
    </div>
  );
}
