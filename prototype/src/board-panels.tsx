import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MentionSuggestions, MentionText } from './mention-field';
import { issueLabels, type DiagramIssue } from './diagram-validation';
import { TEMPLATE_DESCRIPTION_MAX, templatePreview, type UserTemplate } from './user-templates';
import { PreviewThumb, StarterThumb } from './board-thumb';
import { doNotDisturb } from './view-prefs';
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
  Pencil,
  Pin,
  PinOff,
  SmilePlus,
  Download,
  ClipboardList,
  Palette,
} from 'lucide-react';
import type { Board, Item, CommentThread } from './model';
import { layerGroups, layerLabel, formatClock, timerRemaining, votesUsed } from './board-tools';
import { filterTemplates, templateCategories } from './starter-templates';
import { a11yKindLabels, groupA11yIssues } from './access-tools';
import type { TemplateCategory } from './starter-templates';
import type { TimerState, A11yIssue, TemplateName, PenStyle, VotingOptions } from './board-tools';
import {
  addTime,
  parseClock,
  votingTimeLeft,
  commentReactions,
  orderThreads,
  commentColors,
  DEFAULT_COMMENT_COLOR,
  COMMENT_DRAFT_KEY,
  COMMENT_SEEN_KEY,
  isUnread,
  readStoredMap,
  threadUpdatedAt,
  withDraft,
} from './facilitation-rules';

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
  mode = 'draw',
  onMode,
  presets = [],
  activePreset = null,
  onPreset,
}: {
  mode?: 'draw' | 'smart' | 'lasso';
  onMode?: (m: 'draw' | 'smart' | 'lasso') => void;
  presets?: { color: string; width: number }[];
  activePreset?: number | null;
  onPreset?: (index: number) => void;
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
      {!eraser && onMode && (
        <div className="segmented" role="group" aria-label="Pen mode">
          {(
            [
              ['draw', 'Draw'],
              ['smart', 'Smart pen'],
              ['lasso', 'Lasso'],
            ] as const
          ).map(([m, label]) => (
            <button key={m} aria-pressed={mode === m} className={mode === m ? 'active' : ''} onClick={() => onMode(m)}>
              {label}
            </button>
          ))}
        </div>
      )}
      {!eraser && mode === 'smart' && (
        <p className="pen-smart-hint">
          Recognised: rectangle, ellipse, triangle and line. A line between two objects becomes a connector; scribbling
          over ink erases it.
        </p>
      )}
      {!eraser && onPreset && presets.length > 0 && (
        <div className="pen-presets" role="group" aria-label="Pen presets">
          {presets.map((p, i) => (
            <button
              key={i}
              aria-label={`Preset ${i + 1}`}
              aria-pressed={activePreset === i}
              title={`Preset ${i + 1}: ${p.width} px. Changing colour or width while selected updates it.`}
              onClick={() => onPreset(i)}
            >
              <span
                style={{ background: p.color, width: 6 + Math.min(p.width, 18), height: 6 + Math.min(p.width, 18) }}
              />
            </button>
          ))}
        </div>
      )}
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
  onRenameResult,
  onDeleteResult,
  onPlaceResult,
}: {
  board: Board;
  selectedCount: number;
  onStart: (budget: number, scope: 'selection' | 'board', options: VotingOptions) => void;
  onEnd: () => void;
  onClose: () => void;
  onRenameResult?: (index: number, name: string) => void;
  onDeleteResult?: (index: number) => void;
  /** Put a result on the board as a text object. */
  onPlaceResult?: (index: number) => void;
}) {
  const [budget, setBudget] = useState(3),
    [minutes, setMinutes] = useState(0),
    [onePer, setOnePer] = useState(false),
    [renaming, setRenaming] = useState<number | null>(null),
    [now, setNow] = useState(() => Date.now()),
    v = board.voting,
    results = board.votingResults ?? [],
    left = votingTimeLeft(board, now);
  useEffect(() => {
    if (!v?.endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [v?.endsAt]);
  const options: VotingOptions = { ...(minutes ? { minutes } : {}), ...(onePer ? { onePerObject: true } : {}) };
  return (
    <aside className="facilitate-panel floating" aria-label="Dot voting" onKeyDown={stopKeys(onClose)}>
      <Heading title="Dot voting" onClose={onClose} />
      {v?.active ? (
        <>
          <p>
            {votesUsed(board)} of {v.budget} votes used on {v.targets.length} objects. Use the + and − badges on the
            canvas.
          </p>
          {(left !== null || v.onePerObject) && (
            <p className="vote-rules">
              {left !== null && (
                <span className="vote-clock" role="timer" aria-label="Voting time left">
                  {formatClock(left)} left
                </span>
              )}
              {v.onePerObject && <span>One vote per object</span>}
            </p>
          )}
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
          <label className="field">
            Time limit
            <select aria-label="Voting time limit" value={minutes} onChange={e => setMinutes(Number(e.target.value))}>
              <option value={0}>No limit</option>
              {[1, 2, 3, 5, 10, 15, 30].map(m => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </label>
          <label className="check-line">
            <input type="checkbox" checked={onePer} onChange={e => setOnePer(e.target.checked)} />
            One vote per object
          </label>
          <div className="note-details-actions">
            <button disabled={!selectedCount} onClick={() => onStart(budget, 'selection', options)}>
              Vote on selection ({selectedCount})
            </button>
            <button className="primary" onClick={() => onStart(budget, 'board', options)}>
              Vote on whole board
            </button>
          </div>
        </>
      )}
      {results.length > 0 && (
        <section className="results">
          {results
            .map((r, index) => ({ r, index }))
            .reverse()
            .slice(0, 10)
            .map(({ r, index }, k) => {
              const title = r.name || new Date(r.endedAt).toLocaleString();
              return (
                <div key={`${r.endedAt}-${index}`} className="vote-result">
                  <div className="vote-result-head">
                    {renaming === index ? (
                      <input
                        autoFocus
                        className="result-rename"
                        aria-label="Result name"
                        maxLength={80}
                        defaultValue={r.name ?? ''}
                        placeholder={new Date(r.endedAt).toLocaleString()}
                        onKeyDown={e => {
                          e.stopPropagation();
                          if (e.key === 'Enter') e.currentTarget.blur();
                          if (e.key === 'Escape') setRenaming(null);
                        }}
                        onBlur={e => {
                          onRenameResult?.(index, e.target.value);
                          setRenaming(null);
                        }}
                      />
                    ) : (
                      <h3>
                        {k === 0 ? 'Last results' : 'Results'} · {title}
                      </h3>
                    )}
                    {onRenameResult && renaming !== index && (
                      <button
                        className="icon-button"
                        aria-label={`Rename result ${title}`}
                        title="Rename"
                        onClick={() => setRenaming(index)}
                      >
                        <Pencil size={13} />
                      </button>
                    )}
                    {onPlaceResult && (
                      <button
                        className="icon-button"
                        aria-label={`Place result ${title} on the board`}
                        title="Place on the board"
                        onClick={() => onPlaceResult(index)}
                      >
                        <ClipboardList size={13} />
                      </button>
                    )}
                    {onDeleteResult && (
                      <button
                        className="icon-button"
                        aria-label={`Delete result ${title}`}
                        title="Delete"
                        onClick={() => onDeleteResult(index)}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                  <ol>
                    {r.totals.slice(0, k === 0 ? 10 : 3).map(t => (
                      <li key={t.id}>
                        <span>{t.label}</span>
                        <b style={{ width: `${Math.max(4, (t.votes / Math.max(1, r.totals[0].votes)) * 100)}%` }}>
                          {t.votes}
                        </b>
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })}
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
    [exact, setExact] = useState<string | null>(null),
    [bad, setBad] = useState(false),
    cancelled = useRef(false),
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
      if (sound && !doNotDisturb()) beep();
    }
    if (!done) rang.current = false;
  }, [done, sound]);
  const set = (ms: number) => setT({ duration: ms, endsAt: null, remaining: ms });
  const presets = [1, 2, 3, 5, 10, 15, 20, 30].map(m => m * 60000);
  const commitExact = () => {
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    if (exact === null) return;
    const ms = parseClock(exact);
    setExact(null);
    if (ms === null) setBad(true);
    else {
      setBad(false);
      set(ms);
    }
  };
  return (
    <div
      className={`board-timer floating ${done ? 'done' : ''}`}
      role="timer"
      aria-label="Board timer"
      onKeyDown={stopKeys(onClose)}
    >
      {!running && !done && exact !== null ? (
        <input
          autoFocus
          className="clock-input"
          aria-label="Exact time (mm:ss)"
          title="Type a time such as 7:30 or 12, then press Enter"
          inputMode="numeric"
          maxLength={5}
          value={exact}
          onFocus={e => e.currentTarget.select()}
          onChange={e => setExact(e.target.value)}
          onBlur={commitExact}
          onKeyDown={e => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              e.stopPropagation();
              cancelled.current = true;
              setExact(null);
            }
          }}
        />
      ) : !running && !done ? (
        <button
          className={`clock clock-edit ${bad ? 'invalid' : ''}`}
          aria-label={`Set exact time, now ${formatClock(left)}`}
          title={bad ? 'Use mm:ss up to 99:59, for example 7:30' : 'Click to type an exact time'}
          onClick={() => {
            cancelled.current = false;
            setExact(formatClock(left));
          }}
        >
          {formatClock(left)}
        </button>
      ) : (
        <span className="clock" aria-live={done ? 'assertive' : 'off'}>
          {done ? "Time's up" : formatClock(left)}
        </span>
      )}
      {!running && !done && (
        <select
          aria-label="Timer duration"
          value={presets.includes(t.duration) ? t.duration : ''}
          onChange={e => set(Number(e.target.value))}
        >
          {!presets.includes(t.duration) && <option value="">Custom</option>}
          {presets.map(ms => (
            <option key={ms} value={ms}>
              {ms / 60000} min
            </option>
          ))}
        </select>
      )}
      {running && (
        <>
          <button className="timer-add" aria-label="Add 1 minute" onClick={() => setT(addTime(t, 60000, Date.now()))}>
            +1m
          </button>
          <button className="timer-add" aria-label="Add 5 minutes" onClick={() => setT(addTime(t, 300000, Date.now()))}>
            +5m
          </button>
        </>
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
// ---- Comment unread state and drafts (kept on this device, never in the board) ---------------------------
const SEEN_EVENT = 'boardroom:comments-seen';
function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeLocal(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage is full or blocked: unread state and drafts are conveniences */
  }
}
/** Mark a thread as read now. */
function markSeen(id: string) {
  const seen = readStoredMap<number>(readLocal(COMMENT_SEEN_KEY), 'number');
  seen[id] = Date.now();
  const keys = Object.keys(seen);
  writeLocal(COMMENT_SEEN_KEY, JSON.stringify(Object.fromEntries(keys.slice(-500).map(k => [k, seen[k]]))));
  window.dispatchEvent(new Event(SEEN_EVENT));
}
/** Threads last opened on this device, kept current across panels. */
function useSeen(): Record<string, number> {
  const [seen, setSeen] = useState(() => readStoredMap<number>(readLocal(COMMENT_SEEN_KEY), 'number'));
  useEffect(() => {
    const refresh = () => setSeen(readStoredMap<number>(readLocal(COMMENT_SEEN_KEY), 'number'));
    addEventListener(SEEN_EVENT, refresh);
    addEventListener('storage', refresh);
    return () => {
      removeEventListener(SEEN_EVENT, refresh);
      removeEventListener('storage', refresh);
    };
  }, []);
  return seen;
}
const NEW_DRAFT = 'new';
const readDraft = (key: string) => readStoredMap<string>(readLocal(COMMENT_DRAFT_KEY), 'string')[key] ?? '';
const saveDraft = (key: string, text: string) =>
  writeLocal(
    COMMENT_DRAFT_KEY,
    JSON.stringify(withDraft(readStoredMap<string>(readLocal(COMMENT_DRAFT_KEY), 'string'), key, text)),
  );

export function CommentThreadView({
  thread,
  onReply,
  onResolve,
  onDelete,
  onClose,
  onEdit,
  onPin,
  onReact,
  onColor,
  names,
}: {
  thread: CommentThread;
  onReply: (text: string) => void;
  onResolve: (r: boolean) => void;
  onDelete: () => void;
  onClose: () => void;
  onEdit?: (messageId: string, text: string) => void;
  onPin?: (pinned: boolean) => void;
  onReact?: (messageId: string, emoji: string) => void;
  /** Set the pin colour (null restores the default). */
  onColor?: (color: string | null) => void;
  /** Names offered for @mentions (gap G10). */
  names?: string[];
}) {
  const [text, setTextState] = useState(() => readDraft(thread.id)),
    [editing, setEditing] = useState<{ id: string; text: string } | null>(null),
    [picking, setPicking] = useState<string | null>(null),
    [coloring, setColoring] = useState(false),
    field = useRef<HTMLTextAreaElement>(null);
  /** Reply drafts are kept per thread on this device until sent. */
  const setText = (value: string) => {
    setTextState(value);
    saveDraft(thread.id, value);
  };
  useEffect(() => {
    field.current?.focus();
  }, [thread.id]);
  const updated = threadUpdatedAt(thread);
  useEffect(() => {
    markSeen(thread.id);
  }, [thread.id, updated]);
  const saveEdit = () => {
    if (editing && editing.text.trim()) onEdit?.(editing.id, editing.text);
    setEditing(null);
  };
  return (
    <div className="comment-thread" onKeyDown={stopKeys(onClose)}>
      {onPin && (
        <div className="comment-thread-tools">
          <button
            type="button"
            className={`icon-button ${thread.pinned ? 'active' : ''}`}
            aria-label={thread.pinned ? 'Unpin thread' : 'Pin thread'}
            aria-pressed={!!thread.pinned}
            title={thread.pinned ? 'Unpin' : 'Pin to the top of the comments list'}
            onClick={() => onPin(!thread.pinned)}
          >
            {thread.pinned ? <PinOff size={14} /> : <Pin size={14} />}
          </button>
          {onColor && (
            <button
              type="button"
              className={`icon-button ${thread.color ? 'active' : ''}`}
              aria-label="Comment colour"
              aria-expanded={coloring}
              title="Pin colour"
              onClick={() => setColoring(!coloring)}
            >
              <Palette size={14} />
            </button>
          )}
          {onColor && coloring && (
            <span className="comment-colors" role="group" aria-label="Choose a pin colour">
              {[{ name: 'Default', value: DEFAULT_COMMENT_COLOR }, ...commentColors].map(c => (
                <button
                  type="button"
                  key={c.value}
                  aria-label={`${c.name} pin`}
                  aria-pressed={(thread.color ?? DEFAULT_COMMENT_COLOR) === c.value}
                  style={{ background: c.value }}
                  onClick={() => {
                    onColor(c.value === DEFAULT_COMMENT_COLOR ? null : c.value);
                    setColoring(false);
                  }}
                />
              ))}
            </span>
          )}
        </div>
      )}
      <ol>
        {thread.messages.map(m => (
          <li key={m.id}>
            <small>
              {new Date(m.at).toLocaleString()}
              {m.editedAt && <span className="edited"> · edited</span>}
            </small>
            {editing?.id === m.id ? (
              <div
                className="comment-edit"
                onKeyDown={e => {
                  e.stopPropagation();
                  if (e.key === 'Escape') setEditing(null);
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    saveEdit();
                  }
                }}
              >
                <textarea
                  autoFocus
                  aria-label="Edit comment"
                  maxLength={2000}
                  value={editing.text}
                  onChange={e => setEditing({ id: m.id, text: e.target.value })}
                />
                <div className="note-details-actions">
                  <button type="button" onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                  <button type="button" className="primary" disabled={!editing.text.trim()} onClick={saveEdit}>
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <p>
                <MentionText text={m.text} names={names ?? []} />
              </p>
            )}
            {(onReact || onEdit) && editing?.id !== m.id && (
              <div className="comment-reactions">
                {(m.reactions ?? []).map(r => (
                  <button
                    type="button"
                    key={r}
                    className="reaction-chip active"
                    aria-label={`Remove reaction ${r}`}
                    onClick={() => onReact?.(m.id, r)}
                  >
                    {r}
                  </button>
                ))}
                {onReact && (
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Add reaction"
                    aria-expanded={picking === m.id}
                    title="Add reaction"
                    onClick={() => setPicking(picking === m.id ? null : m.id)}
                  >
                    <SmilePlus size={14} />
                  </button>
                )}
                {onEdit && (
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Edit comment"
                    title="Edit"
                    onClick={() => setEditing({ id: m.id, text: m.text })}
                  >
                    <Pencil size={13} />
                  </button>
                )}
                {picking === m.id && onReact && (
                  <span className="reaction-picker" role="group" aria-label="Choose a reaction">
                    {commentReactions.map(r => (
                      <button
                        type="button"
                        key={r}
                        aria-label={`React ${r}`}
                        aria-pressed={!!m.reactions?.includes(r)}
                        onClick={() => {
                          onReact(m.id, r);
                          setPicking(null);
                        }}
                      >
                        {r}
                      </button>
                    ))}
                  </span>
                )}
              </div>
            )}
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
        <MentionSuggestions field={field} text={text} setText={setText} names={names ?? []} />
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
export function NewComment({
  onAdd,
  onClose,
  names = [],
}: {
  onAdd: (text: string) => void;
  onClose: () => void;
  names?: string[];
}) {
  const [text, setTextState] = useState(() => readDraft(NEW_DRAFT)),
    [restored] = useState(() => !!readDraft(NEW_DRAFT)),
    newField = useRef<HTMLTextAreaElement>(null);
  const setText = (value: string) => {
    setTextState(value);
    saveDraft(NEW_DRAFT, value);
  };
  const add = (value: string) => {
    saveDraft(NEW_DRAFT, '');
    onAdd(value);
  };
  return (
    <form
      className="comment-thread"
      onKeyDown={stopKeys(onClose)}
      onSubmit={e => {
        e.preventDefault();
        if (text.trim()) add(text);
      }}
    >
      {restored && <small className="comment-draft-note">Draft restored from last time.</small>}
      <textarea
        ref={newField}
        autoFocus
        aria-label="New comment"
        placeholder="Add a comment"
        maxLength={2000}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            if (text.trim()) add(text);
          }
        }}
      />
      <MentionSuggestions field={newField} text={text} setText={setText} names={names} />
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
  const seen = useSeen(),
    unread = (board.comments ?? []).filter(t => isUnread(t, seen)).length;
  const [show, setShow] = useState<'open' | 'resolved' | 'all'>('open'),
    threads = orderThreads(
      (board.comments ?? []).filter(t => show === 'all' || (show === 'resolved') === !!t.resolved),
    );
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
                <span>
                  {isUnread(t, seen) && (
                    <i className="unread-dot" data-unread="true">
                      <span className="sr-only">Unread: </span>
                    </i>
                  )}
                  {t.pinned && <Pin size={12} aria-label="Pinned" className="pin-mark" />}
                  {t.messages[0].text}
                </span>
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
      {unread > 0 && (
        <p className="unread-summary">
          {unread} unread {unread === 1 ? 'thread' : 'threads'} since you last opened {unread === 1 ? 'it' : 'them'}{' '}
          here.
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
  extra,
}: {
  /** Named layer controls shown above the object list (gap D9). */
  extra?: React.ReactNode;
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
      {extra}
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
        <>
          <p className="a11y-summary">
            {issues.filter(i => i.severity === 'error').length} errors,{' '}
            {issues.filter(i => i.severity === 'warning').length} warnings.
          </p>
          {groupA11yIssues(issues).map(g => (
            <section key={g.section} className="a11y-section" aria-label={g.section}>
              <h3>
                {g.section} <small>{g.issues.length}</small>
              </h3>
              <ol className="thread-list">
                {g.issues.map((i, k) => (
                  <li key={`${i.id}${k}`}>
                    <button onClick={() => onSelect(i.id)}>
                      <span>{i.message}</span>
                      <small>
                        <span className={`a11y-severity ${i.severity}`}>
                          {i.severity === 'error' ? 'Error' : 'Warning'}
                        </span>{' '}
                        · {a11yKindLabels[i.kind]}
                      </small>
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </>
      ) : (
        <p>
          No issues found. The check covers media descriptions, container titles, text and line contrast, and small
          text.
        </p>
      )}
    </aside>
  );
}
export function ValidationPanel({
  issues,
  onSelect,
  onClose,
}: {
  issues: DiagramIssue[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <aside className="facilitate-panel floating" aria-label="Validation report" onKeyDown={stopKeys(onClose)}>
      <Heading title="Validation report" count={issues.length} onClose={onClose} />
      {issues.length ? (
        <ol className="thread-list">
          {issues.map((i, k) => (
            <li key={`${i.id}${i.kind}${k}`}>
              <button onClick={() => onSelect(i.id)}>
                <span>{i.message}</span>
                <small>{issueLabels[i.kind]}</small>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p>No issues found. The report checks loose connectors, unlabelled and unconnected shapes, and overlaps.</p>
      )}
    </aside>
  );
}
export function TemplatesPanel({
  onChoose,
  onClose,
  userTemplates = [],
  onInsertUser,
  onDeleteUser,
  onEditUser,
  onExport,
  onImport,
}: {
  onChoose: (name: TemplateName) => void;
  onClose: () => void;
  userTemplates?: UserTemplate[];
  onInsertUser?: (t: UserTemplate) => void;
  onDeleteUser?: (id: string) => void;
  /** Rename a saved template or change its description (track R3). */
  onEditUser?: (id: string, patch: { name: string; description: string }) => void;
  /** Save templates (one or all) to a file, and add templates from a file (track R3). */
  onExport?: (list: UserTemplate[]) => void;
  onImport?: (file: File) => void;
}) {
  const [query, setQuery] = useState(''),
    [category, setCategory] = useState<TemplateCategory | null>(null),
    [editing, setEditing] = useState<string | null>(null),
    importInput = useRef<HTMLInputElement>(null),
    shown = filterTemplates(query, category),
    q = query.trim().toLowerCase(),
    mine = userTemplates.filter(t => !q || `${t.name} ${t.description ?? ''}`.toLowerCase().includes(q));
  const previews = useMemo(() => new Map(userTemplates.map(t => [t.id, templatePreview(t)])), [userTemplates]);
  return (
    <aside className="facilitate-panel floating" aria-label="Templates" onKeyDown={stopKeys(onClose)}>
      <Heading title="Templates" onClose={onClose} />
      <div className="template-search">
        <input
          type="search"
          aria-label="Search templates"
          placeholder="Search templates"
          value={query}
          maxLength={80}
          onChange={e => setQuery(e.target.value)}
        />
        <div className="template-categories" role="group" aria-label="Template categories">
          {[null, ...templateCategories].map(c => (
            <button key={c ?? 'all'} aria-pressed={category === c} onClick={() => setCategory(c)}>
              {c ?? 'All'}
            </button>
          ))}
        </div>
      </div>
      <div className="template-list-scroll">
        {shown.length ? (
          <ol className="thread-list template-previews" aria-label="Starter templates">
            {shown.map(t => (
              <li key={t.name}>
                <button onClick={() => onChoose(t.name as TemplateName)}>
                  <span className="template-mini-thumb">
                    <StarterThumb name={t.name as TemplateName} />
                  </span>
                  <span className="template-mini-text">
                    <span>{t.name}</span>
                    <small>
                      {t.category} · {t.about}
                    </small>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p>No starter templates match.</p>
        )}
      </div>
      <div className="templates-subhead-row">
        <h3 className="templates-subhead">My templates</h3>
        {onImport && (
          <button className="text-button" onClick={() => importInput.current?.click()}>
            Import
          </button>
        )}
        {onExport && userTemplates.length > 0 && (
          <button className="text-button" onClick={() => onExport(userTemplates)}>
            Export all
          </button>
        )}
        {onImport && (
          <input
            ref={importInput}
            type="file"
            hidden
            aria-label="Choose a templates file"
            accept=".json,application/json"
            onChange={e => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) onImport(f);
            }}
          />
        )}
      </div>
      {mine.length ? (
        <ol className="thread-list user-templates template-previews" aria-label="My templates">
          {mine.map(t =>
            editing === t.id ? (
              <li key={t.id}>
                <form
                  className="template-edit"
                  aria-label={`Edit template ${t.name}`}
                  onSubmit={e => {
                    e.preventDefault();
                    const data = new FormData(e.currentTarget);
                    onEditUser?.(t.id, {
                      name: String(data.get('name') ?? ''),
                      description: String(data.get('description') ?? ''),
                    });
                    setEditing(null);
                  }}
                >
                  <input name="name" aria-label="Template name" defaultValue={t.name} maxLength={80} autoFocus />
                  <textarea
                    name="description"
                    aria-label="Template description"
                    placeholder="What is this template for?"
                    rows={2}
                    defaultValue={t.description ?? ''}
                    maxLength={TEMPLATE_DESCRIPTION_MAX}
                  />
                  <span>
                    <button type="submit" className="primary-button">
                      Save
                    </button>
                    <button type="button" onClick={() => setEditing(null)}>
                      Cancel
                    </button>
                  </span>
                </form>
              </li>
            ) : (
              <li key={t.id}>
                <button onClick={() => onInsertUser?.(t)}>
                  <span className="template-mini-thumb">
                    <PreviewThumb preview={previews.get(t.id) ?? []} empty="" />
                  </span>
                  <span className="template-mini-text">
                    <span>{t.name}</span>
                    <small>
                      {t.description ? `${t.description} · ` : ''}
                      {t.count} object{t.count === 1 ? '' : 's'} · saved {t.created.slice(0, 10)}
                    </small>
                  </span>
                </button>
                {onEditUser && (
                  <button
                    className="icon-button"
                    aria-label={`Edit template ${t.name}`}
                    title="Rename or describe"
                    onClick={() => setEditing(t.id)}
                  >
                    <Pencil size={14} />
                  </button>
                )}
                {onExport && (
                  <button
                    className="icon-button"
                    aria-label={`Export template ${t.name}`}
                    title="Export to a file"
                    onClick={() => onExport([t])}
                  >
                    <Download size={14} />
                  </button>
                )}
                <button
                  className="icon-button"
                  aria-label={`Delete template ${t.name}`}
                  onClick={() => onDeleteUser?.(t.id)}
                >
                  <X size={14} />
                </button>
              </li>
            ),
          )}
        </ol>
      ) : (
        <p>
          {userTemplates.length
            ? 'No saved templates match.'
            : 'Use Export → Save board as template (or select objects and save the selection) to keep a layout here.'}
        </p>
      )}
      <p>Templates are inserted at the centre of the view as one undoable change.</p>
    </aside>
  );
}
