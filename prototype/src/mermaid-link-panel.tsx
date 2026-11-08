// Edit mode of a diagram linked to Mermaid code: a side panel with the code next to the live shapes on the
// canvas (both stay editable), the sync state of each side, and the actions that resolve a divergence.
import { useEffect, useRef, useState } from 'react';
import { X, Copy, Unlink, Eye, EyeOff } from 'lucide-react';
import { useApp } from './board-app';
import { useLatest } from './use-latest';
import { copyText } from './use-deep-links';
import { MermaidPreview } from './formats';
import {
  codeFromShapes,
  kindLabels,
  linkOf,
  linkState,
  linkedMembers,
  rebuildFromCode,
  storeCode,
  syncSummary,
  unlinkMermaid,
  MERMAID_CODE_MAX,
} from './mermaid-link';
import './mermaid-link.css';

export function MermaidLinkPanel() {
  const { mermaidLinkId } = useApp();
  return mermaidLinkId ? <LinkPanel key={mermaidLinkId} id={mermaidLinkId} /> : null;
}

function LinkPanel({ id }: { id: string }) {
  const { board, boardRef, update, display, fit, setSelected, setMermaidLinkId } = useApp();
  const frame = board.items.find(i => i.id === id),
    link = linkOf(frame);
  const [draft, setDraft] = useState(link?.code ?? ''),
    [error, setError] = useState(''),
    [preview, setPreview] = useState(false);
  /** The stored code the draft started from; a different stored code while the draft is edited is a conflict. */
  const base = useRef(link?.code ?? '');
  const field = useRef<HTMLTextAreaElement>(null);
  const latest = useLatest({ draft, update, boardRef });

  useEffect(() => {
    field.current?.focus();
    const f = boardRef.current.items.find(i => i.id === id);
    if (f) fit([f]);
    // Unsaved edits are kept on the frame (shown as "code not applied") when the panel closes; the cleanup reads
    // the values of the last render on purpose.
    const live = latest;
    return () => {
      const { draft: text, update: save, boardRef: ref } = live.current;
      const l = linkOf(ref.current.items.find(i => i.id === id));
      if (l && text !== l.code) save(storeCode(ref.current, id, text));
    };
    // Runs once per opened frame; the latest values are read through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  // Follow code written from the shapes (or undo) while the draft has no edits of its own.
  const stored = link?.code;
  useEffect(() => {
    if (stored === undefined || draft !== base.current) return;
    base.current = stored;
    setDraft(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored]);
  useEffect(() => {
    if (!link) setMermaidLinkId(null);
  }, [link, setMermaidLinkId]);
  if (!frame || !link) return null;

  const doc = linkState(board, id),
    dirty = draft !== link.code,
    external = dirty && base.current !== link.code,
    codeSide = dirty || doc === 'code' || doc === 'both',
    shapeSide = doc === 'shapes' || doc === 'both' || external,
    shapes = linkedMembers(board, frame).filter(m => m.type !== 'arrow').length;
  const close = () => setMermaidLinkId(null);
  const attempt = (action: () => void) => {
    try {
      action();
      setError('');
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const rebuild = () =>
    attempt(() => {
      const r = rebuildFromCode(boardRef.current, id, draft);
      base.current = draft;
      update(r.board);
      display(`Shapes rebuilt from the code.${r.notes.length ? ' ' + r.notes.join(' ') : ''}`);
    });
  const fromShapes = () =>
    attempt(() => {
      const r = codeFromShapes(boardRef.current, id);
      base.current = r.code;
      setDraft(r.code);
      update(r.board);
      display('Code updated from the shapes.');
    });
  const unlink = () =>
    attempt(() => {
      update(unlinkMermaid(boardRef.current, id));
      setSelected([id]);
      close();
      display('Unlinked. The shapes stay; the code is no longer kept. Undo restores the link.');
    });
  const message =
    codeSide && shapeSide
      ? 'Both sides changed since the last sync: the code and the shapes on the canvas. Choose which one to keep.'
      : doc === 'empty'
        ? 'The frame holds none of the diagram shapes. Rebuild them from the code, or unlink.'
        : codeSide
          ? 'The code has changes that are not applied to the shapes yet.'
          : shapeSide
            ? 'Shapes were edited on the canvas and the code was not updated from them (a locked frame or code that would be too long). Update the code from the shapes, or rebuild the shapes from the code.'
            : 'Code and shapes are in sync.';
  return (
    <aside
      className="mermaid-link-panel floating"
      aria-label="Linked Mermaid code"
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Escape') close();
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          rebuild();
        }
      }}
    >
      <div className="panel-heading">
        <h2>
          {frame.text || kindLabels[link.kind]}{' '}
          <span className="link-kind">
            {frame.text && frame.text !== kindLabels[link.kind]
              ? `${kindLabels[link.kind]} · linked`
              : 'Linked to code'}
          </span>
        </h2>
        <button className="icon-button" aria-label="Close code panel" onClick={close}>
          <X size={17} />
        </button>
      </div>
      <p
        className={`link-sync link-sync-${codeSide && shapeSide ? 'both' : codeSide ? 'code' : shapeSide ? 'shapes' : doc}`}
      >
        <span className={`link-side ${codeSide ? 'changed' : ''}`}>Code {codeSide ? 'changed' : 'unchanged'}</span>
        <span className={`link-side ${shapeSide ? 'changed' : ''}`}>
          Shapes {shapeSide ? 'changed' : 'unchanged'} · {shapes}
        </span>
        <span className="link-message">{message}</span>
      </p>
      <div className="link-actions">
        {codeSide && shapeSide ? (
          <>
            <button onClick={fromShapes}>Update code from shapes</button>
            <button className="primary" onClick={rebuild}>
              Rebuild shapes from code
            </button>
          </>
        ) : shapeSide || doc === 'empty' ? (
          <>
            {doc !== 'empty' && <button onClick={fromShapes}>Update code from shapes</button>}
            <button className="primary" onClick={rebuild}>
              Rebuild shapes from code
            </button>
          </>
        ) : (
          <>
            <button className="primary" disabled={!codeSide} onClick={rebuild} title="Ctrl Enter">
              Apply to shapes
            </button>
            {dirty && (
              <button
                onClick={() => {
                  base.current = link.code;
                  setDraft(link.code);
                }}
                title="Go back to the stored code"
              >
                Revert
              </button>
            )}
          </>
        )}
      </div>
      {error && (
        <p className="format-error" role="alert">
          {error}
        </p>
      )}
      <label className="link-code">
        Mermaid code
        <textarea
          ref={field}
          aria-label="Mermaid code"
          spellCheck={false}
          maxLength={MERMAID_CODE_MAX}
          value={draft}
          onChange={e => {
            setDraft(e.target.value);
            setError('');
          }}
        />
      </label>
      <p className="format-hint">{syncSummary(link.kind)}</p>
      {preview && (
        <div className="link-preview">
          <MermaidPreview code={draft} />
        </div>
      )}
      <div className="link-tools">
        <button onClick={() => setPreview(!preview)} aria-pressed={preview}>
          {preview ? <EyeOff size={15} /> : <Eye size={15} />} Rendered preview
        </button>
        <button
          onClick={() =>
            copyText(draft).then(ok => display(ok ? 'Mermaid code copied.' : 'The code could not be copied.'))
          }
        >
          <Copy size={15} /> Copy code
        </button>
        <button onClick={unlink}>
          <Unlink size={15} /> Unlink
        </button>
      </div>
    </aside>
  );
}
