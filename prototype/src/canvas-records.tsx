import type { Item, RecordRow } from './model';
import type { WidgetCtx } from './widget-types';
import { KanbanView, TimelineView } from './record-views';
import type { KanbanLane } from './record-views';
import { CanvasField, canvasControl } from './canvas-fields';
import { addChildRecord, deleteRecord, indentRecord, outdentRecord, recordTree, recordsError } from './records';
import { RecordSavedViews } from './record-saved-views';
import { recordColors, schemaOf, validateRecordValues } from './record-schema';
import { RecordFields, RecordFieldInput } from './record-fields';
import { createItem } from './model';
import { syncedCard } from './record-canvas';
import { RecordCardHandle, RECORD_CARD_MIME } from './record-card-handle';
import { RecordLayoutMenu } from './record-layout-menu';
import { useState } from 'react';
import { RecordControls } from './record-controls';
import { RecordImportControls, recordFileDrop } from './record-import-controls';
import {
  queryRecords,
  groupedRecords,
  deleteRecords,
  duplicateRecords,
  mergeRecordSubset,
  recordValue,
  withRecordValue,
  calculateRecords,
  formatCalc,
  numericRecordFields,
  recordCalcs,
  recordCalcNames,
  toggleHiddenColumn,
} from './record-query';
import type { RecordCalc } from './record-query';
import { StatusChip } from './status-chip';

export function CanvasRecords({ item, ctx }: { item: Item; ctx: WidgetCtx }) {
  const rows = ctx.board.datasets?.[item.datasetId!] ?? [];
  const view = item.type;
  const schema = schemaOf(ctx.board, item.datasetId!);
  const statuses = schema.statuses;
  const fields = schema.fields.filter(f => !f.hidden);
  const relations = rows.some(r => r.dependsOn?.length);
  const group = schema.fields.find(f => f.id === item.recordGroup && f.type === 'select');
  const kanbanColumns = group ? ['', ...group.options!] : statuses;
  const config = item.recordView ?? {},
    [search, setSearch] = useState(''),
    [selection, setSelection] = useState<string[]>([]);
  const visible = queryRecords(rows, config, search, schema);
  // Grouping: row groups in Table and Timeline, swimlanes in Kanban (never the Kanban column field).
  const groupExclude =
    view === 'kanban'
      ? [
          'status',
          ...(group ? [`field:${group.id}`] : []),
          ...schema.fields.filter(f => f.type === 'formula').map(f => `field:${f.id}`),
        ]
      : [];
  const groupField = config.group && !groupExclude.includes(config.group) ? config.group : undefined;
  const groupOf = (r: RecordRow) => String(recordValue(r, groupField!, schema));
  const groups = groupedRecords(visible, groupField, schema);
  const hiddenGroup = (value: string) => !!groupField && !!config.hiddenGroups?.includes(value);
  const toggleGroup = (value: string) =>
    onView({
      ...config,
      hiddenGroups: config.hiddenGroups?.includes(value)
        ? config.hiddenGroups.filter(v => v !== value)
        : [...(config.hiddenGroups ?? []), value],
    });
  const groupLabel = (value: string) => {
    const f = groupField?.startsWith('field:') ? schema.fields.find(f => `field:${f.id}` === groupField) : undefined;
    return value === ''
      ? 'Unassigned'
      : f?.type === 'checkbox'
        ? `${f.name}: ${value === 'true' ? 'Yes' : 'No'}`
        : value;
  };
  const entries = groups.flatMap(g => [
    ...(groupField ? [{ kind: 'group' as const, value: g.value, count: g.rows.length }] : []),
    ...(!hiddenGroup(g.value)
      ? (view === 'table'
          ? recordTree(g.rows, config.collapsed)
          : g.rows.map(row => ({ row, depth: 0, children: 0, collapsed: false }))
        ).map((entry, _k, tree) => ({ kind: 'record' as const, record: entry.row, entry, tree }))
      : []),
  ]);
  const selectable = entries.flatMap(e => (e.kind === 'record' ? [e.record] : [])),
    visibleIds = new Set(selectable.map(r => r.id));
  const selected = selection.filter(id => visibleIds.has(id));
  const onView = (next: typeof config) => {
    setSelection([]);
    ctx.update(b => ({
      ...b,
      items: b.items.map(i => (i.id === item.id && !i.locked ? { ...i, recordView: next } : i)),
    }));
  };
  /** Swimlanes: every option of a select field (or every status) plus any other value in use. */
  const kanbanLanes = (): KanbanLane[] => {
    const f = schema.fields.find(f => `field:${f.id}` === groupField),
      base = groupField === 'status' ? statuses : f?.type === 'select' ? ['', ...f.options!] : [];
    const values = [...new Set([...base, ...groups.map(g => g.value)])];
    return values.map(value => ({ value, label: groupLabel(value), hidden: hiddenGroup(value) }));
  };
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
          <select
            {...canvasControl}
            className="record-color"
            aria-label={`Record colour: ${row.title || 'Untitled record'}`}
            title="Record colour"
            value={rows.find(r => r.id === row.id)?.color ?? ''}
            style={{ background: rows.find(r => r.id === row.id)?.color ?? '#ffffff' }}
            onChange={e => {
              const color = e.target.value;
              change(
                rows.map(r => {
                  if (r.id !== row.id) return r;
                  const next: RecordRow = { ...r, color };
                  if (!color) delete next.color;
                  return next;
                }),
              );
            }}
          >
            <option value="">No colour</option>
            {recordColors.map(c => (
              <option key={c.value} value={c.value}>
                {c.name}
              </option>
            ))}
          </select>
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
  const tryChange = (next: () => RecordRow[]) => {
    try {
      change(next());
    } catch (error) {
      ctx.display((error as Error).message);
    }
  };
  const toggleCollapsed = (id: string) =>
    onView({
      ...config,
      collapsed: config.collapsed?.includes(id)
        ? config.collapsed.filter(v => v !== id)
        : [...(config.collapsed ?? []), id],
    });
  const addChild = (parent: RecordRow) => {
    tryChange(() =>
      addChildRecord(rows, parent.id, {
        id: crypto.randomUUID(),
        title: 'New task',
        status: parent.status,
        assignee: '',
        start: '',
        end: '',
      }),
    );
    if (config.collapsed?.includes(parent.id)) toggleCollapsed(parent.id);
  };
  const setCalc = (field: string, calc: RecordCalc | '') => {
    const calcs = { ...config.calcs };
    if (calc) calcs[field] = calc;
    else delete calcs[field];
    const next: typeof config = { ...config, calcs };
    if (!Object.keys(calcs).length) delete next.calcs;
    onView(next);
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
        groupField && groupValue !== undefined && String(recordValue(row, groupField, schema)) !== groupValue
          ? withRecordValue(row, groupField, groupValue, schema)
          : row;
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
                    onClick={() => toggleGroup(entry.value)}
                  >
                    {entry.value || 'Unassigned'} ({entry.count})
                  </button>
                </th>
              </tr>
            );
          const r = entry.record,
            { depth, children } = entry.entry;
          return (
            <tr
              key={r.id}
              data-record={r.id}
              data-depth={depth || undefined}
              style={r.color ? { background: r.color } : undefined}
              onDragOver={dragOver}
              onDrop={event => dropRecord(event, r.id, groupField ? groupOf(r) : undefined)}
            >
              <td>
                <span className="record-tree-cell" style={{ paddingLeft: Math.min(depth, 12) * 16 }}>
                  {children ? (
                    <button
                      {...canvasControl}
                      className="record-tree-toggle"
                      aria-expanded={!entry.entry.collapsed}
                      aria-label={`${entry.entry.collapsed ? 'Expand' : 'Collapse'} child records: ${r.title}`}
                      onClick={() => toggleCollapsed(r.id)}
                    >
                      {entry.entry.collapsed ? '▸' : '▾'}
                    </button>
                  ) : (
                    depth > 0 && <span className="record-tree-spacer" aria-hidden="true" />
                  )}
                  {recordAction?.(r)}
                  <CanvasField
                    value={r.title}
                    label={`Record title: ${r.title}`}
                    onCommit={title => patch(r.id, { title })}
                  />
                </span>
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
                    row={r}
                    schema={schema}
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
                <span className="record-row-actions">
                  <button
                    {...canvasControl}
                    aria-label={`Add child record: ${r.title}`}
                    title="Add a child record"
                    onClick={() => addChild(r)}
                  >
                    + Child
                  </button>
                  <button
                    {...canvasControl}
                    aria-label={`Indent record: ${r.title}`}
                    title="Make this a child of the record above"
                    onClick={() => tryChange(() => indentRecord(rows, entry.tree, r.id))}
                  >
                    →
                  </button>
                  {r.parent && (
                    <button
                      {...canvasControl}
                      aria-label={`Outdent record: ${r.title}`}
                      title="Move this record up one level"
                      onClick={() => tryChange(() => outdentRecord(rows, r.id))}
                    >
                      ←
                    </button>
                  )}
                  <button
                    {...canvasControl}
                    aria-label={`Delete record: ${r.title}`}
                    title={children ? 'Delete; child records move up one level' : undefined}
                    onClick={() => change(deleteRecord(rows, r.id))}
                  >
                    Delete
                  </button>
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr className="record-calc-row">
          <th scope="row">
            {visible.length} {visible.length === 1 ? 'record' : 'records'}
          </th>
          <td colSpan={4} />
          {fields.map(f => {
            const id = `field:${f.id}`,
              numeric = numericRecordFields(schema).includes(id),
              calc = config.calcs?.[id];
            return (
              <td key={f.id}>
                <select
                  {...canvasControl}
                  aria-label={`Calculation: ${f.name}`}
                  value={calc ?? ''}
                  onChange={e => setCalc(id, e.target.value as RecordCalc | '')}
                >
                  <option value="">None</option>
                  {recordCalcs
                    .filter(c => numeric || c === 'count')
                    .map(c => (
                      <option key={c} value={c}>
                        {recordCalcNames[c]}
                      </option>
                    ))}
                </select>
                {calc && (
                  <span className="record-calc-value" data-calc={f.id}>
                    {formatCalc(calculateRecords(visible, id, calc, schema))}
                  </span>
                )}
              </td>
            );
          })}
          <td colSpan={(relations ? 2 : 0) + 1} />
        </tr>
      </tfoot>
    </table>
  );
  return (
    <div
      className="rich-object canvas-interactive canvas-records"
      onDoubleClick={e => e.stopPropagation()}
      {...recordFileDrop(item, ctx)}
    >
      <div className="rich-title canvas-widget-header">
        <span>{item.text || 'Records'}</span>
        <StatusChip status={item.data?.status} />
        <div {...canvasControl} className="canvas-view-switch" role="group" aria-label="Record layout">
          {view === 'table' && <RecordImportControls item={item} ctx={ctx} />}
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
        layout={view as 'table' | 'kanban' | 'timeline'}
        groupExclude={groupExclude}
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
      >
        <RecordSavedViews item={item} ctx={ctx} view={config} onView={onView} />
      </RecordControls>
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
          {view === 'kanban' && (
            <details className="record-column-menu">
              <summary>
                Shown columns
                {config.hiddenColumns?.length ? ` (${config.hiddenColumns.length} hidden)` : ''}
              </summary>
              <div role="group" aria-label="Shown columns">
                {kanbanColumns.map(c => (
                  <label key={c}>
                    <input
                      type="checkbox"
                      aria-label={`Show column: ${c || 'Unassigned'}`}
                      checked={!config.hiddenColumns?.includes(c)}
                      onChange={() => onView(toggleHiddenColumn(config, c))}
                    />
                    {c || 'Unassigned'}
                  </label>
                ))}
              </div>
            </details>
          )}
          {view === 'kanban' ? (
            <KanbanView
              rows={group ? visible.map(r => ({ ...r, status: String(r.values?.[group.id] ?? '') })) : visible}
              allRows={group ? rows.map(r => ({ ...r, status: String(r.values?.[group.id] ?? '') })) : rows}
              columns={kanbanColumns.filter(c => !config.hiddenColumns?.includes(c))}
              onHideColumn={item.locked ? undefined : c => onView(toggleHiddenColumn(config, c))}
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
              columnSettings={group ? undefined : schema.columns}
              capacity={schema.capacity}
              lanes={groupField ? kanbanLanes() : undefined}
              laneOf={groupField ? groupOf : undefined}
              withLane={groupField ? (r, lane) => withRecordValue(r, groupField, lane, schema) : undefined}
              onToggleLane={item.locked ? undefined : toggleGroup}
              cardFields={r =>
                fields.map(f => (
                  <label className="record-custom-field" key={f.id}>
                    {f.name}
                    <RecordFieldInput
                      field={f}
                      value={r.values?.[f.id]}
                      title={r.title}
                      row={rows.find(row => row.id === r.id) ?? r}
                      schema={schema}
                      onChange={value => patch(r.id, { values: { ...r.values, [f.id]: value } })}
                    />
                  </label>
                ))
              }
            />
          ) : view === 'timeline' ? (
            <TimelineView
              rows={selectable}
              allRows={rows}
              onAllRows={item.locked ? undefined : change}
              settings={config.timeline}
              onSettings={timeline => onView({ ...config, timeline })}
              onError={ctx.display}
              onRows={item.locked ? undefined : next => change(mergeRecordSubset(rows, selectable, next))}
              recordAction={recordAction}
              groups={
                groupField
                  ? groups.map(g => ({
                      value: g.value,
                      label: groupLabel(g.value),
                      hidden: hiddenGroup(g.value),
                      count: g.rows.length,
                    }))
                  : undefined
              }
              groupOf={groupField ? groupOf : undefined}
              onToggleGroup={item.locked ? undefined : toggleGroup}
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
