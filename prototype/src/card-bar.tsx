// Card quick-edit controls in the selection bar (item 115): status, assignee, dates, tags, panel and CSV
// for one or many selected cards, plus Switch type from sticky notes, text and shapes to cards.
import { useEffect, useRef, useState } from 'react';
import {
  CalendarDays,
  CircleDot,
  Gauge,
  Maximize2,
  Sheet,
  SmilePlus,
  Tag,
  UserRound,
  WalletCards,
  X,
} from 'lucide-react';
import type { Item } from './model';
import type { CardData } from './facilitation-widgets';
import { cardStatuses, tshirtSizes } from './facilitation-widgets';
import { schemaOf } from './record-schema';
import { useApp } from './board-app';
import { spokenColor } from './access-tools';
import { useLatest } from './use-latest';
import { QUICK_REACTIONS, reactToNotes } from './notes';
import { canSwitch, switchLabel, switchType } from './switch-type';
import type { SwitchTarget } from './switch-type';
import { basicKinds } from './shapes';
import { CardTag } from './widgets-cards';
import { CHIP_MIME, encodeChip } from './chip-rules';
import {
  pointChips,
  MAX_TAG_LENGTH,
  boardPeople,
  boardTags,
  canBecomeCard,
  cardsCsv,
  convertToCards,
  patchCards,
  tagPalette,
} from './card-tools';
import type { CardPatch } from './card-tools';

type Pop = 'status' | 'assignee' | 'dates' | 'tags' | 'estimate' | null;

function Popover({ onClose, label, children }: { onClose: () => void; label: string; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null),
    closeRef = useLatest(onClose);
  useEffect(() => {
    box.current?.querySelector<HTMLElement>('input,select,button')?.focus();
    const away = (e: PointerEvent) => {
      if (!box.current?.parentElement?.contains(e.target as Node)) closeRef.current();
    };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [closeRef]);
  return (
    <div
      ref={box}
      className="card-pop"
      role="dialog"
      aria-label={label}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Escape') onClose();
      }}
    >
      {children}
    </div>
  );
}

export function CardBar() {
  const { board, selected, run, openEditor, download, display } = useApp();
  const [pop, setPop] = useState<Pop>(null);
  const [tagDraft, setTagDraft] = useState(''),
    [tagColor, setTagColor] = useState<string>(tagPalette[0]);
  const cards = selected.map(id => board.items.find(i => i.id === id)).filter((i): i is Item => !!i);
  if (!cards.length || cards.some(i => i.type !== 'card' || i.locked)) return null;
  const ids = cards.map(c => c.id),
    first = cards[0].data as CardData,
    same = <K extends keyof CardData>(k: K) =>
      cards.every(c => (c.data as CardData)[k] === first[k]) ? first[k] : undefined;
  const synced = cards.some(c => c.recordRef);
  const statuses = cards[0].recordRef ? schemaOf(board, cards[0].recordRef.datasetId).statuses : cardStatuses;
  const statusesFor = (i: Item) => (i.recordRef ? schemaOf(board, i.recordRef.datasetId).statuses : cardStatuses);
  const apply = (patch: CardPatch, close = true) => {
    run(b => patchCards(b, ids, patch, statusesFor));
    if (close) setPop(null);
  };
  const toggle = (p: Pop) => setPop(v => (v === p ? null : p));
  const close = () => setPop(null);
  const sharedTags = [...new Set(cards.flatMap(c => c.tags ?? []))];
  const addTag = () => {
    const t = tagDraft.trim();
    if (!t) return;
    run(b => {
      const next = patchCards(b, ids, { addTag: t });
      return tagColor !== tagPalette[0] || b.tagColors?.[t]
        ? { ...next, tagColors: { ...b.tagColors, [t]: tagColor } }
        : next;
    });
    setTagDraft('');
  };
  const status = same('status'),
    assignee = same('assignee');
  return (
    <span className="card-bar">
      <span className="card-bar-item">
        <button
          className={`widget-action ${pop === 'status' ? 'active' : ''}`}
          aria-haspopup="dialog"
          aria-expanded={pop === 'status'}
          title="Status"
          onClick={() => toggle('status')}
        >
          <CircleDot size={16} />
          <span>{status === undefined ? 'Status' : status || 'No status'}</span>
        </button>
        {pop === 'status' && (
          <Popover label="Card status" onClose={close}>
            {statuses.map(s => (
              <button key={s} className={status === s ? 'active' : ''} onClick={() => apply({ status: s })}>
                {s}
              </button>
            ))}
            {!synced && (
              <button className="card-pop-quiet" onClick={() => apply({ status: '' })}>
                Remove status
              </button>
            )}
          </Popover>
        )}
      </span>
      <span className="card-bar-item">
        <button
          className={`widget-action ${pop === 'assignee' ? 'active' : ''}`}
          aria-haspopup="dialog"
          aria-expanded={pop === 'assignee'}
          title="Assignee"
          onClick={() => toggle('assignee')}
        >
          <UserRound size={16} />
          <span>{assignee || 'Assign'}</span>
        </button>
        {pop === 'assignee' && (
          <Popover label="Assign card" onClose={close}>
            <form
              onSubmit={e => {
                e.preventDefault();
                apply({ assignee: String(new FormData(e.currentTarget).get('assignee') ?? '') });
              }}
            >
              <input
                name="assignee"
                aria-label="Assignee name"
                list="card-bar-people"
                maxLength={200}
                defaultValue={assignee ?? ''}
                placeholder="Name"
              />
              <datalist id="card-bar-people">
                {boardPeople(board).map(p => (
                  <option key={p} value={p} />
                ))}
              </datalist>
              <button type="submit">Assign</button>
            </form>
            {boardPeople(board)
              .slice(0, 8)
              .map(p => (
                <button key={p} className={assignee === p ? 'active' : ''} onClick={() => apply({ assignee: p })}>
                  {p}
                </button>
              ))}
            {cards.some(c => (c.data as CardData).assignee) && (
              <button className="card-pop-quiet" onClick={() => apply({ assignee: '' })}>
                Unassign
              </button>
            )}
          </Popover>
        )}
      </span>
      <span className="card-bar-item">
        <button
          className={`icon-button ${pop === 'dates' ? 'active' : ''}`}
          aria-label="Dates"
          aria-haspopup="dialog"
          aria-expanded={pop === 'dates'}
          title="Start and due dates"
          onClick={() => toggle('dates')}
        >
          <CalendarDays size={16} />
        </button>
        {pop === 'dates' && (
          <Popover label="Card dates" onClose={close}>
            {(['start', 'due'] as const).map(k => (
              <label key={k} className="card-pop-date">
                {k === 'start' ? 'Start date' : 'Due date'}
                <input
                  type="date"
                  aria-label={k === 'start' ? 'Start date' : 'Due date'}
                  value={same(k) ?? ''}
                  onChange={e => apply({ [k]: e.target.value }, false)}
                />
                <button
                  aria-label={`Clear ${k === 'start' ? 'start' : 'due'} date`}
                  onClick={() => apply({ [k]: '' }, false)}
                >
                  <X size={12} />
                </button>
              </label>
            ))}
          </Popover>
        )}
      </span>
      <span className="card-bar-item">
        <button
          className={`icon-button ${pop === 'tags' ? 'active' : ''}`}
          aria-label="Tags"
          aria-haspopup="dialog"
          aria-expanded={pop === 'tags'}
          title="Tags"
          onClick={() => toggle('tags')}
        >
          <Tag size={16} />
        </button>
        {pop === 'tags' && (
          <Popover label="Card tags" onClose={close}>
            <div className="card-tag-list">
              {sharedTags.map(t => (
                <CardTag key={t} tag={t} ctx={{ board }} onRemove={() => apply({ removeTag: t }, false)} />
              ))}
              {!sharedTags.length && <small>No tags yet</small>}
            </div>
            <form
              onSubmit={e => {
                e.preventDefault();
                addTag();
              }}
            >
              <input
                aria-label="New tag"
                list="card-bar-tags"
                maxLength={MAX_TAG_LENGTH}
                placeholder="Tag name"
                value={tagDraft}
                onChange={e => setTagDraft(e.target.value)}
              />
              <datalist id="card-bar-tags">
                {boardTags(board)
                  .filter(t => !sharedTags.includes(t))
                  .map(t => (
                    <option key={t} value={t} />
                  ))}
              </datalist>
              <button type="submit" disabled={!tagDraft.trim()}>
                Create
              </button>
            </form>
            <span className="tag-swatches" role="radiogroup" aria-label="Tag colour">
              {tagPalette.map(c => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={tagColor === c}
                  aria-label={`Tag colour ${spokenColor(c)}`}
                  title={spokenColor(c)}
                  className={tagColor === c ? 'active' : ''}
                  style={{ background: c }}
                  onClick={() => setTagColor(c)}
                />
              ))}
            </span>
          </Popover>
        )}
      </span>
      <span className="card-bar-item">
        <button
          className={`icon-button ${pop === 'estimate' ? 'active' : ''}`}
          aria-label="Estimate"
          aria-haspopup="dialog"
          aria-expanded={pop === 'estimate'}
          title="Story points and T-shirt size (drag a chip onto any card)"
          onClick={() => toggle('estimate')}
        >
          <Gauge size={16} />
        </button>
        {pop === 'estimate' && (
          <Popover label="Estimate" onClose={close}>
            <span className="estimate-chips" role="group" aria-label="Story points">
              {pointChips.map(n => (
                <button
                  key={n}
                  draggable
                  onDragStart={e =>
                    e.dataTransfer.setData(CHIP_MIME, encodeChip({ kind: 'estimate', value: String(n) }))
                  }
                  className={same('points') === n ? 'active' : ''}
                  onClick={() => apply({ points: n }, false)}
                >
                  {n === 0.5 ? '½' : n}
                </button>
              ))}
            </span>
            <span className="estimate-chips" role="group" aria-label="T-shirt size">
              {tshirtSizes.map(z => (
                <button
                  key={z}
                  draggable
                  onDragStart={e => e.dataTransfer.setData(CHIP_MIME, encodeChip({ kind: 'estimate', value: z }))}
                  className={same('size') === z ? 'active' : ''}
                  onClick={() => apply({ size: z }, false)}
                >
                  {z}
                </button>
              ))}
            </span>
            <button className="card-pop-quiet" onClick={() => apply({ points: null, size: null })}>
              Clear estimate
            </button>
          </Popover>
        )}
      </span>
      {cards.length === 1 && (
        <button
          className="icon-button"
          aria-label="Open card panel"
          title="Open card panel (Ctrl+Shift+Enter)"
          onClick={() => openEditor(cards[0].id)}
        >
          <Maximize2 size={16} />
        </button>
      )}
      <button
        className="icon-button"
        aria-label="Export to spreadsheet (CSV)"
        title="Export to spreadsheet (CSV)"
        onClick={() => {
          download('\uFEFF' + cardsCsv(board.items.filter(i => ids.includes(i.id))), 'boardroom-cards.csv', 'text/csv');
          display(`Exported ${cards.length} card${cards.length === 1 ? '' : 's'}.`);
        }}
      >
        <Sheet size={16} />
      </button>
    </span>
  );
}

/** Switch type: turn the selected sticky notes, text boxes and shapes into cards. */
export function SwitchToCard() {
  const { board, selected, run, display } = useApp();
  const items = selected.map(id => board.items.find(i => i.id === id)).filter((i): i is Item => !!i);
  if (!items.length || !items.every(canBecomeCard) || items.some(i => i.locked)) return null;
  return (
    <button
      className="icon-button"
      aria-label={items.length === 1 ? 'Switch to card' : `Switch ${items.length} objects to cards`}
      title="Switch type: card"
      onClick={() =>
        run(b => {
          const { board: next, converted } = convertToCards(b, selected);
          display(`Converted ${converted} object${converted === 1 ? '' : 's'} to card${converted === 1 ? '' : 's'}.`);
          return next;
        })
      }
    >
      <WalletCards size={16} />
    </button>
  );
}

/** Switch type for sticky notes, text, cards and shapes, one or many at once (gap D3). */
export function SwitchTypeMenu() {
  const { board, selected, run, display } = useApp();
  const items = selected.map(id => board.items.find(i => i.id === id)).filter((i): i is Item => !!i);
  if (!items.length || !items.every(canSwitch) || items.some(i => i.locked || i.recordRef)) return null;
  const current = items.every(i => i.type === items[0].type) ? items[0].type : '';
  const basic: SwitchTarget[] = ['note', 'text', 'card', ...basicKinds],
    targets = current && !basic.includes(current as SwitchTarget) ? [current as SwitchTarget, ...basic] : basic;
  return (
    <select
      className="switch-type"
      aria-label="Switch type"
      title="Switch type"
      value={current}
      onChange={e => {
        const target = e.target.value as SwitchTarget;
        run(b => {
          const r = switchType(b, selected, target);
          if (r.switched > 1) display(`Switched ${r.switched} objects to ${switchLabel(target).toLowerCase()}.`);
          return r.board;
        });
      }}
    >
      {!current && <option value="">Switch type…</option>}
      {targets.map(t => (
        <option key={t} value={t}>
          {switchLabel(t)}
        </option>
      ))}
    </select>
  );
}

/** Emoji reactions on selected sticky notes (gap D13): add one, or take one away. */
export function NoteReactButton() {
  const { board, selected, run } = useApp();
  const [open, setOpen] = useState(false);
  const notes = selected.map(id => board.items.find(i => i.id === id)).filter((i): i is Item => !!i);
  if (!notes.length || notes.some(i => i.type !== 'note' || i.locked)) return null;
  const totals = new Map<string, number>();
  for (const n of notes)
    for (const [e, c] of Object.entries(n.reactions ?? {})) totals.set(e, (totals.get(e) ?? 0) + c);
  return (
    <span className="card-bar-item">
      <button
        className={`icon-button ${open ? 'active' : ''}`}
        aria-label="React"
        title="React"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        <SmilePlus size={16} />
      </button>
      {open && (
        <Popover label="Reactions" onClose={() => setOpen(false)}>
          <div className="reaction-quick">
            {QUICK_REACTIONS.map(e => (
              <button key={e} aria-label={`React ${e}`} onClick={() => run(b => reactToNotes(b, selected, e, 1))}>
                {e}
              </button>
            ))}
          </div>
          {[...totals].map(([e, c]) => (
            <button key={e} className="card-pop-quiet" onClick={() => run(b => reactToNotes(b, selected, e, -1))}>
              Remove one {e} ({c})
            </button>
          ))}
        </Popover>
      )}
    </span>
  );
}
