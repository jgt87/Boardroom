// Registry entries for essential and facilitation widgets (items 21-23, 27-29, 43-44).
import './widgets-basic.css';
import { RotateCcw, Repeat2, Shuffle } from 'lucide-react';
import type { WidgetView } from './widget-types';
import { stampKinds } from './specs-basic';
import type { StampKind } from './specs-basic';
import { cardStatuses, pollTotal, resetPoll, spin } from './facilitation-widgets';
import { schemaOf } from './record-schema';
import type { CardData, PollData, SpinnerData } from './facilitation-widgets';
import { CardEditor, CardRender, FlipEditor, FlipRender } from './widgets-cards';
import { data, patchItem, setData } from './widget-kit';
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
} from './widgets-facilitation';

const cycle = <T,>(list: readonly T[], v: T) => list[(list.indexOf(v) + 1) % list.length];
export const basicViews: WidgetView[] = [
  {
    kind: 'card',
    interactive: true,
    mode: 'html',
    Render: CardRender,
    Editor: CardEditor,
    actions: (item, ctx) => {
      const d = data<CardData>(item);
      return [
        {
          label: `Status: ${d.status}`,
          icon: <Repeat2 size={16} />,
          run: () =>
            setData(ctx, item.id, {
              ...d,
              status: cycle(
                item.recordRef ? schemaOf(ctx.board, item.recordRef.datasetId).statuses : cardStatuses,
                d.status,
              ),
            }),
        },
      ];
    },
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
  { kind: 'grid', mode: 'html', interactive: true, Render: GridRender, Editor: GridEditor },
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
      const k = data<{ stamp: StampKind }>(item).stamp,
        n = cycle(stampKinds, k);
      return [
        {
          label: `Next stamp (${stampLabels[n]})`,
          icon: <Repeat2 size={16} />,
          run: () => setData(ctx, item.id, { stamp: n }, { fill: stampColors[n] }),
        },
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
    actions: (item, ctx) => [
      {
        label: 'Reset votes',
        icon: <RotateCcw size={16} />,
        disabled: !pollTotal(data<PollData>(item)),
        run: () => setData(ctx, item.id, resetPoll(data<PollData>(item))),
      },
    ],
  },
  {
    kind: 'spinner',
    mode: 'html',
    Render: SpinnerRender,
    Editor: SpinnerEditor,
    actions: (item, ctx) => [
      {
        label: 'Spin',
        icon: <Shuffle size={16} />,
        run: () => {
          try {
            setData(ctx, item.id, spin(data<SpinnerData>(item)));
          } catch (e) {
            ctx.display((e as Error).message);
          }
        },
      },
    ],
  },
  { kind: 'scale', mode: 'html', Render: ScaleRender, Editor: ScaleEditor, interactive: true },
];
