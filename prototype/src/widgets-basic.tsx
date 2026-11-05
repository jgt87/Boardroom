// Registry entries for essential and facilitation widgets (items 21-23, 27-29, 43-44).
import './widgets-basic.css';
import { RotateCcw, Repeat2, Sheet, FileUp, Eye, EyeOff, Table2 } from 'lucide-react';
import type { WidgetView } from './widget-types';
import { stampKinds } from './specs-basic';
import type { StampKind } from './specs-basic';
import { pollTotal, resetPoll, setPollHidden, resetScale, scaleTotal } from './facilitation-widgets';
import type { PollData, ScaleData } from './facilitation-widgets';
import { CardEditor, CardRender, FlipEditor, FlipRender } from './widgets-cards';
import { data, patchItem, pickFile, saveText, setData } from './widget-kit';
import { gridImportNote, importIntoGrid, isTableFile, readTableFile } from './table-file';
import { askSheet } from './sheet-picker';
import { toCsv } from './csv';
import { gridRows } from './grid';
import type { GridData } from './grid';
import { GridEditor, GridRender } from './widgets-grid';
import {
  DividerRender,
  IconEditor,
  IconRender,
  QrEditor,
  QrRender,
  StampEditor,
  StampRender,
  stampColors,
  stampLabels,
} from './widgets-graphics';
import {
  MatrixEditor,
  MatrixRender,
  PollEditor,
  PollRender,
  ScaleEditor,
  ScaleRender,
  SpinnerEditor,
  SpinnerRender,
  spinnerActions,
} from './widgets-facilitation';

const cycle = <T,>(list: readonly T[], v: T) => list[(list.indexOf(v) + 1) % list.length];
export const basicViews: WidgetView[] = [
  {
    kind: 'card',
    interactive: true,
    mode: 'html',
    Render: CardRender,
    Editor: CardEditor,
    // Status, assignee, dates, tags and CSV live in the card bar (card-bar.tsx), which also handles many cards.
  },
  {
    kind: 'flipcard',
    mode: 'html',
    Render: FlipRender,
    Editor: FlipEditor,
    actions: (item, ctx) => {
      const d = data<{ back: string; flipped: boolean }>(item);
      return [
        {
          label: d.flipped ? 'Show front' : 'Flip',
          icon: <Repeat2 size={16} />,
          pressed: d.flipped,
          run: () => setData(ctx, item.id, { ...d, flipped: !d.flipped }),
        },
      ];
    },
  },
  {
    kind: 'grid',
    mode: 'html',
    interactive: true,
    Render: GridRender,
    Editor: GridEditor,
    actions: (item, ctx) => [
      {
        label: 'Export CSV',
        icon: <Sheet size={16} />,
        run: () =>
          saveText('\uFEFF' + toCsv(gridRows(item.data as GridData)), `${(item.name || 'grid').slice(0, 60)}.csv`),
      },
      {
        // Fill this grid from a spreadsheet file (gap b3-5); one undo step.
        label: 'Import CSV or Excel',
        icon: <FileUp size={16} />,
        disabled: !!item.locked,
        run: () =>
          void pickFile(
            '.csv,.tsv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          ).then(async file => {
            if (!file) return;
            try {
              if (!isTableFile(file.name)) throw new Error('Choose a .csv, .tsv or .xlsx file.');
              const rows = await readTableFile(file, askSheet);
              if (!rows) return;
              let note = '';
              ctx.update(b => {
                const made = importIntoGrid(b, item.id, rows);
                if (!made) return b;
                note = gridImportNote(made.data, made.truncated);
                return made.board;
              });
              if (note) ctx.display(note);
            } catch (err) {
              ctx.display((err as Error).message || 'The file could not be imported.');
            }
          }),
      },
    ],
  },
  {
    kind: 'divider',
    mode: 'svg',
    Render: DividerRender,
    actions: (item, ctx) => {
      const d = data<{ orientation: string; style: string; weight: number }>(item);
      return [
        {
          label: d.orientation === 'horizontal' ? 'Make vertical' : 'Make horizontal',
          run: () =>
            patchItem(ctx, item.id, i => ({
              ...i,
              w: i.h,
              h: i.w,
              x: i.x + (i.w - i.h) / 2,
              y: i.y + (i.h - i.w) / 2,
              data: { ...d, orientation: d.orientation === 'horizontal' ? 'vertical' : 'horizontal' },
            })),
        },
        {
          label: `Pattern: ${d.style}`,
          run: () => setData(ctx, item.id, { ...d, style: cycle(['solid', 'dashed', 'dotted'], d.style) }),
        },
        {
          label: `Weight: ${d.weight} px`,
          run: () => setData(ctx, item.id, { ...d, weight: cycle([1, 2, 4, 8], d.weight) }),
        },
      ];
    },
  },
  {
    kind: 'stamp',
    mode: 'svg',
    Render: StampRender,
    Editor: StampEditor,
    actions: (item, ctx) => {
      const d = data<{ stamp: StampKind; count?: number }>(item),
        k = d.stamp,
        n = cycle(stampKinds, k),
        count = d.count ?? 1;
      return [
        {
          label: `Next stamp (${stampLabels[n]})`,
          icon: <Repeat2 size={16} />,
          run: () => setData(ctx, item.id, { ...d, stamp: n }, { fill: stampColors[n] }),
        },
        // Sticker counter (gap D13).
        {
          label: `+1 (${count})`,
          run: () => setData(ctx, item.id, { ...d, count: Math.min(999, count + 1) }),
        },
        ...(count > 1
          ? [
              {
                label: 'Reset count',
                run: () => {
                  const next = { ...d };
                  delete next.count;
                  setData(ctx, item.id, next);
                },
              },
            ]
          : []),
      ];
    },
  },
  { kind: 'icon', mode: 'svg', Render: IconRender, Editor: IconEditor },
  { kind: 'qr', mode: 'svg', Render: QrRender, Editor: QrEditor },
  { kind: 'matrix', mode: 'html', Render: MatrixRender, Editor: MatrixEditor },
  {
    kind: 'poll',
    mode: 'html',
    Render: PollRender,
    Editor: PollEditor,
    interactive: true,
    actions: (item, ctx) => {
      const d = data<PollData>(item);
      return [
        {
          label: d.resultsHidden ? 'Reveal results' : 'Hide results',
          icon: d.resultsHidden ? <Eye size={16} /> : <EyeOff size={16} />,
          pressed: !!d.resultsHidden,
          run: () => setData(ctx, item.id, setPollHidden(d, !d.resultsHidden)),
        },
        {
          label: 'Export to Table',
          icon: <Table2 size={16} />,
          // The Table import code loads on demand, as it does for CSV files.
          run: () =>
            void import('./facilitation-results').then(({ pollToTable }) => {
              ctx.update(b => pollToTable(b, item.id).board);
              ctx.display('Poll results added as a Table next to the poll.');
            }),
        },
        {
          label: 'Reset votes',
          icon: <RotateCcw size={16} />,
          disabled: !pollTotal(d),
          run: () => setData(ctx, item.id, resetPoll(d)),
        },
      ];
    },
  },
  {
    kind: 'spinner',
    mode: 'html',
    Render: SpinnerRender,
    Editor: SpinnerEditor,
    actions: spinnerActions,
  },
  {
    kind: 'scale',
    mode: 'html',
    Render: ScaleRender,
    Editor: ScaleEditor,
    interactive: true,
    actions: (item, ctx) => [
      {
        label: 'Reset responses',
        icon: <RotateCcw size={16} />,
        disabled: !scaleTotal(data<ScaleData>(item)),
        run: () => setData(ctx, item.id, resetScale(data<ScaleData>(item))),
      },
    ],
  },
];
