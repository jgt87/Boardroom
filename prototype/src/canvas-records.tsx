import type { Item, RecordRow } from './model';
import type { WidgetCtx } from './widget-types';
import { KanbanView, TimelineView } from './record-views';
import { CanvasField, canvasControl } from './canvas-fields';
import { deleteRecord, recordsError } from './records';
import { schemaOf, validateRecordValues } from './record-schema';
import { RecordFields, RecordFieldInput } from './record-fields';
import { createItem } from './model';
import { syncedCard } from './record-canvas';
import { RecordCardHandle, RECORD_CARD_MIME } from './record-card-handle';
import { RecordLayoutMenu } from './record-layout-menu';
import { useState } from 'react';
import { RecordControls } from './record-controls';
import {
  queryRecords,
  groupedRecords,
  deleteRecords,
  duplicateRecords,
  mergeRecordSubset,
  recordValue,
  withRecordValue,
} from './record-query';

export function CanvasRecords({ item, ctx }: { item: Item; ctx: WidgetCtx }) {
  const rows = ctx.board.datasets?.[item.datasetId!] ?? [];
  const view = item.type;
  const schema = schemaOf(ctx.board, item.datasetId!);
  const statuses = schema.statuses;
  const fields = schema.fields.filter(f => !f.hidden);
  const relations = rows.some(r => r.dependsOn?.length);
  const group = schema.fields.find(f => f.id === item.recordGroup && f.type === 'select');
  const config = item.recordView ?? {},
    [search, setSearch] = useState(''),
    [selection, setSelection] = useState<string[]>([]);
  const visible = queryRecords(rows, config, search),
    selectable = visible.filter(
      r => view !== 'table' || !config.group || !config.hiddenGroups?.includes(String(recordValue(r, config.group))),
    ),
    visibleIds = new Set(selectable.map(r => r.id));
  const selected = selection.filter(id => visibleIds.has(id));
  const onView = (next: typeof config) => {
    setSelection([]);
    ctx.update(b => ({
      ...b,
      items: b.items.map(i => (i.id === item.id && !i.locked ? { ...i, recordView: next } : i)),
    }));
  };
  const entries = groupedRecords(visible, config.group).flatMap(g => [
    ...(config.group ? [{ kind: 'group' as const, value: g.value, count: g.rows.length }] : []),
    ...(!(config.group && config.hiddenGroups?.includes(g.value))
      ? g.rows.map(record => ({ kind: 'record' as const, record }))
      : []),
  ]);
  const createCard = (id: string) =>
    ctx.update(b => {
      const source = b.items.find(i => i.id === item.id);
      if (!source || source.locked || b.items.length >= 2000) return b;
      const card = syncedCard(b, source.datasetId!, id, createItem('card', source.x + source.w + 32, source.y));
      return card ? { ...b, items: [...b.items, card] } : b;
    });
  const recordAction = item.locked
    ? undefined
    : (row: RecordRow) => (
        <>
          <input
            {...canvasControl}
            type="checkbox"
            className="record-select"
            aria-label={`Select record: ${row.title || 'Untitled record'}`}
            checked={selected.includes(row.id)}
            onChange={e =>
              setSelection(ids => (e.target.checked ? [...new Set([...ids, row.id])] : ids.filter(id => id !== row.id)))
            }
          />
          <RecordCardHandle row={row} sourceId={item.id} onCreate={createCard} />
        </>
      );
  const change = (next: RecordRow[]) => {
    if (item.locked) return;
    const error = recordsError(next);
    if (error) {
      ctx.display(error);
      return;
    }
    ctx.update(b => {
      validateRecordValues(next, schemaOf(b, item.datasetId!));
      return { ...b, datasets: { ...b.datasets, [item.datasetId!]: next } };
    });
  };
  const patch = (id: string, value: Partial<RecordRow>) =>
    change(rows.map(r => (r.id === id ? { ...r, ...value } : r)));
  const add = () =>
    change([
      ...rows,
      { id: crypto.randomUUID(), title: 'New task', status: statuses[0], assignee: '', start: '', end: '' },
    ]);
  const dragOver = (event: React.DragEvent) => {
    if (!item.locked && [...event.dataTransfer.types].includes(RECORD_CARD_MIME)) event.preventDefault();
  };
  const dropRecord = (event: React.DragEvent, before?: string, groupValue?: string) => {
    if (item.locked) return;
    try {
      const text = event.dataTransfer.getData(RECORD_CARD_MIME);
      if (!text || text.length > 1000) return;
      const payload = JSON.parse(text),
        source = ctx.board.items.find(i => i.id === payload.sourceId);
      const row = rows.find(r => r.id === payload.recordId);
      if (!source || source.locked || source.datasetId !== item.datasetId || !row) return;
      event.preventDefault();
      event.stopPropagation();
      const moved =
        config.group && groupValue !== undefined ? withRecordValue(row, config.group, groupValue, schema) : row;
      if (before === row.id) {
        if (moved !== row) change(rows.map(r => (r.id === row.id ? moved : r)));
        return;
      }
      const rest = rows.filter(r => r.id !== row.id),
        index = before ? rest.findIndex(r => r.id === before) : -1;
      const at = index < 0 ? rest.length : index;
      change([...rest.slice(0, at), moved, ...rest.slice(at)]);
    } catch (error) {
      ctx.display((error as Error).message);
    }
  };
  const table = (
    <table className="records-preview canvas-record-table" onDragOver={dragOver} onDrop={event => dropRecord(event)}>
      <thead>
        <tr>
          {[
            'Title',
            'Status',
            'Assignee',
            'Start',
            'End',
            ...fields.map(f => f.name),
            ...(relations ? ['Blocked by', 'Blocking'] : []),
            '',
          ].map((t, k) => (
            <th key={k} scope="col">
              {k === 0 && !item.locked && (
                <input
                  {...canvasControl}
                  type="checkbox"
                  aria-label="Select all visible records"
                  className="record-select"
                  checked={!!selectable.length && selected.length === selectable.length}
                  onChange={e => setSelection(e.target.checked ? selectable.map(r => r.id) : [])}
                />
              )}
              {t || <span className="sr-only">Actions</span>}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {entries.map(entry => {
          if (entry.kind === 'group')
            return (
              <tr
                key={`group:${entry.value}`}
                className="record-group-heading"
                onDragOver={dragOver}
                onDrop={event => dropRecord(event, undefined, entry.value)}
              >
                <th colSpan={6 + fields.length + (relations ? 2 : 0)} scope="rowgroup">
                  <button
                    disabled={!!item.locked}
                    aria-expanded={!config.hiddenGroups?.includes(entry.value)}
                    onClick={() =>
                      onView({
                        ...config,
                        hiddenGroups: config.hiddenGroups?.includes(entry.value)
                          ? config.hiddenGroups.filter(v => v !== entry.value)
                          : [...(config.hiddenGroups ?? []), entry.value],
                      })
                    }
                  >
                    {entry.value || 'Unassigned'} ({entry.count})
                  </button>
                </th>
              </tr>
            );
          const r = entry.record;
          return (
            <tr
              key={r.id}
              data-record={r.id}
              onDragOver={dragOver}
              onDrop={event => dropRecord(event, r.id, config.group ? String(recordValue(r, config.group)) : undefined)}
            >
              <td>
                {recordAction?.(r)}
                <CanvasField
                  value={r.title}
                  label={`Record title: ${r.title}`}
                  onCommit={title => patch(r.id, { title })}
                />
              </td>
              <td>
                <select
                  {...canvasControl}
                  aria-label={`Status: ${r.title}`}
                  value={r.status}
                  onChange={e => patch(r.id, { status: e.target.value as RecordRow['status'] })}
                >
                  {statuses.map(s => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </td>
              <td>
                <CanvasField
                  value={r.assignee}
                  label={`Assignee: ${r.title}`}
                  onCommit={assignee => patch(r.id, { assignee })}
                />
              </td>
              <td>
                <input
                  {...canvasControl}
                  aria-label={`Start date: ${r.title}`}
                  type="date"
                  value={r.start}
                  onChange={e => patch(r.id, { start: e.target.value })}
                />
              </td>
              <td>
                <input
                  {...canvasControl}
                  aria-label={`End date: ${r.title}`}
                  type="date"
                  value={r.end}
                  onChange={e => patch(r.id, { end: e.target.value })}
                />
              </td>
              {fields.map(f => (
                <td key={f.id}>
                  <RecordFieldInput
                    field={f}
                    value={r.values?.[f.id]}
                    title={r.title}
                    onChange={value => patch(r.id, { values: { ...r.values, [f.id]: value } })}
                  />
                </td>
              ))}
              {relations && (
                <>
                  <td>
                    {(r.dependsOn ?? [])
                      .map(id => rows.find(row => row.id === id)?.title)
                      .filter(Boolean)
                      .join(', ')}
                  </td>
                  <td>
                    {rows
                      .filter(row => row.dependsOn?.includes(r.id))
                      .map(row => row.title)
                      .join(', ')}
                  </td>
                </>
              )}
              <td>
                <button
                  {...canvasControl}
                  aria-label={`Delete record: ${r.title}`}
                  onClick={() => change(deleteRecord(rows, r.id))}
                >
                  Delete
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
  return (
    <div className="rich-object canvas-interactive canvas-records" onDoubleClick={e => e.stopPropagation()}>
      <div className="rich-title canvas-widget-header">
        <span>{item.text || 'Records'}</span>
        <div {...canvasControl} className="canvas-view-switch" role="group" aria-label="Record layout">
          <RecordFields item={item} ctx={ctx} />
          <RecordLayoutMenu item={item} ctx={ctx} />
        </div>
      </div>
      <RecordControls
        schema={schema}
        view={config}
        onView={onView}
        search={search}
        onSearch={value => {
          setSearch(value);
          setSelection([]);
        }}
        count={visible.length}
        total={rows.length}
        table={view === 'table'}
        locked={!!item.locked}
        selected={selected.length}
        onClear={() => setSelection([])}
        onBulk={patch => change(rows.map(r => (selected.includes(r.id) ? { ...r, ...patch } : r)))}
        onDuplicate={() => {
          try {
            change(duplicateRecords(rows, selected));
          } catch (error) {
            ctx.display((error as Error).message);
          }
        }}
        onDelete={() => {
          change(deleteRecords(rows, selected));
          setSelection([]);
        }}
        onCards={() =>
          ctx.update(b => {
            if (item.locked || b.items.length + selected.length > 2000) {
              ctx.display('This prototype supports up to 2,000 objects per board.');
              return b;
            }
            const cards = selected
              .map((id, index) =>
                syncedCard(
                  b,
                  item.datasetId!,
                  id,
                  createItem('card', item.x + item.w + 32 + Math.floor(index / 10) * 310, item.y + (index % 10) * 190),
                ),
              )
              .filter((card): card is Item => !!card);
            return { ...b, items: [...b.items, ...cards] };
          })
        }
      />
      <div
        className="canvas-record-body"
        data-record-format={item.id}
        {...canvasControl}
        onKeyDown={e => e.stopPropagation()}
      >
        <fieldset disabled={!!item.locked}>
          {view === 'kanban' && (
            <label className="record-group">
              Columns
              <select
                aria-label="Kanban column field"
                value={group?.id ?? ''}
                onChange={e =>
                  ctx.update(b => ({
                    ...b,
                    items: b.items.map(i =>
                      i.id === item.id ? { ...i, recordGroup: e.target.value || undefined } : i,
                    ),
                  }))
                }
              >
                <option value="">Status</option>
                {schema.fields
                  .filter(f => f.type === 'select')
                  .map(f => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {view === 'kanban' ? (
            <KanbanView
              rows={group ? visible.map(r => ({ ...r, status: String(r.values?.[group.id] ?? '') })) : visible}
              allRows={group ? rows.map(r => ({ ...r, status: String(r.values?.[group.id] ?? '') })) : rows}
              columns={group ? ['', ...group.options!] : statuses}
              onRows={
                item.locked
                  ? undefined
                  : next =>
                      change(
                        group
                          ? next.map(r => ({
                              ...r,
                              status: rows.find(old => old.id === r.id)?.status ?? statuses[0],
                              values: { ...r.values, [group.id]: r.status },
                            }))
                          : next,
                      )
              }
              recordAction={recordAction}
              cardFields={r =>
                fields.map(f => (
                  <label className="record-custom-field" key={f.id}>
                    {f.name}
                    <RecordFieldInput
                      field={f}
                      value={r.values?.[f.id]}
                      title={r.title}
                      onChange={value => patch(r.id, { values: { ...r.values, [f.id]: value } })}
                    />
                  </label>
                ))
              }
            />
          ) : view === 'timeline' ? (
            <TimelineView
              rows={visible}
              allRows={rows}
              onAllRows={item.locked ? undefined : change}
              settings={config.timeline}
              onSettings={timeline => onView({ ...config, timeline })}
              onError={ctx.display}
              onRows={item.locked ? undefined : next => change(mergeRecordSubset(rows, visible, next))}
              recordAction={recordAction}
            />
          ) : (
            table
          )}
          <button onClick={add}>+ Add record</button>
        </fieldset>
      </div>
    </div>
  );
}
