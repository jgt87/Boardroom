import { Undo2, Redo2, LayoutTemplate, Shapes, Ellipsis, MousePointer2, Smile, Hand } from 'lucide-react';
import { colors, undo, redo, bulkNotes } from './model';
import type { Kind } from './model';
import { ToolGallery, FormatEditor, BulkPanel } from './formats';
import { AnchoredPanel } from './anchored-panel';
import { isShapeKind, shapeLabels } from './shapes';
import { ShapeMenuItems } from './shape-tools';
import { penPresets } from './board-tools';
import { PenOptions } from './board-panels';
import { useApp } from './board-app';
import { tools } from './board-app';
import { useState } from 'react';
import { EmojiPicker } from './emoji-picker';
import { StickerChoices } from './widgets-graphics';

export function ToolRail() {
  const [emojiMenu, setEmojiMenu] = useState(false);
  const {
    addCentered,
    board,
    boardRef,
    bulk,
    chooseFormat,
    display,
    eraser,
    fill,
    fit,
    formatId,
    gallery,
    history,
    penColor,
    penStyle,
    penWidth,
    precise,
    setBulk,
    setEditing,
    setEraser,
    setFill,
    setFormatId,
    setGallery,
    setHistory,
    setPenColor,
    setPenStyle,
    setPenWidth,
    setPrecise,
    setSelected,
    setShapes,
    setTool,
    shapes,
    toWorld,
    tool,
    update,
    pendingPlacement,
    setPendingPlacement,
    setFacil,
    penMode,
    setPenMode,
    penPresetList,
    activePreset,
    setActivePreset,
    savePenPresets,
    viewPrefs,
  } = useApp();
  /** Start click-to-place for an emoji (`emoji:<emoji>`) or a built-in sticker kind. */
  const placeStamp = (choice: string) => {
    setEmojiMenu(false);
    setEditing(null);
    setSelected([]);
    setPendingPlacement('stamp:' + choice);
    setTool('stamp');
  };
  return (
    <>
      <nav
        className="tools floating"
        aria-label="Creation tools"
        onClickCapture={e => {
          const label = (e.target as Element).closest('button')?.getAttribute('aria-label');
          if (label !== 'Emoji and stickers') setEmojiMenu(false);
        }}
      >
        <button
          data-tool-anchor="select"
          aria-label={tool === 'hand' ? 'Pan' : 'Select'}
          title={
            tool === 'hand'
              ? 'Pan (H) · click for Select'
              : tool === 'select'
                ? 'Select (V) · click for Pan'
                : 'Select (V)'
          }
          aria-pressed={tool === 'select' || tool === 'hand'}
          className={tool === 'select' || tool === 'hand' ? 'active' : ''}
          onClick={() => {
            // One button toggles between the selector and the hand (pan) tool; from any other tool it returns to Select.
            setTool(tool === 'select' ? 'hand' : 'select');
            setEditing(null);
            setPendingPlacement(null);
            setGallery(null);
            setShapes(false);
          }}
        >
          {tool === 'hand' ? <Hand size={21} /> : <MousePointer2 size={21} />}
        </button>
        <button
          data-tool-anchor="formats"
          aria-label="Formats and Flows"
          aria-expanded={gallery === 'Formats'}
          onClick={() => {
            setGallery(gallery === 'Formats' ? null : 'Formats');
            setShapes(false);
            setBulk(false);
          }}
        >
          <Shapes size={21} />
          <span className="tool-tip">Formats and Flows</span>
        </button>
        <button
          aria-label="Templates"
          onClick={() => {
            setFacil('templates');
            setGallery(null);
            setShapes(false);
          }}
        >
          <LayoutTemplate size={21} />
          <span className="tool-tip">Templates</span>
        </button>
        {tools
          .filter(t => !['select', 'hand', 'ellipse', 'diamond', 'arrow'].includes(t.id))
          .map(t => (
            <button
              key={t.id}
              data-tool-anchor={t.id}
              aria-label={t.id === 'rectangle' ? 'Shapes and lines' : t.label}
              aria-pressed={tool === t.id}
              className={tool === t.id ? 'active' : ''}
              onClick={() => {
                setPendingPlacement(null);
                if (t.id === 'rectangle') {
                  setShapes(!shapes);
                  setGallery(null);
                } else {
                  setTool(t.id);
                  setEditing(null);
                  setGallery(null);
                  setShapes(false);
                }
              }}
              onDoubleClick={() => {
                if (!['select', 'hand', 'pen'].includes(t.id)) addCentered(t.id as Kind);
              }}
            >
              <t.icon size={21} strokeWidth={1.7} />
              <span className="tool-tip">
                {t.id === 'rectangle' ? 'Shapes and lines' : t.label}
                <kbd>{t.key}</kbd>
              </span>
            </button>
          ))}
        <button
          data-tool-anchor="emoji"
          aria-label="Emoji and stickers"
          aria-expanded={emojiMenu}
          aria-pressed={tool === 'stamp' && !!pendingPlacement?.startsWith('stamp:')}
          className={tool === 'stamp' && pendingPlacement?.startsWith('stamp:') ? 'active' : ''}
          onClick={() => {
            setEmojiMenu(v => !v);
            setGallery(null);
            setShapes(false);
            setBulk(false);
          }}
        >
          <Smile size={21} strokeWidth={1.7} />
          <span className="tool-tip">Emoji and stickers</span>
        </button>
        <button
          data-tool-anchor="essentials"
          aria-label="Tools, media and integrations"
          aria-expanded={gallery === 'Essentials'}
          onClick={() => {
            setGallery(gallery === 'Essentials' ? null : 'Essentials');
            setShapes(false);
            setBulk(false);
          }}
        >
          <Ellipsis size={23} />
          <span className="tool-tip">Tools, media and integrations</span>
        </button>
      </nav>
      {emojiMenu && (
        <AnchoredPanel anchor="emoji">
          <EmojiPicker
            title="Emoji and stickers"
            allowRemove={false}
            note="Choose an emoji or sticker, then click the board to place it. Esc cancels."
            extra={<StickerChoices onChoose={kind => placeStamp(kind)} />}
            onChoose={emoji => {
              if (emoji) placeStamp('emoji:' + emoji);
            }}
            onClose={() => setEmojiMenu(false)}
          />
        </AnchoredPanel>
      )}
      {shapes && (
        <AnchoredPanel anchor="rectangle">
          <aside className="shape-menu floating" aria-label="Shapes and lines">
            <h2>Shapes and lines</h2>
            <div className="shape-menu-list">
              <ShapeMenuItems
                onChoose={kind => {
                  setTool(kind);
                  setShapes(false);
                }}
              />
              {tools
                .filter(t => t.id === 'arrow')
                .map(t => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setTool(t.id);
                      setShapes(false);
                    }}
                  >
                    <t.icon size={20} />
                    {t.label}
                  </button>
                ))}
            </div>
          </aside>
        </AnchoredPanel>
      )}
      {gallery && (
        <AnchoredPanel anchor={gallery === 'Formats' ? 'formats' : 'essentials'}>
          <ToolGallery
            key={gallery}
            initial={gallery}
            onClose={() => setGallery(null)}
            onChoose={chooseFormat}
            onPrimitive={kind => {
              setPendingPlacement(null);
              setGallery(null);
              setTool(kind);
            }}
          />
        </AnchoredPanel>
      )}
      {bulk && (
        <AnchoredPanel anchor="note">
          <BulkPanel
            onClose={() => setBulk(false)}
            onDone={text => {
              const p = toWorld(130, 130),
                items = bulkNotes(text, p.x, p.y, fill);
              update({ ...boardRef.current, items: [...boardRef.current.items, ...items] });
              setSelected(items.map(i => i.id));
              setBulk(false);
              fit(items);
            }}
          />
        </AnchoredPanel>
      )}
      {formatId && board.items.find(i => i.id === formatId) && (
        <FormatEditor
          key={formatId}
          item={board.items.find(i => i.id === formatId)!}
          board={board}
          onReplace={(items, notes) => {
            const id = formatId;
            update({ ...boardRef.current, items: [...boardRef.current.items.filter(i => i.id !== id), ...items] });
            setSelected(items.filter(i => i.type !== 'arrow').map(i => i.id));
            setFormatId(null);
            fit(items);
            display(
              `Converted to ${items.filter(i => i.type !== 'arrow').length} shapes.${notes.length ? ' ' + notes.join(' ') : ''} Undo restores the diagram.`,
            );
          }}
          onClose={() => setFormatId(null)}
          onApply={(item, rows) => {
            const next = { ...boardRef.current, items: boardRef.current.items.map(i => (i.id === item.id ? item : i)) };
            if (rows && item.datasetId) next.datasets = { ...next.datasets, [item.datasetId]: rows };
            update(next);
            setFormatId(null);
          }}
        />
      )}
      {viewPrefs.undoControls && (
        <div className="history floating">
          <button
            className="icon-button"
            aria-label="Undo"
            title="Undo (Ctrl Z)"
            disabled={!history.past.length}
            onClick={() => {
              setHistory(undo);
              setEditing(null);
            }}
          >
            <Undo2 size={19} />
          </button>
          <button
            className="icon-button"
            aria-label="Redo"
            title="Redo (Ctrl Shift Z)"
            disabled={!history.future.length}
            onClick={() => {
              setHistory(redo);
              setEditing(null);
            }}
          >
            <Redo2 size={19} />
          </button>
        </div>
      )}
      {tool !== 'select' && tool !== 'hand' && (
        <AnchoredPanel
          anchor={
            isShapeKind(tool) || tool === 'arrow'
              ? 'rectangle'
              : pendingPlacement?.startsWith('stamp:')
                ? 'emoji'
                : pendingPlacement
                  ? 'formats'
                  : tool
          }
        >
          <div className="tool-options floating">
            <strong>
              {isShapeKind(tool)
                ? shapeLabels[tool]
                : pendingPlacement?.startsWith('stamp:emoji:')
                  ? `Place ${pendingPlacement.slice(12)}`
                  : pendingPlacement?.startsWith('stamp:')
                    ? 'Place sticker'
                    : tool === 'stack'
                      ? 'Sticky stack'
                      : tool === 'comment'
                        ? 'Comment'
                        : tools.find(t => t.id === tool)?.label || tool[0].toUpperCase() + tool.slice(1)}
            </strong>
            {tool === 'pen' && (
              <PenOptions
                style={penStyle}
                width={penWidth}
                eraser={eraser}
                precise={precise}
                onStyle={st => {
                  setPenStyle(st);
                  setPenWidth(penPresets[st].width);
                }}
                onWidth={w => {
                  setPenWidth(w);
                  if (activePreset !== null)
                    savePenPresets(penPresetList.map((p, i) => (i === activePreset ? { ...p, width: w } : p)));
                }}
                onEraser={setEraser}
                onPrecise={setPrecise}
                mode={penMode}
                onMode={setPenMode}
                presets={penPresetList}
                activePreset={activePreset}
                onPreset={i => {
                  const p = penPresetList[i]!;
                  setActivePreset(i);
                  setEraser(false);
                  setPenMode('draw');
                  setPenColor(p.color);
                  setPenWidth(p.width);
                }}
              />
            )}
            {tool === 'pen' && !eraser && (
              <div className="swatches">
                {['#25252a', '#4262ff', '#e5484d', '#2f9e44', '#f59f00', '#ffe36e', '#7048e8'].map(c => (
                  <button
                    key={c}
                    aria-label={`Pen colour ${c}`}
                    aria-pressed={penColor === c}
                    className={penColor === c ? 'chosen' : ''}
                    style={{ background: c }}
                    onClick={() => {
                      setPenColor(c);
                      if (activePreset !== null)
                        savePenPresets(penPresetList.map((p, i) => (i === activePreset ? { ...p, color: c } : p)));
                    }}
                  />
                ))}
              </div>
            )}
            {tool === 'note' && (
              <button
                onClick={() => {
                  setBulk(true);
                  setTool('select');
                }}
              >
                Bulk mode
              </button>
            )}
            <span>
              {tool === 'arrow'
                ? 'Drag between two objects to connect them.'
                : tool === 'pen'
                  ? eraser
                    ? 'Drag over strokes to erase them.'
                    : 'Draw freely on the canvas. Strokes are smoothed when you lift the pointer.'
                  : tool === 'stack'
                    ? 'Each click adds the next note below the previous one. Press Esc to finish the stack.'
                    : tool === 'comment'
                      ? 'Click an object or the canvas to start a comment.'
                      : 'Click to place. Drag to choose a size.'}
            </span>
            {!['arrow', 'text', 'pen', 'frame', 'comment'].includes(tool) && (
              <div className="swatches">
                {colors.map(c => (
                  <button
                    key={c}
                    aria-label={`Use color ${c}`}
                    aria-pressed={fill === c}
                    style={{ background: c }}
                    className={fill === c ? 'chosen' : ''}
                    onClick={() => setFill(c)}
                  />
                ))}
              </div>
            )}
          </div>
        </AnchoredPanel>
      )}
    </>
  );
}
