import { expandGroups } from './arrange';
import React from 'react';
import { selectionBounds, handles, handlePoint } from './interactions';
import { connectorGeometry, ConnectorMarkers } from './connectors';
import { bendHandles } from './connector-geometry';
import { castVote, threadPoint, frameContentHidden } from './board-tools';
import { VoteBadge } from './board-panels';
import { EyeOff } from 'lucide-react';
import { useApp } from './board-app';
import { useRenderItem } from './use-render-item';
import { RECORD_CARD_MIME } from './record-card-handle';
import { syncedCard } from './record-canvas';
import { createItem } from './model';

export function CanvasSurface() {
  const {
    insertDrawio,
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
    marquee,
    openEditor,
    pointerDown,
    pointerMove,
    pointerUp,
    previewStart,

    run,
    selected,
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
  } = useApp();
  const { renderItem } = useRenderItem();
  // Large boards: only render objects near the visible area (selected and edited objects always render).
  const view = React.useMemo(() => {
    if (shown.items.length < 400) return null;
    const w = size.w / camera.z,
      h = size.h / camera.z,
      x = -camera.x / camera.z,
      y = -camera.y / camera.z;
    return { x: x - w * 0.5, y: y - h * 0.5, r: x + w * 1.5, b: y + h * 1.5 };
  }, [shown.items.length, camera, size]);
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
    return i.x <= view.r && i.x + i.w >= view.x && i.y <= view.b && i.y + i.h >= view.y;
  };
  return (
    <>
      <svg
        ref={svg}
        onDragOver={e => {
          if ([...e.dataTransfer.types].some(t => t === 'Files' || t === RECORD_CARD_MIME)) e.preventDefault();
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
          const files = [...e.dataTransfer.files];
          if (!files.length) return;
          e.preventDefault();
          const diagrams = files.filter(f => /\.(drawio|xml)$/i.test(f.name));
          const images = files.filter(f => !diagrams.includes(f));
          if (diagrams.length) void insertDrawio(diagrams, toWorld(e.clientX, e.clientY));
          if (images.length) void insertImages(images, toWorld(e.clientX, e.clientY));
        }}
        className={`canvas tool-${tool}`}
        width="100%"
        height="100%"
        aria-label="Whiteboard canvas"
        tabIndex={0}
        onDoubleClick={e => {
          if (
            (e.target as Element).closest(
              '[data-resize],[data-connector-end],[data-bend],video,iframe,.mindmap-canvas-editor',
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
        onPointerCancel={cancelGesture}
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
            <path d={`M ${40 * camera.z} 0 L 0 0 0 ${40 * camera.z}`} fill="none" stroke="#e4e4e8" strokeWidth=".7" />
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
        <rect width="100%" height="100%" fill="url(#grid)" />
        <g id="objects" transform={`translate(${camera.x} ${camera.y}) scale(${camera.z})`}>
          {[
            ...shown.items.filter(i => i.type === 'frame'),
            ...shown.items.filter(i => i.type === 'screen'),
            ...shown.items.filter(i => i.type !== 'frame' && i.type !== 'screen'),
          ]
            .filter(i => !i.hidden && !covered.has(i.id) && inView(i))
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
          {(board.comments ?? [])
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
                  aria-label={`Comment: ${t.messages[0].text.slice(0, 60)}`}
                >
                  <path
                    d="M0,0 L0,-18 Q0,-30 12,-30 L30,-30 Q42,-30 42,-18 L42,-12 Q42,0 30,0 Z"
                    fill={t.resolved ? '#d4d4da' : '#ffb020'}
                    stroke="#ffffff"
                    strokeWidth="2"
                  />
                  <text x="21" y="-11" textAnchor="middle" fontSize="12" fontWeight="700" fill="#25252c">
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
            const b = selectionBounds(shown.items, selected)!;
            return (
              <g className="selection" transform={`translate(${camera.x} ${camera.y}) scale(${camera.z})`}>
                {selected.length > 1 && (
                  <rect
                    x={b.x - 3 / camera.z}
                    y={b.y - 3 / camera.z}
                    width={b.w + 6 / camera.z}
                    height={b.h + 6 / camera.z}
                    fill="none"
                    stroke="#4262ff"
                    strokeWidth={1.5 / camera.z}
                    pointerEvents="none"
                  />
                )}
                {!editing &&
                  !selectionLocked &&
                  !(selected.length === 1 && selectedItem?.type === 'arrow') &&
                  handles.map(handle => {
                    const p = handlePoint(b, handle);
                    return (
                      <g key={handle}>
                        <rect
                          data-resize={handle}
                          x={p.x - 11 / camera.z}
                          y={p.y - 11 / camera.z}
                          width={22 / camera.z}
                          height={22 / camera.z}
                          fill="transparent"
                          style={{ cursor: `${handle}-resize` }}
                        />
                        <rect
                          x={p.x - 4 / camera.z}
                          y={p.y - 4 / camera.z}
                          width={8 / camera.z}
                          height={8 / camera.z}
                          fill="white"
                          stroke="#4262ff"
                          strokeWidth={1.5 / camera.z}
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
                    rx={2 / camera.z}
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
                    r={7 / camera.z}
                    fill={selectedItem[end === 'start' ? 'from' : 'to'] ? '#4262ff' : '#ffffff'}
                    stroke="#4262ff"
                    strokeWidth={2 / camera.z}
                    style={{ cursor: 'crosshair' }}
                  />
                ))}
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
