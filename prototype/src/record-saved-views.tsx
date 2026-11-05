import { useId, useLayoutEffect, useRef, useState } from 'react';
import { GripVertical } from 'lucide-react';
import type { Item } from './model';
import type { WidgetCtx } from './widget-types';
import type { RecordViewConfig } from './record-query';
import {
  applySavedView,
  deleteRecordView,
  moveRecordView,
  renameRecordView,
  saveRecordView,
  schemaOf,
  setRecordSchema,
} from './record-schema';
import { CanvasField } from './canvas-fields';
import './library-r2.css';

const VIEW_MIME = 'application/x-boardroom-saved-view';

/** Named views shared by every Table, Kanban and Timeline of a dataset: save, switch, rename and delete. */
export function RecordSavedViews({
  item,
  ctx,
  view,
  onView,
}: {
  item: Item;
  ctx: WidgetCtx;
  view: RecordViewConfig;
  onView: (view: RecordViewConfig) => void;
}) {
  const schema = schemaOf(ctx.board, item.datasetId!),
    views = schema.views ?? [],
    active = views.find(v => v.id === view.activeView),
    [name, setName] = useState('');
  const scope = useId(),
    order = useRef<HTMLOListElement>(null),
    focusAfter = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!focusAfter.current) return;
    order.current?.querySelector<HTMLElement>(`[data-saved-view="${CSS.escape(focusAfter.current)}"]`)?.focus();
    focusAfter.current = null;
  });
  const write = (change: (s: typeof schema) => typeof schema) =>
    ctx.update(b =>
      b.items.find(i => i.id === item.id)?.locked
        ? b
        : setRecordSchema(b, item.datasetId!, change(schemaOf(b, item.datasetId!))),
    );
  const save = (label: string) => {
    if (!label.trim()) return;
    ctx.update(b => {
      const source = b.items.find(i => i.id === item.id);
      if (!source || source.locked) return b;
      const { schema: next, id } = saveRecordView(schemaOf(b, item.datasetId!), label, source.recordView ?? {});
      const saved = setRecordSchema(b, item.datasetId!, next);
      return {
        ...saved,
        items: saved.items.map(i => (i.id === item.id ? { ...i, recordView: { ...i.recordView, activeView: id } } : i)),
      };
    });
    setName('');
  };
  return (
    <div className="record-saved-views" role="group" aria-label="Saved views">
      <select
        aria-label="Saved view"
        value={active?.id ?? ''}
        onChange={e => {
          const saved = views.find(v => v.id === e.target.value);
          if (saved) onView(applySavedView(view, saved));
          else {
            const next = { ...view };
            delete next.activeView;
            onView(next);
          }
        }}
      >
        <option value="">{views.length ? 'Choose a view' : 'No saved views'}</option>
        {views.map(v => (
          <option key={v.id} value={v.id}>
            {v.name}
          </option>
        ))}
      </select>
      {active && (
        <>
          <button onClick={() => save(active.name)}>Update view</button>
          <CanvasField
            label={`Rename view: ${active.name}`}
            value={active.name}
            maxLength={80}
            onCommit={value => write(s => renameRecordView(s, active.id, value))}
          />
          <button
            aria-label={`Delete view: ${active.name}`}
            onClick={() =>
              ctx.update(b => {
                if (b.items.find(i => i.id === item.id)?.locked) return b;
                const next = setRecordSchema(
                  b,
                  item.datasetId!,
                  deleteRecordView(schemaOf(b, item.datasetId!), active.id),
                );
                return {
                  ...next,
                  items: next.items.map(i => {
                    if (i.datasetId !== item.datasetId || i.recordView?.activeView !== active.id) return i;
                    const recordView = { ...i.recordView };
                    delete recordView.activeView;
                    return { ...i, recordView };
                  }),
                };
              })
            }
          >
            Delete view
          </button>
        </>
      )}
      {views.length > 1 && (
        <details className="record-view-order">
          <summary>Order views</summary>
          <ol ref={order} aria-label="Saved view order">
            {views.map((v, k) => (
              <li
                key={v.id}
                onDragOver={e => {
                  if ([...e.dataTransfer.types].includes(VIEW_MIME)) e.preventDefault();
                }}
                onDrop={e => {
                  try {
                    const value = JSON.parse(e.dataTransfer.getData(VIEW_MIME));
                    if (value?.scope !== scope || typeof value.id !== 'string') return;
                    e.preventDefault();
                    e.stopPropagation();
                    focusAfter.current = value.id;
                    write(s => moveRecordView(s, value.id, k));
                  } catch {
                    /* Foreign drag. */
                  }
                }}
              >
                <button
                  type="button"
                  draggable={!item.locked}
                  disabled={!!item.locked}
                  data-saved-view={v.id}
                  aria-label={`Move view: ${v.name} (${k + 1} of ${views.length})`}
                  title="Drag to reorder; Alt + up/down also moves views"
                  onDragStart={e => {
                    e.stopPropagation();
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData(VIEW_MIME, JSON.stringify({ scope, id: v.id }));
                  }}
                  onKeyDown={e => {
                    if (!e.altKey || !['ArrowUp', 'ArrowDown'].includes(e.key)) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const to = k + (e.key === 'ArrowUp' ? -1 : 1);
                    if (to < 0 || to >= views.length) return;
                    focusAfter.current = v.id;
                    write(s => moveRecordView(s, v.id, to));
                  }}
                >
                  <GripVertical size={12} aria-hidden="true" />
                  {v.name}
                </button>
              </li>
            ))}
          </ol>
        </details>
      )}
      <input
        aria-label="New view name"
        placeholder="View name"
        maxLength={80}
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => {
          e.stopPropagation();
          if (e.key === 'Enter') save(name);
        }}
      />
      <button disabled={!name.trim() || views.length >= 20} onClick={() => save(name)}>
        Save view
      </button>
    </div>
  );
}
