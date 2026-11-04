// Card and flip card views and editors (items 21, 22, 43, 115).
import { useLayoutEffect, useRef, useState } from 'react';
import type { Item } from './model';
import type { WidgetCtx } from './widget-types';
import { cardStatuses, tshirtSizes, isIsoDate } from './facilitation-widgets';
import type { CardData } from './facilitation-widgets';
import { Dialog, data, setData } from './widget-kit';
import { CanvasField, canvasControl } from './canvas-fields';
import { createItem } from './model';
import { spokenColor } from './access-tools';
import { AlignLeft, Database, Maximize2, X } from 'lucide-react';
import { schemaOf, validateRecordValues } from './record-schema';
import { RecordFieldInput } from './record-fields';
import { renderMarkdown } from './markdown';
import { markdownFrom } from './canvas-doc';
import {
  CARD_TEXT_MAX,
  MAX_TAGS,
  MAX_TAG_LENGTH,
  boardPeople,
  boardTags,
  patchCards,
  tagColors,
  tagPalette,
} from './card-tools';

// ---- Card (21) + estimates (43) + card panel (115) ------------------------------------------
const statusColor: Record<string, string> = { 'Not started': '#8a8a94', 'In progress': '#e2a01b', Complete: '#2c9f5b' };
const shortDate = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .map(p => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

export function CardTag({ tag, ctx, onRemove }: { tag: string; ctx: Pick<WidgetCtx, 'board'>; onRemove?: () => void }) {
  const c = tagColors(ctx.board, tag);
  return (
    <span className="w-tag" style={c}>
      {tag}
      {onRemove && (
        <button
          type="button"
          className="w-tag-remove"
          aria-label={`Remove tag ${tag}`}
          title="Remove tag"
          {...canvasControl}
          onClick={e => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <X size={10} />
        </button>
      )}
    </span>
  );
}

export function CardRender({ item, ctx }: { item: Item; ctx: WidgetCtx }) {
  const d = data<CardData>(item),
    orphan =
      !!item.recordRef && !ctx.board.datasets?.[item.recordRef.datasetId]?.some(r => r.id === item.recordRef!.recordId),
    overdue = d.due && d.status !== 'Complete' && d.due < new Date().toISOString().slice(0, 10),
    editable = !item.locked && !orphan;
  return (
    <div className="w-card" style={{ borderLeftColor: item.fill }}>
      <div className="w-card-top">
        {item.recordRef && (
          <span
            title={orphan ? 'Source record deleted' : 'Synced to record'}
            aria-label={orphan ? 'Source record deleted' : 'Synced to record'}
          >
            <Database size={14} />
          </span>
        )}
        {!orphan && d.status && (
          <span className="w-status" style={{ background: statusColor[d.status] ?? '#52525b' }}>
            {d.status}
          </span>
        )}
        {(d.points !== undefined || d.size) && (
          <span className="w-estimate" title="Estimate">
            {[d.points !== undefined ? `${d.points} pt` : '', d.size ?? ''].filter(Boolean).join(' · ')}
          </span>
        )}
        {ctx.openEditor && !orphan && (
          <button
            type="button"
            className="w-card-expand"
            aria-label="Open card panel"
            title="Open card panel (Ctrl+Shift+Enter)"
            {...canvasControl}
            onClick={e => {
              e.stopPropagation();
              ctx.openEditor!();
            }}
          >
            <Maximize2 size={13} />
          </button>
        )}
      </div>
      <strong className="w-card-title">
        {!editable ? (
          item.text
        ) : (
          <CanvasField
            label={`Card title: ${item.text}`}
            value={item.text}
            maxLength={CARD_TEXT_MAX}
            onCommit={text => setData(ctx, item.id, d, { text })}
            onKeyDown={e => {
              if (e.key === 'Tab' && !e.shiftKey) {
                e.preventDefault();
                const next = createItem('card', item.x + item.w + 24, item.y, item.fill);
                next.text = '';
                ctx.update(b => ({ ...b, items: [...b.items, next] }));
                setTimeout(
                  () => document.querySelector<HTMLInputElement>(`[data-item="${next.id}"] input`)?.focus(),
                  0,
                );
              }
            }}
          />
        )}
      </strong>
      {item.recordRef && !orphan && (
        <div className="synced-card-fields">
          {schemaOf(ctx.board, item.recordRef.datasetId)
            .fields.filter(f => !f.hidden)
            .map(f => {
              const ref = item.recordRef!;
              const row = ctx.board.datasets![ref.datasetId].find(r => r.id === ref.recordId)!;
              return (
                <label className="record-custom-field" key={f.id}>
                  {f.name}
                  {item.locked ? (
                    String(row.values?.[f.id] ?? '')
                  ) : (
                    <RecordFieldInput
                      field={f}
                      value={row.values?.[f.id]}
                      title={row.title}
                      row={row}
                      schema={schemaOf(ctx.board, ref.datasetId)}
                      onChange={value =>
                        ctx.update(b => {
                          const rows = b.datasets![ref.datasetId].map(r =>
                            r.id === ref.recordId ? { ...r, values: { ...r.values, [f.id]: value } } : r,
                          );
                          validateRecordValues(rows, schemaOf(b, ref.datasetId));
                          return { ...b, datasets: { ...b.datasets, [ref.datasetId]: rows } };
                        })
                      }
                    />
                  )}
                </label>
              );
            })}
        </div>
      )}
      <div className="w-card-meta">
        {d.assignee && (
          <span className="w-avatar" title={d.assignee}>
            {initials(d.assignee)}
          </span>
        )}
        {(d.start || d.due) && (
          <span className={overdue ? 'overdue' : ''} title={overdue ? 'Overdue' : undefined}>
            {d.start && d.due
              ? `${shortDate(d.start)} – ${shortDate(d.due)}`
              : d.due
                ? `Due ${shortDate(d.due)}`
                : `Starts ${shortDate(d.start!)}`}
          </span>
        )}
        {d.description && (
          <span className="w-card-hasdesc" title="Has a description. Open the card panel to read it.">
            <AlignLeft size={12} aria-label="Has description" />
          </span>
        )}
        {item.tags?.map(t => (
          <CardTag
            key={t}
            tag={t}
            ctx={ctx}
            onRemove={editable ? () => ctx.update(b => patchCards(b, [item.id], { removeTag: t })) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

/** Rich-text description field: Markdown storage, bold/italic/underline, lists and link paste (item 115). */
function DescriptionEditor({
  initial,
  disabled,
  onChange,
}: {
  initial: string;
  disabled?: boolean;
  onChange: (markdown: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  // Filled once on mount: React must not own the children of a contentEditable, or a re-render
  // wipes what the person typed.
  const first = useRef(initial);
  useLayoutEffect(() => {
    if (box.current) box.current.innerHTML = renderMarkdown(first.current) || '<p><br></p>';
  }, []);
  const read = () =>
    onChange(
      box.current
        ? Array.from(box.current.childNodes)
            .map(markdownFrom)
            .join('')
            .replace(/\n{3,}/g, '\n\n')
            .trim()
        : '',
    );
  const command = (name: string, value?: string) => {
    box.current?.focus();
    document.execCommand(name, false, value);
    read();
  };
  return (
    <div className="card-desc-field">
      <div className="card-desc-tools" onMouseDown={e => e.preventDefault()}>
        <button type="button" aria-label="Bold (Ctrl+B)" title="Bold (Ctrl+B)" onClick={() => command('bold')}>
          <b>B</b>
        </button>
        <button type="button" aria-label="Italic (Ctrl+I)" title="Italic (Ctrl+I)" onClick={() => command('italic')}>
          <i>I</i>
        </button>
        <button
          type="button"
          aria-label="Underline (Ctrl+U)"
          title="Underline (Ctrl+U)"
          onClick={() => command('underline')}
        >
          <u>U</u>
        </button>
        <button
          type="button"
          aria-label="Bulleted list"
          title='Bulleted list ("- " + space)'
          onClick={() => command('insertUnorderedList')}
        >
          •
        </button>
        <button
          type="button"
          aria-label="1. Numbered list"
          title='Numbered list ("1." + space)'
          onClick={() => command('insertOrderedList')}
        >
          1.
        </button>
      </div>
      <div
        ref={box}
        className="card-desc doc-content"
        role="textbox"
        aria-label="Card description"
        aria-multiline="true"
        contentEditable={!disabled}
        suppressContentEditableWarning
        data-placeholder="Add a description"
        onFocus={() => document.execCommand('defaultParagraphSeparator', false, 'p')}
        onInput={read}
        onKeyDown={e => {
          const mod = e.ctrlKey || e.metaKey;
          if (mod && !e.shiftKey && !e.altKey && ['b', 'i', 'u'].includes(e.key.toLowerCase())) {
            e.preventDefault();
            command({ b: 'bold', i: 'italic', u: 'underline' }[e.key.toLowerCase() as 'b' | 'i' | 'u']);
            return;
          }
          if (e.key !== ' ') return;
          // "- " or "1." at the start of a line starts a list.
          const sel = window.getSelection();
          const node = sel?.anchorNode;
          if (!sel || !node || node.nodeType !== Node.TEXT_NODE || !sel.isCollapsed) return;
          const before = (node.textContent ?? '').slice(0, sel.anchorOffset);
          const lineStart = !node.previousSibling || node.previousSibling.nodeName === 'BR';
          if (!lineStart || (before !== '-' && before !== '1.')) return;
          e.preventDefault();
          const range = document.createRange();
          range.setStart(node, 0);
          range.setEnd(node, sel.anchorOffset);
          sel.removeAllRanges();
          sel.addRange(range);
          document.execCommand('delete');
          command(before === '-' ? 'insertUnorderedList' : 'insertOrderedList');
        }}
        onPaste={e => {
          e.preventDefault();
          const text = e.clipboardData.getData('text/plain');
          const sel = window.getSelection();
          // Pasting a web address over selected text makes it a link.
          if (sel && !sel.isCollapsed && /^(https?:\/\/|mailto:)\S+$/i.test(text.trim()))
            document.execCommand('createLink', false, text.trim());
          else document.execCommand('insertText', false, text);
          read();
        }}
      />
    </div>
  );
}

export function CardEditor({ item, ctx, onClose }: { item: Item; ctx: WidgetCtx; onClose: () => void }) {
  const [title, setTitle] = useState(item.text),
    [d, setD] = useState<CardData>({ ...data<CardData>(item) }),
    [tags, setTags] = useState<string[]>(item.tags ?? []),
    [tagDraft, setTagDraft] = useState(''),
    [tagColor, setTagColor] = useState<string>(tagPalette[0]),
    [newColors, setNewColors] = useState<Record<string, string>>({}),
    [points, setPoints] = useState(d.points === undefined ? '' : String(d.points));
  const statuses = item.recordRef ? schemaOf(ctx.board, item.recordRef.datasetId).statuses : cardStatuses;
  const people = boardPeople(ctx.board),
    knownTags = boardTags(ctx.board).filter(t => !tags.includes(t));
  const preview = { ...ctx, board: { ...ctx.board, tagColors: { ...ctx.board.tagColors, ...newColors } } };
  const error =
    d.due && !isIsoDate(d.due)
      ? 'Enter a valid due date.'
      : d.start && !isIsoDate(d.start)
        ? 'Enter a valid start date.'
        : d.start && d.due && d.start > d.due
          ? 'The start date must be on or before the due date.'
          : points && !(Number(points) >= 0 && Number(points) <= 1000)
            ? 'Story points must be between 0 and 1,000.'
            : d.description.length > CARD_TEXT_MAX
              ? `Use at most ${CARD_TEXT_MAX.toLocaleString()} characters in the description.`
              : '';
  const addTag = () => {
    const t = tagDraft.trim().slice(0, MAX_TAG_LENGTH);
    if (!t || tags.includes(t) || tags.length >= MAX_TAGS) return;
    setTags([...tags, t]);
    if (!ctx.board.tagColors?.[t] || tagColor !== tagPalette[0]) setNewColors({ ...newColors, [t]: tagColor });
    setTagDraft('');
  };
  const apply = () => {
    if (error) return;
    const next: CardData = { ...d, assignee: d.assignee.trim() };
    if (points === '') delete next.points;
    else next.points = Number(points);
    if (!next.size) delete next.size;
    if (!next.start) delete next.start;
    ctx.update(b => {
      const colors = { ...b.tagColors };
      for (const [t, c] of Object.entries(newColors)) if (tags.includes(t)) colors[t] = c;
      const items = b.items.map(i =>
        i.id === item.id
          ? { ...i, text: title.slice(0, CARD_TEXT_MAX), tags: tags.length ? tags : undefined, data: next }
          : i,
      );
      return { ...b, items, ...(Object.keys(colors).length ? { tagColors: colors } : {}) };
    });
    onClose();
  };
  return (
    <Dialog
      title="Card"
      hint="Ctrl+Enter applies. Status matches Table, Kanban and Timeline records."
      onClose={onClose}
      onApply={apply}
      applyDisabled={!!error}
      error={error}
      wide
    >
      <div className="w-form card-panel">
        <label className="span2">
          Title
          <input
            aria-label="Card title"
            maxLength={CARD_TEXT_MAX}
            value={title}
            onChange={e => setTitle(e.target.value)}
          />
        </label>
        <div className="span2 card-panel-desc">
          <span className="card-panel-label">
            Description
            <small>
              {d.description.length.toLocaleString()} / {CARD_TEXT_MAX.toLocaleString()}
            </small>
          </span>
          <DescriptionEditor
            initial={data<CardData>(item).description}
            onChange={description => setD(v => ({ ...v, description }))}
          />
        </div>
        <label>
          Status
          <select
            aria-label="Card status"
            value={d.status}
            onChange={e => setD({ ...d, status: e.target.value as CardData['status'] })}
          >
            {!item.recordRef && <option value="">No status</option>}
            {statuses.map(s => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Assignee
          <input
            aria-label="Card assignee"
            list={`card-people-${item.id}`}
            maxLength={200}
            placeholder={people.length ? 'Choose or type a name' : 'Name'}
            value={d.assignee}
            onChange={e => setD({ ...d, assignee: e.target.value })}
          />
          <datalist id={`card-people-${item.id}`}>
            {people.map(p => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </label>
        <label>
          Start date
          <span className="card-date">
            <input
              aria-label="Card start date"
              type="date"
              value={d.start ?? ''}
              onChange={e => setD({ ...d, start: e.target.value })}
            />
            {d.start && (
              <button type="button" aria-label="Clear start date" onClick={() => setD({ ...d, start: '' })}>
                <X size={12} />
              </button>
            )}
          </span>
        </label>
        <label>
          Due date
          <span className="card-date">
            <input
              aria-label="Card due date"
              type="date"
              value={d.due}
              onChange={e => setD({ ...d, due: e.target.value })}
            />
            {d.due && (
              <button type="button" aria-label="Clear due date" onClick={() => setD({ ...d, due: '' })}>
                <X size={12} />
              </button>
            )}
          </span>
        </label>
        <div className="span2 card-panel-tags">
          <span className="card-panel-label">Tags</span>
          <div className="card-tag-list">
            {tags.map(t => (
              <CardTag key={t} tag={t} ctx={preview} onRemove={() => setTags(tags.filter(x => x !== t))} />
            ))}
            {!tags.length && <small>No tags</small>}
          </div>
          {tags.length < MAX_TAGS && (
            <div className="card-tag-add">
              <input
                aria-label="New tag"
                list={`card-tags-${item.id}`}
                maxLength={MAX_TAG_LENGTH}
                placeholder="Add a tag"
                value={tagDraft}
                onChange={e => setTagDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    addTag();
                  }
                }}
              />
              <datalist id={`card-tags-${item.id}`}>
                {knownTags.map(t => (
                  <option key={t} value={t} />
                ))}
              </datalist>
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
              <button type="button" onClick={addTag} disabled={!tagDraft.trim()}>
                Create
              </button>
            </div>
          )}
        </div>
        <label>
          Story points
          <input
            aria-label="Story points"
            type="number"
            min={0}
            max={1000}
            step={0.5}
            value={points}
            onChange={e => setPoints(e.target.value)}
          />
        </label>
        <label>
          T-shirt size
          <select
            aria-label="T-shirt size"
            value={d.size ?? ''}
            onChange={e => setD({ ...d, size: (e.target.value || undefined) as CardData['size'] })}
          >
            <option value="">None</option>
            {tshirtSizes.map(s => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
    </Dialog>
  );
}

// ---- Flip card (22) --------------------------------------------------------------------------
export function FlipRender({ item }: { item: Item }) {
  const d = data<{ back: string; flipped: boolean }>(item),
    text = d.flipped ? d.back : item.text;
  return (
    <div
      className={`w-flip ${d.flipped ? 'back' : ''}`}
      style={{ background: d.flipped ? '#ffffff' : item.fill, borderColor: item.fill }}
    >
      <small>{d.flipped ? 'Back' : 'Front'}</small>
      <span>{text || (d.flipped ? 'Add text to the back' : 'Add text to the front')}</span>
    </div>
  );
}
export function FlipEditor({ item, ctx, onClose }: { item: Item; ctx: WidgetCtx; onClose: () => void }) {
  const d = data<{ back: string; flipped: boolean }>(item),
    [front, setFront] = useState(item.text),
    [back, setBack] = useState(d.back);
  return (
    <Dialog
      title="Flip card"
      hint="Each face is edited independently."
      onClose={onClose}
      onApply={() => {
        setData(ctx, item.id, { ...d, back: back.slice(0, 6000) }, { text: front.slice(0, 6000) });
        onClose();
      }}
    >
      <div className="w-form">
        <label className="span2">
          Front
          <textarea aria-label="Front face" maxLength={6000} value={front} onChange={e => setFront(e.target.value)} />
        </label>
        <label className="span2">
          Back
          <textarea aria-label="Back face" maxLength={6000} value={back} onChange={e => setBack(e.target.value)} />
        </label>
      </div>
    </Dialog>
  );
}
