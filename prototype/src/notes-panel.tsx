// Board notes panel (track L): a docked rich-text document per board (Alt+N, or View → Board notes), edited
// with the same editor as Doc objects and stored as `board.notes`. Each saved edit is one undo step.
import { Download, X } from 'lucide-react';
import { useApp } from './board-app';
import { RichDocEditor } from './canvas-doc';
import { notesFileName, noteTemplatesFor, setBoardNotes } from './board-notes';
import { exportMarkdown } from './doc-tools';
import './notes-panel.css';

export function NotesPanel() {
  const { board, boardRef, update, display, notesOpen, setNotesOpen, outline } = useApp();
  // The Layers panel uses the same place on the right; while it is open the notes wait behind it.
  if (!notesOpen || outline) return null;
  const notes = board.notes ?? '',
    locked = !!board.viewOnly;
  const exportNotes = () => {
    if (!notes.trim()) return display('Write some notes before exporting them.');
    const name = notesFileName(board.title),
      url = URL.createObjectURL(new Blob([exportMarkdown(notes)], { type: 'text/markdown;charset=utf-8' })),
      a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    display(`Exported ${name}.`);
  };
  return (
    <aside
      className="outline notes-panel floating"
      aria-label="Board notes"
      onKeyDown={e => {
        // Keys in the panel never reach board shortcuts; Escape outside the editor closes the panel (the
        // editor handles its own Escape first).
        e.stopPropagation();
        if (e.key === 'Escape') setNotesOpen(false);
      }}
    >
      <div className="panel-heading">
        <h2>Board notes</h2>
        <span className="notes-panel-actions">
          <button
            className="icon-button"
            aria-label="Export notes as Markdown"
            title="Export as Markdown"
            onClick={exportNotes}
          >
            <Download size={16} />
          </button>
          <button className="icon-button" aria-label="Close board notes" onClick={() => setNotesOpen(false)}>
            <X size={17} />
          </button>
        </span>
      </div>
      <RichDocEditor
        className="notes-doc"
        markdown={notes}
        locked={locked}
        zoom={1}
        board={board}
        display={display}
        templates={noteTemplatesFor(new Date())}
        templateMode="insert"
        label="Board notes. Type / on an empty line for blocks, @ to mention someone. Esc selects the block."
        placeholder={locked ? 'No notes on this board.' : 'Write notes for this board, or start from a template.'}
        title={<span className="notes-doc-hint">{locked ? 'View only' : 'Saved with the board'}</span>}
        onSave={markdown => update(setBoardNotes(boardRef.current, markdown))}
      />
    </aside>
  );
}
