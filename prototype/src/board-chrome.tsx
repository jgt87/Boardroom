import React from 'react';
import { StickyNote, Minus, Plus, X, Frame, CircleHelp } from 'lucide-react';
import { useRef, useState } from 'react';
import { useDismiss } from './board-menu';
import { setLocked } from './arrange';
import { Minimap } from './minimap';
import { CameraControls } from './camera-controls';
import { CommandPalette } from './command-palette';
import { reorderLayer, setHidden, renameItem } from './board-tools';
import { LayersPanel } from './board-panels';
import { NamedLayers } from './layers-panel';
import { PassphraseHost } from './passphrase-dialog';
import { SheetPickerHost } from './sheet-picker';
import { BoardOutline } from './board-outline';
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
    backView,
    goBack,
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
    setNotice,
    setOutline,
    setSelected,
    shown,
    size,
    update,
    zoom,
    commandsOpen,
    setCommandsOpen,
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
          extra={<NamedLayers />}
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
            className={`icon-button ${presentPanel ? 'active' : ''}`}
            aria-label="Frames"
            aria-pressed={presentPanel}
            title="Frames"
            onClick={() => setPresentPanel(p => !p)}
          >
            <Frame size={17} />
          </button>
          <button className="icon-button" aria-label="Zoom out" title="Zoom out" onClick={() => zoom(1 / 1.2)}>
            <Minus size={17} />
          </button>
          <CameraControls />
          <button className="icon-button" aria-label="Zoom in" title="Zoom in" onClick={() => zoom(1.2)}>
            <Plus size={17} />
          </button>
          <HelpMenu onShortcuts={() => setHelp(h => !h)} onCommands={() => setCommandsOpen(true)} />
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
              <kbd>Ctrl + scroll</kbd> <kbd>Ctrl + / Ctrl −</kbd>
            </dd>
            <dt>Zoom to fit / to selection / to 100%</dt>
            <dd>
              <kbd>Alt 1 / Alt 2 / Ctrl 0</kbd>
            </dd>
            <dt>Move the board</dt>
            <dd>
              <kbd>Arrows (nothing selected)</kbd>
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
            <dt>Duplicate beside</dt>
            <dd>
              <kbd>Alt + arrow</kbd>
            </dd>
            <dt>Bring to front / forward</dt>
            <dd>
              <kbd>PgUp / Shift PgUp</kbd>
            </dd>
            <dt>Send to back / backward</dt>
            <dd>
              <kbd>PgDn / Shift PgDn</kbd>
            </dd>
            <dt>Clear contents</dt>
            <dd>
              <kbd>Ctrl Backspace</kbd>
            </dd>
            <dt>Grid / Minimap / Shapes / Eraser</dt>
            <dd>
              <kbd>G / M / S / E</kbd>
            </dd>
            <dt>Show or hide comments</dt>
            <dd>
              <kbd>Shift C</kbd>
            </dd>
            <dt>Link to object</dt>
            <dd>
              <kbd>Ctrl Alt K</kbd>
            </dd>
            <dt>Next / previous object</dt>
            <dd>
              <kbd>Tab / Shift Tab</kbd> <kbd>Ctrl + arrow</kbd>
            </dd>
            <dt>Enter or leave a frame or group</dt>
            <dd>
              <kbd>Ctrl Shift ↓ / Ctrl Shift ↑</kbd>
            </dd>
            <dt>Add the next object to the selection</dt>
            <dd>
              <kbd>Ctrl Shift ← / Ctrl Shift →</kbd>
            </dd>
            <dt>First / last object in the container</dt>
            <dd>
              <kbd>Alt Home / Alt End</kbd>
            </dd>
            <dt>Resize the selection</dt>
            <dd>
              <kbd>Alt Shift + arrow</kbd>
            </dd>
            <dt>Place the chosen tool at the centre</dt>
            <dd>
              <kbd>Enter</kbd>
            </dd>
            <dt>Focus the selection toolbar</dt>
            <dd>
              <kbd>Ctrl Enter</kbd>
            </dd>
            <dt>Focus the board</dt>
            <dd>
              <kbd>B</kbd>
            </dd>
            <dt>Next sticky note while editing</dt>
            <dd>
              <kbd>Tab</kbd>
            </dd>
            <dt>Board summary</dt>
            <dd>
              <kbd>Alt S</kbd>
            </dd>
            <dt>Object details / repeat announcement</dt>
            <dd>
              <kbd>Alt I / Alt R</kbd>
            </dd>
            <dt>Comment on the selection</dt>
            <dd>
              <kbd>Alt C</kbd>
            </dd>
            <dt>Board outline by frame</dt>
            <dd>
              <kbd>Alt O</kbd>
            </dd>
            <dt>Copy or paste style</dt>
            <dd>
              <kbd>Ctrl Alt C / Ctrl Alt V</kbd>
            </dd>
            <dt>Copy as image</dt>
            <dd>
              <kbd>Ctrl Shift C</kbd>
            </dd>
            <dt>Shortcuts</dt>
            <dd>
              <kbd>? / F1</kbd>
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
            Drag any selection handle to resize. Shift preserves proportions at corners; Alt resizes from the centre.
            Drag the round handle above a selection to rotate it; Shift snaps to 15 degrees. Drag empty space to select
            multiple objects; Shift adds to selection. Frame moves carry fully contained objects. Hold Alt while moving
            to bypass snapping. Export JSON for a portable, editable backup.
          </p>
        </aside>
      )}
      <PassphraseHost />
      <SheetPickerHost />
      <BoardOutline />
      <div id="sr-announcer" className="sr-only" aria-live="polite" aria-atomic="true" />
      {backView && (
        <div className="notice floating go-back-toast" role="status">
          Followed a link
          <button className="text-button" onClick={goBack}>
            Go back
          </button>
        </div>
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

/** Help menu in the bottom bar (item 114), like the reference's question-mark button. */
function HelpMenu({ onShortcuts, onCommands }: { onShortcuts: () => void; onCommands: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, ref, () => setOpen(false));
  const choose = (run: () => void) => () => {
    setOpen(false);
    run();
  };
  return (
    <div className="menu-anchor help-anchor" ref={ref}>
      <button
        className="icon-button"
        aria-label="Help and resources"
        title="Help and resources"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        <CircleHelp size={18} />
      </button>
      {open && (
        <div className="dropdown floating help-menu" role="menu" aria-label="Help and resources">
          <button role="menuitem" onClick={choose(onShortcuts)}>
            Keyboard shortcuts<span>All tool keys</span>
          </button>
          <button role="menuitem" onClick={choose(onCommands)}>
            Commands<span>Ctrl K</span>
          </button>
        </div>
      )}
    </div>
  );
}
