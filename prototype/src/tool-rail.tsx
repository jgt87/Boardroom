import {
  Layers2,
  Undo2,
  Redo2,
  MessageCircle,
  Plus,
  LayoutTemplate,
  Shapes,
  MousePointer2,
  Smile,
  Hand,
  Layers3,
} from 'lucide-react';
import { allKinds, colors, colorName, undo, redo, bulkNotes, createItem } from './model';
import { addStickySet, stickySets } from './sticky-sets';
import { useBrandKit } from './brand-kit-panel';
import { brandFirst } from './brand-kit';
import type { Kind } from './model';
import { ToolGallery, FormatEditor, BulkPanel, TOOL_MIME, kindIcons } from './formats';
import { catalog } from './tool-catalog';

/** Drag data marking a pinned toolbar tool, for reordering (gap F12). */
const PIN_MIME = 'application/x-boardroom-pinned';
import { AnchoredPanel } from './anchored-panel';
import { isShapeKind, shapeLabels } from './shapes';
import { CompactShapesMenu } from './shape-tools';
import { placeCustomShape } from './custom-shapes';
import { penPresets } from './board-tools';
import { PenOptions } from './board-panels';
import { useApp } from './board-app';
import { tools } from './board-app';
import { useState } from 'react';
import { useRovingToolbar } from './use-roving-toolbar';
import { lastColors } from './last-color';
import { EmojiPicker } from './emoji-picker';
import { StickerChoices } from './widgets-graphics';

export function ToolRail() {
  const brandKit = useBrandKit();
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
    size,
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
    setViewPrefs,
  } = useApp();
  const rail = useRovingToolbar<HTMLDivElement>();
  // The sticky note tool shows the reference's compact palette and a Stack toggle (item 109).
  const noteTool = tool === 'note' || tool === 'stack';
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
      <div className="tool-column">
        <nav
          className="tools floating"
          aria-label="Creation tools"
          onClickCapture={e => {
            // Only one rail popup at a time (item 109): a click on any rail button closes the others.
            const label = (e.target as Element).closest('button')?.getAttribute('aria-label');
            if (!label) return;
            if (label !== 'Emoji and stickers') setEmojiMenu(false);
            if (label !== 'Shapes and lines') setShapes(false);
            if (label !== 'Formats and Flows' && label !== 'Tools, media and integrations') setGallery(null);
            if (label !== 'Templates') setFacil(f => (f === 'templates' ? null : f));
            setBulk(false);
          }}
        >
          <div
            ref={rail.ref}
            role="toolbar"
            aria-label="Tools"
            aria-orientation="vertical"
            className="tool-buttons"
            onFocus={rail.onFocus}
            onKeyDown={rail.onKeyDown}
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
                  aria-haspopup={t.id === 'rectangle' ? 'menu' : undefined}
                  aria-expanded={t.id === 'rectangle' ? shapes : undefined}
                  className={tool === t.id ? 'active' : ''}
                  draggable={!['pen', 'rectangle'].includes(t.id)}
                  onDragStart={e => {
                    e.dataTransfer.setData(TOOL_MIME, t.id);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
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
            {viewPrefs.pinned
              .filter(k => (allKinds as string[]).includes(k))
              .map(k => {
                const Icon = kindIcons[k] ?? Layers3,
                  label =
                    Object.values(catalog)
                      .flat()
                      .find(entry => entry.kind === k)?.label ?? k;
                return (
                  <button
                    key={`pin-${k}`}
                    className="pinned-tool"
                    aria-label={label}
                    draggable
                    onDragStart={e => {
                      e.dataTransfer.setData(TOOL_MIME, k);
                      e.dataTransfer.setData(PIN_MIME, k);
                      e.dataTransfer.effectAllowed = 'copyMove';
                    }}
                    onDragOver={e => {
                      // Drop a pinned tool on another to reorder (gap F12).
                      if (e.dataTransfer.types.includes(PIN_MIME)) e.preventDefault();
                    }}
                    onDrop={e => {
                      const from = e.dataTransfer.getData(PIN_MIME);
                      if (!from || from === k) return;
                      e.preventDefault();
                      e.stopPropagation();
                      const list = viewPrefs.pinned.filter(x => x !== from),
                        at = list.indexOf(k);
                      list.splice(at < 0 ? list.length : at, 0, from);
                      setViewPrefs({ pinned: list });
                    }}
                    onClick={() => chooseFormat(k)}
                  >
                    <Icon size={21} strokeWidth={1.7} />
                    <span className="tool-tip">{label}</span>
                  </button>
                );
              })}
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
              data-tool-anchor="comment"
              aria-label="Comment"
              aria-pressed={tool === 'comment'}
              className={tool === 'comment' ? 'active' : ''}
              onClick={() => {
                setPendingPlacement(null);
                setGallery(null);
                setShapes(false);
                setTool(tool === 'comment' ? 'select' : 'comment');
              }}
            >
              <MessageCircle size={21} strokeWidth={1.7} />
              <span className="tool-tip">
                Comment<kbd>C</kbd>
              </span>
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
              <Plus size={23} strokeWidth={1.7} />
              <span className="tool-tip">Tools, media and integrations</span>
            </button>
          </div>
        </nav>
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
      </div>
      {emojiMenu && (
        <AnchoredPanel anchor="emoji" onDismiss={() => setEmojiMenu(false)}>
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
        <AnchoredPanel anchor="rectangle" onDismiss={() => setShapes(false)}>
          <aside className="shape-menu floating compact" aria-label="Shapes and lines">
            <div className="shape-menu-list">
              <CompactShapesMenu
                onShape={kind => {
                  setPendingPlacement(null);
                  setTool(kind);
                  setShapes(false);
                }}
                onLine={preset => {
                  setPendingPlacement('line:' + preset);
                  setTool('arrow');
                  setShapes(false);
                }}
                onKind={kind => {
                  setPendingPlacement(null);
                  setTool(kind);
                  setShapes(false);
                }}
                onCustom={shape => {
                  const placed = placeCustomShape(
                    boardRef.current,
                    shape,
                    toWorld(window.innerWidth / 2, window.innerHeight / 2),
                  );
                  setShapes(false);
                  if (!placed) return display('This saved shape can no longer be read.');
                  update(placed.board);
                  setTool('select');
                  setSelected(placed.ids);
                }}
              />
            </div>
          </aside>
        </AnchoredPanel>
      )}
      {gallery && (
        <AnchoredPanel anchor={gallery === 'Formats' ? 'formats' : 'essentials'} onDismiss={() => setGallery(null)}>
          <ToolGallery
            key={gallery}
            initial={gallery}
            onClose={() => setGallery(null)}
            onChoose={chooseFormat}
            pinned={viewPrefs.pinned}
            onTogglePin={kind =>
              setViewPrefs({
                pinned: viewPrefs.pinned.includes(kind)
                  ? viewPrefs.pinned.filter(k => k !== kind)
                  : [...viewPrefs.pinned, kind].slice(0, 12),
              })
            }
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
            // The first item is the frame that keeps the link to the code.
            setSelected([items[0].id]);
            setFormatId(null);
            fit(items);
            display(
              `Converted to ${items.filter(i => i.type !== 'arrow' && i.type !== 'frame').length} shapes, linked to their code. Press Enter on the frame to edit the code.${notes.length ? ' ' + notes.join(' ') : ''} Undo restores the diagram.`,
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
      {tool !== 'select' && tool !== 'hand' && !shapes && !gallery && !emojiMenu && (
        <AnchoredPanel
          anchor={
            isShapeKind(tool) || tool === 'arrow'
              ? 'rectangle'
              : pendingPlacement?.startsWith('stamp:')
                ? 'emoji'
                : pendingPlacement
                  ? 'formats'
                  : tool === 'stack'
                    ? 'note'
                    : tool
          }
        >
          <div className={`tool-options floating ${noteTool ? 'note-options' : ''}`}>
            {!noteTool && (
              <strong>
                {isShapeKind(tool)
                  ? shapeLabels[tool]
                  : pendingPlacement?.startsWith('stamp:emoji:')
                    ? `Place ${pendingPlacement.slice(12)}`
                    : pendingPlacement?.startsWith('stamp:')
                      ? 'Place sticker'
                      : tool === 'comment'
                        ? 'Comment'
                        : tools.find(t => t.id === tool)?.label || tool[0].toUpperCase() + tool.slice(1)}
              </strong>
            )}
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
                    aria-label={`Pen colour ${colorName(c)}`}
                    title={colorName(c)}
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
            {!noteTool && (
              <span>
                {tool === 'arrow'
                  ? 'Drag between two objects to connect them.'
                  : tool === 'pen'
                    ? eraser
                      ? 'Drag over strokes to erase them.'
                      : 'Draw freely on the canvas. Strokes are smoothed when you lift the pointer.'
                    : tool === 'comment'
                      ? 'Click an object or the canvas to start a comment.'
                      : 'Click to place. Drag to choose a size.'}
              </span>
            )}
            {!['arrow', 'text', 'pen', 'frame', 'comment'].includes(tool) && (
              <div className={`swatches ${noteTool ? 'note-swatches' : ''}`} role="group" aria-label="Colors">
                {(() => {
                  // Shapes start with the colour last applied to a shape this session, else the tool colour (for
                  // sticky notes, the colour last picked for sticky notes). A chosen colour outside the swatches,
                  // e.g. from the colour menu, shows as one more swatch at the end.
                  const chosen = (isShapeKind(tool) ? lastColors.get('shape') : undefined) ?? fill,
                    list = brandFirst(brandKit, colors);
                  return list.includes(chosen) ? list : [...list, chosen];
                })().map(c => {
                  const chosen = (isShapeKind(tool) ? lastColors.get('shape') : undefined) ?? fill;
                  return (
                    <button
                      key={c}
                      aria-label={`Use colour ${colorName(c)}`}
                      title={colorName(c)}
                      aria-pressed={chosen === c}
                      style={{ background: c }}
                      className={chosen === c ? 'chosen' : ''}
                      onClick={() => {
                        setFill(c);
                        lastColors.remember(tool, c);
                      }}
                    />
                  );
                })}
              </div>
            )}
            {noteTool && (
              <button className="note-stack-button" onClick={() => chooseFormat('stack')}>
                <Layers2 size={16} /> Stack
              </button>
            )}
            {noteTool && (
              // Sticky note sets (track L): a small pre-coloured group placed at the centre of the view.
              <select
                className="note-set-select"
                aria-label="Add a sticky note set"
                value=""
                onChange={e => {
                  const set = stickySets.find(s => s.id === e.target.value);
                  e.target.value = '';
                  if (!set) return;
                  const made = addStickySet(boardRef.current, set.id, toWorld(size.w / 2, size.h / 2), (x, y, f) =>
                    createItem('note', x, y, f),
                  );
                  if (!made) return;
                  update(made.board);
                  setSelected(made.ids);
                  setTool('select');
                  display(`Added the ${set.label} sticky note set as a group.`);
                }}
              >
                <option value="">Note sets…</option>
                {stickySets.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        </AnchoredPanel>
      )}
    </>
  );
}
