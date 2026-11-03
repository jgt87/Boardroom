// Views for video, PDF, bookmark, embed, doc, wireframe and prototype-screen widgets (items 30–33, 37, 38).
// Public libraries only: pdfjs-dist (lazy) for PDFs and marked (via markdown.ts) for docs.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Play,
  Square,
  ExternalLink,
  Monitor,
  ChevronLeft,
  ChevronRight,
  Settings2,
  ArrowRight,
  Plus,
  Check,
  Search,
  Download,
  Heart,
} from 'lucide-react';
import type { Item, ImageAsset } from './model';
import type { WidgetView, WidgetCtx } from './widget-types';
import {
  normalizeHttpsUrl,
  domainOf,
  embedSource,
  providerLabels,
  isVideoProvider,
  wireframeComponents,
  buttonVariants,
  buttonIcons,
  screenDevices,
  applyScreenFormat,
  linkTarget,
} from './specs-media';
import type { ScreenDevice, EmbedProvider, ButtonVariant, ButtonIcon } from './specs-media';
import { renderMarkdown, docOutline } from './markdown';
import { CanvasDoc } from './canvas-doc';
import { exportMarkdown, markdownFileName, docTitle } from './doc-tools';
import { applyDocFormat } from './engage';
import type { DocFormat } from './engage';
import { PREVIEW_EVENT } from './prototype-preview';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import './widgets-media.css';

/** Fired by widget actions that need main.tsx to open the widget's Editor: detail { id }. */
export const OPEN_EDITOR_EVENT = 'boardroom:open-widget-editor';
const openEditor = (id: string) => window.dispatchEvent(new CustomEvent(OPEN_EDITOR_EVENT, { detail: { id } }));
const stop = (e: React.SyntheticEvent) => e.stopPropagation();
export const MAX_MEDIA_FILE = 25_000_000;

// ---- shared helpers -----------------------------------------------------------------------------
function readDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('The file could not be read.'));
    r.readAsDataURL(file);
  });
}
function dataUrlBytes(data: string): Uint8Array {
  const b64 = data.slice(data.indexOf(',') + 1),
    bin = atob(b64),
    out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function checkFile(file: File, mimes: string[], what: string) {
  if (!mimes.includes(file.type)) throw new Error(`"${file.name}" is not a supported ${what}.`);
  if (file.size > MAX_MEDIA_FILE) throw new Error(`"${file.name}" is larger than 25 MB. Choose a smaller file.`);
}
function Dialog({
  title,
  hint,
  onClose,
  onDone,
  doneLabel = 'Done',
  doneDisabled,
  children,
  wide,
}: {
  title: string;
  hint?: string;
  onClose: () => void;
  onDone: () => void;
  doneLabel?: string;
  doneDisabled?: boolean;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prior = document.activeElement as HTMLElement;
    ref.current?.querySelector<HTMLElement>('[data-autofocus],input,textarea,select,button')?.focus();
    return () => {
      if (prior?.isConnected) prior.focus();
    };
  }, []);
  return (
    <div
      className="format-overlay"
      onPointerDown={stop}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Escape') onClose();
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !doneDisabled) {
          e.preventDefault();
          onDone();
        }
      }}
    >
      <div
        ref={ref}
        className={`format-editor media-dialog ${wide ? 'wide' : ''}`}
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
        <div className="media-dialog-body">{children}</div>
        <footer>
          <span>Ctrl+Enter applies · Esc cancels</span>
          <button onClick={onClose}>Cancel</button>
          <button className="primary" disabled={doneDisabled} onClick={onDone}>
            {doneLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}
const fontFor = (h: number, min = 9, max = 18) => Math.max(min, Math.min(max, h * 0.36));
const missing = (label: string) => <div className="media-missing">{label}</div>;

// ---- PDF (item 31) ----------------------------------------------------------------------------------
let pdfjsPromise: Promise<any> | null = null;
async function pdfjs(): Promise<any> {
  pdfjsPromise ??= import('pdfjs-dist').then(m => {
    m.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    return m;
  });
  return pdfjsPromise;
}
const pdfDocs = new Map<string, Promise<any>>();
function openPdf(key: string, data: string | Uint8Array): Promise<any> {
  if (!pdfDocs.has(key)) {
    const promise = pdfjs()
      .then(
        lib =>
          lib.getDocument({
            data: typeof data === 'string' ? dataUrlBytes(data) : data.slice(),
            isEvalSupported: false,
          }).promise,
      )
      .catch(() => {
        pdfDocs.delete(key);
        throw new Error('This PDF could not be opened. It may be damaged or password-protected.');
      });
    pdfDocs.set(key, promise);
  }
  return pdfDocs.get(key)!;
}
async function renderPdfPage(doc: any, pageNumber: number, canvas: HTMLCanvasElement, width: number): Promise<number> {
  const page = await doc.getPage(pageNumber),
    base = page.getViewport({ scale: 1 }),
    viewport = page.getViewport({ scale: width / base.width });
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context, canvas, viewport }).promise;
  return base.height / base.width;
}
async function pdfThumb(doc: any, pageNumber: number): Promise<{ thumb: string; aspect: number }> {
  const canvas = document.createElement('canvas'),
    aspect = await renderPdfPage(doc, pageNumber, canvas, 480);
  return { thumb: canvas.toDataURL('image/jpeg', 0.82), aspect };
}
function PdfView({ item, ctx }: { item: Item; ctx: WidgetCtx }) {
  const d = item.data ?? {},
    asset = item.assetId ? ctx.assets[item.assetId] : undefined;
  if (!asset) return missing('PDF unavailable');
  return (
    <div className="pdf-object">
      <div className="pdf-page">
        {d.thumb ? (
          <img src={d.thumb} alt={item.alt || `Page ${d.page} of ${item.text || 'PDF'}`} draggable={false} />
        ) : (
          missing('Preview unavailable')
        )}
      </div>
      <div className="media-caption">
        <strong title={item.text}>{item.text || 'PDF document'}</strong>
        <span>
          Page {d.page} of {d.pages} · double-click to open
        </span>
      </div>
    </div>
  );
}
function PdfEditor({ item, ctx, onClose }: { item: Item; ctx: WidgetCtx; onClose: () => void }) {
  const asset = item.assetId ? ctx.assets[item.assetId] : undefined,
    pages: number = item.data?.pages ?? 1;
  const [page, setPage] = useState<number>(item.data?.page ?? 1),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!asset || !canvas.current) return;
    let live = true;
    setError('');
    openPdf(item.assetId!, asset.data)
      .then(async doc => {
        if (live && canvas.current) await renderPdfPage(doc, page, canvas.current, 760);
      })
      .catch(e => {
        if (live) setError((e as Error).message);
      });
    return () => {
      live = false;
    };
  }, [page, asset, item.assetId]);
  const go = (n: number) => setPage(Math.max(1, Math.min(pages, n)));
  const done = async () => {
    if (!asset) return onClose();
    setBusy(true);
    try {
      const doc = await openPdf(item.assetId!, asset.data),
        { thumb } = await pdfThumb(doc, page);
      ctx.update(b => ({
        ...b,
        items: b.items.map(i => (i.id === item.id ? { ...i, data: { ...i.data, page, thumb } } : i)),
      }));
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <Dialog
      title="PDF viewer"
      hint={item.text}
      onClose={onClose}
      onDone={done}
      doneLabel="Show this page"
      doneDisabled={busy || !asset}
      wide
    >
      <div
        className="pdf-viewer"
        tabIndex={0}
        data-autofocus
        aria-label={`Page ${page} of ${pages}. Arrow keys change page.`}
        onKeyDown={e => {
          const map: Record<string, number> = {
            ArrowRight: page + 1,
            PageDown: page + 1,
            ArrowLeft: page - 1,
            PageUp: page - 1,
            Home: 1,
            End: pages,
          };
          if (e.key in map) {
            e.preventDefault();
            e.stopPropagation();
            go(map[e.key]);
          }
        }}
      >
        <div className="pdf-nav">
          <button aria-label="Previous page" disabled={page <= 1} onClick={() => go(page - 1)}>
            <ChevronLeft size={16} />
            Previous
          </button>
          <span aria-live="polite">
            Page {page} of {pages}
          </span>
          <button aria-label="Next page" disabled={page >= pages} onClick={() => go(page + 1)}>
            Next
            <ChevronRight size={16} />
          </button>
        </div>
        {error ? (
          <p className="format-error" role="alert">
            {error}
          </p>
        ) : (
          <canvas ref={canvas} className="pdf-canvas" aria-label={`Rendered page ${page}`} />
        )}
      </div>
    </Dialog>
  );
}
async function loadPdf(file: File) {
  checkFile(file, ['application/pdf'], 'PDF');
  const bytes = new Uint8Array(await file.arrayBuffer()),
    data = await readDataUrl(file),
    key = `new:${crypto.randomUUID()}`;
  try {
    const doc = await openPdf(key, bytes),
      { thumb, aspect } = await pdfThumb(doc, 1),
      w = 320;
    return {
      asset: {
        mime: 'application/pdf',
        data,
        width: 1000,
        height: Math.round(1000 * aspect),
        name: file.name.slice(0, 200),
      } as ImageAsset,
      data: { page: 1, pages: doc.numPages as number, thumb },
      size: [w, Math.round(w * aspect) + 44] as [number, number],
      text: file.name.replace(/\.pdf$/i, '').slice(0, 200),
    };
  } finally {
    pdfDocs.delete(key);
  }
}

// ---- Video (item 30) ---------------------------------------------------------------------------------
function VideoView({ item, ctx }: { item: Item; ctx: WidgetCtx }) {
  const [playing, setPlaying] = useState(false),
    asset = item.assetId ? ctx.assets[item.assetId] : undefined,
    d = item.data ?? {};
  return (
    <div className="video-object">
      <div className="media-bar">
        <span title={item.text}>{item.text || 'Video'}</span>
        {playing && (
          <button className="media-mini" aria-label="Stop video" onPointerDown={stop} onClick={() => setPlaying(false)}>
            <Square size={12} />
          </button>
        )}
      </div>
      <div className="video-stage">
        {!asset ? (
          missing('Video unavailable')
        ) : playing ? (
          <video
            src={asset.data}
            controls
            autoPlay
            playsInline
            aria-label={item.alt || item.text || 'Video'}
            onPointerDown={stop}
            onKeyDown={stop}
            onDoubleClick={stop}
            onEnded={() => setPlaying(false)}
          />
        ) : (
          <>
            {d.poster ? <img src={d.poster} alt={item.alt || ''} draggable={false} /> : <div className="video-blank" />}
            <button
              className="video-play"
              aria-label={`Play ${item.text || 'video'}`}
              onPointerDown={stop}
              onDoubleClick={stop}
              onClick={() => setPlaying(true)}
            >
              <Play size={22} fill="currentColor" />
            </button>
            {d.duration ? (
              <span className="video-duration">
                {Math.floor(d.duration / 60)}:{String(Math.round(d.duration % 60)).padStart(2, '0')}
              </span>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
async function loadVideo(file: File) {
  checkFile(file, ['video/mp4', 'video/webm'], 'video. Use MP4 or WebM');
  const data = await readDataUrl(file),
    url = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error(`"${file.name}" could not be decoded by this browser.`));
      setTimeout(() => reject(new Error('The video took too long to load.')), 15000);
    });
    const vw = video.videoWidth || 640,
      vh = video.videoHeight || 360,
      duration = Number.isFinite(video.duration) ? video.duration : 0;
    let poster: string | undefined;
    try {
      // Wait for the first frame. Recorded WebM files often report an unknown duration; then the
      // poster is the first frame, because seeking to 0 may never fire 'seeked'.
      if (video.readyState < 2)
        await new Promise<void>((resolve, reject) => {
          video.onloadeddata = () => resolve();
          setTimeout(() => reject(new Error('frame')), 5000);
        });
      const at = Math.min(1, duration / 10 || 0);
      if (at > 0) {
        video.currentTime = at;
        await new Promise<void>(resolve => {
          video.onseeked = () => resolve();
          setTimeout(resolve, 3000);
        });
      }
      const scale = Math.min(1, 640 / vw),
        canvas = document.createElement('canvas');
      canvas.width = Math.round(vw * scale);
      canvas.height = Math.round(vh * scale);
      canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);
      poster = canvas.toDataURL('image/jpeg', 0.8);
    } catch {
      poster = undefined;
    }
    const w = Math.min(480, Math.max(200, vw)),
      h = Math.round((w * vh) / vw) + 28;
    return {
      asset: { mime: file.type, data, width: vw, height: vh, name: file.name.slice(0, 200) } as ImageAsset,
      data: { ...(poster ? { poster } : {}), duration: Math.round(duration * 10) / 10 },
      size: [w, h] as [number, number],
      text: file.name.replace(/\.(mp4|webm)$/i, '').slice(0, 200),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---- Bookmark and embed (item 32; video links count for item 30) ---------------------------------
function Badge({ url, size }: { url: string; size: number }) {
  const domain = domainOf(url),
    letter = (domain[0] ?? '?').toUpperCase(),
    shade = [...domain].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 360, 0);
  return (
    <span
      className="domain-badge"
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.5,
        background: `hsl(${shade} 30% 92%)`,
        color: `hsl(${shade} 35% 32%)`,
      }}
    >
      {letter}
    </span>
  );
}
function BookmarkView({ item }: { item: Item; ctx: WidgetCtx }) {
  const d = item.data ?? {},
    url: string = d.url ?? '',
    title = d.title || domainOf(url) || 'Untitled link';
  if (!url) return <div className="bookmark-object empty">{missing('Double-click to add a link')}</div>;
  return (
    <div className={`bookmark-object layout-${d.layout}`} title={url}>
      {d.layout === 'big' && (
        <div className="bookmark-hero">
          <Badge url={url} size={Math.max(28, Math.min(72, item.h * 0.22))} />
        </div>
      )}
      <div className="bookmark-body">
        {d.layout === 'small' && <Badge url={url} size={34} />}
        <div>
          <strong>{title}</strong>
          {d.description && d.layout !== 'none' && <p>{d.description}</p>}
          <small>
            <ExternalLink size={11} />
            {domainOf(url)}
          </small>
        </div>
      </div>
    </div>
  );
}
function BookmarkEditor({ item, ctx, onClose }: { item: Item; ctx: WidgetCtx; onClose: () => void }) {
  const d = item.data ?? {},
    [url, setUrl] = useState<string>(d.url ?? ''),
    [title, setTitle] = useState<string>(d.title ?? ''),
    [description, setDescription] = useState<string>(d.description ?? ''),
    [layout, setLayout] = useState<string>(d.layout ?? 'big'),
    [error, setError] = useState('');
  const done = () => {
    try {
      const href = normalizeHttpsUrl(url);
      ctx.update(b => ({
        ...b,
        items: b.items.map(i =>
          i.id === item.id
            ? {
                ...i,
                data: {
                  url: href,
                  title: title.trim().slice(0, 300),
                  description: description.trim().slice(0, 1000),
                  layout,
                },
              }
            : i,
        ),
      }));
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Dialog
      title="Link bookmark"
      hint="Details are entered by you; nothing is fetched from the site."
      onClose={onClose}
      onDone={done}
    >
      <label>
        Link
        <input
          aria-label="Bookmark link"
          value={url}
          placeholder="https://example.com/article"
          maxLength={2048}
          onChange={e => {
            setUrl(e.target.value);
            setError('');
          }}
        />
      </label>
      <label>
        Title
        <input
          aria-label="Bookmark title"
          value={title}
          placeholder="Defaults to the site name"
          maxLength={300}
          onChange={e => setTitle(e.target.value)}
        />
      </label>
      <label>
        Description
        <textarea
          aria-label="Bookmark description"
          value={description}
          maxLength={1000}
          rows={3}
          onChange={e => setDescription(e.target.value)}
        />
      </label>
      <fieldset className="media-radios">
        <legend>Layout</legend>
        {[
          ['big', 'Large preview'],
          ['small', 'Compact'],
          ['none', 'Title only'],
        ].map(([v, l]) => (
          <label key={v}>
            <input type="radio" name="bookmark-layout" checked={layout === v} onChange={() => setLayout(v)} />
            {l}
          </label>
        ))}
      </fieldset>
      {error && (
        <p className="format-error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}
function EmbedView({ item }: { item: Item; ctx: WidgetCtx }) {
  const [active, setActive] = useState(false),
    d = item.data ?? {},
    url: string = d.url ?? '';
  let src = '';
  try {
    if (url) src = embedSource(url).src;
  } catch {
    src = '';
  }
  if (!url)
    return <div className="embed-object empty">{missing('Double-click to add a video, map, design or code link')}</div>;
  if (!src) return <div className="embed-object empty">{missing('This embed link is no longer supported')}</div>;
  const label = providerLabels[d.provider as EmbedProvider] ?? 'Embed';
  return (
    <div className="embed-object">
      <div className="media-bar">
        <span>
          {label}
          {isVideoProvider(d.provider) ? ' · video link' : ''}
        </span>
        {active && (
          <button
            className="media-mini"
            aria-label="Stop embedded content"
            onPointerDown={stop}
            onClick={() => setActive(false)}
          >
            <Square size={12} />
          </button>
        )}
      </div>
      {active ? (
        <div className="embed-frame" onPointerDown={stop} onKeyDown={stop} onDoubleClick={stop}>
          <iframe
            src={src}
            title={item.alt || label}
            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
            referrerPolicy="strict-origin-when-cross-origin"
            allow="fullscreen; picture-in-picture; encrypted-media"
            loading="lazy"
          />
        </div>
      ) : (
        <div className="embed-placeholder">
          <Badge url={url} size={Math.max(28, Math.min(56, item.h * 0.18))} />
          <small>{domainOf(url)}</small>
          <button onPointerDown={stop} onDoubleClick={stop} onClick={() => setActive(true)}>
            <Play size={14} />
            Activate
          </button>
          <p>Content loads from {domainOf(url)} only after you activate it.</p>
        </div>
      )}
    </div>
  );
}
function EmbedEditor({ item, ctx, onClose }: { item: Item; ctx: WidgetCtx; onClose: () => void }) {
  const [url, setUrl] = useState<string>(item.data?.url ?? ''),
    [error, setError] = useState('');
  let detected = '';
  try {
    if (url.trim()) detected = providerLabels[embedSource(url).provider];
  } catch (e) {
    detected = '';
  }
  const done = () => {
    try {
      const s = embedSource(url);
      ctx.update(b => ({
        ...b,
        items: b.items.map(i => (i.id === item.id ? { ...i, data: { url: s.url, provider: s.provider } } : i)),
      }));
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Dialog
      title="Embed"
      hint="Supported: YouTube, Vimeo, map embed links, Figma and CodePen."
      onClose={onClose}
      onDone={done}
    >
      <label>
        Link
        <input
          aria-label="Embed link"
          value={url}
          placeholder="https://www.youtube.com/watch?v=…"
          maxLength={2048}
          onChange={e => {
            setUrl(e.target.value);
            setError('');
          }}
        />
      </label>
      <p className="format-hint" aria-live="polite">
        {url.trim()
          ? detected
            ? `Detected: ${detected}`
            : 'Not a supported embed link yet.'
          : 'Paste a link to embed.'}
      </p>
      {error && (
        <p className="format-error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}

// ---- Doc (item 33) -----------------------------------------------------------------------------------
export function DocView({ item }: { item: Item; ctx: WidgetCtx }) {
  const md: string = item.data?.markdown ?? '',
    html = useMemo(() => renderMarkdown(md.slice(0, 20000)), [md]);
  return (
    <div className="doc-object">
      <div className="doc-label">Doc</div>
      <div className="doc-content" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
const docTools: { kind: DocFormat; label: string; text: string; key?: string }[] = [
  { kind: 'bold', label: 'Bold (Ctrl+B)', text: 'B', key: 'b' },
  { kind: 'italic', label: 'Italic (Ctrl+I)', text: 'I', key: 'i' },
  { kind: 'h1', label: 'Heading 1', text: 'H1' },
  { kind: 'h2', label: 'Heading 2', text: 'H2' },
  { kind: 'h3', label: 'Heading 3', text: 'H3' },
  { kind: 'bullet', label: 'Bulleted list', text: '•' },
  { kind: 'number', label: 'Numbered list', text: '1.' },
  { kind: 'check', label: 'Checklist', text: '☐' },
  { kind: 'link', label: 'Link (Ctrl+K)', text: 'Link', key: 'k' },
  { kind: 'code', label: 'Code', text: '</>' },
  { kind: 'quote', label: 'Quote', text: '❝' },
  { kind: 'callout', label: 'Callout', text: 'ⓘ' },
];
function DocEditor({ item, ctx, onClose }: { item: Item; ctx: WidgetCtx; onClose: () => void }) {
  const [md, setMd] = useState<string>(item.data?.markdown ?? ''),
    [shown, setShown] = useState(md),
    preview = useRef<HTMLDivElement>(null),
    source = useRef<HTMLTextAreaElement>(null);
  const format = (kind: DocFormat) => {
    const t = source.current;
    if (!t) return;
    const r = applyDocFormat(t.value, t.selectionStart, t.selectionEnd, kind);
    if (r.text.length > 60000) return;
    setMd(r.text);
    requestAnimationFrame(() => {
      t.focus();
      t.setSelectionRange(r.start, r.end);
    });
  };
  useEffect(() => {
    const t = setTimeout(() => setShown(md), md.length > 8000 ? 400 : 150);
    return () => clearTimeout(t);
  }, [md]);
  const html = useMemo(() => renderMarkdown(shown), [shown]),
    outline = useMemo(() => docOutline(shown), [shown]);
  const done = () => {
    if (md.length > 60000) return;
    ctx.update(b => ({
      ...b,
      items: b.items.map(i => (i.id === item.id ? { ...i, data: { ...i.data, markdown: md } } : i)),
    }));
    onClose();
  };
  return (
    <Dialog
      title="Doc"
      hint="Markdown: # headings, - lists, - [ ] checklists, **bold**, [links](https://…)"
      onClose={onClose}
      onDone={done}
      doneDisabled={md.length > 60000}
      wide
    >
      <div className="doc-toolbar" role="toolbar" aria-label="Formatting">
        {docTools.map(t => (
          <button
            key={t.kind}
            type="button"
            className={`doc-tool doc-tool-${t.kind}`}
            aria-label={
              /^[A-Za-z0-9]/.test(t.text) && !t.label.toLowerCase().startsWith(t.text.toLowerCase())
                ? `${t.text}: ${t.label}`
                : t.label
            }
            title={t.label}
            onMouseDown={e => e.preventDefault()}
            onClick={() => format(t.kind)}
          >
            {t.text}
          </button>
        ))}
      </div>
      <div className="doc-workspace">
        <textarea
          ref={source}
          data-autofocus
          aria-label="Doc source"
          spellCheck
          value={md}
          onChange={e => setMd(e.target.value)}
          onKeyDown={e => {
            const tool =
              (e.ctrlKey || e.metaKey) && !e.altKey ? docTools.find(t => t.key === e.key.toLowerCase()) : undefined;
            if (tool) {
              e.preventDefault();
              e.stopPropagation();
              format(tool.kind);
              return;
            }
            if (e.key === 'Tab') {
              e.preventDefault();
              const t = e.currentTarget,
                s = t.selectionStart,
                v = t.value;
              const next = v.slice(0, s) + '  ' + v.slice(t.selectionEnd);
              setMd(next);
              requestAnimationFrame(() => {
                t.selectionStart = t.selectionEnd = s + 2;
              });
            }
          }}
        />
        <div className="doc-side">
          {outline.length > 0 && (
            <nav aria-label="Doc outline" className="doc-outline">
              {outline.map(h => (
                <button
                  key={h.index}
                  style={{ paddingLeft: 8 + (h.level - 1) * 12 }}
                  onClick={() =>
                    preview.current
                      ?.querySelector(`#doc-h-${h.index}`)
                      ?.scrollIntoView({ block: 'start', behavior: 'smooth' })
                  }
                >
                  {h.text || 'Untitled heading'}
                </button>
              ))}
            </nav>
          )}
          <div
            ref={preview}
            className="doc-content doc-preview"
            aria-label="Doc preview"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>
      <p className={md.length > 60000 ? 'format-error' : 'format-hint'}>
        {md.length.toLocaleString()} / 60,000 characters
      </p>
    </Dialog>
  );
}

// ---- Wireframes (item 37) and prototype preview inputs (item 38) ------------------------------------
function WireframeView({ item, ctx }: { item: Item; ctx: WidgetCtx }) {
  const d = item.data ?? {},
    p = ctx.preview,
    live = !!p,
    value = p && item.id in p.values ? p.values[item.id] : d.state,
    options: string[] = d.options ?? [],
    fs = fontFor(item.h),
    target = linkTarget(ctx.board, d.link);
  const press = (fn: () => void) =>
    live
      ? {
          onPointerDown: stop,
          onClick: (e: React.MouseEvent) => {
            e.stopPropagation();
            fn();
          },
        }
      : {};
  const follow = () => {
    if (target && p) p.go(target.id);
  };
  const label = item.text;
  switch (d.component) {
    case 'button':
      return (
        <div
          className={`wf wf-button wf-button-${d.variant ?? 'solid'} ${live && target ? 'linked' : ''}`}
          style={{ fontSize: fs }}
          role={live ? 'button' : undefined}
          {...press(follow)}
        >
          {label}
          {d.icon && <ButtonIconGlyph icon={d.icon} size={Math.round(fs * 1.1)} />}
        </div>
      );
    case 'input':
      return live ? (
        <input
          className="wf wf-input"
          style={{ fontSize: fs }}
          placeholder={label}
          value={String(value ?? '')}
          aria-label={label}
          onPointerDown={stop}
          onKeyDown={stop}
          onChange={e => p!.setValue(item.id, e.target.value.slice(0, 500))}
        />
      ) : (
        <div className="wf wf-input" style={{ fontSize: fs }}>
          <span className="wf-placeholder">{label}</span>
        </div>
      );
    case 'textarea':
      return live ? (
        <textarea
          className="wf wf-textarea"
          style={{ fontSize: Math.min(16, fs) }}
          placeholder={label}
          value={String(value ?? '')}
          aria-label={label}
          onPointerDown={stop}
          onKeyDown={stop}
          onChange={e => p!.setValue(item.id, e.target.value.slice(0, 2000))}
        />
      ) : (
        <div className="wf wf-textarea" style={{ fontSize: Math.min(16, fs) }}>
          <span className="wf-placeholder">{label}</span>
        </div>
      );
    case 'select': {
      const current = typeof value === 'string' && value ? value : label;
      return (
        <div
          className="wf wf-select"
          style={{ fontSize: fs }}
          role={live ? 'button' : undefined}
          {...press(() => {
            const i = options.indexOf(String(value));
            p!.setValue(item.id, options[(i + 1) % Math.max(1, options.length)] ?? label);
          })}
        >
          <span>{current}</span>
          <span aria-hidden="true">▾</span>
        </div>
      );
    }
    case 'toggle': {
      const on = value === true;
      return (
        <div
          className="wf wf-toggle"
          style={{ fontSize: fs }}
          role={live ? 'switch' : undefined}
          aria-checked={live ? on : undefined}
          {...press(() => p!.setValue(item.id, !on))}
        >
          <span className={`wf-switch ${on ? 'on' : ''}`}>
            <span />
          </span>
          <span>{label}</span>
        </div>
      );
    }
    case 'checkbox': {
      const on = value === true;
      return (
        <div
          className="wf wf-checkbox"
          style={{ fontSize: fs }}
          role={live ? 'checkbox' : undefined}
          aria-checked={live ? on : undefined}
          {...press(() => p!.setValue(item.id, !on))}
        >
          <span className={`wf-box ${on ? 'on' : ''}`}>{on ? '✓' : ''}</span>
          <span>{label}</span>
        </div>
      );
    }
    case 'slider': {
      const v = Math.max(0, Math.min(100, Number(value ?? 40) || 0));
      return (
        <div
          className="wf wf-slider"
          style={{ fontSize: Math.min(13, fs) }}
          tabIndex={live ? 0 : undefined}
          role={live ? 'slider' : undefined}
          aria-valuenow={live ? v : undefined}
          aria-label={label}
          onPointerDown={
            live
              ? e => {
                  e.stopPropagation();
                  const r = e.currentTarget.getBoundingClientRect();
                  p!.setValue(item.id, Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * 100));
                }
              : undefined
          }
          onKeyDown={
            live
              ? e => {
                  e.stopPropagation();
                  if (e.key === 'ArrowRight' || e.key === 'ArrowUp') p!.setValue(item.id, Math.min(100, v + 5));
                  if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') p!.setValue(item.id, Math.max(0, v - 5));
                }
              : undefined
          }
        >
          {label && <span className="wf-slider-label">{label}</span>}
          <span className="wf-track">
            <span className="wf-fill" style={{ width: `${v}%` }} />
            <span className="wf-knob" style={{ left: `${v}%` }} />
          </span>
        </div>
      );
    }
    case 'tabs': {
      const active = Number(value ?? 0) || 0;
      return (
        <div className="wf wf-tabs" style={{ fontSize: fs }}>
          {(options.length ? options : ['Tab']).map((o, i) => (
            <span key={i} className={i === active ? 'active' : ''} {...press(() => p!.setValue(item.id, i))}>
              {o}
            </span>
          ))}
        </div>
      );
    }
    case 'navbar':
      return (
        <div className="wf wf-navbar" style={{ fontSize: Math.min(15, fs) }} {...press(follow)}>
          <strong>{label}</strong>
          <span>
            {options.map((o, i) => (
              <span key={i}>{o}</span>
            ))}
          </span>
        </div>
      );
    case 'window':
      return (
        <div className="wf wf-window">
          <div className="wf-titlebar">
            <i />
            <i />
            <i />
            <span>{label}</span>
          </div>
          <div className="wf-window-body" />
        </div>
      );
    case 'card':
      return (
        <div className="wf wf-card" {...press(follow)}>
          <div className="wf-card-image">
            <svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100">
              <path
                d="M0 0 L100 100 M100 0 L0 100"
                stroke="#c5c5ce"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </div>
          <strong>{label}</strong>
          <span className="wf-line" />
          <span className="wf-line short" />
        </div>
      );
    case 'image':
      return (
        <div className="wf wf-image" {...press(follow)}>
          <svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100">
            <path
              d="M0 0 L100 100 M100 0 L0 100"
              stroke="#b4b4bd"
              strokeWidth="1.2"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {label && <span>{label}</span>}
        </div>
      );
    case 'avatar':
      return (
        <div
          className="wf wf-avatar"
          style={{ fontSize: Math.max(10, Math.min(item.w, item.h) * 0.36) }}
          {...press(follow)}
        >
          {label.slice(0, 3)}
        </div>
      );
    case 'list':
      return (
        <div
          className="wf wf-list"
          style={{ fontSize: Math.min(15, Math.max(10, (item.h / Math.max(3, options.length)) * 0.4)) }}
        >
          {(options.length ? options : [label]).map((o, i) => (
            <div key={i}>
              <span className="wf-dot" />
              {o}
            </div>
          ))}
        </div>
      );
    default:
      return missing('Unknown component');
  }
}
const buttonIconGlyphs: Record<ButtonIcon, typeof ArrowRight> = {
  arrow: ArrowRight,
  plus: Plus,
  check: Check,
  search: Search,
  download: Download,
  heart: Heart,
};
const buttonIconLabels: Record<ButtonIcon, string> = {
  arrow: 'Arrow',
  plus: 'Plus',
  check: 'Check',
  search: 'Search',
  download: 'Download',
  heart: 'Heart',
};
function ButtonIconGlyph({ icon, size }: { icon: ButtonIcon; size: number }) {
  const Glyph = buttonIconGlyphs[icon];
  return Glyph ? <Glyph size={size} aria-hidden="true" /> : null;
}
function WireframeEditor({ item, ctx, onClose }: { item: Item; ctx: WidgetCtx; onClose: () => void }) {
  const d = item.data ?? {},
    def = wireframeComponents.find(c => c.component === d.component),
    [label, setLabel] = useState(item.text),
    [options, setOptions] = useState<string>((d.options ?? []).join('\n')),
    [state, setState] = useState<any>(d.state),
    [link, setLink] = useState<string>(d.link ?? ''),
    [variant, setVariant] = useState<ButtonVariant>(d.variant ?? 'solid'),
    [icon, setIcon] = useState<ButtonIcon | ''>(d.icon ?? '');
  const screens = ctx.board.items.filter(i => i.type === 'screen'),
    hasOptions = ['select', 'tabs', 'list', 'navbar'].includes(d.component),
    linkable = ['button', 'navbar', 'card', 'image', 'avatar'].includes(d.component);
  const done = () => {
    const opts = options
        .split('\n')
        .map(o => o.trim())
        .filter(Boolean)
        .slice(0, 20)
        .map(o => o.slice(0, 100)),
      data: Record<string, any> = { component: d.component };
    if (hasOptions) data.options = opts;
    if (state !== undefined && state !== '')
      data.state =
        d.component === 'slider'
          ? Math.max(0, Math.min(100, Number(state) || 0))
          : d.component === 'tabs'
            ? Math.max(0, Math.min(opts.length - 1, Number(state) || 0))
            : state;
    if (linkable && link) data.link = link;
    if (d.component === 'button') {
      if (variant !== 'solid') data.variant = variant;
      if (icon) data.icon = icon;
    }
    ctx.update(b => ({
      ...b,
      items: b.items.map(i => (i.id === item.id ? { ...i, text: label.slice(0, 6000), data } : i)),
    }));
    onClose();
  };
  return (
    <Dialog title={`${def?.label ?? 'Wireframe'} properties`} onClose={onClose} onDone={done}>
      <label>
        Label
        <input aria-label="Component label" value={label} maxLength={500} onChange={e => setLabel(e.target.value)} />
      </label>
      {hasOptions && (
        <label>
          {d.component === 'tabs' ? 'Tabs' : d.component === 'navbar' ? 'Links' : 'Items'} (one per line)
          <textarea aria-label="Component items" rows={5} value={options} onChange={e => setOptions(e.target.value)} />
        </label>
      )}
      {d.component === 'button' && (
        <>
          <label>
            Style
            <select
              aria-label="Button style"
              value={variant}
              onChange={e => setVariant(e.target.value as ButtonVariant)}
            >
              {buttonVariants.map(v => (
                <option key={v} value={v}>
                  {v[0].toUpperCase() + v.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Icon
            <select aria-label="Button icon" value={icon} onChange={e => setIcon(e.target.value as ButtonIcon | '')}>
              <option value="">No icon</option>
              {buttonIcons.map(v => (
                <option key={v} value={v}>
                  {buttonIconLabels[v]}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      {(d.component === 'toggle' || d.component === 'checkbox') && (
        <label className="media-check">
          <input type="checkbox" checked={state === true} onChange={e => setState(e.target.checked)} />
          Initially on
        </label>
      )}
      {d.component === 'slider' && (
        <label>
          Initial value
          <input
            type="range"
            min={0}
            max={100}
            value={Number(state ?? 40)}
            onChange={e => setState(Number(e.target.value))}
          />
        </label>
      )}
      {d.component === 'tabs' && (
        <label>
          Active tab
          <select value={Number(state ?? 0)} onChange={e => setState(Number(e.target.value))}>
            {options
              .split('\n')
              .filter(o => o.trim())
              .map((o, i) => (
                <option key={i} value={i}>
                  {o}
                </option>
              ))}
          </select>
        </label>
      )}
      {linkable && (
        <label>
          When clicked in preview, go to
          <select aria-label="Link to screen" value={link} onChange={e => setLink(e.target.value)}>
            <option value="">No link</option>
            {screens.map(s => (
              <option key={s.id} value={s.id}>
                {s.text || 'Untitled screen'}
              </option>
            ))}
          </select>
        </label>
      )}
      {linkable && !screens.length && <p className="format-hint">Add a prototype screen to create links.</p>}
    </Dialog>
  );
}

// ---- Prototype screens (item 38) -----------------------------------------------------------------------
function ScreenView({ item, ctx }: { item: Item; ctx: WidgetCtx }) {
  const d = item.data ?? {},
    z = ctx.zoom || 1,
    device: ScreenDevice = d.device ?? 'phone',
    bezel = device === 'desktop' ? 0 : device === 'tablet' ? 14 : 12,
    r = device === 'phone' ? Math.min(item.w, item.h) * 0.1 : device === 'tablet' ? 26 : 6,
    current = ctx.preview?.screenId === item.id;
  return (
    <g>
      {device === 'desktop' ? (
        <>
          <rect x={-1} y={-30} width={item.w + 2} height={item.h + 31} rx={8} fill="#e9e9ee" stroke="#c5c5ce" />
          {[0, 1, 2].map(n => (
            <circle key={n} cx={14 + n * 16} cy={-15} r={5} fill="#c5c5ce" />
          ))}
          <rect x={70} y={-23} width={Math.max(40, item.w - 90)} height={16} rx={8} fill="#ffffff" />
        </>
      ) : (
        <rect
          x={-bezel}
          y={-bezel}
          width={item.w + bezel * 2}
          height={item.h + bezel * 2}
          rx={r + bezel}
          fill="#1f2129"
        />
      )}
      <rect width={item.w} height={item.h} rx={device === 'desktop' ? 0 : r} fill={d.background ?? '#ffffff'} />
      {device === 'phone' && (
        <rect
          x={item.w / 2 - Math.min(60, item.w * 0.16)}
          y={8}
          width={Math.min(120, item.w * 0.32)}
          height={Math.max(10, item.w * 0.06)}
          rx={item.w * 0.03}
          fill="#1f2129"
        />
      )}
      {!ctx.preview && (
        <text
          x={0}
          y={(device === 'desktop' ? -38 : -bezel - 10) / 1}
          fill="#52525b"
          fontSize={13 / z}
          style={{ fontFamily: 'Arial' }}
        >
          {item.text || 'Screen'} · {screenDevices.find(s => s.id === device)?.label}
          {d.orientation === 'landscape' ? ' landscape' : ''}
        </text>
      )}
      {current && (
        <rect
          width={item.w}
          height={item.h}
          rx={device === 'desktop' ? 0 : r}
          fill="none"
          stroke="#4262ff"
          strokeWidth={2 / z}
          pointerEvents="none"
        />
      )}
    </g>
  );
}
function ScreenEditor({ item, ctx, onClose }: { item: Item; ctx: WidgetCtx; onClose: () => void }) {
  const d = item.data ?? {},
    [name, setName] = useState(item.text),
    [device, setDevice] = useState<ScreenDevice>(d.device ?? 'phone'),
    [orientation, setOrientation] = useState<'portrait' | 'landscape'>(d.orientation ?? 'portrait'),
    [background, setBackground] = useState<string>(d.background ?? '#ffffff');
  const done = () => {
    ctx.update(b => {
      const next = applyScreenFormat(b, item.id, device, orientation, background);
      return { ...next, items: next.items.map(i => (i.id === item.id ? { ...i, text: name.slice(0, 200) } : i)) };
    });
    onClose();
  };
  return (
    <Dialog
      title="Prototype screen"
      hint="Contents keep their positions when the device changes."
      onClose={onClose}
      onDone={done}
    >
      <label>
        Name
        <input aria-label="Screen name" value={name} maxLength={200} onChange={e => setName(e.target.value)} />
      </label>
      <label>
        Device
        <select aria-label="Device" value={device} onChange={e => setDevice(e.target.value as ScreenDevice)}>
          {screenDevices.map(s => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="media-radios">
        <legend>Orientation</legend>
        {(['portrait', 'landscape'] as const).map(o => (
          <label key={o}>
            <input
              type="radio"
              name="screen-orientation"
              checked={orientation === o}
              onChange={() => setOrientation(o)}
            />
            {o === 'portrait' ? 'Portrait' : 'Landscape'}
          </label>
        ))}
      </fieldset>
      <label>
        Background
        <input
          type="color"
          aria-label="Screen background"
          value={background}
          onChange={e => setBackground(e.target.value)}
        />
      </label>
    </Dialog>
  );
}

const updateItem = (ctx: WidgetCtx, id: string, patch: Partial<Item>) =>
  ctx.update(b => ({ ...b, items: b.items.map(i => (i.id === id ? { ...i, ...patch } : i)) }));
export const mediaViews: WidgetView[] = [
  {
    kind: 'video',
    mode: 'html',
    interactive: true,
    Render: p => <VideoView {...p} />,
    fromFile: { accept: 'video/mp4,video/webm', load: loadVideo },
  },
  {
    kind: 'pdf',
    mode: 'html',
    Render: p => <PdfView {...p} />,
    Editor: p => <PdfEditor {...p} />,
    fromFile: { accept: 'application/pdf', load: loadPdf },
  },
  {
    kind: 'bookmark',
    mode: 'html',
    Render: p => <BookmarkView {...p} />,
    Editor: p => <BookmarkEditor {...p} />,
    actions: item =>
      item.data?.url
        ? [
            {
              label: 'Open link',
              icon: <ExternalLink size={17} />,
              run: () => {
                window.open(item.data!.url, '_blank', 'noopener,noreferrer');
              },
            },
          ]
        : [],
  },
  {
    kind: 'embed',
    mode: 'html',
    interactive: true,
    Render: p => <EmbedView {...p} />,
    Editor: p => <EmbedEditor {...p} />,
  },
  {
    kind: 'doc',
    mode: 'html',
    interactive: true,
    Render: CanvasDoc,
    Editor: p => <DocEditor {...p} />,
    actions: (item, ctx) => [
      {
        label: 'Export as Markdown',
        icon: <Download size={17} />,
        run: () => {
          const md = exportMarkdown(String(item.data?.markdown ?? '')),
            name = markdownFileName(item.text && item.text !== 'Doc' ? item.text : docTitle(md)),
            url = URL.createObjectURL(new Blob([md], { type: 'text/markdown;charset=utf-8' })),
            a = document.createElement('a');
          a.href = url;
          a.download = name;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          ctx.display(`Exported ${name}.`);
        },
      },
    ],
  },
  {
    kind: 'wireframe',
    mode: 'html',
    interactive: true,
    textEdit: true,
    Render: p => <WireframeView {...p} />,
    Editor: p => <WireframeEditor {...p} />,
    actions: (item, ctx) => [
      { label: 'Component properties', icon: <Settings2 size={17} />, run: () => openEditor(item.id) },
      ...(item.data?.component === 'button'
        ? [
            {
              label: `Button style: ${item.data?.variant ?? 'solid'} (change)`,
              run: () => {
                const now = buttonVariants.indexOf(item.data?.variant ?? 'solid'),
                  variant = buttonVariants[(now + 1) % buttonVariants.length],
                  data = { ...item.data };
                if (variant === 'solid') delete data.variant;
                else data.variant = variant;
                updateItem(ctx, item.id, { data });
              },
            },
          ]
        : []),
      ...(['toggle', 'checkbox'].includes(item.data?.component)
        ? [
            {
              label: item.data?.state === true ? 'Set initially off' : 'Set initially on',
              pressed: item.data?.state === true,
              run: () => updateItem(ctx, item.id, { data: { ...item.data, state: item.data?.state !== true } }),
            },
          ]
        : []),
    ],
  },
  {
    kind: 'screen',
    mode: 'svg',
    Render: p => <ScreenView {...p} />,
    Editor: p => <ScreenEditor {...p} />,
    actions: item => [
      {
        label: 'Preview prototype',
        icon: <Monitor size={17} />,
        run: () => window.dispatchEvent(new CustomEvent(PREVIEW_EVENT, { detail: { screenId: item.id } })),
      },
    ],
  },
];
