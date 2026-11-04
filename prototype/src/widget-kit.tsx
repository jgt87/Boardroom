// Shared helpers for widget views: data access, one-step updates and the editor dialog shell.
import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { ImageAsset, Item } from './model';
import { decodeDataUrl, originalFileName } from './images';
import type { WidgetCtx } from './widget-types';

export const data = <T,>(i: Item) => (i.data ?? {}) as T;
export const patchItem = (ctx: WidgetCtx, id: string, change: (i: Item) => Item) =>
  ctx.update(b => ({ ...b, items: b.items.map(i => (i.id === id ? change(i) : i)) }));
export const setData = (ctx: WidgetCtx, id: string, d: Record<string, any>, extra: Partial<Item> = {}) =>
  patchItem(ctx, id, i => ({ ...i, ...extra, data: d }));
export const stop = (e: React.SyntheticEvent) => e.stopPropagation();
/** Download a blob as a file. */
export function saveBlobFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/** Download the stored file of an image, video or PDF object under its original name (gap b3-4). */
export function saveAssetFile(asset: ImageAsset, fallback: string) {
  const { mime, bytes } = decodeDataUrl(asset.data);
  saveBlobFile(new Blob([bytes as BlobPart], { type: mime || asset.mime }), originalFileName(asset, fallback));
}
/** Ask for one local file; resolves null when the chooser is dismissed without a choice. */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.hidden = true;
    input.onchange = () => {
      resolve(input.files?.[0] ?? null);
      input.remove();
    };
    input.oncancel = () => {
      resolve(null);
      input.remove();
    };
    document.body.append(input);
    input.click();
  });
}
/** Download text as a file (spreadsheet and other exports from widget actions). */
export function saveText(text: string, name: string, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type })),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Shared focus dialog in the existing format-editor vocabulary. */
export function Dialog({
  title,
  hint,
  onClose,
  onApply,
  applyDisabled,
  error,
  wide,
  children,
}: {
  title: string;
  hint?: string;
  onClose: () => void;
  onApply: () => void;
  applyDisabled?: boolean;
  error?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prior = document.activeElement as HTMLElement;
    (
      box.current?.querySelector<HTMLElement>('input,textarea,select,[tabindex="0"]') ??
      box.current?.querySelector<HTMLElement>('button')
    )?.focus();
    return () => {
      if (prior?.isConnected) prior.focus();
    };
  }, []);
  return (
    <div
      className="format-overlay"
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Escape') onClose();
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !applyDisabled) {
          e.preventDefault();
          onApply();
        }
      }}
      onPointerDown={stop}
    >
      <div
        ref={box}
        className={`format-editor widget-editor ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <div>
            <h2>{title}</h2>
            {hint && <p>{hint}</p>}
          </div>
          <button className="icon-button" aria-label={`Cancel ${title.toLowerCase()}`} onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <div className="widget-editor-body">{children}</div>
        {error && (
          <p className="format-error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <span>Ctrl+Enter applies · Esc cancels</span>
          <button onClick={onClose}>Cancel</button>
          <button className="primary" disabled={applyDisabled} onClick={onApply}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
