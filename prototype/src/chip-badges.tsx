// Marks that chips leave on objects (track F): a sticky note's estimate and assignee, and placed voting dots.
// Clicking a placed dot returns it to its pile; a selected sticky shows a × on its estimate and assignee.
// Those clicks are handled by the canvas gesture code through `data-chip-remove`.
import type { Item } from './model';
import { estimateLabel } from './chip-rules';
import { colorFor } from './specs-people';
import { initials } from './authors';

function RemoveMark({ x, y, r, what, label }: { x: number; y: number; r: number; what: string; label: string }) {
  return (
    <g
      className="chip-remove"
      data-chip-remove={what}
      transform={`translate(${x} ${y})`}
      pointerEvents="all"
      role="button"
      aria-label={label}
    >
      <circle r={r} fill="#ffffff" stroke="#c5c5ce" />
      <path
        d={`M${-r / 2.6} ${-r / 2.6}L${r / 2.6} ${r / 2.6}M${r / 2.6} ${-r / 2.6}L${-r / 2.6} ${r / 2.6}`}
        stroke="#52525b"
        strokeWidth={r / 4}
        strokeLinecap="round"
      />
    </g>
  );
}

/** Estimate pill (top right) and person chip (top left, beside any marker emoji) on a sticky note. */
export function NoteChips({ item, selected }: { item: Item; selected: boolean }) {
  if (!item.estimate && !item.assignee) return null;
  const size = Math.max(10, Math.min(16, item.w * 0.065)),
    chipH = size * 1.8,
    pad = 6;
  const label = item.estimate ? estimateLabel(item.estimate) : '',
    estW = size * (1.4 + [...label].length * 0.68);
  const maxName = Math.max(3, Math.floor((item.w * 0.55) / (size * 0.62))),
    name = item.assignee ?? '',
    shown = name.length > maxName ? name.slice(0, maxName - 1) + '…' : name,
    nameX = item.emoji ? Math.max(22, Math.min(44, Math.min(item.w, item.h) * 0.16)) * 0.7 + pad : pad,
    nameW = chipH + size * (0.5 + shown.length * 0.58);
  return (
    <g className="note-chips" pointerEvents="none">
      {item.estimate && (
        <g transform={`translate(${item.w - estW - pad} ${pad})`} role="img" aria-label={`Estimate ${label}`}>
          <rect width={estW} height={chipH} rx={chipH / 2} fill="#ffffff" fillOpacity={0.92} stroke="#d4d4da" />
          <text
            x={estW / 2}
            y={chipH / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={size}
            fontWeight={700}
            fontFamily="Arial"
            fill="#25252a"
          >
            {label}
          </text>
          {selected && <RemoveMark x={estW} y={0} r={size * 0.55} what="estimate" label="Remove estimate" />}
        </g>
      )}
      {item.assignee && (
        <g transform={`translate(${nameX} ${pad})`} role="img" aria-label={`Assigned to ${name}`}>
          <rect width={nameW} height={chipH} rx={chipH / 2} fill="#ffffff" fillOpacity={0.92} stroke="#d4d4da" />
          <circle cx={chipH / 2} cy={chipH / 2} r={chipH / 2 - 2} fill={colorFor(name)} />
          <text
            x={chipH / 2}
            y={chipH / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={size * 0.62}
            fontWeight={700}
            fontFamily="Arial"
            fill="#ffffff"
          >
            {initials(name)}
          </text>
          <text
            x={chipH + size * 0.25}
            y={chipH / 2}
            dominantBaseline="central"
            fontSize={size * 0.85}
            fontFamily="Arial"
            fill="#25252a"
          >
            {shown}
          </text>
          {selected && <RemoveMark x={nameW} y={0} r={size * 0.55} what="assignee" label={`Unassign ${name}`} />}
        </g>
      )}
    </g>
  );
}

/** Placed voting dots: one dot per pile with its count, above the object (below a frame, whose title is above). */
export function DotBadges({ item }: { item: Item }) {
  if (!item.dots?.length) return null;
  const r = 9,
    y = item.type === 'frame' ? item.h + r + 6 : -r - 6;
  return (
    <g className="dot-badges">
      {item.dots.map((d, k) => (
        <g
          key={d.pile}
          className="chip-remove"
          data-chip-remove={`dot:${d.pile}`}
          transform={`translate(${r + k * (2 * r + 4)} ${y})`}
          pointerEvents="all"
          role="button"
          aria-label={`${d.n} ${d.n === 1 ? 'dot' : 'dots'}; click to return one`}
        >
          <title>{`${d.n} ${d.n === 1 ? 'dot' : 'dots'}. Click to return one to its pile.`}</title>
          <circle r={r} fill={d.color} stroke="#ffffff" strokeWidth={2} />
          {d.n > 1 && (
            <text
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={10}
              fontWeight={700}
              fontFamily="Arial"
              fill="#ffffff"
            >
              {d.n}
            </text>
          )}
        </g>
      ))}
    </g>
  );
}
