import { SlidersHorizontal } from 'lucide-react';
import { Layers, Check, CloudOff, Search as SearchIcon, MonitorPlay, Users, Upload, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLatest } from './use-latest';
import { presentationFrames } from './navigation';
import { IMAGE_ACCEPT, withAssets } from './images';
import { setPrivate } from './board-tools';
import { useApp } from './board-app';
import { BoardEmoji, BoardMenu, BoardStatusChip, SensitivityChip, useDismiss } from './board-menu';
import { settingsLocked, settingsLockedNote } from './board-modes';
import {
  addTemplate,
  loadTemplates,
  makeSelectionTemplate,
  makeTemplate,
  selectionTemplateName,
  storeTemplates,
} from './user-templates';
import { useExporters } from './use-exporters';
import { ExportAreaOverlay } from './export-area-overlay';
import { canEncrypt, encryptBackup } from './encrypted-backup';
import { askPassphrase } from './passphrase-dialog';
import { useLibraryFiles } from './use-library-files';

export function TopBar() {
  const {
    assets,
    board,
    boardRef,
    display,
    download,

    facil,
    facilitate,
    file,
    imageFile,
    importFile,
    insertAt,
    insertImages,
    insertMedia,
    mediaFile,
    docImportFile,
    docImportKind,
    importDrawioShapes,
    importWhiteboardFile,
    importDocument,
    importStickies,
    menu,
    outline,
    presentPanel,
    replaceFile,
    replaceSelectedImage,
    run,
    saveError,
    saved,
    searchOpen,
    selected,
    setFacil,
    setFacilitate,
    setMenu,
    setOutline,
    setPresentPanel,
    setSearchOpen,
    setTimerOn,
    update,
    setDashboard,
    inspector,
    setInspector,
    startPresenting,
  } = useApp();
  const exportRef = useRef<HTMLDivElement>(null),
    newBoardFile = useRef<HTMLInputElement>(null);
  const libraryFiles = useLibraryFiles();
  useDismiss(menu, exportRef, () => setMenu(false));
  const {
    exportCsv,
    exportTextCsv,
    exportPdf,
    exportRaster,
    exportSvg,
    exportBundle,
    copyImage,
    exportHtml,
    printBoard,
  } = useExporters();
  const [scale, setScale] = useState(2),
    [areaPick, setAreaPick] = useState(false);
  // Ctrl+Shift+C copies the selection (or board) as an image (gap B11).
  const copyRef = useLatest(copyImage);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !e.shiftKey || e.altKey || e.key.toLowerCase() !== 'c') return;
      if ((e.target as HTMLElement)?.closest?.('input,textarea,select,[contenteditable=true]')) return;
      e.preventDefault();
      void copyRef.current();
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, [copyRef]);
  return (
    <>
      <header className="board-header floating">
        <button
          className="wordmark"
          aria-label="boardroom: all boards"
          title="All boards"
          onClick={() => setDashboard(true)}
        >
          <span className="brand-mark">
            <Layers size={20} />
          </span>
          <span>boardroom</span>
        </button>
        <span className="divider" />
        <BoardEmoji />
        <input
          aria-label="Board name"
          value={board.title}
          maxLength={200}
          // The name is a board setting: read-only on a comment-only or view-only board (question P2-Q11).
          readOnly={settingsLocked(board)}
          title={settingsLocked(board) ? settingsLockedNote(board) : undefined}
          onChange={e => update({ ...boardRef.current, title: e.target.value })}
        />
        <BoardStatusChip />
        <SensitivityChip />
        {board.viewOnly && (
          <span className="board-status view-only" title="Editing is off. Turn it on in Main menu → Board → View only.">
            View only
          </span>
        )}
        {board.commentOnly && !board.viewOnly && (
          <span
            className="board-status view-only comment-only"
            title="Only comments can be added, replied to or resolved. Turn editing on in Main menu → Board → Comment only."
          >
            Comment only
          </span>
        )}
        <BoardMenu />
        <div className="menu-anchor export-anchor" ref={exportRef}>
          <button
            className="icon-button"
            aria-label="Export"
            title="Export this board"
            aria-expanded={menu}
            onClick={() => setMenu(m => !m)}
          >
            <Upload size={17} />
          </button>
          {menu && (
            <div className="dropdown floating export-menu">
              <button
                onClick={() =>
                  download(JSON.stringify(withAssets(board, assets), null, 2), 'boardroom.json', 'application/json')
                }
              >
                Save board as JSON<span>Editable text backup with media</span>
              </button>
              {canEncrypt() && (
                <button
                  onClick={async () => {
                    setMenu(false);
                    const pass = await askPassphrase('Save encrypted backup', true);
                    if (!pass) return;
                    try {
                      const locked = await encryptBackup(JSON.stringify(withAssets(board, assets)), pass);
                      download(JSON.stringify(locked), 'boardroom-encrypted.json', 'application/json');
                    } catch (err) {
                      display((err as Error).message);
                    }
                  }}
                >
                  Save encrypted backup<span>JSON locked with a passphrase</span>
                </button>
              )}
              <button onClick={exportBundle}>
                Save board with media<span>Compact .boardroom file for large boards</span>
              </button>
              <button onClick={() => exportSvg()}>
                Export as SVG<span>{selected.length ? 'Selected objects only' : 'Whole board'}, vector image</span>
              </button>
              <button onClick={exportHtml}>
                Export as web page<span>Read-only HTML copy with pan and zoom</span>
              </button>
              <label className="export-scale">
                Image size
                <select aria-label="Image size" value={scale} onChange={e => setScale(Number(e.target.value))}>
                  <option value={1}>Small (1×)</option>
                  <option value={2}>Medium (2×)</option>
                  <option value={4}>Large (4×)</option>
                </select>
              </label>
              <button onClick={() => exportRaster('image/png', scale)}>
                Export as PNG
                <span>
                  {selected.length ? 'Selection' : 'Whole board'}, {scale}× scale
                </span>
              </button>
              <button
                onClick={() => {
                  setMenu(false);
                  void copyImage();
                }}
              >
                Copy as image<span>{selected.length ? 'Selection' : 'Whole board'} · Ctrl Shift C</span>
              </button>
              <button onClick={() => exportRaster('image/jpeg', scale)}>
                Export as JPG<span>{selected.length ? 'Selection' : 'Whole board'}, white background</span>
              </button>
              <button onClick={() => exportPdf()}>
                Export as PDF
                <span>
                  {selected.some(id => board.items.find(i => i.id === id)?.type === 'frame')
                    ? 'Selected frames'
                    : 'One page per slide'}
                </span>
              </button>
              <button
                onClick={() => {
                  setMenu(false);
                  setAreaPick(true);
                }}
              >
                Export an area<span>Drag over the part of the board to export</span>
              </button>
              <button onClick={() => void printBoard()}>
                Print<span>{selected.length ? 'Selected objects only' : 'Whole board'}</span>
              </button>
              <button onClick={exportCsv}>
                Export to spreadsheet (CSV)<span>Selected cards, or records</span>
              </button>
              <button onClick={exportTextCsv}>
                Export text as CSV
                <span>{selected.length ? 'Selection' : 'Whole board'}: notes, shapes, text, cards</span>
              </button>
              <button
                onClick={() => {
                  setMenu(false);
                  const made = makeTemplate(board, board.title, crypto.randomUUID(), new Date());
                  if ('error' in made) return display(made.error);
                  display(
                    storeTemplates(addTemplate(loadTemplates(), made))
                      ? `Saved "${made.name}" to My templates.`
                      : 'This browser has no room to store the template.',
                  );
                }}
              >
                Save board as template<span>Reuse it from Templates; media not included</span>
              </button>
              {selected.length > 0 && (
                <button
                  onClick={() => {
                    setMenu(false);
                    const made = makeSelectionTemplate(
                      board,
                      selected,
                      selectionTemplateName(board, selected),
                      crypto.randomUUID(),
                      new Date(),
                    );
                    if ('error' in made) return display(made.error);
                    display(
                      storeTemplates(addTemplate(loadTemplates(), made))
                        ? `Saved "${made.name}" (${made.count} object${made.count === 1 ? '' : 's'}) to My templates.`
                        : 'This browser has no room to store the template.',
                    );
                  }}
                >
                  Save selection as template<span>Selected objects and the contents of selected frames</span>
                </button>
              )}
              <button
                onClick={() => {
                  file.current?.click();
                  setMenu(false);
                }}
              >
                Import backup<span>JSON or .boardroom; replaces the board</span>
              </button>
              <button
                onClick={() => {
                  newBoardFile.current?.click();
                  setMenu(false);
                }}
              >
                Import as new board<span>Keeps this board; library backups add all their boards</span>
              </button>
              <button
                onClick={() => {
                  setMenu(false);
                  void libraryFiles.backupAll();
                }}
              >
                Back up all boards<span>Every board, its media and spaces in one file</span>
              </button>
            </div>
          )}
        </div>
        <span className={`save-state ${saveError ? 'error' : ''}`} title={saveError || 'Stored only in this browser'}>
          {saveError ? <CloudOff size={15} /> : <Check size={15} />}
          <span>{saveError ? 'Save issue' : saved ? 'Saved locally' : 'Saving'}</span>
        </span>
      </header>
      <div className="document-actions floating">
        <button
          className={`floating icon-button ${searchOpen ? 'active' : ''}`}
          title="Search board (Ctrl F)"
          aria-label="Search board"
          aria-expanded={searchOpen}
          onClick={() => setSearchOpen(v => !v)}
        >
          <SearchIcon size={19} />
        </button>
        <button
          data-tool-anchor="present"
          className={`floating icon-button ${presentPanel ? 'active' : ''}`}
          title="Presentation"
          aria-label="Presentation"
          aria-expanded={presentPanel}
          onClick={() => setPresentPanel(v => !v)}
        >
          <MonitorPlay size={19} />
        </button>
        <div className="menu-anchor">
          <button
            data-tool-anchor="facilitate"
            className={`floating icon-button ${facilitate || facil ? 'active' : ''}`}
            title="Collaborate and review"
            aria-label="Collaborate and review"
            aria-expanded={facilitate}
            onClick={() => setFacilitate(v => !v)}
          >
            <Users size={19} />
          </button>
          {facilitate && (
            <div
              className="dropdown floating facilitate-menu"
              onKeyDown={e => {
                if (e.key === 'Escape') setFacilitate(false);
              }}
            >
              <button
                onClick={() => {
                  setFacil('voting');
                  setFacilitate(false);
                }}
              >
                Dot voting<span>{board.voting?.active ? 'Session running' : 'Vote on objects'}</span>
              </button>
              <button
                onClick={() => {
                  setTimerOn(true);
                  setFacilitate(false);
                }}
              >
                Timer<span>Countdown for the board</span>
              </button>
              <button
                onClick={() => {
                  setFacil('comments');
                  setFacilitate(false);
                }}
              >
                Comments<span>{(board.comments ?? []).filter(t => !t.resolved).length} open · C to add</span>
              </button>
              <button
                onClick={() => {
                  run(b => setPrivate(b, 'all', !b.privateMode?.all));
                  setFacilitate(false);
                }}
              >
                {board.privateMode?.all ? 'Reveal all notes' : 'Private mode'}
                <span>{board.privateMode?.all ? 'Show sticky-note text again' : 'Hide sticky-note text'}</span>
              </button>
              <button
                onClick={() => {
                  setFacil('templates');
                  setFacilitate(false);
                }}
              >
                Templates<span>Start from a layout</span>
              </button>
              <button
                onClick={() => {
                  setFacil('a11y');
                  setFacilitate(false);
                }}
              >
                Accessibility check<span>Contrast, descriptions, text size</span>
              </button>
              <button
                onClick={() => {
                  setFacil('reactions');
                  setFacilitate(false);
                }}
              >
                Reactions<span>Send a quick emoji reaction</span>
              </button>
              <button
                onClick={() => {
                  setFacil('authors');
                  setFacilitate(false);
                }}
              >
                Note authors<span>{board.showAuthors ? 'Shown on sticky notes' : 'Your name on new notes'}</span>
              </button>
            </div>
          )}
        </div>
        <button
          className={`floating icon-button ${inspector ? 'active' : ''}`}
          title="Properties"
          aria-label="Properties"
          aria-pressed={inspector}
          onClick={() => setInspector(v => !v)}
        >
          <SlidersHorizontal size={19} />
        </button>
        <button
          className={`floating icon-button ${outline ? 'active' : ''}`}
          title="Layers"
          aria-label="Layers"
          onClick={() => setOutline(v => !v)}
        >
          <Layers size={19} />
        </button>
        <button
          className="present-button"
          aria-label="Present"
          title="Present from the first frame"
          onClick={() => {
            if (presentationFrames(boardRef.current).length) startPresenting(0);
            else {
              setPresentPanel(true);
              display('Add a frame to present. Each frame becomes one slide.');
            }
          }}
        >
          <Play size={15} fill="currentColor" />
        </button>
      </div>
      {areaPick && (
        <ExportAreaOverlay
          onClose={() => setAreaPick(false)}
          onExport={(format, area) => {
            setAreaPick(false);
            if (format === 'png' || format === 'jpg')
              void exportRaster(format === 'png' ? 'image/png' : 'image/jpeg', scale, area);
            else if (format === 'svg') exportSvg(area);
            else if (format === 'pdf') void exportPdf(area);
            else void printBoard(area);
          }}
        />
      )}
      <input
        type="file"
        ref={file}
        hidden
        accept=".json,application/json,.boardroom,application/zip"
        onChange={importFile}
      />
      <input
        type="file"
        ref={newBoardFile}
        hidden
        aria-label="Choose a backup to import as a new board"
        accept=".json,application/json,.boardroom,application/zip"
        onChange={e => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void libraryFiles.importFile(f);
        }}
      />
      <input
        type="file"
        ref={imageFile}
        hidden
        multiple
        accept={IMAGE_ACCEPT}
        aria-label="Choose images"
        onChange={e => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          insertImages(files, insertAt.current ?? undefined);
        }}
      />
      <input
        type="file"
        ref={docImportFile}
        hidden
        aria-label="Choose a document to import"
        onChange={e => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f && docImportKind.current === 'drawio') void importDrawioShapes(f);
          else if (f && docImportKind.current === 'stickies') void importStickies(f);
          else if (f && docImportKind.current === 'whiteboard') void importWhiteboardFile(f, true);
          else if (f) void importDocument(f, undefined, docImportKind.current === 'grid' ? 'grid' : undefined);
        }}
      />
      <input
        type="file"
        ref={mediaFile}
        hidden
        aria-label="Choose a media file"
        onChange={e => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) insertMedia(f);
        }}
      />
      <input
        type="file"
        ref={replaceFile}
        hidden
        accept={IMAGE_ACCEPT}
        aria-label="Choose replacement image"
        onChange={e => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) replaceSelectedImage(f);
        }}
      />
    </>
  );
}
