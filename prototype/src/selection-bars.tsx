import {
  StickyNote,
  Type,
  Plus,
  Copy,
  Trash2,
  MoveUp,
  MoveDown,
  Link2,
  Lock,
  LockOpen,
  Crop as CropIcon,
  ImageUp,
  SmilePlus,
  Repeat2,
  LayoutGrid,
  Link as LinkIcon,
  ExternalLink as OpenIcon,
  MessageSquare,
  EyeOff,
} from 'lucide-react';
import type { Item, FrameFormat } from './model';
import { TextControls } from './text-format';
import { NoteSizeControl } from './sticky-tools';
import { ConnectorControls } from './connectors';
import { isShapeKind, shapeLabels } from './shapes';
import { BorderControls } from './shape-tools';
import { expandGroups } from './arrange';
import { FrameControls } from './presentation';
import { containerOf, moveChild, removeChild } from './autolayout';
import { applyFrameFormat } from './frame-presets';
import { urlsIn, setPrivate, setFrameContentHidden, frameContentHidden } from './board-tools';
import { viewFor } from './widgets';
import { useApp } from './board-app';

export function SelectionBars() {
  const {
    allShapes,
    assets,
    board,
    connectorDetailsId,
    deleteSelection,
    detailsId,
    duplicate,
    fill,
    firstShape,
    mixedBorders,
    openEditor,
    panel,
    patch,
    patchStyle,
    quickAddNote,
    replaceFile,
    run,
    selected,
    selectedItem,
    selectionLocked,
    setConnectorDetailsId,
    setCropId,
    setDetailsId,
    setEditing,
    setPanel,
    setThread,
    toggleLock,
    update,
    widgetCtx,
  } = useApp();
  return (
    <>
      {selected.length > 0 && selectionLocked && (
        <div className="selection-bar floating">
          <span>
            <Lock size={14} />{' '}
            {selected.length === 1 ? `Locked ${selectedItem?.type}` : `${selected.length} objects, some locked`}
          </span>
          <button className="icon-button" aria-label="Unlock" title="Unlock (Ctrl Shift L)" onClick={toggleLock}>
            <LockOpen size={17} />
          </button>
          <button className="icon-button" aria-label="Duplicate" title="Duplicate (Ctrl D)" onClick={duplicate}>
            <Copy size={17} />
          </button>
        </div>
      )}
      {selected.length > 0 && !selectionLocked && (
        <div className="selection-bar floating">
          <span>
            {selected.length === 1
              ? selectedItem && isShapeKind(selectedItem.type)
                ? shapeLabels[selectedItem.type]
                : selectedItem?.type
              : `${selected.length} objects`}
          </span>
          {selectedItem && (
            <input
              type="color"
              aria-label={selectedItem.type === 'arrow' ? 'Line color' : 'Object color'}
              value={selectedItem.fill}
              onChange={e => patch({ fill: e.target.value })}
            />
          )}
          {allShapes && firstShape && <BorderControls item={firstShape} mixed={mixedBorders} onChange={patchStyle} />}
          {selectedItem &&
            selected.length === 1 &&
            (['note', 'text'].includes(selectedItem.type) || isShapeKind(selectedItem.type)) && (
              <TextControls item={selectedItem} onChange={format => patch({ format })} />
            )}
          {selectedItem?.type === 'frame' && selected.length === 1 && (
            <FrameControls
              key={selectedItem.id}
              item={selectedItem}
              onApply={(preset, orientation, custom) =>
                run(b =>
                  applyFrameFormat(b, selectedItem.id, preset, orientation as FrameFormat['orientation'], custom),
                )
              }
            />
          )}
          {selectedItem?.type === 'image' && selected.length === 1 && (
            <>
              <button
                className="icon-button"
                aria-label="Crop image"
                title="Crop image"
                disabled={!assets[selectedItem.assetId!]}
                onClick={() => setCropId(selectedItem.id)}
              >
                <CropIcon size={17} />
              </button>
              <button
                className="icon-button"
                aria-label="Replace image"
                title="Replace image"
                onClick={() => replaceFile.current?.click()}
              >
                <ImageUp size={17} />
              </button>
            </>
          )}
          {selectedItem?.type === 'note' && selected.length === 1 && (
            <>
              <button
                data-tool-anchor="note-emoji"
                className={`icon-button ${selectedItem.emoji ? 'active' : ''}`}
                aria-label="Note marker"
                title="Emoji marker"
                aria-expanded={panel === 'emoji'}
                onClick={() => {
                  setEditing(null);
                  setPanel(panel === 'emoji' ? null : 'emoji');
                }}
              >
                {selectedItem.emoji ? (
                  <span className="emoji-chip">{selectedItem.emoji}</span>
                ) : (
                  <SmilePlus size={17} />
                )}
              </button>
              <button
                data-tool-anchor="note-convert"
                className="icon-button"
                aria-label="Convert note"
                title="Convert to text, shape or record"
                aria-expanded={panel === 'convert'}
                onClick={() => {
                  setEditing(null);
                  setPanel(panel === 'convert' ? null : 'convert');
                }}
              >
                <Repeat2 size={17} />
              </button>
            </>
          )}
          {selectedItem?.type === 'note' && selected.length === 1 && (
            <NoteSizeControl item={selectedItem} onChange={patch} />
          )}
          {selectedItem?.type === 'note' && selected.length === 1 && (
            <button
              data-tool-anchor="note-details"
              className="icon-button"
              aria-label="Links and tags"
              title="Links and tags"
              aria-expanded={detailsId === selectedItem.id}
              onClick={() => {
                setEditing(null);
                setDetailsId(detailsId === selectedItem.id ? null : selectedItem.id);
              }}
            >
              <Link2 size={17} />
            </button>
          )}
          {selectedItem?.type === 'note' && selected.length === 1 && (
            <button
              className="icon-button"
              aria-label="Add connected note"
              title="Add connected note"
              onClick={quickAddNote}
            >
              <Plus size={17} />
            </button>
          )}
          {selectedItem?.type === 'arrow' && selected.length === 1 && (
            <ConnectorControls item={selectedItem} onChange={connector => patch({ connector })} />
          )}
          {selectedItem?.type === 'arrow' && selected.length === 1 && (
            <button
              data-tool-anchor="connector-details"
              className="icon-button"
              aria-label="Connector details"
              title="Label and connections"
              onClick={() => {
                setEditing(null);
                setConnectorDetailsId(connectorDetailsId === selectedItem.id ? null : selectedItem.id);
              }}
            >
              <Link2 size={17} />
            </button>
          )}
          <button
            className="icon-button"
            aria-label={selectedItem?.type === 'code' ? 'Edit code' : 'Edit text'}
            title={selectedItem?.type === 'code' ? 'Edit code (Enter)' : 'Edit text (Enter)'}
            disabled={!selectedItem || ['pen', 'image'].includes(selectedItem.type) || selected.length !== 1}
            onClick={() => openEditor(selected[0])}
          >
            <Type size={17} />
          </button>
          {selectedItem &&
            selected.length === 1 &&
            viewFor(selectedItem.type)
              ?.actions?.(selectedItem, widgetCtx(selectedItem))
              .map(a => (
                <button
                  key={a.label}
                  className={`widget-action ${a.pressed ? 'active' : ''}`}
                  aria-pressed={a.pressed}
                  disabled={a.disabled}
                  onClick={a.run}
                  title={a.label}
                >
                  {a.icon}
                  <span>{a.label}</span>
                </button>
              ))}
          {selectedItem &&
            selected.length === 1 &&
            viewFor(selectedItem.type)?.Editor &&
            !viewFor(selectedItem.type)?.textEdit && (
              <button className="widget-action" onClick={() => openEditor(selectedItem.id)}>
                Edit
              </button>
            )}
          {selectedItem &&
            selected.length === 1 &&
            containerOf(board, selectedItem.id) &&
            (() => {
              const c = containerOf(board, selectedItem.id)!;
              return (
                <>
                  <button
                    className="widget-action"
                    aria-label="Move earlier in container"
                    onClick={() => run(b => moveChild(b, c.id, selectedItem.id, -1))}
                  >
                    Earlier
                  </button>
                  <button
                    className="widget-action"
                    aria-label="Move later in container"
                    onClick={() => run(b => moveChild(b, c.id, selectedItem.id, 1))}
                  >
                    Later
                  </button>
                  <button className="widget-action" onClick={() => run(b => removeChild(b, c.id, selectedItem.id))}>
                    Take out
                  </button>
                </>
              );
            })()}
          {selectedItem?.type === 'frame' && selected.length === 1 && (
            <>
              <button
                className={`icon-button ${frameContentHidden(selectedItem) ? 'active' : ''}`}
                aria-label={frameContentHidden(selectedItem) ? 'Show contents' : 'Hide contents'}
                title={frameContentHidden(selectedItem) ? 'Show contents' : 'Hide contents'}
                aria-pressed={frameContentHidden(selectedItem)}
                onClick={() => run(b => setFrameContentHidden(b, selectedItem.id, !frameContentHidden(selectedItem)))}
              >
                <EyeOff size={17} />
              </button>
              <button
                className={`icon-button ${board.privateMode?.frames.includes(selectedItem.id) ? 'active' : ''}`}
                aria-label="Private notes in this frame"
                title="Hide sticky-note text in this frame"
                aria-pressed={!!board.privateMode?.frames.includes(selectedItem.id)}
                onClick={() =>
                  run(b => setPrivate(b, selectedItem.id, !b.privateMode?.frames.includes(selectedItem.id)))
                }
              >
                <StickyNote size={17} />
              </button>
            </>
          )}
          {selectedItem &&
            selected.length === 1 &&
            ['image', 'video', 'pdf', 'icon', 'qr'].includes(selectedItem.type) && (
              <input
                className="alt-input"
                aria-label="Text description"
                placeholder="Description"
                maxLength={1000}
                key={`alt-${selectedItem.id}`}
                defaultValue={selectedItem.alt ?? ''}
                onBlur={e => {
                  const v = e.target.value.trim();
                  if (v !== (selectedItem.alt ?? ''))
                    run(b => ({
                      ...b,
                      items: b.items.map(i =>
                        i.id === selectedItem.id
                          ? v
                            ? { ...i, alt: v }
                            : ((({ alt: _, ...rest }) => rest)(i) as Item)
                          : i,
                      ),
                    }));
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
              />
            )}
          {selectedItem &&
            selected.length === 1 &&
            urlsIn(selectedItem.text)
              .slice(0, 1)
              .map(u => (
                <a
                  key={u}
                  className="icon-button"
                  href={u}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open ${u}`}
                  title={`Open ${u}`}
                >
                  <OpenIcon size={16} />
                </a>
              ))}
          {selectedItem && selected.length === 1 && selectedItem.type !== 'arrow' && (
            <>
              <button
                data-tool-anchor="link-to"
                className={`icon-button ${selectedItem.linkTo ? 'active' : ''}`}
                aria-label="Link to object"
                title="Link to a frame or object"
                aria-expanded={panel === 'link'}
                onClick={() => setPanel(panel === 'link' ? null : 'link')}
              >
                <LinkIcon size={16} />
              </button>
              <button
                className="icon-button"
                aria-label="Comment on object"
                title="Comment"
                onClick={() =>
                  setThread({ x: selectedItem.x + selectedItem.w, y: selectedItem.y, itemId: selectedItem.id })
                }
              >
                <MessageSquare size={16} />
              </button>
            </>
          )}
          <button
            data-tool-anchor="arrange"
            className="icon-button"
            aria-label="Arrange"
            title="Align, distribute and group"
            aria-expanded={panel === 'arrange'}
            onClick={() => setPanel(panel === 'arrange' ? null : 'arrange')}
          >
            <LayoutGrid size={17} />
          </button>
          <button className="icon-button" aria-label="Lock" title="Lock (Ctrl Shift L)" onClick={toggleLock}>
            <Lock size={17} />
          </button>
          <button className="icon-button" aria-label="Duplicate" title="Duplicate (Ctrl D)" onClick={duplicate}>
            <Copy size={17} />
          </button>
          <button
            className="icon-button"
            aria-label="Bring to front"
            title="Bring to front"
            onClick={() => {
              const ids = expandGroups(board, selected);
              update({
                ...board,
                items: [
                  ...board.items.filter(i => !ids.includes(i.id)),
                  ...board.items.filter(i => ids.includes(i.id)),
                ],
              });
            }}
          >
            <MoveUp size={17} />
          </button>
          <button
            className="icon-button"
            aria-label="Send to back"
            title="Send to back"
            onClick={() => {
              const ids = expandGroups(board, selected);
              update({
                ...board,
                items: [
                  ...board.items.filter(i => ids.includes(i.id)),
                  ...board.items.filter(i => !ids.includes(i.id)),
                ],
              });
            }}
          >
            <MoveDown size={17} />
          </button>
          <span className="divider" />
          <button
            className="icon-button danger"
            aria-label="Delete selection"
            title="Delete selection"
            onClick={deleteSelection}
          >
            <Trash2 size={17} />
          </button>
        </div>
      )}
    </>
  );
}
