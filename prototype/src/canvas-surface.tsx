import { expandGroups } from './arrange';
import React from 'react';
import {
  selectionBounds,
  handles,
  handlePoint,
  resizeCursor,
  SELECT_GAP,
  anchorSides,
  anchorPoint,
} from './interactions';
import { canRotate } from './rotation';
import type { Item } from './model';

/** SVG rotate() suffix that turns a world-space overlay with a rotated object (gap D1). */
const rotateAbout = (i: Item) => (i.rotation ? ` rotate(${i.rotation} ${i.x + i.w / 2} ${i.y + i.h / 2})` : '');
/** Screen-pixel distance of the rotate handle above the selection outline. */
const ROTATE_GAP = 44;
import { dimensionLabel } from './view-prefs';
import { connectorGeometry, ConnectorMarkers } from './connectors';
import { bendHandles } from './connector-geometry';
import { castVote, threadPoint, frameContentHidden } from './board-tools';
import { VoteBadge } from './board-panels';
import { EyeOff } from 'lucide-react';
import { useApp } from './board-app';
import { useRenderItem } from './use-render-item';
import { RECORD_CARD_MIME } from './record-card-handle';
import { mermaidItem } from './smart-paste';
import { droppedImage } from './web-drop';
import { TOOL_MIME } from './formats';
import { ESTIMATE_MIME } from './card-tools';
import { CHIP_MIME, legacyEstimateChip, parseChip } from './chip-rules';
import { applyChip, chipHint } from './chips';
import { inHiddenLayer } from './layers';
import { describeItem, stepInOrder } from './navigation';
import { announce } from './announce';
import { addConnectedCopy, canQuickConnect, quickConnectPoint } from './diagram-gaps';
import { isCallout, tailTip } from './diagram-extras';

/** True while a drag that started in this page is in progress (so canvas text drops ignore it). */
let pageDrag = false;
if (typeof document !== 'undefined') {
  document.addEventListener('dragstart', () => (pageDrag = true), true);
  document.addEventListener('dragend', () => (pageDrag = false), true);
  document.addEventListener('drop', () => setTimeout(() => (pageDrag = false)), true);
}
import { syncedCard } from './record-canvas';
import { createItem } from './model';
import { StickyPeel } from './sticky-peel';
import { AutoLayoutGapHandle } from './autolayout-gap-handle';

export function CanvasSurface() {
  const {
    dropDrawio,
    dropSpreadsheets,
    importDocument,
    importWhiteboardFile,
    update,
    size,
    geometries,
    dropLine,
    board,
    boardRef,
    camera,
    cancelGesture,
    covered,
    editing,
    gesture,
    guides,
    insertImages,
    insertText,
    insertWebImage,
    insertMedia,
    placeAt,
    marquee,
    openEditor,
    pointerDown,
    pointerCancel,
    pointerMove,
    pointerUp,
    previewStart,

    run,
    selected,
    viewPrefs,
    lasso,
    connectTarget,
    selectedItem,
    selectionLocked,
    setMindEditId,
    setSelected,
    shown,
    svg,
    thread,
    toWorld,
    tool,
    lastPointer,
    setContextMenu,
    renderAll,
    setEditing,
    display,
  } = useApp();
  const { renderItem } = useRenderItem();
  // Large boards: only render objects near the visible area (selected and edited objects always render).
  const view = React.useMemo(() => {
    if (renderAll || shown.items.length < 400) return null;
    const w = size.w / camera.z,
      h = size.h / camera.z,
      x = -camera.x / camera.z,
      y = -camera.y / camera.z;
    return { x: x - w * 0.5, y: y - h * 0.5, r: x + w * 1.5, b: y + h * 1.5 };
  }, [renderAll, shown.items.length, camera, size]);
  const inView = (i: (typeof shown.items)[number]) => {
    if (!view || selected.includes(i.id) || editing === i.id) return true;
    if (i.type === 'arrow') {
      const pts = geometries.get(i.id)?.samples;
      if (!pts) return true;
      return (
        pts.some(p => p.x >= view.x && p.x <= view.r && p.y >= view.y && p.y <= view.b) ||
        (Math.min(...pts.map(p => p.x)) <= view.r &&
          Math.max(...pts.map(p => p.x)) >= view.x &&
          Math.min(...pts.map(p => p.y)) <= view.b &&
          Math.max(...pts.map(p => p.y)) >= view.y)
      );
    }
    if (i.x <= view.r && i.x + i.w >= view.x && i.y <= view.b && i.y + i.h >= view.y) return true;
    // A callout whose tail reaches into view stays rendered, so its tail can still be clicked (P2-Q5).
    if (isCallout(i) && i.tail) {
      if (i.rotation) return true;
      const tip = tailTip(i, shown.items),
        x0 = Math.min(i.x, i.x + tip.x),
        x1 = Math.max(i.x + i.w, i.x + tip.x),
        y0 = Math.min(i.y, i.y + tip.y),
        y1 = Math.max(i.y + i.h, i.y + tip.y);
      return x0 <= view.r && x1 >= view.x && y0 <= view.b && y1 >= view.y;
    }
    return false;
  };
  return (
    <>
      {/* Skip link (gap F4): jumps keyboard users from the toolbars to the first object on the board. */}
      <button
        className="skip-link"
        onClick={() => {
          const first = stepInOrder(boardRef.current, undefined);
          svg.current?.focus();
          if (!first) return announce('The board is empty.');
          setSelected([first]);
          announce(describeItem(boardRef.current.items.find(i => i.id === first)!) + '. Tab moves to the next object.');
        }}
      >
        Skip to first object
      </button>
      <svg
        ref={svg}
        onDragOver={e => {
          if (
            [...e.dataTransfer.types].some(
              t =>
                t === 'Files' ||
                t === RECORD_CARD_MIME ||
                t === TOOL_MIME ||
                t === ESTIMATE_MIME ||
                t === CHIP_MIME ||
                (!pageDrag && (t === 'text/uri-list' || t === 'text/plain')),
            )
          )
            e.preventDefault();
        }}
        onDrop={e => {
          const record = e.dataTransfer.getData(RECORD_CARD_MIME);
          if (record) {
            e.preventDefault();
            if ((e.target as Element).closest('[data-record-format]')) return;
            try {
              if (record.length > 1000) return;
              const { sourceId, recordId } = JSON.parse(record);
              const current = boardRef.current;
              const source = current.items.find(i => i.id === sourceId);
              if (!source || source.locked || !source.datasetId || current.items.length >= 2000) return;
              const p = toWorld(e.clientX, e.clientY);
              const card = syncedCard(current, source.datasetId, recordId, createItem('card', p.x, p.y));
              if (card) {
                update({ ...current, items: [...current.items, card] });
                setSelected([card.id]);
              }
            } catch {
              /* Foreign or malformed drag data does not change the board. */
            }
            return;
          }
          // Chips dropped on an object: estimates (gap G12), voting dots and people avatars (track F). One undo
          // step per drop; locked objects refuse the chip.
          const chipData = e.dataTransfer.getData(CHIP_MIME),
            legacyEstimate = chipData ? '' : e.dataTransfer.getData(ESTIMATE_MIME);
          if (chipData || legacyEstimate) {
            e.preventDefault();
            const chip = chipData ? parseChip(chipData) : legacyEstimateChip(legacyEstimate);
            if (!chip) return;
            const id = (e.target as Element).closest?.('[data-item]')?.getAttribute('data-item'),
              target = id ? boardRef.current.items.find(i => i.id === id) : undefined;
            // Dropped back on a chip source (the palette, pile or People widget): nothing to do.
            if (target && ['estimates', 'dotpile', 'people'].includes(target.type)) return;
            if (!target) return display(chipHint(chip));
            try {
              update(applyChip(boardRef.current, [target.id], chip).board);
              setSelected([target.id]);
            } catch (error) {
              display((error as Error).message);
            }
            return;
          }
          const tool = e.dataTransfer.getData(TOOL_MIME);
          if (tool) {
            // A tool dragged from the toolbar or tool gallery (gap F12).
            e.preventDefault();
            if (tool.length <= 40) placeAt(tool, toWorld(e.clientX, e.clientY));
            return;
          }
          const files = [...e.dataTransfer.files];
          if (!files.length) {
            // Links and text dragged from other apps (gap B7). Drags that start inside the page (Kanban cards,
            // table rows, selected text) or that a widget already handled are left alone.
            if (e.defaultPrevented || pageDrag) return;
            // A picture dragged from a web page becomes an image object when its bytes can be read (gap b6-7).
            const picture = droppedImage(
              e.dataTransfer.getData('text/html'),
              e.dataTransfer.getData('text/uri-list'),
              e.dataTransfer.getData('text/plain'),
            );
            if (picture) {
              e.preventDefault();
              void insertWebImage(picture, toWorld(e.clientX, e.clientY));
              return;
            }
            const uri = e.dataTransfer
              .getData('text/uri-list')
              .split(/\r?\n/)
              .find(l => l && !l.startsWith('#'));
            const text = uri || e.dataTransfer.getData('text/plain');
            if (text && insertText(text, toWorld(e.clientX, e.clientY))) e.preventDefault();
            return;
          }
          e.preventDefault();
          const diagrams = files.filter(f => /\.(drawio|xml)$/i.test(f.name));
          const documents = files.filter(f => /\.(md|markdown|pptx|docx|odt|odp|rtf|csv|tsv|xlsx)$/i.test(f.name));
          const mermaid = files.filter(f => /\.(mmd|mermaid)$/i.test(f.name));
          const media = files.filter(
            f => /^(video\/|application\/pdf$)/.test(f.type) || /\.(pdf|mp4|webm|mov)$/i.test(f.name),
          );
          const rest = files.filter(
            f => !diagrams.includes(f) && !documents.includes(f) && !mermaid.includes(f) && !media.includes(f),
          );
          const images = rest.filter(
            f => f.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(f.name),
          );
          // Any other file (other Office formats, archives, text…) is kept as a File object (track J).
          for (const [k, f] of rest
            .filter(f => !images.includes(f))
            .slice(0, 10)
            .entries()) {
            const p = toWorld(e.clientX, e.clientY),
              keep = () => void insertMedia(f, 'file', { x: p.x + k * 40, y: p.y + 100 + k * 40 });
            // A whiteboard REST export (JSON) opens as a new board; other JSON files are kept as files.
            if (/\.json$/i.test(f.name)) void importWhiteboardFile(f).then(done => done || keep());
            else keep();
          }
          // Mermaid files and PDF or video files (gap list B8, B9).
          for (const [k, f] of mermaid.slice(0, 5).entries()) {
            const p = toWorld(e.clientX, e.clientY);
            void f.text().then(code =>
              update({
                ...boardRef.current,
                items: [...boardRef.current.items, mermaidItem(code, { x: p.x + k * 40, y: p.y + k * 40 })],
              }),
            );
          }
          for (const [k, f] of media.slice(0, 5).entries()) {
            const p = toWorld(e.clientX, e.clientY);
            void insertMedia(f, f.type === 'application/pdf' || /\.pdf$/i.test(f.name) ? 'pdf' : 'video', {
              x: p.x + k * 40,
              y: p.y + k * 40,
            });
          }
          // A spreadsheet dropped on a Grid fills that grid (gap b3-5); elsewhere the person picks a Table (the
          // default) or sticky notes.
          const dropId = (e.target as Element).closest?.('[data-item]')?.getAttribute('data-item'),
            dropGrid = boardRef.current.items.find(i => i.id === dropId && i.type === 'grid'),
            sheets = dropGrid ? [] : documents.filter(f => /\.(csv|tsv|xlsx)$/i.test(f.name));
          if (sheets.length) void dropSpreadsheets(sheets, toWorld(e.clientX, e.clientY));
          for (const [k, f] of documents
            .filter(f => !sheets.includes(f))
            .slice(0, 5)
            .entries()) {
            const p = toWorld(e.clientX, e.clientY);
            void importDocument(
              f,
              { x: p.x + k * 40, y: p.y + k * 40 },
              dropGrid && k === 0 && /\.(csv|tsv|xlsx)$/i.test(f.name) ? { gridId: dropGrid.id } : undefined,
            );
          }
          // Draw.io files: ask whether they become a draw.io object or native shapes (P2-Q4).
          if (diagrams.length) void dropDrawio(diagrams, toWorld(e.clientX, e.clientY));
          if (images.length) void insertImages(images, toWorld(e.clientX, e.clientY));
        }}
        className={`canvas tool-${tool}`}
        style={board.background ? { background: board.background } : undefined}
        width="100%"
        height="100%"
        aria-label="Whiteboard canvas"
        tabIndex={0}
        onDoubleClick={e => {
          if (
            (e.target as Element).closest(
              '[data-resize],[data-rotate],[data-connector-end],[data-bend],[data-callout-tail],video,iframe,.mindmap-canvas-editor',
            ) ||
            tool !== 'select' ||
            previewStart
          )
            return;
          if (e.altKey) {
            const p0 = toWorld(e.clientX, e.clientY),
              mm = [...boardRef.current.items]
                .reverse()
                .find(
                  i => i.type === 'mindmap' && p0.x >= i.x && p0.x <= i.x + i.w && p0.y >= i.y && p0.y <= i.y + i.h,
                );
            if (mm && !mm.locked) {
              setSelected([mm.id]);
              setMindEditId(mm.id);
              return;
            }
          }
          const p = toWorld(e.clientX, e.clientY);
          const item = [...boardRef.current.items]
            .reverse()
            .find(
              i =>
                !['arrow', 'pen'].includes(i.type) && p.x >= i.x && p.x <= i.x + i.w && p.y >= i.y && p.y <= i.y + i.h,
            );
          if (item) {
            setSelected([item.id]);
            openEditor(item.id);
          }
        }}
        onPointerDown={pointerDown}
        onPointerMove={e => {
          lastPointer.current = toWorld(e.clientX, e.clientY);
          pointerMove(e);
        }}
        onContextMenu={e => {
          e.preventDefault();
          cancelGesture();
          const world = toWorld(e.clientX, e.clientY),
            id = (e.target as Element).closest<SVGGElement>('[data-item]')?.dataset.item;
          if (id && !selected.includes(id)) setSelected(expandGroups(board, [id]));
          if (!id && selected.length) setSelected([]);
          setContextMenu({ x: e.clientX, y: e.clientY, world, onItem: !!id });
        }}
        onPointerUp={pointerUp}
        onPointerCancel={pointerCancel}
        onLostPointerCapture={() => {
          if (gesture.current) cancelGesture();
        }}
      >
        <defs>
          <ConnectorMarkers />
          <pattern
            id="grid"
            width={40 * camera.z}
            height={40 * camera.z}
            patternUnits="userSpaceOnUse"
            x={camera.x % (40 * camera.z)}
            y={camera.y % (40 * camera.z)}
          >
            {viewPrefs.gridStyle === 'dots' ? (
              <circle cx={1} cy={1} r={Math.max(0.8, Math.min(1.6, camera.z * 1.2))} fill="#c8c8d0" />
            ) : (
              <path d={`M ${40 * camera.z} 0 L 0 0 0 ${40 * camera.z}`} fill="none" stroke="#e4e4e8" strokeWidth=".7" />
            )}
          </pattern>
          <filter id="note-shadow" x="-10%" y="-10%" width="130%" height="140%">
            <feDropShadow dx="0" dy="3" stdDeviation="3" floodOpacity=".09" />
          </filter>
          <marker
            id="arrowhead"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
          </marker>
        </defs>
        {viewPrefs.grid && <rect className="canvas-grid" width="100%" height="100%" fill="url(#grid)" />}
        <g id="objects" transform={`translate(${camera.x} ${camera.y}) scale(${camera.z})`}>
          {[
            ...shown.items.filter(i => i.type === 'frame'),
            ...shown.items.filter(i => i.type === 'swimlane'),
            ...shown.items.filter(i => i.type === 'screen'),
            ...shown.items.filter(i => i.type !== 'frame' && i.type !== 'swimlane' && i.type !== 'screen'),
          ]
            .filter(i => !i.hidden && !inHiddenLayer(shown, i) && !covered.has(i.id) && inView(i))
            .map(renderItem)}
          {shown.items
            .filter(i => frameContentHidden(i) && !i.hidden)
            .map(f => (
              <g key={`cover-${f.id}`} className="frame-cover" data-item={f.id} transform={`translate(${f.x} ${f.y})`}>
                <rect width={f.w} height={f.h} fill="#ececf1" />
                <foreignObject width={f.w} height={f.h} pointerEvents="none">
                  <div className="frame-cover-label">
                    <EyeOff size={22} />
                    <span>Content hidden</span>
                    <small>Select the frame and choose Show contents</small>
                  </div>
                </foreignObject>
              </g>
            ))}
          {(viewPrefs.comments ? (board.comments ?? []) : [])
            .filter(t => !t.resolved || (thread && 'id' in thread && thread.id === t.id))
            .map(t => {
              const p = threadPoint(shown, t);
              return (
                <g
                  key={t.id}
                  className="comment-pin"
                  data-comment={t.id}
                  transform={`translate(${p.x} ${p.y}) scale(${1 / camera.z})`}
                  style={{ cursor: 'pointer' }}
                  role="button"
                  aria-label={`${t.messages.length} ${t.messages.length === 1 ? 'comment' : 'comments'}: ${t.messages[0].text.slice(0, 60)}`}
                >
                  <path
                    d="M0,0 L0,-18 Q0,-30 12,-30 L30,-30 Q42,-30 42,-18 L42,-12 Q42,0 30,0 Z"
                    fill={t.resolved ? '#d4d4da' : (t.color ?? '#ffb020')}
                    stroke="#ffffff"
                    strokeWidth="2"
                  />
                  <text
                    aria-hidden="true"
                    x="21"
                    y="-11"
                    textAnchor="middle"
                    fontSize="12"
                    fontWeight="700"
                    fill={t.color && !t.resolved ? '#ffffff' : '#25252c'}
                  >
                    {t.messages.length}
                  </text>
                </g>
              );
            })}
          {board.voting?.active &&
            board.voting.targets.map(id => {
              const target = shown.items.find(i => i.id === id);
              return target && !target.hidden ? (
                <g key={`vote-${id}`} transform={`translate(${target.x + target.w / 2} ${target.y - 22 / camera.z})`}>
                  <VoteBadge
                    count={board.voting!.votes[id] ?? 0}
                    scale={1 / camera.z}
                    onVote={delta => run(b => castVote(b, id, delta))}
                  />
                </g>
              ) : null;
            })}
        </g>
        {selectionBounds(shown.items, selected) &&
          (() => {
            // A single rotated object keeps its handles on its own (rotated) outline (gap D1).
            const turned = selected.length === 1 && selectedItem?.rotation ? selectedItem : null,
              b = turned
                ? { x: turned.x, y: turned.y, w: turned.w, h: turned.h }
                : selectionBounds(shown.items, selected)!,
              rotatable =
                selected.length > 1
                  ? selected.some(id => {
                      const i = shown.items.find(n => n.id === id);
                      return !!i && canRotate(i);
                    })
                  : !!selectedItem && canRotate(selectedItem),
              // Diagonally out from the top-right corner, clear of the "+" quick-connect handles (gaps D1, E1).
              top = {
                x: b.x + b.w + (SELECT_GAP + ROTATE_GAP * 0.6) / camera.z,
                y: b.y - (SELECT_GAP + ROTATE_GAP * 0.6) / camera.z,
              };
            return (
              <g
                className="selection"
                transform={`translate(${camera.x} ${camera.y}) scale(${camera.z})${turned ? rotateAbout(turned) : ''}`}
              >
                {!editing && !selectionLocked && rotatable && (
                  <g className="rotate-handle">
                    <line
                      x1={top.x}
                      y1={top.y}
                      x2={b.x + b.w + SELECT_GAP / camera.z}
                      y2={b.y - SELECT_GAP / camera.z}
                      stroke="#9a9aa3"
                      strokeWidth={1 / camera.z}
                      strokeDasharray={`${2 / camera.z} ${2 / camera.z}`}
                      pointerEvents="none"
                    />
                    <circle
                      data-rotate="1"
                      cx={top.x}
                      cy={top.y}
                      r={7 / camera.z}
                      fill="white"
                      stroke="#4262ff"
                      strokeWidth={1.5 / camera.z}
                    >
                      <title>Rotate (Shift snaps to 15°)</title>
                    </circle>
                    <path
                      d={`M${top.x - 3 / camera.z},${top.y - 1 / camera.z} A${3 / camera.z},${3 / camera.z} 0 1 0 ${top.x},${top.y - 3 / camera.z}`}
                      fill="none"
                      stroke="#4262ff"
                      strokeWidth={1.2 / camera.z}
                      pointerEvents="none"
                    />
                  </g>
                )}
                {selected.length > 1 && (
                  <rect
                    x={b.x - SELECT_GAP / camera.z}
                    y={b.y - SELECT_GAP / camera.z}
                    width={b.w + (2 * SELECT_GAP) / camera.z}
                    height={b.h + (2 * SELECT_GAP) / camera.z}
                    fill="none"
                    stroke="#4262ff"
                    strokeWidth={1.5 / camera.z}
                    pointerEvents="none"
                  />
                )}
                {viewPrefs.dimensions && !(selected.length === 1 && selectedItem?.type === 'arrow') && (
                  <text
                    className="dimension-label"
                    x={b.x + b.w / 2}
                    y={b.y + b.h + 22 / camera.z}
                    textAnchor="middle"
                    fontSize={12 / camera.z}
                    pointerEvents="none"
                  >
                    {dimensionLabel(b)}
                  </text>
                )}
                {!editing &&
                  !selectionLocked &&
                  !(selected.length === 1 && selectedItem?.type === 'arrow') &&
                  handles.map(handle => {
                    // Handles sit on the outline (item 112): round corners are drawn; sides only resize.
                    const g = SELECT_GAP / camera.z,
                      p = handlePoint({ x: b.x - g, y: b.y - g, w: b.w + 2 * g, h: b.h + 2 * g }, handle),
                      corner = handle.length === 2,
                      hit = (corner ? 11 : 7) / camera.z;
                    return (
                      <g key={handle}>
                        <rect
                          data-resize={handle}
                          x={p.x - hit}
                          y={p.y - hit}
                          width={2 * hit}
                          height={2 * hit}
                          fill="transparent"
                          style={{ cursor: resizeCursor(handle, turned?.rotation) }}
                        />
                        {corner && (
                          <circle
                            className="resize-handle"
                            cx={p.x}
                            cy={p.y}
                            r={5 / camera.z}
                            fill="white"
                            stroke="#9a9aa3"
                            strokeWidth={1.5 / camera.z}
                            pointerEvents="none"
                          />
                        )}
                      </g>
                    );
                  })}
                {!editing &&
                  !selectionLocked &&
                  selected.length === 1 &&
                  selectedItem &&
                  !['arrow', 'pen', 'frame', 'swimlane', 'stickypad'].includes(selectedItem.type) &&
                  anchorSides.map(side => {
                    const p = anchorPoint(b, side, camera.z);
                    return (
                      <g key={side} className="connect-anchor" style={{ cursor: 'crosshair' }}>
                        <circle cx={p.x} cy={p.y} r={10 / camera.z} fill="transparent" data-anchor={side} />
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r={3.5 / camera.z}
                          fill="#4262ff"
                          stroke="#ffffff"
                          strokeWidth={1 / camera.z}
                          pointerEvents="none"
                        />
                      </g>
                    );
                  })}
                {!editing &&
                  !selectionLocked &&
                  !previewStart &&
                  selected.length === 1 &&
                  selectedItem?.type === 'autolayout' && <AutoLayoutGapHandle item={selectedItem} />}
                {!editing &&
                  !selectionLocked &&
                  selected.length === 1 &&
                  selectedItem &&
                  canQuickConnect(selectedItem) &&
                  anchorSides.map(side => {
                    // Quick connect (gap E1): "+" further out than the connection dot adds a connected copy.
                    const p = quickConnectPoint(b, side, camera.z),
                      r = 9 / camera.z,
                      arm = 4 / camera.z;
                    return (
                      <g
                        key={`quick-${side}`}
                        className="quick-connect"
                        data-quick-connect={side}
                        role="button"
                        aria-label={`Add connected copy ${side}`}
                        style={{ cursor: 'pointer' }}
                        onPointerDown={e => {
                          e.stopPropagation();
                          e.preventDefault();
                        }}
                        onClick={e => {
                          e.stopPropagation();
                          try {
                            const next = addConnectedCopy(boardRef.current, selectedItem.id, side);
                            update(next.board);
                            setSelected([next.item.id]);
                            setEditing(next.item.id);
                          } catch (error) {
                            display((error as Error).message);
                          }
                        }}
                      >
                        <circle cx={p.x} cy={p.y} r={r} fill="#ffffff" stroke="#4262ff" strokeWidth={1.5 / camera.z} />
                        <path
                          d={`M${p.x - arm} ${p.y} H${p.x + arm} M${p.x} ${p.y - arm} V${p.y + arm}`}
                          stroke="#4262ff"
                          strokeWidth={1.8 / camera.z}
                          strokeLinecap="round"
                          pointerEvents="none"
                        />
                      </g>
                    );
                  })}
              </g>
            );
          })()}
        {selected.length === 1 &&
          selectedItem?.type === 'arrow' &&
          !editing &&
          !selectedItem.locked &&
          (() => {
            const g = connectorGeometry(selectedItem, shown.items);
            return (
              <g className="selection" transform={`translate(${camera.x} ${camera.y}) scale(${camera.z})`}>
                {bendHandles(selectedItem, g).map(h => (
                  <rect
                    key={`${h.kind}${h.index}`}
                    data-bend={`${h.kind}:${h.index}`}
                    aria-label={h.kind === 'bend' ? `Bend ${h.index}` : `Bend segment ${h.index + 1}`}
                    x={h.at.x - (h.kind === 'bend' ? 6 : 5) / camera.z}
                    y={h.at.y - (h.kind === 'bend' ? 6 : 5) / camera.z}
                    width={(h.kind === 'bend' ? 12 : 10) / camera.z}
                    height={(h.kind === 'bend' ? 12 : 10) / camera.z}
                    rx={(h.kind === 'bend' ? 6 : 5) / camera.z}
                    fill={h.kind === 'bend' ? '#4262ff' : '#ffffff'}
                    stroke="#4262ff"
                    strokeWidth={1.5 / camera.z}
                    style={{ cursor: 'move' }}
                  />
                ))}
                {(['start', 'end'] as const).map(end => (
                  <circle
                    key={end}
                    data-connector-end={end}
                    cx={g[end].x}
                    cy={g[end].y}
                    r={6 / camera.z}
                    fill="#ffffff"
                    stroke="#4262ff"
                    strokeWidth={1.5 / camera.z}
                    style={{ cursor: 'crosshair' }}
                  />
                ))}
              </g>
            );
          })()}
        {selected.length === 1 &&
          selectedItem &&
          isCallout(selectedItem) &&
          !editing &&
          !selectedItem.locked &&
          (() => {
            // Callout tail handle (track R2-H): drag onto an object to point at it; Alt leaves it free.
            const tip = tailTip(selectedItem, shown.items),
              r = 6 / camera.z;
            return (
              <g
                className="selection"
                transform={`translate(${camera.x} ${camera.y}) scale(${camera.z})${rotateAbout(selectedItem)}`}
              >
                <circle
                  data-callout-tail={selectedItem.id}
                  aria-label="Callout tail"
                  cx={selectedItem.x + tip.x}
                  cy={selectedItem.y + tip.y}
                  r={r}
                  fill={selectedItem.tail?.target ? '#4262ff' : '#ffffff'}
                  stroke="#4262ff"
                  strokeWidth={1.5 / camera.z}
                  style={{ cursor: 'crosshair' }}
                >
                  <title>Drag onto an object to point the tail at it</title>
                </circle>
              </g>
            );
          })()}
        {dropLine && (
          <line
            className="drop-indicator"
            x1={dropLine.x1 * camera.z + camera.x}
            y1={dropLine.y1 * camera.z + camera.y}
            x2={dropLine.x2 * camera.z + camera.x}
            y2={dropLine.y2 * camera.z + camera.y}
            stroke="#4262ff"
            strokeWidth="3"
            strokeLinecap="round"
            pointerEvents="none"
          />
        )}
        {guides.map((guide, index) => (
          <line
            key={index}
            className="snap-guide"
            x1={(guide.axis === 'x' ? guide.at : guide.start) * camera.z + camera.x}
            y1={(guide.axis === 'y' ? guide.at : guide.start) * camera.z + camera.y}
            x2={(guide.axis === 'x' ? guide.at : guide.end) * camera.z + camera.x}
            y2={(guide.axis === 'y' ? guide.at : guide.end) * camera.z + camera.y}
            stroke="#4262ff"
            strokeWidth="1"
            strokeDasharray="4 3"
            pointerEvents="none"
          />
        ))}
        {/* Pulling a note off a sticky stack, animated frame by frame (items 110, 133). */}
        <StickyPeel />
        {connectTarget &&
          (() => {
            // Drop target while drawing a connector (item 113): shaded, outlined, with its connection points.
            const target = shown.items.find(i => i.id === connectTarget);
            if (!target) return null;
            const b = { x: target.x, y: target.y, w: target.w, h: target.h },
              g = SELECT_GAP / camera.z;
            return (
              <g
                className="connect-target"
                transform={`translate(${camera.x} ${camera.y}) scale(${camera.z})${rotateAbout(target)}`}
                pointerEvents="none"
              >
                <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="#00000014" />
                <rect
                  x={b.x - g}
                  y={b.y - g}
                  width={b.w + 2 * g}
                  height={b.h + 2 * g}
                  fill="none"
                  stroke="#4262ff"
                  strokeWidth={1.5 / camera.z}
                />
                {anchorSides.map(side => {
                  const p = anchorPoint(b, side, camera.z);
                  return <circle key={side} cx={p.x} cy={p.y} r={4 / camera.z} fill="#4262ff" />;
                })}
              </g>
            );
          })()}
        {lasso && lasso.length > 1 && (
          <polygon
            className="lasso-path"
            points={lasso.map(p => `${p.x * camera.z + camera.x},${p.y * camera.z + camera.y}`).join(' ')}
            fill="#4262ff12"
            stroke="#4262ff"
            strokeDasharray="5 4"
            pointerEvents="none"
          />
        )}
        {marquee && (
          <rect
            x={marquee.x * camera.z + camera.x}
            y={marquee.y * camera.z + camera.y}
            width={marquee.w * camera.z}
            height={marquee.h * camera.z}
            fill="#4262ff15"
            stroke="#4262ff"
          />
        )}
      </svg>
    </>
  );
}
