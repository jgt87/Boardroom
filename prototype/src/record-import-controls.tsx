// Table header controls for spreadsheet import and charts (gap list B3, B15, I4): "Import CSV" appends rows
// from a .csv or .xlsx file, dropping such a file on the view does the same, and "Chart" summarises a column.
import { useRef } from 'react';
import type React from 'react';
import { Upload } from 'lucide-react';
import type { Item } from './model';
import { createItem } from './model';
import type { WidgetCtx } from './widget-types';
import { schemaOf } from './record-schema';
import { chartColumns, chartFromRecords } from './specs-charts';
import { askSheet } from './sheet-picker';

export const SPREADSHEET_ACCEPT =
  '.csv,.tsv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const spreadsheet = (f: File) => /\.(csv|tsv|xlsx)$/i.test(f.name);

/** Read a spreadsheet file and append its rows to the view's dataset as one undo step. */
async function importFile(item: Item, ctx: WidgetCtx, file: File) {
  try {
    const { importIntoDataset } = await import('./record-import'),
      { readTableFile } = await import('./table-file'),
      table = await readTableFile(file, askSheet);
    if (!table) return;
    let message = '';
    ctx.update(b => {
      try {
        const made = importIntoDataset(b, item.datasetId!, table);
        message = [`Imported ${made.count} ${made.count === 1 ? 'record' : 'records'}.`, ...made.notes].join(' ');
        return made.board;
      } catch (error) {
        message = (error as Error).message;
        return b;
      }
    });
    ctx.display(message);
  } catch (error) {
    ctx.display((error as Error).message || 'The file could not be imported.');
  }
}

/** Drag-and-drop handlers for spreadsheet files dropped on a record view. */
export function recordFileDrop(item: Item, ctx: WidgetCtx) {
  return {
    onDragOver: (e: React.DragEvent) => {
      if (!item.locked && [...e.dataTransfer.types].includes('Files')) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    onDrop: (e: React.DragEvent) => {
      const file = [...e.dataTransfer.files].find(spreadsheet);
      if (!file || item.locked) return;
      e.preventDefault();
      e.stopPropagation();
      void importFile(item, ctx, file);
    },
  };
}

export function RecordImportControls({ item, ctx }: { item: Item; ctx: WidgetCtx }) {
  const input = useRef<HTMLInputElement>(null),
    schema = schemaOf(ctx.board, item.datasetId!),
    columns = chartColumns(schema);
  return (
    <>
      <button
        className="record-import-button"
        disabled={!!item.locked}
        title="Add rows from a CSV or Excel file (or drop the file on the table)"
        onClick={() => input.current?.click()}
      >
        <Upload size={13} aria-hidden="true" /> Import CSV
      </button>
      <input
        ref={input}
        type="file"
        hidden
        accept={SPREADSHEET_ACCEPT}
        aria-label="Choose a CSV or Excel file to import"
        onChange={e => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void importFile(item, ctx, f);
        }}
      />
      <select
        className="record-chart-select"
        aria-label="Create a chart from a column"
        value=""
        onChange={e => {
          const column = columns.find(c => c.id === e.target.value);
          e.target.value = '';
          if (!column) return;
          ctx.update(b => {
            if (b.items.length >= 2000) {
              ctx.display('This prototype supports up to 2,000 objects per board.');
              return b;
            }
            const rows = b.datasets?.[item.datasetId!] ?? [],
              chart: Item = {
                ...createItem('chart', item.x + item.w + 60, item.y),
                text: `${item.text || 'Records'}: ${column.name}`.slice(0, 200),
                data: chartFromRecords(rows, schemaOf(b, item.datasetId!), column.id),
              };
            chart.x = item.x + item.w + 60;
            chart.y = item.y;
            return { ...b, items: [...b.items, chart] };
          });
          ctx.display(`Chart of ${column.name} added to the right of the table.`);
        }}
      >
        <option value="">Chart…</option>
        {columns.map(c => (
          <option key={c.id} value={c.id}>
            {c.mode === 'sum' ? `Total ${c.name} by status` : `Count by ${c.name}`}
          </option>
        ))}
      </select>
    </>
  );
}
