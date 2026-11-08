import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, FileUp, RefreshCw, Shapes, Workflow, X } from 'lucide-react';
import type { Item } from './model';
import { createItem } from './model';
import { convertDrawioWidget, drawioImportNote } from './drawio-shapes';
import type { WidgetCtx, WidgetView } from './widget-types';
import { DRAWIO_URL, DRAWIO_ORIGIN, assertDrawioXml, isDrawioSender, parseDrawioMessage } from './drawio';
import { readDrawioFile, downloadDrawio, drawioPreview } from './drawio-files';
import { useLatest } from './use-latest';
import { statusAction } from './status-chip';
import './drawio.css';

function DrawioRender({ item, ctx }: { item: Item; ctx: WidgetCtx }) {
  const asset = item.assetId ? ctx.assets[item.assetId] : undefined;
  return (
    <g>
      <rect width={item.w} height={item.h} fill="#fff" stroke="#d4d4da" rx="6" />
      {asset ? (
        <image href={asset.data} width={item.w} height={item.h} preserveAspectRatio="xMidYMid meet" />
      ) : (
        <>
          <Workflow x={item.w / 2 - 18} y={item.h / 2 - 53} width={36} height={36} color="#4262ff" />
          <text x={item.w / 2} y={item.h / 2 + 5} textAnchor="middle" fill="#25252c" fontSize="18">
            {item.text || 'Draw.io diagram'}
          </text>
          <text x={item.w / 2} y={item.h / 2 + 32} textAnchor="middle" fill="#696973" fontSize="13">
            Double-click to edit or import a .drawio file
          </text>
        </>
      )}
    </g>
  );
}

function DrawioEditor({ item, ctx, onClose }: { item: Item; ctx: WidgetCtx; onClose: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null),
    file = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLElement>(null),
    closeControl = useRef<HTMLButtonElement>(null);
  const draft = useRef(String(item.data?.xml ?? ''));
  const original = useRef(draft.current);
  const alive = useRef(true),
    pendingExport = useRef(false),
    editorReady = useRef(false);
  const exportTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [name, setName] = useState(item.text || 'Draw.io diagram');
  const [ready, setReady] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState('');
  const [sourceChanged, setSourceChanged] = useState(false),
    [session, setSession] = useState(0);
  const latest = useLatest({ ctx, onClose, name });
  const busy = useLatest(saving);
  const send = useCallback(
    (message: Record<string, unknown>) =>
      frame.current?.contentWindow?.postMessage(JSON.stringify(message), DRAWIO_ORIGIN),
    [],
  );
  const save = async (xml: string, preview?: string) => {
    setSaving(true);
    setError('');
    try {
      assertDrawioXml(xml);
      const title = latest.current.name.trim().slice(0, 200) || 'Draw.io diagram';
      const asset = preview ? await drawioPreview(preview, title) : null;
      if (!alive.current) return;
      const assetId = asset ? await latest.current.ctx.storeAsset(asset) : undefined;
      if (!alive.current) return;
      let applied = false;
      latest.current.ctx.update(board => {
        const current = board.items.find(i => i.id === item.id);
        if (!current || current.locked) return board;
        const next = { ...current, text: title, data: { ...current.data, xml } };
        if (assetId) next.assetId = assetId;
        else if (xml !== original.current) delete next.assetId;
        applied = true;
        return { ...board, items: board.items.map(i => (i.id === item.id ? next : i)) };
      });
      if (!applied) throw new Error('This diagram is no longer editable. Close the editor and unlock it to try again.');
      latest.current.onClose();
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setSaving(false);
    }
  };
  const saveRef = useLatest(save);
  const requestPreview = (xml?: string) => {
    if (!editorReady.current || pendingExport.current) return;
    pendingExport.current = true;
    setSaving(true);
    setError('');
    send({ action: 'export', format: 'png', border: 12, background: '#ffffff', ...(xml ? { xml } : {}) });
    clearTimeout(exportTimer.current);
    exportTimer.current = setTimeout(() => {
      pendingExport.current = false;
      setSaving(false);
      setError('The preview could not be generated. Retry saving, or save the diagram source without a preview.');
    }, 20_000);
  };
  const requestRef = useLatest(requestPreview);
  useEffect(() => {
    alive.current = true;
    const prior = document.activeElement as HTMLElement;
    closeControl.current?.focus();
    const timer = setTimeout(() => {
      if (!editorReady.current)
        setError('The online editor could not connect. Retry, or import a .drawio file and save its source.');
    }, 20_000);
    const receive = (event: MessageEvent) => {
      if (!isDrawioSender(event.origin, event.source, frame.current?.contentWindow)) return;
      const message = parseDrawioMessage(event.data);
      if (!message) return;
      if (message.event === 'init') {
        send({
          action: 'load',
          xml: draft.current,
          autosave: 1,
          title: latest.current.name,
          fit: 1,
          noSaveBtn: 1,
          noExitBtn: 1,
        });
      } else if (message.event === 'load') {
        if (message.error) {
          editorReady.current = false;
          setReady(false);
          setError(`The diagram could not be opened: ${message.error}`);
          return;
        }
        editorReady.current = true;
        setReady(true);
        setError('');
        clearTimeout(timer);
      } else if (message.event === 'autosave' && message.xml) {
        draft.current = message.xml;
        setSourceChanged(message.xml !== original.current);
      } else if (message.event === 'save' && message.xml) {
        draft.current = message.xml;
        setSourceChanged(true);
        requestRef.current(message.xml);
      } else if (message.event === 'export' && pendingExport.current) {
        pendingExport.current = false;
        clearTimeout(exportTimer.current);
        if (message.error || message.format !== 'png' || !message.data) {
          setSaving(false);
          setError('The diagram preview could not be generated. Try saving again.');
          return;
        }
        const xml = message.xml || draft.current;
        draft.current = xml;
        void saveRef.current(xml, message.data);
      } else if (message.event === 'exit' && !pendingExport.current && !busy.current) latest.current.onClose();
    };
    window.addEventListener('message', receive);
    return () => {
      alive.current = false;
      clearTimeout(timer);
      clearTimeout(exportTimer.current);
      window.removeEventListener('message', receive);
      if (prior?.isConnected) prior.focus();
    };
  }, [session, latest, saveRef, requestRef, send, busy]);
  const loadFile = async (selected?: File) => {
    if (!selected) return;
    try {
      const xml = await readDrawioFile(selected);
      draft.current = xml;
      setSourceChanged(true);
      setName(selected.name.replace(/\.(drawio|xml)$/i, '').slice(0, 200));
      if (editorReady.current) setError('');
      if (editorReady.current)
        send({ action: 'load', xml, autosave: 1, title: selected.name, fit: 1, noSaveBtn: 1, noExitBtn: 1 });
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const close = () => {
    if (!saving) onClose();
  };
  const unavailable = !ready && !!error;
  const retry = () => {
    editorReady.current = false;
    setReady(false);
    setError('');
    setSession(s => s + 1);
  };
  return (
    <div
      className="format-overlay drawio-overlay"
      onPointerDown={e => e.stopPropagation()}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Escape') close();
        if (e.key === 'Tab') {
          const controls = [
            ...(dialog.current?.querySelectorAll<HTMLElement>(
              'button:not(:disabled),input:not([hidden]):not(:disabled),iframe:not([tabindex="-1"])',
            ) ?? []),
          ];
          const first = controls[0],
            last = controls.at(-1);
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <section ref={dialog} className="drawio-editor" role="dialog" aria-modal="true" aria-labelledby="drawio-heading">
        <header>
          <div>
            <h2 id="drawio-heading">Draw.io diagram</h2>
            <p>Online editor · saved with this board</p>
          </div>
          <button
            ref={closeControl}
            className="icon-button"
            aria-label="Cancel Draw.io editing"
            disabled={saving}
            onClick={close}
          >
            <X size={20} />
          </button>
        </header>
        <div className="drawio-tools">
          <label>
            Diagram name
            <input
              aria-label="Diagram name"
              maxLength={200}
              value={name}
              onChange={e => setName(e.target.value)}
              disabled={saving}
            />
          </label>
          {!unavailable && (
            <button disabled={saving} onClick={() => file.current?.click()}>
              <FileUp size={16} />
              Import .drawio
            </button>
          )}
          <input
            ref={file}
            hidden
            type="file"
            accept=".drawio,.xml,application/xml,text/xml"
            aria-label="Choose Draw.io file"
            onChange={e => {
              void loadFile(e.target.files?.[0]);
              e.currentTarget.value = '';
            }}
          />
          {error && !unavailable && (
            <button disabled={saving} onClick={retry}>
              <RefreshCw size={16} />
              Retry editor
            </button>
          )}
        </div>
        {error && (
          <p className="drawio-error" role="alert">
            {error}
          </p>
        )}
        <div className="drawio-frame-wrap">
          {unavailable && (
            <div className="drawio-fallback" role="region" aria-label="Diagram editor unavailable">
              <Workflow size={36} color="#4262ff" aria-hidden="true" />
              <h3>Diagram editor unavailable</h3>
              <p>Your diagram source is still here. Retry the online editor or import a local .drawio file.</p>
              <div>
                <button className="primary" onClick={retry}>
                  <RefreshCw size={16} />
                  Retry editor
                </button>
                <button onClick={() => file.current?.click()}>
                  <FileUp size={16} />
                  Import .drawio
                </button>
              </div>
            </div>
          )}
          {!ready && !error && (
            <p className="drawio-loading" role="status">
              Loading diagram editor…
            </p>
          )}
          <iframe
            key={session}
            ref={frame}
            title="Draw.io diagram editor"
            src={DRAWIO_URL}
            sandbox="allow-scripts allow-same-origin allow-downloads"
            referrerPolicy="no-referrer"
            aria-hidden={unavailable}
            tabIndex={saving || unavailable ? -1 : 0}
            style={{
              pointerEvents: saving || unavailable ? 'none' : undefined,
              visibility: unavailable ? 'hidden' : undefined,
            }}
          />
        </div>
        <footer>
          <span role="status">
            {saving
              ? 'Saving diagram…'
              : sourceChanged
                ? 'Unsaved changes'
                : 'Save keeps the editable diagram and its preview.'}
          </span>
          <div>
            {(error || (!ready && sourceChanged)) && (
              <button disabled={saving} onClick={() => void save(draft.current)}>
                Save source only
              </button>
            )}
            <button disabled={saving} onClick={close}>
              Cancel
            </button>
            <button className="primary" disabled={!ready || saving} onClick={() => requestPreview()}>
              Save diagram
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

export const drawioView: WidgetView = {
  kind: 'drawio',
  mode: 'svg',
  Render: DrawioRender,
  Editor: DrawioEditor,
  actions: (item, ctx) => [
    {
      label: 'Export .drawio',
      icon: <Download size={16} />,
      run: () => downloadDrawio(String(item.data?.xml ?? ''), item.text),
    },
    statusAction(item, ctx),
    {
      // Native shapes and connectors in place of the widget (track R2-H); one undo step.
      label: 'Convert to shapes',
      icon: <Shapes size={16} />,
      disabled: !!item.locked,
      run: () => {
        try {
          let note = '';
          ctx.update(b => {
            const made = convertDrawioWidget(b, item.id, (t, x, y, f) => createItem(t, x, y, f));
            if (!made) return b;
            note = drawioImportNote(made.result);
            return made.board;
          });
          if (note) ctx.display(note);
        } catch (error) {
          ctx.display((error as Error).message, undefined, 'error');
        }
      },
    },
  ],
};
