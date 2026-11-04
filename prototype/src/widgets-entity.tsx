// ERD entity table view and editor (track R5).
import React, { useState } from 'react';
import { Rows3 } from 'lucide-react';
import type { WidgetView } from './widget-types';
import { Dialog, patchItem } from './widget-kit';
import { readableTextOn } from './board-tools';
import { ENTITY_HEADER, entityHeight, entityRowsText, parseEntityRows } from './specs-entity';
import type { EntityData } from './specs-entity';

const clip = (text: string, max: number) => (text.length > max ? text.slice(0, max - 1) + '…' : text);

export const entityView: WidgetView = {
  kind: 'entity',
  mode: 'svg',
  Render: ({ item, ctx }) => {
    const d = (item.data ?? { rows: [] }) as EntityData,
      rows = d.rows,
      rowH = rows.length ? (item.h - ENTITY_HEADER) / rows.length : 0,
      chars = Math.max(4, Math.floor((item.w - 70) / 7.5));
    return (
      <g className="entity-table" aria-label={`Entity ${item.text}`}>
        <rect
          width={item.w}
          height={item.h}
          rx="6"
          fill="#ffffff"
          stroke={ctx.selected ? '#4262ff' : '#a1a1aa'}
          strokeWidth={1.2}
        />
        <path
          d={`M0 6 a6 6 0 0 1 6 -6 H${item.w - 6} a6 6 0 0 1 6 6 V${ENTITY_HEADER} H0 Z`}
          fill={item.fill}
          stroke="none"
        />
        <text
          x={item.w / 2}
          y={ENTITY_HEADER / 2 + 5}
          fontSize="14"
          fontWeight="700"
          textAnchor="middle"
          fill={readableTextOn(item.fill)}
        >
          {clip(item.text || 'Entity', chars + 6)}
        </text>
        {rows.map((r, k) => (
          <g key={k} transform={`translate(0 ${ENTITY_HEADER + k * rowH})`}>
            {d.stripes && k % 2 === 1 && <rect x="1" width={item.w - 2} height={rowH} fill="#f4f4f6" />}
            <line x1="0" x2={item.w} y1="0" y2="0" stroke="#e4e4e7" />
            <text x="10" y={rowH / 2 + 4} fontSize="12" fontWeight="700" fill="#4262ff">
              {r.key ?? ''}
            </text>
            <text x={r.key || d.rows.some(x => x.key) ? 40 : 10} y={rowH / 2 + 4} fontSize="13" fill="#25252c">
              {clip(r.name, r.type ? Math.ceil(chars / 2) + 4 : chars + 4)}
            </text>
            <text x={item.w - 10} y={rowH / 2 + 4} fontSize="12" fill="#71717a" textAnchor="end">
              {clip(r.type, Math.floor(chars / 2))}
            </text>
          </g>
        ))}
      </g>
    );
  },
  Editor: ({ item, ctx, onClose }) => {
    const d = (item.data ?? { rows: [] }) as EntityData;
    const [name, setName] = useState(item.text),
      [text, setText] = useState(entityRowsText(d.rows)),
      [stripes, setStripes] = useState(!!d.stripes);
    const apply = () => {
      const rows = parseEntityRows(text);
      patchItem(ctx, item.id, i => ({
        ...i,
        text: name.slice(0, 200),
        h: entityHeight(rows.length),
        data: { rows, ...(stripes ? { stripes: true } : {}) },
      }));
      onClose();
    };
    return (
      <Dialog
        title="Entity table"
        hint="One attribute per line: name, type and an optional key (PK, FK or UK)."
        onClose={onClose}
        onApply={apply}
      >
        <label>
          Entity name
          <input aria-label="Entity name" maxLength={200} value={name} onChange={e => setName(e.target.value)} />
        </label>
        <label>
          Attributes
          <textarea
            aria-label="Entity attributes"
            rows={8}
            spellCheck={false}
            value={text}
            onChange={e => setText(e.target.value)}
          />
        </label>
        <label className="check-inline">
          <input type="checkbox" checked={stripes} onChange={e => setStripes(e.target.checked)} />
          Shade alternate rows
        </label>
      </Dialog>
    );
  },
  actions: (item, ctx) => [
    {
      label: 'Shade alternate rows',
      icon: <Rows3 size={17} />,
      pressed: !!item.data?.stripes,
      run: () =>
        patchItem(ctx, item.id, i => {
          const data = { ...(i.data as EntityData) };
          if (data.stripes) delete data.stripes;
          else data.stripes = true;
          return { ...i, data };
        }),
    },
  ],
};
