import { SlidersHorizontal } from 'lucide-react';
import { Download, Layers, Check, ChevronDown, CloudOff, Search as SearchIcon, MonitorPlay, Users } from 'lucide-react';
import { IMAGE_ACCEPT, withAssets } from './images';
import { setPrivate } from './board-tools';
import { useApp } from './board-app';
import { BoardMenu, BoardStatusChip } from './board-menu';
import { addTemplate, loadTemplates, makeTemplate, storeTemplates } from './user-templates';
import { useExporters } from './use-exporters';

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
    importDocument,
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
  } = useApp();
  const { exportCsv, exportPdf, exportRaster, exportSvg, exportBundle } = useExporters();
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
        <input
          aria-label="Board name"
          value={board.title}
          maxLength={200}
          onChange={e => update({ ...boardRef.current, title: e.target.value })}
        />
        <BoardStatusChip />
        <BoardMenu />
        <span className={`save-state ${saveError ? 'error' : ''}`} title={saveError || 'Stored only in this browser'}>
          {saveError ? <CloudOff size={15} /> : <Check size={15} />}
          <span>{saveError ? 'Save issue' : saved ? 'Saved locally' : 'Saving'}</span>
        </span>
      </header>
      <div className="document-actions">
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
        <div className="menu-anchor">
          <button className="export-button" aria-label="Export" aria-expanded={menu} onClick={() => setMenu(m => !m)}>
            <Download size={17} />
            <span>Export</span>
            <ChevronDown size={14} />
          </button>
          {menu && (
            <div className="dropdown floating">
              <button
                onClick={() =>
                  download(JSON.stringify(withAssets(board, assets), null, 2), 'boardroom.json', 'application/json')
                }
              >
                Save board as JSON<span>Editable text backup with media</span>
              </button>
              <button onClick={exportBundle}>
                Save board with media<span>Compact .boardroom file for large boards</span>
              </button>
              <button onClick={exportSvg}>
                Export as SVG<span>Vector image</span>
              </button>
              <button onClick={() => exportRaster('image/png')}>
                Export as PNG<span>{selected.length ? 'Selection' : 'Whole board'}, 2× scale</span>
              </button>
              <button onClick={() => exportRaster('image/jpeg')}>
                Export as JPG<span>{selected.length ? 'Selection' : 'Whole board'}, white background</span>
              </button>
              <button onClick={exportPdf}>
                Export as PDF<span>One page per frame</span>
              </button>
              <button onClick={exportCsv}>
                Export records as CSV<span>Selected or first record view</span>
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
              <button
                onClick={() => {
                  file.current?.click();
                  setMenu(false);
                }}
              >
                Import backup<span>JSON or .boardroom; replaces the board</span>
              </button>
            </div>
          )}
        </div>
      </div>
      <input
        type="file"
        ref={file}
        hidden
        accept=".json,application/json,.boardroom,application/zip"
        onChange={importFile}
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
          if (f) void importDocument(f);
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
