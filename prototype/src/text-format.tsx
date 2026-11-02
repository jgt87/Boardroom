import React, { useLayoutEffect, useRef, useState } from 'react';
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
} from 'lucide-react';
import type { Item, TextFormat } from './model';
import { fitText, wrappedLineCount } from './text-layout';
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
    height = Math.max(8, item.h - 24);
  measuring ??= document.createElement('canvas').getContext('2d');
  const measure = (text: string, size: number) => {
    if (!measuring) return text.length * size * 0.6;
    measuring.font = `${f.italic ? 'italic ' : ''}${f.bold ? 'bold ' : ''}${size}px ${f.fontFamily ?? 'Arial'}`;
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
    fontFamily: f.fontFamily ?? 'Arial',
    fontWeight: f.bold ? 700 : 400,
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
export function CanvasTextEditor({ item, onCommit }: { item: Item; onCommit: (text: string) => void }) {
  const [text, setText] = useState(item.text),
    live = { ...item, text },
    layout = textLayout(live),
    sticky = item.type === 'note';
  const editor = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = editor.current;
    if (!el || !sticky) return;
    const auto = item.format?.fontSize === undefined || item.format.fontSize === 'auto',
      available = Math.max(1, item.h - 26);
    el.style.height = '0px';
    el.style.paddingTop = '0px';
    el.style.paddingBottom = '0px';
    if (auto) {
      let low = 1,
        high = Math.min(512, available / 1.4);
      for (let i = 0; i < 11; i++) {
        const size = (low + high) / 2;
        el.style.fontSize = `${size}px`;
        if (el.scrollHeight <= available) low = size;
        else high = size;
      }
      el.style.fontSize = `${Math.floor(low * 10) / 10}px`;
    }
    const natural = el.scrollHeight;
    el.style.height = '100%';
    el.style.paddingTop = `${Math.max(4, item.format?.valign === 'top' ? 4 : item.format?.valign === 'bottom' ? item.h - 20 - natural : (item.h - 16 - natural) / 2)}px`;
    el.style.paddingBottom = '4px';
  }, [text, item.w, item.h, item.format, sticky]);
  return (
    <textarea
      ref={editor}
      aria-label="Edit object text"
      className={`object-editor ${sticky ? 'sticky-editor' : ''}`}
      style={{
        ...formatStyle(live),
        ...(sticky
          ? { background: item.fill, paddingTop: Math.max(4, (item.h - 16 - layout.height) / 2), paddingBottom: 4 }
          : {}),
        lineHeight: 1.4,
      }}
      value={text}
      autoFocus
      maxLength={6000}
      onFocus={e => e.currentTarget.select()}
      onPointerDown={e => e.stopPropagation()}
      onChange={e => setText(e.target.value)}
      onBlur={() => onCommit(text)}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) e.currentTarget.blur();
      }}
    />
  );
}
export function formattedText(item: Item) {
  return !item.format?.list || item.format.list === 'none'
    ? item.text
    : item.text
        .split('\n')
        .map((line, index) => `${item.format!.list === 'bullet' ? '•' : `${index + 1}.`} ${line}`)
        .join('\n');
}
export function TextControls({ item, onChange }: { item: Item; onChange: (f: TextFormat) => void }) {
  const f = item.format ?? {},
    set = (change: TextFormat) => onChange({ ...f, ...change });
  return (
    <div className="text-controls" aria-label="Text formatting">
      <select
        aria-label="Font family"
        style={{ fontFamily: f.fontFamily ?? 'Arial' }}
        value={f.fontFamily ?? 'Arial'}
        onChange={e => set({ fontFamily: e.target.value as TextFormat['fontFamily'] })}
      >
        <option style={{ fontFamily: 'Arial' }}>Arial</option>
        <option style={{ fontFamily: 'Georgia' }}>Georgia</option>
        <option value="monospace" style={{ fontFamily: 'monospace' }}>
          Monospace
        </option>
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
      {item.type === 'note' && (
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
      ].map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          className={`icon-button ${f[key as 'bold'] ? 'active' : ''}`}
          aria-label={label}
          title={label}
          aria-pressed={!!f[key as 'bold']}
          onClick={() => set({ [key]: !f[key as 'bold'] })}
        >
          <Icon size={17} />
        </button>
      ))}
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
/** Text body with optional highlight behind each line. */
export function TextBody({ item }: { item: Item }) {
  const text = formattedText(item),
    h = item.format?.highlight;
  return h ? (
    <span style={{ background: h, boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone', padding: '0 2px' }}>
      {text}
    </span>
  ) : (
    <>{text}</>
  );
}
