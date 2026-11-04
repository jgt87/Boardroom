// Small board thumbnail drawn from preview shapes (board-library.ts previewOf): dashboard cards, the
// template gallery and the template picker share it.
import { useMemo } from 'react';
import { createItem } from './model';
import { previewOf, type PreviewShape } from './board-library';
import { templateItems, type TemplateName } from './board-tools';

export function PreviewThumb({ preview, empty = 'Empty board' }: { preview: PreviewShape[]; empty?: string }) {
  return (
    <svg className="board-thumb" viewBox="-0.05 -0.05 1.1 1.1" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <rect x={-0.05} y={-0.05} width={1.1} height={1.1} fill="#fafafb" />
      {preview.map((s, k) =>
        s.kind === 'line' ? (
          <line key={k} x1={s.x} y1={s.y} x2={s.x + s.w} y2={s.y + s.h} stroke="#8a8a94" strokeWidth={0.006} />
        ) : (
          <rect
            key={k}
            x={s.x}
            y={s.y}
            width={s.w}
            height={s.h}
            rx={s.kind === 'note' ? 0 : 0.006}
            fill={s.kind === 'frame' ? '#ffffff' : s.fill}
            stroke={s.kind === 'frame' ? '#c5c5ce' : s.kind === 'shape' ? '#52525b' : 'none'}
            strokeWidth={0.004}
          />
        ),
      )}
      {!preview.length && empty && (
        <text x={0.5} y={0.52} textAnchor="middle" fontSize={0.07} fill="#8a8a94">
          {empty}
        </text>
      )}
    </svg>
  );
}

const starterPreviews = new Map<string, PreviewShape[]>();
/** Preview of a gallery template, built once per name. */
export function starterPreview(name: TemplateName): PreviewShape[] {
  let p = starterPreviews.get(name);
  if (!p) {
    p = previewOf({
      version: 1,
      title: name,
      items: templateItems(name, { x: 0, y: 0 }, (t, x, y, f) => createItem(t, x, y, f)),
    });
    starterPreviews.set(name, p);
  }
  return p;
}
export function StarterThumb({ name }: { name: TemplateName }) {
  const preview = useMemo(() => starterPreview(name), [name]);
  return <PreviewThumb preview={preview} />;
}
