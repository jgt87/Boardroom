import { useState } from 'react';
import type { RecordSchema } from './record-schema';
import type { RecordFilter, RecordViewConfig } from './record-query';
import { recordFieldOptions } from './record-query';
import { CanvasField, canvasControl } from './canvas-fields';

export function RecordControls({
  schema,
  view,
  onView,
  search,
  onSearch,
  count,
  total,
  table,
  locked,
  selected,
  onBulk,
  onDuplicate,
  onDelete,
  onCards,
  onClear,
}: {
  schema: RecordSchema;
  view: RecordViewConfig;
  onView: (view: RecordViewConfig) => void;
  search: string;
  onSearch: (value: string) => void;
  count: number;
  total: number;
  table: boolean;
  locked: boolean;
  selected: number;
  onBulk: (patch: { status?: string; assignee?: string }) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onCards: () => void;
  onClear: () => void;
}) {
  const fields = recordFieldOptions(schema),
    filters = view.filters ?? [],
    [assignee, setAssignee] = useState('');
  const patchFilter = (index: number, patch: Partial<RecordFilter>) =>
    onView({ ...view, filters: filters.map((f, k) => (k === index ? { ...f, ...patch } : f)) });
  return (
    <div className="record-controls" {...canvasControl} onKeyDown={e => e.stopPropagation()}>
      <div className="record-query-bar">
        <input
          type="search"
          aria-label="Search records"
          placeholder="Search records"
          value={search}
          maxLength={6000}
          onChange={e => onSearch(e.target.value)}
        />
        <fieldset disabled={locked}>
          <details className="record-query-details">
            <summary>Filters{filters.length ? ` (${filters.length})` : ''}</summary>
            <div className="record-query-panel" role="group" aria-label="Record filters">
              <label>
                Match
                <select
                  aria-label="Filter match"
                  value={view.match ?? 'all'}
                  onChange={e => onView({ ...view, match: e.target.value as 'all' | 'any' })}
                >
                  <option value="all">All conditions</option>
                  <option value="any">Any condition</option>
                </select>
              </label>
              {filters.map((filter, k) => (
                <div className="record-filter-row" key={`${k}:${filter.field}:${filter.op}`}>
                  <select
                    aria-label={`Filter field ${k + 1}`}
                    value={filter.field}
                    onChange={e => patchFilter(k, { field: e.target.value })}
                  >
                    {fields.map(f => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={`Filter operator ${k + 1}`}
                    value={filter.op}
                    onChange={e => patchFilter(k, { op: e.target.value as RecordFilter['op'] })}
                  >
                    <option value="contains">Contains</option>
                    <option value="is">Is</option>
                    <option value="not">Is not</option>
                    <option value="gt">Greater than / after</option>
                    <option value="lt">Less than / before</option>
                    <option value="empty">Is empty</option>
                  </select>
                  {filter.op !== 'empty' && (
                    <CanvasField
                      label={`Filter value ${k + 1}`}
                      value={filter.value}
                      onCommit={value => patchFilter(k, { value })}
                    />
                  )}
                  <button
                    aria-label={`Remove filter ${k + 1}`}
                    onClick={() => onView({ ...view, filters: filters.filter((_, index) => index !== k) })}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                disabled={filters.length >= 10}
                onClick={() =>
                  onView({ ...view, filters: [...filters, { field: 'title', op: 'contains', value: '' }] })
                }
              >
                + Filter
              </button>
              <button disabled={!filters.length} onClick={() => onView({ ...view, filters: [] })}>
                Clear filters
              </button>
            </div>
          </details>
          <select
            aria-label="Sort records by"
            value={view.sort?.field ?? ''}
            onChange={e =>
              onView({
                ...view,
                sort: e.target.value ? { field: e.target.value, direction: view.sort?.direction ?? 'asc' } : undefined,
              })
            }
          >
            <option value="">Manual order</option>
            {fields.map(f => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <button
            aria-label={`Sort direction: ${view.sort?.direction === 'desc' ? 'Descending' : 'Ascending'}`}
            disabled={!view.sort}
            onClick={() =>
              onView({
                ...view,
                sort: view.sort
                  ? { ...view.sort, direction: view.sort.direction === 'asc' ? 'desc' : 'asc' }
                  : undefined,
              })
            }
          >
            {view.sort?.direction === 'desc' ? 'Descending' : 'Ascending'}
          </button>
          {table && (
            <select
              aria-label="Group records by"
              value={view.group ?? ''}
              onChange={e => onView({ ...view, group: e.target.value || undefined, hiddenGroups: [] })}
            >
              <option value="">No grouping</option>
              {fields
                .filter(f => f.id !== 'title')
                .map(f => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
            </select>
          )}
        </fieldset>
        <span className="record-result-count" aria-live="polite">
          {count} of {total}
        </span>
      </div>
      {!!selected && (
        <fieldset className="record-bulk-bar" disabled={locked} aria-label="Selected records">
          <strong>{selected} selected</strong>
          <select
            aria-label="Set selected status"
            value=""
            onChange={e => {
              if (e.target.value) onBulk({ status: e.target.value });
            }}
          >
            <option value="">Set status</option>
            {schema.statuses.map(s => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <input
            aria-label="Selected records assignee"
            placeholder="Assignee"
            maxLength={6000}
            value={assignee}
            onChange={e => setAssignee(e.target.value)}
          />
          <button onClick={() => onBulk({ assignee })}>Apply assignee</button>
          <button onClick={onDuplicate}>Duplicate selected</button>
          <button onClick={onCards}>Create synced cards</button>
          <button onClick={onDelete}>Delete selected</button>
          <button onClick={onClear}>Clear selection</button>
        </fieldset>
      )}
    </div>
  );
}
