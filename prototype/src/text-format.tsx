import React, { useState } from 'react';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  ListOrdered,
  Highlighter,
  PaintBucket,
  MoveVertical,
  Ellipsis,
} from 'lucide-react';
import type { Item, TextFormat } from './model';
import { fontStack } from './model';
import { useBrandKit } from './brand-kit-panel';
import { fontsBrandFirst } from './brand-kit';
import { fitText, wrappedLineCount } from './text-layout';
import { activeSpans, lineRuns, runCss } from './rich-text';
import type { Run, TextSpan } from './rich-text';
let measuring: CanvasRenderingContext2D | null = null;
const layoutCache = new Map<string, { size: number; lines: number; height: number }>();
/** Cached text layout: measuring with canvas is expensive and boards re-render often. */
export function textLayout(item: Item) {
  const key = `${item.type}|${item.w}|${item.h}|${JSON.stringify(item.format ?? null)}|${item.text}`,
    hit = layoutCache.get(key);
  if (hit) return hit;
  const result = measureLayout(item);
  if (layoutCache.size > 6000) layoutCache.clear();
  layoutCache.set(key, result);
  return result;
}
function measureLayout(item: Item) {
  const f = item.format ?? {},
    width = Math.max(8, item.w - 24),
    height = Math.max(8, item.h - 24 - 2 * Math.abs(f.baselineOffsetY ?? 0));
  measuring ??= document.createElement('canvas').getContext('2d');
  const measure = (text: string, size: number) => {
    if (!measuring) return text.length * size * 0.6;
    measuring.font = `${f.italic ? 'italic ' : ''}${f.fontWeight ?? (f.bold ? 700 : 400)} ${size}px ${fontStack(f.fontFamily)}`;
    return measuring.measureText(text).width;
  };
  const text = formattedText(item),
    auto = f.fontSize === 'auto' || (item.type === 'note' && f.fontSize === undefined);
  if (auto) return fitText(text, width, height, measure);
  const size = typeof f.fontSize === 'number' ? f.fontSize : item.type === 'text' ? 28 : 22,
    lines = wrappedLineCount(text, width, size, measure);
  return { size, lines, height: lines * size * 1.4 };
}
export function formatStyle(item: Item): React.CSSProperties {
  const f = item.format ?? {};
  return {
    fontSize: textLayout(item).size,
    fontFamily: fontStack(f.fontFamily),
    fontWeight: f.fontWeight ?? (f.bold ? 700 : 400),
    fontStyle: f.italic ? 'italic' : 'normal',
    textDecoration:
      [f.underline ? 'underline' : '', f.strike ? 'line-through' : ''].filter(Boolean).join(' ') || 'none',
    ...(item.type === 'text' && f.background ? { background: f.background, borderRadius: 4, padding: '4px 8px' } : {}),
    textAlign: f.align ?? 'center',
    justifyContent: f.align === 'left' ? 'flex-start' : f.align === 'right' ? 'flex-end' : 'center',
    alignItems:
      (item.type === 'text' && !f.valign) || f.valign === 'top'
        ? 'flex-start'
        : f.valign === 'bottom'
          ? 'flex-end'
          : 'center',
  };
}
export function formattedText(item: Item) {
  return !item.format?.list || item.format.list === 'none'
    ? item.text
    : item.text
        .split('\n')
        .map((line, index) => `${item.format!.list === 'bullet' ? '•' : `${index + 1}.`} ${line}`)
        .join('\n');
}
export function TextControls({
  item,
  onChange,
  compact = false,
}: {
  item: Item;
  onChange: (f: TextFormat) => void;
  /** One-row toolbar (item 114): font, size and bold, with the rest behind "More text options". */
  compact?: boolean;
}) {
  const f = item.format ?? {},
    set = (change: TextFormat) => onChange({ ...f, ...change });
  const brandKit = useBrandKit();
  const [expanded, setExpanded] = useState(false),
    full = !compact || expanded;
  return (
    <div className={`text-controls ${compact ? 'compact' : ''}`} aria-label="Text formatting">
      <select
        aria-label="Font family"
        style={{ fontFamily: fontStack(f.fontFamily) }}
        value={f.fontFamily ?? 'Arial'}
        onChange={e => set({ fontFamily: e.target.value as TextFormat['fontFamily'] })}
      >
        {fontsBrandFirst(brandKit).map(ff => (
          <option key={ff} value={ff} style={{ fontFamily: fontStack(ff) }}>
            {ff === 'monospace' ? 'Monospace' : ff}
          </option>
        ))}
      </select>
      <select
        aria-label="Font size"
        style={{ fontFamily: f.fontFamily ?? 'Arial' }}
        value={f.fontSize ?? (item.type === 'note' ? 'auto' : item.type === 'text' ? 28 : 22)}
        onChange={e => set({ fontSize: e.target.value === 'auto' ? 'auto' : Number(e.target.value) })}
      >
        <option value="auto">Auto</option>
        {[
          ...new Set([
            12,
            14,
            16,
            18,
            20,
            22,
            24,
            28,
            32,
            40,
            48,
            64,
            typeof f.fontSize === 'number' ? f.fontSize : item.type === 'text' ? 28 : 22,
          ]),
        ]
          .sort((a, b) => a - b)
          .map(n => (
            <option key={n}>{n}</option>
          ))}
      </select>
      <span className="divider" />
      {full && item.type === 'note' && (
        <select
          aria-label="Vertical text alignment"
          value={f.valign ?? 'middle'}
          onChange={e => set({ valign: e.target.value as TextFormat['valign'] })}
        >
          <option value="top">Top</option>
          <option value="middle">Middle</option>
          <option value="bottom">Bottom</option>
        </select>
      )}
      {[
        { key: 'bold', label: 'Bold', icon: Bold },
        { key: 'italic', label: 'Italic', icon: Italic },
        { key: 'underline', label: 'Underline', icon: Underline },
        { key: 'strike', label: 'Strikethrough', icon: Strikethrough },
      ]
        .filter(({ key }) => full || key === 'bold')
        .map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            className={`icon-button ${(key === 'bold' ? (f.fontWeight ?? (f.bold ? 700 : 400)) >= 600 : f[key as 'bold']) ? 'active' : ''}`}
            aria-label={label}
            title={label}
            aria-pressed={key === 'bold' ? (f.fontWeight ?? (f.bold ? 700 : 400)) >= 600 : !!f[key as 'bold']}
            onClick={() =>
              key === 'bold'
                ? set({
                    bold: (f.fontWeight ?? (f.bold ? 700 : 400)) < 600,
                    fontWeight: (f.fontWeight ?? (f.bold ? 700 : 400)) >= 600 ? 400 : 700,
                  })
                : set({ [key]: !f[key as 'bold'] })
            }
          >
            <Icon size={17} />
          </button>
        ))}
      {full && (
        <>
          <select
            aria-label="Font weight"
            value={f.fontWeight ?? (f.bold ? 700 : 400)}
            onChange={e => set({ fontWeight: Number(e.target.value), bold: Number(e.target.value) >= 600 })}
          >
            {Array.from(new Set([100, 200, 300, 400, 500, 600, 700, 800, 900, f.fontWeight ?? 400]))
              .sort((a, b) => a - b)
              .map(n => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
          </select>
          <span className="divider" />
          {[
            { key: 'left', icon: AlignLeft },
            { key: 'center', icon: AlignCenter },
            { key: 'right', icon: AlignRight },
          ].map(({ key, icon: Icon }) => (
            <button
              key={key}
              className={`icon-button ${(f.align ?? 'center') === key ? 'active' : ''}`}
              aria-label={`Align ${key}`}
              title={`Align ${key}`}
              aria-pressed={(f.align ?? 'center') === key}
              onClick={() => set({ align: key as TextFormat['align'] })}
            >
              <Icon size={17} />
            </button>
          ))}
          <button
            className={`icon-button ${f.list === 'bullet' ? 'active' : ''}`}
            aria-label="Bullet list"
            title="Bullet list"
            aria-pressed={f.list === 'bullet'}
            onClick={() => set({ list: f.list === 'bullet' ? 'none' : 'bullet' })}
          >
            <List size={17} />
          </button>
          <button
            className={`icon-button ${f.list === 'number' ? 'active' : ''}`}
            aria-label="Numbered list"
            title="Numbered list"
            aria-pressed={f.list === 'number'}
            onClick={() => set({ list: f.list === 'number' ? 'none' : 'number' })}
          >
            <ListOrdered size={17} />
          </button>
          <span className="divider" />
          <ColorToggle
            label="Text highlight"
            icon={<Highlighter size={16} />}
            value={f.highlight}
            fallback="#fff27a"
            onChange={highlight => onChange(withOptional(f, 'highlight', highlight))}
          />
          {item.type === 'text' && (
            <ColorToggle
              label="Text background"
              icon={<PaintBucket size={16} />}
              value={f.background}
              fallback="#edf0ff"
              onChange={background => onChange(withOptional(f, 'background', background))}
            />
          )}
          {item.type === 'text' && (
            <button
              className={`icon-button ${f.autoHeight ? 'active' : ''}`}
              aria-label="Fixed width, auto height"
              title="Fixed width, auto height: resize the width and the height follows the text"
              aria-pressed={!!f.autoHeight}
              onClick={() => onChange(withOptional(f, 'autoHeight', f.autoHeight ? undefined : true))}
            >
              <MoveVertical size={17} />
            </button>
          )}
        </>
      )}
      {compact && (
        <button
          className={`icon-button ${expanded ? 'active' : ''}`}
          aria-label="More text options"
          title="More text options"
          aria-pressed={expanded}
          onClick={() => setExpanded(v => !v)}
        >
          <Ellipsis size={17} />
        </button>
      )}
    </div>
  );
}

function withOptional<K extends keyof TextFormat>(f: TextFormat, key: K, value: TextFormat[K] | undefined): TextFormat {
  const next = { ...f };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
}
/** Toggle a colour on/off; the swatch opens a picker while on. */
function ColorToggle({
  label,
  icon,
  value,
  fallback,
  onChange,
}: {
  label: string;
  icon: React.ReactNode;
  value?: string;
  fallback: string;
  onChange: (v: string | undefined) => void;
}) {
  return (
    <span className="color-toggle">
      <button
        className={`icon-button ${value ? 'active' : ''}`}
        aria-label={label}
        title={value ? `${label} (click to remove)` : label}
        aria-pressed={!!value}
        onClick={() => onChange(value ? undefined : fallback)}
      >
        {icon}
      </button>
      {value && (
        <input type="color" aria-label={`${label} colour`} value={value} onChange={e => onChange(e.target.value)} />
      )}
    </span>
  );
}
/** One styled run of canvas text. Links open on Ctrl/Cmd+click; a plain click still selects and drags the object. */
function RunView({ run }: { run: Run }) {
  const s = run.style;
  if (s.mention)
    return (
      <span className="text-mention" style={runCss(s) as React.CSSProperties}>
        {run.text}
      </span>
    );
  let body: React.ReactNode = run.text;
  if (s.italic) body = <em>{body}</em>;
  if (s.bold) body = <strong style={{ fontWeight: 700 }}>{body}</strong>;
  // Weight and slant come from <strong> and <em>; the wrapper carries decoration and colours.
  const rest = runCss({ ...s, bold: false, italic: false }) as React.CSSProperties;
  if (s.href)
    return (
      <a
        className="text-link"
        href={s.href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        tabIndex={-1}
        draggable={false}
        title={`${s.href} (Ctrl+click to open)`}
        style={{ ...rest, pointerEvents: 'auto' }}
        onPointerDown={e => {
          if (e.ctrlKey || e.metaKey) e.stopPropagation();
        }}
        onClick={e => {
          e.preventDefault();
          if (!(e.ctrlKey || e.metaKey)) return;
          e.stopPropagation();
          window.open(s.href, '_blank', 'noopener,noreferrer');
        }}
      >
        {body}
      </a>
    );
  return Object.keys(rest).length ? <span style={rest}>{body}</span> : <>{body}</>;
}
/** Styled lines, with list markers in front of each line like `formattedText`. */
function RichLines({ item, spans }: { item: Item; spans: TextSpan[] }) {
  const list = item.format?.list;
  return (
    <>
      {lineRuns(item.text, spans).map((line, k) => (
        <React.Fragment key={k}>
          {k > 0 && '\n'}
          {list === 'bullet' ? '• ' : list === 'number' ? `${k + 1}. ` : ''}
          {line.map((run, r) => (
            <RunView key={r} run={run} />
          ))}
        </React.Fragment>
      ))}
    </>
  );
}
/** Text body with optional highlight behind each line, and per-word styles when the object has them. */
export function TextBody({ item }: { item: Item }) {
  const spans = activeSpans(item),
    text = spans.length ? <RichLines item={item} spans={spans} /> : formattedText(item),
    h = item.format?.highlight;
  return (
    <span
      style={{
        minWidth: 0,
        maxWidth: '100%',
        position: 'relative',
        top: item.format?.baselineOffsetY ?? 0,
        ...(h
          ? { background: h, boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone', padding: '0 2px' }
          : {}),
      }}
    >
      {text}
    </span>
  );
}
