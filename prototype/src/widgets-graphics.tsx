// Divider, stamp, icon and QR code views and editors (items 27-29).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Item } from './model';
import type { WidgetCtx } from './widget-types';
import { stampKinds } from './specs-basic';
import type { StampKind } from './specs-basic';
import { qrMatrix, qrPath, QR_MAX } from './qr';
import { Dialog, data, setData } from './widget-kit';
import { BrandSwatches } from './brand-kit-panel';
import { ColorMenu } from './color-menu';
import { EmojiPicker } from './emoji-picker';
import { isValidEmojiValue } from './emoji-data';

type StampData = { stamp: StampKind | 'emoji'; emoji?: string };
const EMOJI_STAMP_FILL = '#fff4dc';
/**
 * Stamp data for a tool-rail choice: `emoji:<emoji>` or a built-in sticker kind. Returns null for
 * anything else, so a stale or malformed choice falls back to the default stamp.
 */
export function stampChoice(choice: string): { data: StampData; fill: string } | null {
  if (choice.startsWith('emoji:')) {
    const emoji = choice.slice(6);
    return isValidEmojiValue(emoji) ? { data: { stamp: 'emoji', emoji }, fill: EMOJI_STAMP_FILL } : null;
  }
  return (stampKinds as readonly string[]).includes(choice)
    ? { data: { stamp: choice as StampKind }, fill: stampColors[choice as StampKind] }
    : null;
}

// ---- Divider and stamp (27) ------------------------------------------------------------------
export function DividerRender({ item }: { item: Item }) {
  const d = data<{ orientation: string; style: string; weight: number }>(item),
    h = d.orientation === 'horizontal';
  const dash =
    d.style === 'dashed'
      ? `${d.weight * 4} ${d.weight * 2.5}`
      : d.style === 'dotted'
        ? `0 ${d.weight * 2.5}`
        : undefined;
  return (
    <>
      <rect width={item.w} height={item.h} fill="transparent" />
      <line
        x1={h ? 0 : item.w / 2}
        y1={h ? item.h / 2 : 0}
        x2={h ? item.w : item.w / 2}
        y2={h ? item.h / 2 : item.h}
        stroke={item.fill}
        strokeWidth={d.weight}
        strokeDasharray={dash}
        strokeLinecap={d.style === 'dotted' ? 'round' : 'butt'}
      />
    </>
  );
}
export const stampLabels: Record<StampKind, string> = {
  check: 'Check',
  cross: 'Cross',
  star: 'Star',
  thumbsup: 'Thumbs up',
  question: 'Question',
  heart: 'Heart',
  flag: 'Flag',
  warning: 'Warning',
};
export const stampColors: Record<StampKind, string> = {
  check: '#2c9f5b',
  cross: '#d03a45',
  star: '#e2a01b',
  thumbsup: '#4262ff',
  question: '#7a52cc',
  heart: '#e0457b',
  flag: '#e2701b',
  warning: '#d48a00',
};
function StampGlyph({ kind }: { kind: StampKind }) {
  const s = {
    fill: 'none',
    stroke: '#fff',
    strokeWidth: 7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (kind) {
    case 'check':
      return <path d="M30 52 L44 66 L71 36" {...s} />;
    case 'cross':
      return <path d="M34 34 L66 66 M66 34 L34 66" {...s} />;
    case 'star':
      return (
        <path d="M50 24 L57.6 41 L76 42.8 L62 55 L66.2 73 L50 63.5 L33.8 73 L38 55 L24 42.8 L42.4 41Z" fill="#fff" />
      );
    case 'thumbsup':
      return (
        <path
          d="M30 48 h9 v24 h-9z M42 72 V48 l10 -18 c4 0 6 3 5 8 l-3 9 h15 c4 0 6 3 5 7 l-4 14 c-1 3 -3 4 -6 4z"
          fill="#fff"
        />
      );
    case 'question':
      return (
        <>
          <path d="M38 40 c0 -9 6 -14 13 -14 c7 0 13 5 13 12 c0 10 -13 11 -13 21" {...s} />
          <circle cx="51" cy="72" r="4.5" fill="#fff" />
        </>
      );
    case 'heart':
      return (
        <path d="M50 74 C24 57 26 33 40 31 C46 30 49 34 50 38 C51 34 54 30 60 31 C74 33 76 57 50 74Z" fill="#fff" />
      );
    case 'flag':
      return <path d="M35 76 V26 M35 28 H68 L60 39 L68 50 H35" {...s} strokeWidth={6} />;
    case 'warning':
      return (
        <>
          <path d="M50 28 V56" {...s} />
          <circle cx="50" cy="70" r="4.5" fill="#fff" />
        </>
      );
  }
}
/** Counter badge on a sticker that was added to more than once (gap D13). */
function CountBadge({ count }: { count?: number }) {
  if (!count || count < 2) return null;
  return (
    <g>
      <circle cx="84" cy="16" r="15" fill="#25252a" stroke="#ffffff" strokeWidth="3" />
      <text
        x="84"
        y="17"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={count > 99 ? 12 : 16}
        fill="#ffffff"
        fontFamily="Arial"
        fontWeight="700"
      >
        {count}
      </text>
    </g>
  );
}
export function StampRender({ item }: { item: Item }) {
  const d = data<StampData & { count?: number }>(item);
  if (d.stamp === 'emoji')
    return (
      <svg
        width={item.w}
        height={item.h}
        viewBox="0 0 100 100"
        role="img"
        aria-label={`${d.emoji ?? ''} stamp${d.count && d.count > 1 ? `, ${d.count}` : ''}`}
      >
        <circle cx="50" cy="50" r="46" fill={item.fill} stroke="#ffffff" strokeWidth="4" />
        <text
          x="50"
          y="53"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="56"
          fontFamily="'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',sans-serif"
        >
          {d.emoji}
        </text>
        <CountBadge count={d.count} />
      </svg>
    );
  const kind = d.stamp;
  return (
    <svg
      width={item.w}
      height={item.h}
      viewBox="0 0 100 100"
      role="img"
      aria-label={`${stampLabels[kind]} stamp${d.count && d.count > 1 ? `, ${d.count}` : ''}`}
    >
      <circle cx="50" cy="50" r="46" fill={item.fill} stroke="#ffffff" strokeWidth="4" />
      <StampGlyph kind={kind} />
      <CountBadge count={d.count} />
    </svg>
  );
}
/** Built-in sticker choices for the tool-rail emoji panel. */
export function StickerChoices({ onChoose }: { onChoose: (kind: StampKind) => void }) {
  return (
    <div className="rail-stickers" role="group" aria-label="Stickers">
      {stampKinds.map(k => (
        <button
          key={k}
          type="button"
          aria-label={`${stampLabels[k]} sticker`}
          title={stampLabels[k]}
          onClick={() => onChoose(k)}
        >
          <svg width="30" height="30" viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r="46" fill={stampColors[k]} />
            <StampGlyph kind={k} />
          </svg>
        </button>
      ))}
    </div>
  );
}
export function StampEditor({ item, ctx, onClose }: { item: Item; ctx: WidgetCtx; onClose: () => void }) {
  const initial = data<StampData>(item);
  const [kind, setKind] = useState<StampKind | 'emoji'>(initial.stamp),
    [emoji, setEmoji] = useState<string | undefined>(initial.emoji),
    [picking, setPicking] = useState(false);
  return (
    <Dialog
      title="Stamp"
      hint="Arrow keys move between stamps."
      onClose={onClose}
      onApply={() => {
        if (kind === 'emoji' && emoji)
          setData(
            ctx,
            item.id,
            { stamp: 'emoji', emoji },
            { fill: initial.stamp === 'emoji' ? item.fill : EMOJI_STAMP_FILL },
          );
        else if (kind !== 'emoji') setData(ctx, item.id, { stamp: kind }, { fill: stampColors[kind] });
        onClose();
      }}
    >
      <div
        className="w-stamp-grid"
        role="radiogroup"
        aria-label="Stamp"
        onKeyDown={e => {
          const i = Math.max(0, stampKinds.indexOf(kind as StampKind)),
            step = { ArrowRight: 1, ArrowDown: 4, ArrowLeft: -1, ArrowUp: -4 }[e.key];
          if (step) {
            e.preventDefault();
            const n = stampKinds[(i + step + stampKinds.length) % stampKinds.length];
            setKind(n);
            (e.currentTarget.querySelector(`[data-stamp="${n}"]`) as HTMLElement)?.focus();
          }
        }}
      >
        {stampKinds.map(k => (
          <button
            key={k}
            data-stamp={k}
            role="radio"
            aria-checked={k === kind}
            tabIndex={k === kind ? 0 : -1}
            className={k === kind ? 'active' : ''}
            onClick={() => setKind(k)}
          >
            <svg width="44" height="44" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="46" fill={stampColors[k]} />
              <StampGlyph kind={k} />
            </svg>
            <span>{stampLabels[k]}</span>
          </button>
        ))}
      </div>
      <div className="w-stamp-emoji-choice">
        <button
          type="button"
          aria-pressed={kind === 'emoji'}
          aria-expanded={picking}
          className={kind === 'emoji' ? 'active' : ''}
          onClick={() => setPicking(p => !p)}
        >
          Emoji…
        </button>
        {kind === 'emoji' && emoji && (
          <span className="w-stamp-emoji-preview" role="img" aria-label={`Chosen emoji ${emoji}`}>
            {emoji}
          </span>
        )}
      </div>
      {picking && (
        <EmojiPicker
          title="Stamp emoji"
          current={kind === 'emoji' ? emoji : undefined}
          allowRemove={false}
          note={null}
          onChoose={e => {
            if (e) {
              setEmoji(e);
              setKind('emoji');
            }
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </Dialog>
  );
}

// ---- Icon (28) -------------------------------------------------------------------------------
type IconMap = Record<
  string,
  React.ComponentType<{ size?: number; color?: string; width?: number; height?: number; strokeWidth?: number }>
>;
let iconCache: IconMap | null = null,
  iconPromise: Promise<IconMap> | null = null;
function useIcons(): IconMap | null {
  const [icons, setIcons] = useState<IconMap | null>(iconCache);
  useEffect(() => {
    if (iconCache) return;
    iconPromise ??= import('lucide-react').then(m => (iconCache = m.icons as unknown as IconMap));
    let live = true;
    iconPromise.then(i => {
      if (live) setIcons(i);
    });
    return () => {
      live = false;
    };
  }, []);
  return icons;
}
export function IconRender({ item }: { item: Item }) {
  const icons = useIcons(),
    Icon = icons?.[data<{ name: string }>(item).name];
  return (
    <>
      <rect width={item.w} height={item.h} fill="transparent" />
      {Icon ? (
        <Icon width={item.w} height={item.h} color={item.fill} strokeWidth={1.75} />
      ) : (
        <rect
          x={item.w * 0.2}
          y={item.h * 0.2}
          width={item.w * 0.6}
          height={item.h * 0.6}
          rx="6"
          fill="none"
          stroke="#c5c5ce"
          strokeDasharray="4 3"
        />
      )}
    </>
  );
}
export function IconEditor({ item, ctx, onClose }: { item: Item; ctx: WidgetCtx; onClose: () => void }) {
  const icons = useIcons(),
    [query, setQuery] = useState(''),
    [name, setName] = useState(data<{ name: string }>(item).name),
    [color, setColor] = useState(item.fill),
    list = useRef<HTMLDivElement>(null);
  const names = useMemo(() => {
    if (!icons) return [];
    const q = query
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '');
    return Object.keys(icons)
      .filter(n => !q || n.toLowerCase().includes(q))
      .slice(0, 240);
  }, [icons, query]);
  const move = (e: React.KeyboardEvent) => {
    const cols = 8,
      step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
    if (!step || !names.length) return;
    e.preventDefault();
    const i = Math.max(0, Math.min(names.length - 1, names.indexOf(name) + step));
    setName(names[i]);
    list.current?.querySelector<HTMLElement>(`[data-icon="${names[i]}"]`)?.focus();
  };
  return (
    <Dialog
      wide
      title="Icons"
      hint="Search the bundled icon set; arrow keys move, Enter applies."
      onClose={onClose}
      onApply={() => {
        setData(ctx, item.id, { name }, { fill: color });
        onClose();
      }}
      applyDisabled={!icons?.[name]}
    >
      <div className="w-icon-tools">
        <input
          aria-label="Search icons"
          placeholder="Search icons"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'ArrowDown' && names.length) {
              e.preventDefault();
              setName(names[0]);
              list.current?.querySelector<HTMLElement>('button')?.focus();
            }
          }}
        />
        <span className="w-inline">
          Colour
          <ColorMenu label="Icon colour" value={color} onPick={setColor} />
        </span>
        <BrandSwatches label="Brand colours for icon" value={color} onPick={setColor} />
        <span>{icons ? `${names.length}${names.length === 240 ? '+' : ''} icons` : 'Loading icons…'}</span>
      </div>
      <div ref={list} className="w-icon-grid" role="listbox" aria-label="Icons" onKeyDown={move}>
        {icons &&
          names.map(n => {
            const Icon = icons[n];
            return (
              <button
                key={n}
                data-icon={n}
                role="option"
                aria-selected={n === name}
                aria-label={n.replace(/([a-z])([A-Z0-9])/g, '$1 $2')}
                title={n}
                tabIndex={n === name ? 0 : -1}
                className={n === name ? 'active' : ''}
                onClick={() => setName(n)}
              >
                <Icon size={22} color={color} />
              </button>
            );
          })}
        {icons && !names.length && <p className="format-hint">No icons match “{query}”.</p>}
      </div>
    </Dialog>
  );
}

// ---- QR (29) ---------------------------------------------------------------------------------
export function QrRender({ item }: { item: Item }) {
  const d = data<{ color: string; quiet: number }>(item);
  let matrix: boolean[][] | null = null;
  try {
    matrix = qrMatrix(item.text);
  } catch {
    /* invalid content shows a placeholder */
  }
  const n = (matrix?.length ?? 21) + d.quiet * 2;
  return (
    <svg
      width={item.w}
      height={item.h}
      viewBox={`0 0 ${n} ${n}`}
      preserveAspectRatio="xMidYMid meet"
      shapeRendering="crispEdges"
      role="img"
      aria-label={`QR code: ${item.text}`}
    >
      <rect width={n} height={n} fill={item.fill} />
      {matrix ? (
        <path d={qrPath(matrix, d.quiet)} fill={d.color} />
      ) : (
        <text x={n / 2} y={n / 2} fontSize="3" textAnchor="middle" fill="#ad2532">
          Invalid
        </text>
      )}
    </svg>
  );
}
export function QrEditor({ item, ctx, onClose }: { item: Item; ctx: WidgetCtx; onClose: () => void }) {
  const d = data<{ color: string; quiet: number }>(item),
    [text, setText] = useState(item.text),
    [color, setColor] = useState(d.color),
    [bg, setBg] = useState(item.fill),
    [quiet, setQuiet] = useState(d.quiet);
  let error = '';
  try {
    qrMatrix(text);
  } catch (e) {
    error = (e as Error).message;
  }
  return (
    <Dialog
      title="QR code"
      hint={`Up to ${QR_MAX.toLocaleString('en-US')} characters. Keep strong contrast so it scans.`}
      onClose={onClose}
      onApply={() => {
        if (!error) {
          setData(ctx, item.id, { color, quiet }, { text, fill: bg });
          onClose();
        }
      }}
      applyDisabled={!!error}
      error={error}
    >
      <div className="w-form">
        <label className="span2">
          Link or text
          <textarea aria-label="QR content" value={text} onChange={e => setText(e.target.value)} />
          <small>
            {text.length.toLocaleString('en-US')} / {QR_MAX.toLocaleString('en-US')}
          </small>
        </label>
        <span>
          Code colour
          <ColorMenu label="QR colour" value={color} onPick={setColor} />
        </span>
        <BrandSwatches label="Brand colours for code" value={color} onPick={setColor} />
        <span>
          Background
          <ColorMenu label="QR background" value={bg} onPick={setBg} />
        </span>
        <BrandSwatches label="Brand colours for background" value={bg} onPick={setBg} />
        <label>
          Quiet zone
          <select aria-label="Quiet zone" value={quiet} onChange={e => setQuiet(Number(e.target.value))}>
            {[0, 1, 2, 4, 6, 8].map(q => (
              <option key={q} value={q}>
                {q} modules
              </option>
            ))}
          </select>
        </label>
        {!error && (
          <div className="w-qr-preview">
            <QrRender item={{ ...item, w: 140, h: 140, text, fill: bg, data: { color, quiet } }} />
          </div>
        )}
      </div>
    </Dialog>
  );
}
