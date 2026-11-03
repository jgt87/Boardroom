import { useState } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import type { Item } from './model';
import type { WidgetCtx } from './widget-types';
import type { RecordField } from './record-schema';
import { schemaOf, setRecordSchema } from './record-schema';
import { CanvasField, canvasControl } from './canvas-fields';
const typeNames = { text: 'Text', number: 'Number', date: 'Date', select: 'Single select', checkbox: 'Checkbox' };

export function RecordFieldInput({
  field,
  value,
  title,
  onChange,
}: {
  field: RecordField;
  value: unknown;
  title: string;
  onChange: (value: string | number | boolean) => void;
}) {
  const label = `${field.name}: ${title || 'Untitled record'}`;
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
  return (
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
        </fieldset>
        <fieldset disabled={!!item.locked}>
          <legend>Custom fields</legend>
          {schema.fields.map((f, k) => (
            <div className="record-schema-field" key={f.id}>
              <CanvasField
                label={`Rename field: ${f.name}`}
                value={f.name}
                maxLength={80}
                onCommit={value =>
                  write({
                    ...schema,
                    fields: schema.fields.map(x => (x.id === f.id ? { ...x, name: value.trim() } : x)),
                  })
                }
              />
              <small>{typeNames[f.type]}</small>
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
              {(['text', 'number', 'date', 'select', 'checkbox'] as const).map(t => (
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
          <button
            disabled={!name.trim() || schema.fields.length >= 30}
            onClick={() => {
              write({
                ...schema,
                fields: [
                  ...schema.fields,
                  {
                    id: crypto.randomUUID(),
                    name: name.trim(),
                    type,
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
            }}
          >
            Add field
          </button>
        </fieldset>
      </div>
    </details>
  );
}
