import React from 'react';
import { StickyNote, Minus, Plus, Maximize, X, Keyboard, Magnet, Map as MapIcon, Frame } from 'lucide-react';
import { setLocked } from './arrange';
import { Minimap } from './minimap';
import { CameraControls } from './camera-controls';
import { CommandPalette } from './command-palette';
import { reorderLayer, setHidden, renameItem } from './board-tools';
import { LayersPanel } from './board-panels';
import { useApp } from './board-app';
import { tools } from './board-app';

export function BoardChrome() {
  const {
    addCentered,
    addExample,
    board,
    boardRef,
    camera,
    fit,
    help,
    minimap,
    notice,
    outline,
    presenting,
    presentPanel,
    setPresentPanel,
    saveError,
    selected,
    setCamera,
    setHelp,
    setMinimap,
    setNotice,
    setOutline,
    setSelected,
    setSnapping,
    shown,
    size,
    snapping,
    update,
    zoom,
    commandsOpen,
  } = useApp();
  return (
    <>
      {!board.items.length && (
        <section className="empty-state">
          <span className="empty-symbol">
            <StickyNote size={34} strokeWidth={1.3} />
          </span>
          <h1>A little room for big ideas.</h1>
          <p>
            Add a sticky note, sketch a thought,
            <br />
            or connect the dots. This space is yours.
          </p>
          <button onClick={() => addCentered('note')}>
            <Plus size={17} />
            Add your first note
          </button>
          <button className="text-button" onClick={addExample}>
            Explore a sample board
          </button>
        </section>
      )}
      {outline && (
        <LayersPanel
          board={board}
          selected={selected}
          onSelect={i => {
            setSelected([i.id]);
            if (!i.hidden) fit([i]);
          }}
          onReorder={(id, to) => update(reorderLayer(boardRef.current, id, to))}
          onHide={(id, h) => {
            update(setHidden(boardRef.current, [id], h));
            if (h) setSelected(s => s.filter(x => x !== id));
          }}
          onLock={(id, l) => update(setLocked(boardRef.current, [id], l))}
          onRename={(id, name) => update(renameItem(boardRef.current, id, name))}
          onUnlockAll={() =>
            update(
              setLocked(
                boardRef.current,
                boardRef.current.items.filter(i => i.locked).map(i => i.id),
                false,
              ),
            )
          }
          onClose={() => setOutline(false)}
        />
      )}

      <footer className="canvas-footer">
        <span className="local-label">
          Independent prototype <span>•</span> Local to this browser
        </span>
        {minimap && !presenting && (
          <Minimap items={shown.items} camera={camera} size={size} onCamera={setCamera} onFit={() => fit()} />
        )}
        <div className="zoom floating">
          <button
            className={`icon-button ${minimap ? 'active' : ''}`}
            aria-label="Minimap"
            aria-pressed={minimap}
            title="Minimap"
            onClick={() => setMinimap(m => !m)}
          >
            <MapIcon size={17} />
          </button>
          <span className="divider" />
          <button
            className={`icon-button ${snapping ? 'active' : ''}`}
            aria-label="Snap to objects"
            aria-pressed={snapping}
            title="Snap to objects · hold Alt to bypass"
            onClick={() => setSnapping(!snapping)}
          >
            <Magnet size={17} />
          </button>
          <span className="divider" />
          <button
            className={`icon-button ${presentPanel ? 'active' : ''}`}
            aria-label="Frames"
            aria-pressed={presentPanel}
            title="Frames"
            onClick={() => setPresentPanel(p => !p)}
          >
            <Frame size={17} />
          </button>
          <span className="divider" />
          <button
            className="icon-button"
            aria-label="Fit to screen"
            title="Fit to screen (Alt 1)"
            onClick={() => fit()}
          >
            <Maximize size={17} />
          </button>
          <span className="divider" />
          <button className="icon-button" aria-label="Zoom out" onClick={() => zoom(1 / 1.2)}>
            <Minus size={17} />
          </button>
          <CameraControls />
          <button className="icon-button" aria-label="Zoom in" onClick={() => zoom(1.2)}>
            <Plus size={17} />
          </button>
          <span className="divider" />
          <button
            className="icon-button"
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts"
            onClick={() => setHelp(h => !h)}
          >
            <Keyboard size={18} />
          </button>
        </div>
      </footer>
      {commandsOpen && <CommandPalette />}
      {help && (
        <aside className="help floating">
          <div className="panel-heading">
            <h2>Make yourself at home.</h2>
            <button className="icon-button" aria-label="Close shortcuts" onClick={() => setHelp(false)}>
              <X size={17} />
            </button>
          </div>
          <p>Everything you need, a keystroke away.</p>
          <dl>
            {tools.map(t => (
              <React.Fragment key={t.id}>
                <dt>{t.label}</dt>
                <dd>
                  <kbd>{t.key}</kbd>
                </dd>
              </React.Fragment>
            ))}
            <dt>Pan temporarily</dt>
            <dd>
              <kbd>Space + drag</kbd>
            </dd>
            <dt>Zoom</dt>
            <dd>
              <kbd>Ctrl + scroll</kbd>
            </dd>
            <dt>Select multiple</dt>
            <dd>
              <kbd>Shift + click</kbd>
            </dd>
            <dt>Edit selected object</dt>
            <dd>
              <kbd>Enter</kbd>
            </dd>
            <dt>Finish editing</dt>
            <dd>
              <kbd>Esc</kbd>
            </dd>
            <dt>Undo / Redo</dt>
            <dd>
              <kbd>Ctrl Z / Ctrl Shift Z</kbd>
            </dd>
            <dt>Duplicate</dt>
            <dd>
              <kbd>Ctrl D</kbd>
            </dd>
            <dt>Group / Ungroup</dt>
            <dd>
              <kbd>Ctrl G / Ctrl Shift G</kbd>
            </dd>
            <dt>Lock / Unlock</dt>
            <dd>
              <kbd>Ctrl Shift L</kbd>
            </dd>
            <dt>Search board</dt>
            <dd>
              <kbd>Ctrl F</kbd>
            </dd>
            <dt>Paste an image</dt>
            <dd>
              <kbd>Ctrl V</kbd>
            </dd>
          </dl>
          <p>
            Drag any selection handle to resize. Shift preserves proportions at corners. Drag empty space to select
            multiple objects; Shift adds to selection. Frame moves carry fully contained objects. Hold Alt while moving
            to bypass snapping. Export JSON for a portable, editable backup.
          </p>
        </aside>
      )}
      {notice && (
        <div className={`notice floating ${saveError ? 'error' : ''}`} role="status">
          {notice}
          <button className="icon-button" aria-label="Dismiss notification" onClick={() => setNotice('')}>
            <X size={15} />
          </button>
        </div>
      )}
    </>
  );
}
