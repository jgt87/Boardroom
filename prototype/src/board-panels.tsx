import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Eye,
  EyeOff,
  Lock,
  LockOpen,
  ArrowUp,
  ArrowDown,
  Check,
  RotateCcw,
  Trash2,
  Pause,
  Play,
  Bell,
  BellOff,
  Link2,
  Unlink,
} from 'lucide-react';
import type { Board, Item, CommentThread } from './model';
import { layerGroups, layerLabel, formatClock, timerRemaining, templateNames, votesUsed } from './board-tools';
import type { TimerState, A11yIssue, TemplateName, PenStyle } from './board-tools';

const stopKeys = (onClose: () => void) => (e: React.KeyboardEvent) => {
  e.stopPropagation();
  if (e.key === 'Escape') onClose();
};
function Heading({ title, count, onClose }: { title: string; count?: number; onClose: () => void }) {
  return (
    <div className="panel-heading">
      <h2>
        {title}
        {count !== undefined && <span>{count}</span>}
      </h2>
      <button className="icon-button" aria-label={`Close ${title.toLowerCase()}`} onClick={onClose}>
        <X size={17} />
      </button>
    </div>
  );
}

// ---- 25 Pen options --------------------------------------------------------------------------
export function PenOptions({
  style,
  width,
  eraser,
  precise,
  onStyle,
  onWidth,
  onEraser,
  onPrecise,
}: {
  style: PenStyle;
  width: number;
  eraser: boolean;
  precise: boolean;
  onStyle: (s: PenStyle) => void;
  onWidth: (w: number) => void;
  onEraser: (on: boolean) => void;
  onPrecise: (on: boolean) => void;
}) {
  return (
    <div className="pen-options">
      <div className="segmented" role="group" aria-label="Drawing style">
        {(['pen', 'marker', 'highlighter'] as const).map(s => (
          <button
            key={s}
            aria-pressed={!eraser && style === s}
            className={!eraser && style === s ? 'active' : ''}
            onClick={() => {
              onEraser(false);
              onStyle(s);
            }}
          >
            {s[0].toUpperCase() + s.slice(1)}
          </button>
        ))}
        <button aria-pressed={eraser} className={eraser ? 'active' : ''} onClick={() => onEraser(!eraser)}>
          Eraser
        </button>
      </div>
      {eraser ? (
        <label className="check-line">
          <input type="checkbox" checked={precise} onChange={e => onPrecise(e.target.checked)} />
          Precise (erase only touched points)
        </label>
      ) : (
        <label className="check-line">
          Width
          <select aria-label="Stroke width" value={width} onChange={e => onWidth(Number(e.target.value))}>
            {[1, 2, 3, 5, 8, 12, 18, 24, 32].map(w => (
              <option key={w} value={w}>
                {w} px
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

// ---- 41 Voting ------------------------------------------------------------------------------------
export function VotingPanel({
  board,
  selectedCount,
  onStart,
  onEnd,
  onClose,
}: {
  board: Board;
  selectedCount: number;
  onStart: (budget: number, scope: 'selection' | 'board') => void;
  onEnd: () => void;
  onClose: () => void;
}) {
  const [budget, setBudget] = useState(3),
    v = board.voting,
    last = board.votingResults?.at(-1);
  return (
    <aside className="facilitate-panel floating" aria-label="Dot voting" onKeyDown={stopKeys(onClose)}>
      <Heading title="Dot voting" onClose={onClose} />
      {v?.active ? (
        <>
          <p>
            {votesUsed(board)} of {v.budget} votes used on {v.targets.length} objects. Use the + and − badges on the
            canvas.
          </p>
          <p className="local-note">This is a single-device session; votes are not collected from other people.</p>
          <div className="note-details-actions">
            <button className="primary" onClick={onEnd}>
              End vote and keep results
            </button>
          </div>
        </>
      ) : (
        <>
          <label className="field">
            Votes per session
            <input
              type="number"
              min={1}
              max={100}
              value={budget}
              aria-label="Votes per session"
              onChange={e => setBudget(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
            />
          </label>
          <div className="note-details-actions">
            <button disabled={!selectedCount} onClick={() => onStart(budget, 'selection')}>
              Vote on selection ({selectedCount})
            </button>
            <button className="primary" onClick={() => onStart(budget, 'board')}>
              Vote on whole board
            </button>
          </div>
        </>
      )}
      {last && (
        <section className="results">
          <h3>Last results · {new Date(last.endedAt).toLocaleString()}</h3>
          <ol>
            {last.totals.slice(0, 10).map(t => (
              <li key={t.id}>
                <span>{t.label}</span>
                <b style={{ width: `${Math.max(4, (t.votes / Math.max(1, last.totals[0].votes)) * 100)}%` }}>
                  {t.votes}
                </b>
              </li>
            ))}
          </ol>
        </section>
      )}
    </aside>
  );
}
export function VoteBadge({ count, onVote, scale }: { count: number; onVote: (delta: 1 | -1) => void; scale: number }) {
  return (
    <g className="vote-badge selection" transform={`scale(${scale})`}>
      <rect x={-46} y={-14} width={92} height={28} rx={14} fill="#ffffff" stroke="#4262ff" />
      <g
        data-vote="-1"
        role="button"
        aria-label="Remove vote"
        style={{ cursor: 'pointer' }}
        onPointerDown={e => {
          e.stopPropagation();
          onVote(-1);
        }}
      >
        <circle cx={-30} cy={0} r={10} fill="#edf0ff" />
        <text x={-30} y={4} textAnchor="middle" fontSize={14} fill="#4262ff">
          −
        </text>
      </g>
      <text x={0} y={5} textAnchor="middle" fontSize={14} fontWeight={700} fill="#25252c">
        {count}
      </text>
      <g
        data-vote="1"
        role="button"
        aria-label="Add vote"
        style={{ cursor: 'pointer' }}
        onPointerDown={e => {
          e.stopPropagation();
          onVote(1);
        }}
      >
        <circle cx={30} cy={0} r={10} fill="#4262ff" />
        <text x={30} y={5} textAnchor="middle" fontSize={15} fill="#ffffff">
          +
        </text>
      </g>
    </g>
  );
}

// ---- 42 Timer ---------------------------------------------------------------------------------------
export function BoardTimer({ onClose }: { onClose: () => void }) {
  const [t, setT] = useState<TimerState>({ duration: 300000, endsAt: null, remaining: 300000 }),
    [now, setNow] = useState(Date.now()),
    [sound, setSound] = useState(false),
    rang = useRef(false);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const left = timerRemaining(t, now),
    running = t.endsAt !== null && left > 0,
    done = t.endsAt !== null && left === 0;
  useEffect(() => {
    if (done && !rang.current) {
      rang.current = true;
      if (sound) beep();
    }
    if (!done) rang.current = false;
  }, [done, sound]);
  const set = (ms: number) => setT({ duration: ms, endsAt: null, remaining: ms });
  return (
    <div
      className={`board-timer floating ${done ? 'done' : ''}`}
      role="timer"
      aria-label="Board timer"
      onKeyDown={stopKeys(onClose)}
    >
      <span className="clock" aria-live={done ? 'assertive' : 'off'}>
        {done ? "Time's up" : formatClock(left)}
      </span>
      {!running && !done && (
        <select aria-label="Timer duration" value={t.duration} onChange={e => set(Number(e.target.value))}>
          {[1, 2, 3, 5, 10, 15, 20, 30].map(m => (
            <option key={m} value={m * 60000}>
              {m} min
            </option>
          ))}
        </select>
      )}
      <button
        className="icon-button"
        aria-label={running ? 'Pause timer' : 'Start timer'}
        onClick={() =>
          setT(
            running
              ? { ...t, endsAt: null, remaining: left }
              : { ...t, endsAt: Date.now() + (done ? t.duration : t.remaining) },
          )
        }
      >
        {running ? <Pause size={16} /> : <Play size={16} />}
      </button>
      <button className="icon-button" aria-label="Reset timer" onClick={() => set(t.duration)}>
        <RotateCcw size={16} />
      </button>
      <button
        className={`icon-button ${sound ? 'active' : ''}`}
        aria-label="Sound at completion"
        aria-pressed={sound}
        onClick={() => setSound(!sound)}
      >
        {sound ? <Bell size={16} /> : <BellOff size={16} />}
      </button>
      <button className="icon-button" aria-label="Close timer" onClick={onClose}>
        <X size={16} />
      </button>
    </div>
  );
}
function beep() {
  try {
    const ctx = new AudioContext(),
      o = ctx.createOscillator(),
      g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.8);
  } catch {
    /* audio unavailable */
  }
}

// ---- 46 Comments ---------------------------------------------------------------------------------
export function CommentThreadView({
  thread,
  onReply,
  onResolve,
  onDelete,
  onClose,
}: {
  thread: CommentThread;
  onReply: (text: string) => void;
  onResolve: (r: boolean) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(''),
    field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    field.current?.focus();
  }, [thread.id]);
  return (
    <div className="comment-thread" onKeyDown={stopKeys(onClose)}>
      <ol>
        {thread.messages.map(m => (
          <li key={m.id}>
            <small>{new Date(m.at).toLocaleString()}</small>
            <p>{m.text}</p>
          </li>
        ))}
      </ol>
      <form
        onSubmit={e => {
          e.preventDefault();
          if (text.trim()) {
            onReply(text);
            setText('');
          }
        }}
      >
        <textarea
          ref={field}
          aria-label="Reply"
          placeholder="Reply"
          maxLength={2000}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              if (text.trim()) {
                onReply(text);
                setText('');
              }
            }
          }}
        />
        <div className="note-details-actions">
          <button type="button" className="icon-button" aria-label="Delete thread" onClick={onDelete}>
            <Trash2 size={15} />
          </button>
          <button type="button" onClick={() => onResolve(!thread.resolved)}>
            {thread.resolved ? (
              'Reopen'
            ) : (
              <>
                <Check size={15} />
                Resolve
              </>
            )}
          </button>
          <button type="submit" className="primary" disabled={!text.trim()}>
            Reply
          </button>
        </div>
      </form>
    </div>
  );
}
export function NewComment({ onAdd, onClose }: { onAdd: (text: string) => void; onClose: () => void }) {
  const [text, setText] = useState('');
  return (
    <form
      className="comment-thread"
      onKeyDown={stopKeys(onClose)}
      onSubmit={e => {
        e.preventDefault();
        if (text.trim()) onAdd(text);
      }}
    >
      <textarea
        autoFocus
        aria-label="New comment"
        placeholder="Add a comment"
        maxLength={2000}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            if (text.trim()) onAdd(text);
          }
        }}
      />
      <div className="note-details-actions">
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button className="primary" type="submit" disabled={!text.trim()}>
          Comment
        </button>
      </div>
    </form>
  );
}
export function CommentsPanel({
  board,
  active,
  onOpen,
  onClose,
}: {
  board: Board;
  active: string | null;
  onOpen: (t: CommentThread) => void;
  onClose: () => void;
}) {
  const [show, setShow] = useState<'open' | 'resolved' | 'all'>('open'),
    threads = (board.comments ?? []).filter(t => show === 'all' || (show === 'resolved') === !!t.resolved);
  const label = (t: CommentThread) => {
    const i = t.itemId ? board.items.find(x => x.id === t.itemId) : undefined;
    return i ? layerLabel(i) : 'On the canvas';
  };
  return (
    <aside className="facilitate-panel comments-panel floating" aria-label="Comments" onKeyDown={stopKeys(onClose)}>
      <Heading title="Comments" count={board.comments?.length ?? 0} onClose={onClose} />
      <div className="segmented" role="group" aria-label="Show comments">
        {(['open', 'resolved', 'all'] as const).map(s => (
          <button key={s} aria-pressed={show === s} className={show === s ? 'active' : ''} onClick={() => setShow(s)}>
            {s[0].toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>
      {threads.length ? (
        <ol className="thread-list">
          {threads.map(t => (
            <li key={t.id}>
              <button className={active === t.id ? 'selected' : ''} onClick={() => onOpen(t)}>
                <span>{t.messages[0].text}</span>
                <small>
                  {label(t)} · {t.messages.length} {t.messages.length === 1 ? 'message' : 'messages'}
                  {t.resolved ? ' · resolved' : ''}
                </small>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p>
          {show === 'open'
            ? 'No open comments. Choose the comment tool (C) and click the canvas or an object.'
            : 'Nothing to show.'}
        </p>
      )}
      <p className="local-note">Comments are saved with this board on this device.</p>
    </aside>
  );
}

// ---- 47 Link picker -------------------------------------------------------------------------------
export function LinkPicker({
  item,
  board,
  onLink,
  onClose,
}: {
  item: Item;
  board: Board;
  onLink: (target: string | undefined) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(''),
    candidates = useMemo(
      () =>
        board.items
          .filter(
            i => i.id !== item.id && i.type !== 'arrow' && layerLabel(i).toLowerCase().includes(query.toLowerCase()),
          )
          .sort((a, b) => Number(b.type === 'frame') - Number(a.type === 'frame'))
          .slice(0, 80),
      [board, item.id, query],
    );
  return (
    <aside className="facilitate-panel floating" aria-label="Link to object" onKeyDown={stopKeys(onClose)}>
      <Heading title="Link to" onClose={onClose} />
      <input
        className="panel-search"
        autoFocus
        aria-label="Find object"
        placeholder="Find a frame or object"
        value={query}
        onChange={e => setQuery(e.target.value)}
      />
      <ol className="thread-list">
        {candidates.map(c => (
          <li key={c.id}>
            <button className={item.linkTo === c.id ? 'selected' : ''} onClick={() => onLink(c.id)}>
              <Link2 size={14} />
              <span>{layerLabel(c)}</span>
              <small>{c.type}</small>
            </button>
          </li>
        ))}
        {!candidates.length && <li className="empty">No matching objects.</li>}
      </ol>
      {item.linkTo && (
        <div className="note-details-actions">
          <button onClick={() => onLink(undefined)}>
            <Unlink size={15} />
            Remove link
          </button>
        </div>
      )}
    </aside>
  );
}

// ---- 48 Layers ----------------------------------------------------------------------------------
export function LayersPanel({
  board,
  selected,
  onSelect,
  onReorder,
  onHide,
  onLock,
  onRename,
  onUnlockAll,
  onClose,
}: {
  board: Board;
  selected: string[];
  onSelect: (item: Item) => void;
  onReorder: (id: string, toIndex: number) => void;
  onHide: (id: string, hidden: boolean) => void;
  onLock: (id: string, locked: boolean) => void;
  onRename: (id: string, name: string) => void;
  onUnlockAll: () => void;
  onClose: () => void;
}) {
  const groups = useMemo(() => layerGroups(board), [board]),
    [renaming, setRenaming] = useState<string | null>(null),
    [drag, setDrag] = useState<string | null>(null),
    [limit, setLimit] = useState(300);
  const indexOf = (id: string) => board.items.findIndex(i => i.id === id),
    lockedCount = board.items.filter(i => i.locked).length;
  const row = (i: Item, nested: boolean) => (
    <li
      key={i.id}
      className={`layer-row ${nested ? 'nested' : ''} ${selected.includes(i.id) ? 'selected' : ''} ${i.hidden ? 'is-hidden' : ''}`}
      draggable
      onDragStart={e => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', i.id);
        setTimeout(() => setDrag(i.id));
      }}
      onDragEnd={() => setDrag(null)}
      onDragOver={e => {
        if (drag !== i.id && (drag || e.dataTransfer.types.includes('text/plain'))) e.preventDefault();
      }}
      onDrop={e => {
        e.preventDefault();
        const id = drag ?? e.dataTransfer.getData('text/plain');
        if (id && id !== i.id) onReorder(id, indexOf(i.id));
        setDrag(null);
      }}
    >
      {renaming === i.id ? (
        <input
          className="layer-rename"
          autoFocus
          aria-label="Layer name"
          defaultValue={i.name ?? ''}
          placeholder={layerLabel(i)}
          maxLength={200}
          onBlur={e => {
            onRename(i.id, e.target.value);
            setRenaming(null);
          }}
          onKeyDown={e => {
            e.stopPropagation();
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') setRenaming(null);
          }}
        />
      ) : (
        <button
          className="layer-name"
          title="Click to select · double-click to rename · Alt+↑/↓ to reorder"
          onClick={() => onSelect(i)}
          onDoubleClick={() => setRenaming(i.id)}
          onKeyDown={e => {
            if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
              e.preventDefault();
              onReorder(i.id, indexOf(i.id) + (e.key === 'ArrowUp' ? 1 : -1));
            }
            if (e.key === 'F2') setRenaming(i.id);
          }}
        >
          <span className="object-dot" style={{ background: i.fill }} />
          <span>
            {layerLabel(i)}
            <small>
              {i.type}
              {i.group ? ' · grouped' : ''}
            </small>
          </span>
        </button>
      )}
      <button
        className="icon-button"
        aria-label={`${i.hidden ? 'Show' : 'Hide'} ${layerLabel(i)}`}
        onClick={() => onHide(i.id, !i.hidden)}
      >
        {i.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
      <button
        className={`icon-button ${i.locked ? 'active' : ''}`}
        aria-label={`${i.locked ? 'Unlock' : 'Lock'} ${layerLabel(i)}`}
        onClick={() => onLock(i.id, !i.locked)}
      >
        {i.locked ? <Lock size={14} /> : <LockOpen size={14} />}
      </button>
      <span className="layer-order">
        <button
          className="icon-button"
          aria-label={`Bring ${layerLabel(i)} forward`}
          onClick={() => onReorder(i.id, indexOf(i.id) + 1)}
        >
          <ArrowUp size={13} />
        </button>
        <button
          className="icon-button"
          aria-label={`Send ${layerLabel(i)} backward`}
          onClick={() => onReorder(i.id, indexOf(i.id) - 1)}
        >
          <ArrowDown size={13} />
        </button>
      </span>
    </li>
  );
  let shown = 0;
  return (
    <aside
      className="outline layers-panel floating"
      aria-label="Layers"
      onKeyDown={e => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <Heading title="Layers" count={board.items.length} onClose={onClose} />
      <p>
        Front-most first. Drag rows or use Alt+↑/↓ to reorder; double-click to rename. Hidden objects are skipped on the
        canvas and in exports.
      </p>
      {lockedCount > 0 && (
        <button className="unlock-all" onClick={onUnlockAll}>
          <LockOpen size={15} />
          Unlock all ({lockedCount})
        </button>
      )}
      <div className="object-list">
        <ol className="layer-list">
          {groups.map(g => {
            if (shown >= limit) return null;
            const items = g.items.slice(0, Math.max(0, limit - shown));
            shown += items.length + (g.frame ? 1 : 0);
            return (
              <React.Fragment key={g.frame?.id ?? 'loose'}>
                {g.frame
                  ? row(g.frame, false)
                  : g.items.length > 0 && <li className="layer-heading">Not in a frame</li>}
                {items.map(i => row(i, !!g.frame))}
              </React.Fragment>
            );
          })}
        </ol>
        {board.items.length > limit && (
          <button className="unlock-all" onClick={() => setLimit(l => l + 500)}>
            Show more ({board.items.length - limit} remaining)
          </button>
        )}
        {!board.items.length && <div className="list-empty">Your objects will appear here.</div>}
      </div>
    </aside>
  );
}

// ---- 50 Accessibility and templates ----------------------------------------------------------------
export function A11yPanel({
  issues,
  onSelect,
  onClose,
}: {
  issues: A11yIssue[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <aside className="facilitate-panel floating" aria-label="Accessibility check" onKeyDown={stopKeys(onClose)}>
      <Heading title="Accessibility check" count={issues.length} onClose={onClose} />
      {issues.length ? (
        <ol className="thread-list">
          {issues.map((i, k) => (
            <li key={`${i.id}${k}`}>
              <button onClick={() => onSelect(i.id)}>
                <span>{i.message}</span>
                <small>
                  {i.kind === 'alt' ? 'Missing description' : i.kind === 'contrast' ? 'Contrast' : 'Small text'}
                </small>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p>No issues found. The check covers text contrast, media descriptions and small text.</p>
      )}
    </aside>
  );
}
export function TemplatesPanel({ onChoose, onClose }: { onChoose: (name: TemplateName) => void; onClose: () => void }) {
  const about: Record<TemplateName, string> = {
    Retrospective: 'Three frames: went well, to improve, actions',
    SWOT: 'Strengths, weaknesses, opportunities, threats',
    'Weekly plan': 'One column per weekday',
    Flowchart: 'Start, process, decision and end',
  };
  return (
    <aside className="facilitate-panel floating" aria-label="Templates" onKeyDown={stopKeys(onClose)}>
      <Heading title="Templates" onClose={onClose} />
      <ol className="thread-list">
        {templateNames.map(n => (
          <li key={n}>
            <button onClick={() => onChoose(n)}>
              <span>{n}</span>
              <small>{about[n]}</small>
            </button>
          </li>
        ))}
      </ol>
      <p>Templates are inserted at the centre of the view as one undoable change.</p>
    </aside>
  );
}
