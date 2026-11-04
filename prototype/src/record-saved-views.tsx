import { useState } from 'react';
import type { Item } from './model';
import type { WidgetCtx } from './widget-types';
import type { RecordViewConfig } from './record-query';
import {
  applySavedView,
  deleteRecordView,
  renameRecordView,
  saveRecordView,
  schemaOf,
  setRecordSchema,
} from './record-schema';
import { CanvasField } from './canvas-fields';

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
