// Card and flip card views and editors (items 21, 22, 43).
import { useState } from 'react';
import type { Item } from './model';
import type { WidgetCtx } from './widget-types';
import { cardStatuses, tshirtSizes, isIsoDate } from './facilitation-widgets';
import type { CardData } from './facilitation-widgets';
import { Dialog, data, setData } from './widget-kit';
import { CanvasField } from './canvas-fields';
import { createItem } from './model';
import { Database } from 'lucide-react';
import { schemaOf, validateRecordValues } from './record-schema';
import { RecordFieldInput } from './record-fields';

// ---- Card (21) + estimates (43) -------------------------------------------------------------
const statusColor: Record<string, string> = { 'Not started': '#8a8a94', 'In progress': '#e2a01b', Complete: '#2c9f5b' };
export function CardRender({ item, ctx }: { item: Item; ctx: WidgetCtx }) {
  const d = data<CardData>(item),
    orphan =
      !!item.recordRef && !ctx.board.datasets?.[item.recordRef.datasetId]?.some(r => r.id === item.recordRef!.recordId),
    overdue = d.due && d.status !== 'Complete' && d.due < new Date().toISOString().slice(0, 10);
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
        {!orphan && (
          <span className="w-status" style={{ background: statusColor[d.status] ?? '#52525b' }}>
            {d.status}
          </span>
        )}
        {(d.points !== undefined || d.size) && (
          <span className="w-estimate" title="Estimate">
            {[d.points !== undefined ? `${d.points} pt` : '', d.size ?? ''].filter(Boolean).join(' · ')}
          </span>
        )}
      </div>
      <strong className="w-card-title">
        {item.locked || orphan ? (
          item.text
        ) : (
          <CanvasField
            label={`Card title: ${item.text}`}
            value={item.text}
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
      {d.description && <p className="w-card-desc">{d.description}</p>}
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
            {d.assignee
              .trim()
              .split(/\s+/)
              .map(p => p[0])
              .join('')
              .slice(0, 2)
              .toUpperCase()}
          </span>
        )}
        {d.due && <span className={overdue ? 'overdue' : ''}>Due {d.due}</span>}
        {item.tags?.map(t => (
          <span key={t} className="w-tag">
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
export function CardEditor({ item, ctx, onClose }: { item: Item; ctx: WidgetCtx; onClose: () => void }) {
  const [title, setTitle] = useState(item.text),
    [d, setD] = useState<CardData>({ ...data<CardData>(item) }),
    [tags, setTags] = useState(item.tags?.join(', ') ?? ''),
    [points, setPoints] = useState(d.points === undefined ? '' : String(d.points));
  const tagList = [
    ...new Set(
      tags
        .split(',')
        .map(t => t.trim())
        .filter(Boolean),
    ),
  ];
  const error =
    d.due && !isIsoDate(d.due)
      ? 'Enter a valid due date.'
      : points && !(Number(points) >= 0 && Number(points) <= 1000)
        ? 'Story points must be between 0 and 1,000.'
        : tagList.length > 10 || tagList.some(t => t.length > 32)
          ? 'Use up to 10 tags of at most 32 characters.'
          : '';
  const apply = () => {
    if (error) return;
    const next: CardData = { ...d };
    if (points === '') delete next.points;
    else next.points = Number(points);
    if (!next.size) delete next.size;
    setData(ctx, item.id, next, { text: title.slice(0, 6000), tags: tagList.length ? tagList : undefined });
    onClose();
  };
  return (
    <Dialog
      title="Card details"
      hint="Status matches Table, Kanban and Timeline records."
      onClose={onClose}
      onApply={apply}
      applyDisabled={!!error}
      error={error}
    >
      <div className="w-form">
        <label className="span2">
          Title
          <input aria-label="Card title" maxLength={6000} value={title} onChange={e => setTitle(e.target.value)} />
        </label>
        <label className="span2">
          Description
          <textarea
            aria-label="Card description"
            maxLength={6000}
            value={d.description}
            onChange={e => setD({ ...d, description: e.target.value })}
          />
        </label>
        <label>
          Assignee
          <input
            aria-label="Card assignee"
            maxLength={200}
            value={d.assignee}
            onChange={e => setD({ ...d, assignee: e.target.value })}
          />
        </label>
        <label>
          Due date
          <input
            aria-label="Card due date"
            type="date"
            value={d.due}
            onChange={e => setD({ ...d, due: e.target.value })}
          />
        </label>
        <label>
          Status
          <select
            aria-label="Card status"
            value={d.status}
            onChange={e => setD({ ...d, status: e.target.value as CardData['status'] })}
          >
            {(item.recordRef ? schemaOf(ctx.board, item.recordRef.datasetId).statuses : cardStatuses).map(s => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Tags
          <input
            aria-label="Card tags"
            placeholder="Design, Urgent"
            value={tags}
            onChange={e => setTags(e.target.value)}
          />
        </label>
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
