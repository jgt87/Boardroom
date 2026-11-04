import { useState } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import type { Item, RecordRow } from './model';
import type { WidgetCtx } from './widget-types';
import type { RecordField, RecordSchema } from './record-schema';
import {
  fieldTypes,
  formulaError,
  normalizeRecordUrl,
  renameRecordField,
  schemaOf,
  setRecordSchema,
} from './record-schema';
import { numericFieldValue } from './record-formula';
import { formatCalc } from './record-query';
import { CanvasField, canvasControl } from './canvas-fields';
import './record-gaps.css';
const typeNames: Record<RecordField['type'], string> = {
  text: 'Text',
  number: 'Number',
  date: 'Date',
  select: 'Single select',
  checkbox: 'Checkbox',
  formula: 'Formula',
  url: 'Link',
};

/** A number shown as a bar between the field's minimum and maximum. */
export function ProgressBar({ field, value }: { field: RecordField; value: number | null }) {
  const min = field.min ?? 0,
    max = field.max ?? 100,
    ratio = value === null ? 0 : Math.max(0, Math.min(1, (value - min) / (max - min)));
  return (
    <span
      className="record-progress"
      role="progressbar"
      aria-label={`${field.name} progress`}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value ?? undefined}
      title={value === null ? 'No value' : `${formatCalc(value)} of ${max}`}
    >
      <span style={{ width: `${ratio * 100}%` }} />
    </span>
  );
}

export function RecordFieldInput({
  field,
  value,
  title,
  onChange,
  row,
  schema,
}: {
  field: RecordField;
  value: unknown;
  title: string;
  onChange: (value: string | number | boolean) => void;
  /** Needed to calculate formula fields. */
  row?: RecordRow;
  schema?: RecordSchema;
}) {
  const label = `${field.name}: ${title || 'Untitled record'}`;
  if (field.type === 'formula') {
    const computed = row && schema ? numericFieldValue(row, field, schema.fields) : null;
    return (
      <span className="record-formula-value" aria-label={label} title={field.formula}>
        {field.display === 'progress' && <ProgressBar field={field} value={computed} />}
        {formatCalc(computed)}
      </span>
    );
  }
  if (field.type === 'url') {
    const href = typeof value === 'string' ? value : '';
    return (
      <span className="record-url-value">
        <CanvasField
          label={label}
          value={href}
          maxLength={2048}
          onCommit={text => {
            try {
              onChange(normalizeRecordUrl(text));
            } catch {
              onChange(text);
            }
          }}
        />
        {href && (
          <a
            {...canvasControl}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open link: ${title}`}
          >
            Open
          </a>
        )}
      </span>
    );
  }
  if (field.type === 'text')
    return <CanvasField label={label} value={typeof value === 'string' ? value : ''} onCommit={onChange} />;
  if (field.type === 'select')
    return (
      <select
        {...canvasControl}
        aria-label={label}
        value={String(value ?? '')}
        onChange={e => onChange(e.target.value)}
      >
        <option value="">Unassigned</option>
        {field.options?.map(v => (
          <option key={v}>{v}</option>
        ))}
      </select>
    );
  const input = (
    <input
      {...canvasControl}
      aria-label={label}
      type={field.type === 'checkbox' ? 'checkbox' : field.type}
      checked={field.type === 'checkbox' ? value === true : undefined}
      value={field.type === 'checkbox' ? undefined : String(value ?? '')}
      onChange={e =>
        onChange(
          field.type === 'checkbox'
            ? e.target.checked
            : field.type === 'number' && e.target.value !== ''
              ? Number(e.target.value)
              : e.target.value,
        )
      }
    />
  );
  return field.type === 'number' && field.display === 'progress' ? (
    <span className="record-progress-field">
      <ProgressBar field={field} value={typeof value === 'number' ? value : null} />
      {input}
    </span>
  ) : (
    input
  );
}

const hex = /^#[0-9a-f]{6}$/i;
/** Progress-bar display settings for number and formula fields. */
function ProgressSettings({ field, onField }: { field: RecordField; onField: (next: RecordField) => void }) {
  const set = (patch: Partial<RecordField>) => {
    const next: RecordField = { ...field, ...patch };
    for (const k of ['display', 'min', 'max'] as const) if (next[k] === undefined) delete next[k];
    onField(next);
  };
  return (
    <span className="record-progress-settings">
      <label>
        <input
          type="checkbox"
          aria-label={`Show as progress bar: ${field.name}`}
          checked={field.display === 'progress'}
          onChange={e => set({ display: e.target.checked ? 'progress' : undefined })}
        />
        Progress bar
      </label>
      {field.display === 'progress' && (
        <>
          <CanvasField
            label={`Progress minimum: ${field.name}`}
            value={String(field.min ?? 0)}
            onCommit={v => set({ min: v.trim() === '' ? undefined : Number(v) })}
          />
          <CanvasField
            label={`Progress maximum: ${field.name}`}
            value={String(field.max ?? 100)}
            onCommit={v => set({ max: v.trim() === '' ? undefined : Number(v) })}
          />
        </>
      )}
    </span>
  );
}

export function RecordFields({ item, ctx }: { item: Item; ctx: WidgetCtx }) {
  const schema = schemaOf(ctx.board, item.datasetId!);
  const [name, setName] = useState(''),
    [type, setType] = useState<RecordField['type']>('text'),
    [options, setOptions] = useState('');
  const write = (next: typeof schema, rename?: { from: string; to: string }) =>
    ctx.update(b =>
      b.items.find(i => i.id === item.id)?.locked ? b : setRecordSchema(b, item.datasetId!, next, rename),
    );
  const setColumn = (status: string, patch: { color?: string; limit?: number }) => {
    const current = { ...schema.columns?.[status], ...patch };
    for (const k of ['color', 'limit'] as const) if (current[k] === undefined) delete current[k];
    const columns = { ...schema.columns, [status]: current };
    if (!Object.keys(current).length) delete columns[status];
    const next: typeof schema = { ...schema, columns };
    if (!Object.keys(columns).length) delete next.columns;
    write(next);
  };
  const setField = (field: RecordField) =>
    write({ ...schema, fields: schema.fields.map(x => (x.id === field.id ? field : x)) });
  const [formula, setFormula] = useState('');
  const newFormulaError = type === 'formula' && formula.trim() ? formulaError(schema, formula) : null;
  const swap = <T,>(values: T[], at: number, direction: number) => {
    const next = [...values];
    [next[at], next[at + direction]] = [next[at + direction], next[at]];
    return next;
  };
  return (
    <details
      className="record-fields"
      {...canvasControl}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          e.currentTarget.open = false;
          e.currentTarget.querySelector('summary')?.focus();
        }
      }}
    >
      <summary>Fields</summary>
      <div className="record-fields-panel" role="group" aria-label="Record fields">
        <fieldset disabled={!!item.locked}>
          <legend>Status columns</legend>
          {schema.statuses.map((status, k) => (
            <div className="record-schema-row" key={status}>
              <CanvasField
                label={`Rename status: ${status}`}
                value={status}
                maxLength={80}
                onCommit={value =>
                  write(
                    { ...schema, statuses: schema.statuses.map(s => (s === status ? value.trim() : s)) },
                    { from: status, to: value.trim() },
                  )
                }
              />
              <button
                disabled={!k}
                aria-label={`Move status up: ${status}`}
                onClick={() => write({ ...schema, statuses: swap(schema.statuses, k, -1) })}
              >
                <ArrowUp size={12} />
              </button>
              <button
                disabled={k === schema.statuses.length - 1}
                aria-label={`Move status down: ${status}`}
                onClick={() => write({ ...schema, statuses: swap(schema.statuses, k, 1) })}
              >
                <ArrowDown size={12} />
              </button>
              <input
                type="color"
                aria-label={`Column colour: ${status}`}
                value={schema.columns?.[status]?.color ?? '#f4f4f6'}
                onChange={e => setColumn(status, { color: hex.test(e.target.value) ? e.target.value : undefined })}
              />
              <CanvasField
                label={`Column capacity: ${status}`}
                value={String(schema.columns?.[status]?.limit ?? '')}
                maxLength={6}
                onCommit={value => {
                  const limit = Math.round(Number(value));
                  setColumn(status, { limit: value.trim() && limit > 0 ? limit : undefined });
                }}
              />
              <button
                disabled={schema.statuses.length === 1}
                aria-label={`Delete status: ${status}`}
                onClick={() => write({ ...schema, statuses: schema.statuses.filter(s => s !== status) })}
              >
                Delete
              </button>
            </div>
          ))}
          <button
            disabled={schema.statuses.length >= 30}
            onClick={() => {
              let suffix = schema.statuses.length + 1;
              while (schema.statuses.includes(`Status ${suffix}`)) suffix++;
              write({ ...schema, statuses: [...schema.statuses, `Status ${suffix}`] });
            }}
          >
            + Status
          </button>
          <label>
            Capacity counts
            <select
              aria-label="Column capacity counts"
              value={schema.capacity ?? 'count'}
              onChange={e => {
                const next: typeof schema = { ...schema, capacity: e.target.value as 'count' | 'points' };
                if (next.capacity === 'count') delete next.capacity;
                write(next);
              }}
            >
              <option value="count">Cards</option>
              <option value="points">Story points</option>
            </select>
          </label>
        </fieldset>
        <fieldset disabled={!!item.locked}>
          <legend>Custom fields</legend>
          {schema.fields.map((f, k) => (
            <div className="record-schema-field" key={f.id}>
              <CanvasField
                label={`Rename field: ${f.name}`}
                value={f.name}
                maxLength={80}
                onCommit={value => write(renameRecordField(schema, f.id, value.trim()))}
              />
              <small>{typeNames[f.type]}</small>
              {f.type === 'formula' && (
                <CanvasField
                  label={`Formula: ${f.name}`}
                  value={f.formula ?? ''}
                  maxLength={500}
                  onCommit={value => {
                    const error = formulaError(schema, value, f.id);
                    if (error) ctx.display(error);
                    else setField({ ...f, formula: value.trim() });
                  }}
                />
              )}
              {(f.type === 'number' || f.type === 'formula') && <ProgressSettings field={f} onField={setField} />}
              <label>
                <input
                  type="checkbox"
                  checked={!f.hidden}
                  onChange={e =>
                    write({
                      ...schema,
                      fields: schema.fields.map(x => (x.id === f.id ? { ...x, hidden: !e.target.checked } : x)),
                    })
                  }
                />
                Visible
              </label>
              {f.type === 'select' && (
                <CanvasField
                  label={`Options: ${f.name}`}
                  value={f.options!.join(', ')}
                  onCommit={value =>
                    write({
                      ...schema,
                      fields: schema.fields.map(x =>
                        x.id === f.id
                          ? {
                              ...x,
                              options: value
                                .split(',')
                                .map(v => v.trim())
                                .filter(Boolean),
                            }
                          : x,
                      ),
                    })
                  }
                />
              )}
              <button
                disabled={!k}
                aria-label={`Move field up: ${f.name}`}
                onClick={() => write({ ...schema, fields: swap(schema.fields, k, -1) })}
              >
                <ArrowUp size={12} />
              </button>
              <button
                disabled={k === schema.fields.length - 1}
                aria-label={`Move field down: ${f.name}`}
                onClick={() => write({ ...schema, fields: swap(schema.fields, k, 1) })}
              >
                <ArrowDown size={12} />
              </button>
              <button
                aria-label={`Delete field: ${f.name}`}
                onClick={() => write({ ...schema, fields: schema.fields.filter(x => x.id !== f.id) })}
              >
                Delete
              </button>
            </div>
          ))}
          <label>
            Field name
            <input aria-label="New field name" value={name} maxLength={80} onChange={e => setName(e.target.value)} />
          </label>
          <label>
            Type
            <select aria-label="Field type" value={type} onChange={e => setType(e.target.value as RecordField['type'])}>
              {fieldTypes.map(t => (
                <option key={t} value={t}>
                  {typeNames[t]}
                </option>
              ))}
            </select>
          </label>
          {type === 'select' && (
            <label>
              Options (comma separated)
              <input value={options} onChange={e => setOptions(e.target.value)} />
            </label>
          )}
          {type === 'formula' && (
            <label>
              Formula, for example {'{Effort} * 2 + {Points}'}
              <input
                aria-label="New field formula"
                value={formula}
                maxLength={500}
                onChange={e => setFormula(e.target.value)}
              />
              {newFormulaError && <small role="alert">{newFormulaError}</small>}
            </label>
          )}
          <button
            disabled={
              !name.trim() ||
              schema.fields.length >= 30 ||
              (type === 'formula' && (!formula.trim() || !!newFormulaError))
            }
            onClick={() => {
              write({
                ...schema,
                fields: [
                  ...schema.fields,
                  {
                    id: crypto.randomUUID(),
                    name: name.trim(),
                    type,
                    ...(type === 'formula' ? { formula: formula.trim() } : {}),
                    ...(type === 'select'
                      ? {
                          options: options
                            .split(',')
                            .map(v => v.trim())
                            .filter(Boolean),
                        }
                      : {}),
                  },
                ],
              });
              setName('');
              setFormula('');
            }}
          >
            Add field
          </button>
        </fieldset>
      </div>
    </details>
  );
}
