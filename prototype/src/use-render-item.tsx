import React from 'react';
import { Lock, Link as LinkIcon } from 'lucide-react';
import { richKinds } from './model';
import type { Item } from './model';
import { formatStyle, CanvasTextEditor, TextBody } from './text-format';
import { RichPreview } from './formats';
import { NoteBadges } from './sticky-tools';
import { connectorGeometry, ConnectorCaption } from './connectors';
import { isShapeKind } from './shapes';
import type { ShapeKind } from './shapes';
import { ShapeBody, shapeTextBox } from './shape-tools';
import { ImageBody } from './image-tools';
import { EmojiBadge } from './note-extras';
import { MindmapCanvasEditor } from './mindmap-canvas';
import { CodePreview } from './code-block';
import { strokePath, penPresets, jumpPath, pointAlong } from './board-tools';
import type { PenStyle } from './board-tools';
import { viewFor } from './widgets';
import type { WidgetCtx } from './widget-types';
import { useApp } from './board-app';
import { CanvasRecords } from './canvas-records';
import { gridOwner } from './grid-canvas';
import './canvas-workflows.css';

/** Renders one board object (shape, note, connector, widget, media) with its overlays. */
export function useRenderItem() {
  const {
    previewState,
    assets,
    boardRef,
    camera,
    editing,
    editSeed,
    geometries,
    jumps,
    matches,
    mindEditId,
    openEditor,
    privateSet,
    selected,
    setEditing,
    setMindEditId,
    setSelected,
    shown,
    update,
    widgetCtx,
  } = useApp();
  function renderItem(i: Item) {
    if (gridOwner(shown, i.id)?.locked) i = { ...i, locked: true };
    const isSelected = selected.includes(i.id),
      frame = i.type === 'frame',
      shape = isShapeKind(i.type),
      hitMark = matches.ids.has(i.id);
    const tb =
      i.type === 'text'
        ? { x: 0, y: 0, w: i.w, h: i.h }
        : shape
          ? shapeTextBox(i)
          : { x: 12, y: 12, w: Math.max(20, i.w - 24), h: Math.max(20, i.h - 24) };
    if (i.type === 'arrow') {
      const g0 = geometries.get(i.id) ?? connectorGeometry(i, shown.items),
        hops = jumps.get(i.id),
        geometry = {
          ...g0,
          path: hops && !g0.loop ? jumpPath(g0.samples, hops) : g0.path,
          mid: i.connector?.labelAt !== undefined ? pointAlong(g0.nodes, i.connector.labelAt) : g0.mid,
        },
        c = i.connector ?? {},
        width = c.width ?? 2,
        startHead = c.startHead ?? 'none',
        endHead = c.endHead ?? 'arrow';
      return (
        <g
          key={i.id}
          data-item={i.id}
          data-connector-path={i.connector?.path ?? 'straight'}
          role="img"
          aria-label={i.text ? `Connector: ${i.text}` : 'Connector'}
          onDoubleClick={e => {
            e.stopPropagation();
            setSelected([i.id]);
            setEditing(i.id);
          }}
        >
          <path d={geometry.path} stroke="transparent" strokeWidth={18 / camera.z} fill="none" />
          {hitMark && (
            <path
              className="search-hit"
              d={geometry.path}
              stroke="#ffb020"
              strokeWidth={width + (matches.current === i.id ? 10 : 6) / camera.z}
              opacity=".55"
              fill="none"
              pointerEvents="none"
            />
          )}
          {isSelected && (
            <path
              d={geometry.path}
              stroke="#4262ff"
              strokeWidth={width + 4 / camera.z}
              opacity=".35"
              fill="none"
              pointerEvents="none"
            />
          )}
          <path
            d={geometry.path}
            stroke={i.fill}
            strokeWidth={width}
            strokeDasharray={
              c.dash === 'dashed' ? `${width * 4} ${width * 2}` : c.dash === 'dotted' ? `0 ${width * 2.5}` : undefined
            }
            strokeLinecap="round"
            markerStart={startHead === 'none' ? undefined : `url(#connector-head-${startHead})`}
            markerEnd={endHead === 'none' ? undefined : `url(#connector-head-${endHead})`}
            fill="none"
          />
          <ConnectorCaption
            item={i}
            mid={geometry.mid}
            editing={editing === i.id}
            onCommit={text => {
              update({
                ...boardRef.current,
                items: boardRef.current.items.map(n => (n.id === i.id ? { ...n, text } : n)),
              });
              setEditing(null);
            }}
          />
        </g>
      );
    }
    return (
      <g
        key={i.id}
        data-item={i.id}
        transform={`translate(${i.x} ${i.y})`}
        onDoubleClick={e => {
          if (!['pen'].includes(i.type)) {
            e.stopPropagation();
            openEditor(i.id);
            setSelected([i.id]);
          }
        }}
        role={viewFor(i.type)?.interactive || ['table', 'kanban', 'timeline'].includes(i.type) ? 'group' : 'img'}
        aria-label={`${i.type}: ${i.text || 'Untitled'}`}
      >
        <rect className="object-hit-area" width={i.w} height={i.h} fill="transparent" pointerEvents="all" />
        {i.type === 'note' && (
          <>
            <rect width={i.w} height={i.h} fill={i.fill} filter="url(#note-shadow)" />
            <path d={`M${i.w - 18} ${i.h} L${i.w} ${i.h - 18} L${i.w} ${i.h}Z`} fill="#000" opacity=".04" />
          </>
        )}
        {richKinds.includes(i.type) && mindEditId !== i.id && (
          <foreignObject
            width={i.w}
            height={i.h}
            pointerEvents={['table', 'kanban', 'timeline'].includes(i.type) ? 'all' : 'none'}
          >
            {['table', 'kanban', 'timeline'].includes(i.type) ? (
              <CanvasRecords item={i} ctx={widgetCtx(i)} />
            ) : (
              <RichPreview item={i} board={shown} />
            )}
          </foreignObject>
        )}
        {i.type === 'mindmap' && mindEditId === i.id && (
          <foreignObject width={i.w} height={i.h} pointerEvents="all" className="mindmap-canvas-editor">
            <MindmapCanvasEditor
              item={i}
              onCommit={nodes =>
                update({
                  ...boardRef.current,
                  items: boardRef.current.items.map(n => (n.id === i.id ? { ...n, nodes } : n)),
                })
              }
              onClose={() => setMindEditId(null)}
            />
          </foreignObject>
        )}
        {(i.link || i.tags?.length) && <NoteBadges item={i} />}{' '}
        {shape && <ShapeBody item={i as Item & { type: ShapeKind }} />}
        {i.type === 'image' && <ImageBody item={i} asset={assets[i.assetId!]} />}
        {i.type === 'code' && (
          <foreignObject width={i.w} height={i.h} pointerEvents="none">
            <CodePreview item={i} />
          </foreignObject>
        )}
        {frame && (
          <>
            <rect width={i.w} height={i.h} fill={i.fill} fillOpacity=".5" stroke="#c5c5ce" strokeWidth={1 / camera.z} />
            <text y={-12 / camera.z} fill="#52525b" fontSize={13 / camera.z}>
              {i.text || 'Untitled frame'}
            </text>
          </>
        )}
        {i.type === 'pen' &&
          (() => {
            const st = (i.data?.style ?? 'pen') as PenStyle,
              wd = i.data?.width ?? 3;
            return (
              <>
                <rect width={i.w} height={i.h} fill="transparent" />
                <path
                  d={strokePath(i.points ?? [])}
                  fill="none"
                  stroke={i.fill}
                  strokeWidth={wd}
                  strokeOpacity={penPresets[st].opacity}
                  strokeLinecap={st === 'highlighter' ? 'butt' : 'round'}
                  strokeLinejoin="round"
                  style={st === 'highlighter' ? { mixBlendMode: 'multiply' } : undefined}
                />
              </>
            );
          })()}
        {viewFor(i.type) &&
          (() => {
            const v = viewFor(i.type)!,
              ctx = widgetCtx(i),
              R = v.Render as (props: { item: Item; ctx: WidgetCtx }) => React.ReactNode;
            return v.mode === 'svg' ? (
              <g className={v.interactive ? 'widget-interactive' : undefined}>
                <R item={i} ctx={ctx} />
              </g>
            ) : (
              <foreignObject
                width={Math.max(1, i.w)}
                height={Math.max(1, i.h)}
                pointerEvents={v.interactive ? 'all' : 'none'}
                className={v.interactive ? 'widget-interactive' : undefined}
              >
                <R item={i} ctx={ctx} />
              </foreignObject>
            );
          })()}
        {i.linkTo && (
          <g
            className="link-badge"
            data-link={i.linkTo}
            transform={`translate(${-4 / camera.z} ${i.h + 4 / camera.z}) scale(${1 / camera.z})`}
            style={{ cursor: 'pointer' }}
            role="link"
            aria-label="Go to linked object"
          >
            <circle r="11" fill="#4262ff" />
            <LinkIcon x={-6.5} y={-6.5} width={13} height={13} color="#ffffff" />
          </g>
        )}
        {editing !== i.id && !['frame', 'pen', 'image', 'code', ...richKinds].includes(i.type) && !viewFor(i.type) && (
          <foreignObject x={tb.x} y={tb.y} width={tb.w} height={tb.h} pointerEvents="none">
            {privateSet.has(i.id) ? (
              <div className="object-text private-text" aria-label="Private note">
                Private
              </div>
            ) : (
              <div
                className={`object-text ${i.type === 'text' ? 'plain-text' : ''}`}
                style={{ color: i.type === 'text' ? i.fill : '#22232b', ...formatStyle(i) }}
              >
                <TextBody item={i} />
              </div>
            )}
          </foreignObject>
        )}
        {i.type === 'note' && <EmojiBadge item={i} />}
        {editing === i.id && (
          <foreignObject
            x={frame ? 0 : shape ? tb.x - 4 : 8}
            y={frame ? -40 : shape ? tb.y - 4 : 8}
            width={frame ? i.w - 16 : shape ? tb.w + 8 : i.w - 16}
            height={frame ? 40 : shape ? tb.h + 8 : i.h - 16}
          >
            <CanvasTextEditor
              item={i}
              initialText={editSeed.current?.id === i.id ? editSeed.current.text : undefined}
              onCommit={text => {
                editSeed.current = null;
                update({
                  ...boardRef.current,
                  items: boardRef.current.items.map(n => (n.id === i.id ? { ...n, text } : n)),
                });
                setEditing(null);
              }}
            />
          </foreignObject>
        )}
        {hitMark && (
          <rect
            className="search-hit"
            x={-6 / camera.z}
            y={-6 / camera.z}
            width={i.w + 12 / camera.z}
            height={i.h + 12 / camera.z}
            rx={4 / camera.z}
            fill="#ffb02014"
            stroke="#ffb020"
            strokeWidth={(matches.current === i.id ? 4 : 2) / camera.z}
            pointerEvents="none"
          />
        )}
        {i.locked && (
          <g
            className="lock-badge"
            transform={`translate(${i.w - 4 / camera.z} ${-4 / camera.z}) scale(${1 / camera.z})`}
            pointerEvents="none"
          >
            <circle r="11" fill="#ffffff" stroke="#d4d4da" />
            <Lock x={-7} y={-7} width={14} height={14} color="#52525b" />
          </g>
        )}
        {isSelected && (
          <g className="selection">
            <rect
              x={-3 / camera.z}
              y={-3 / camera.z}
              width={i.w + 6 / camera.z}
              height={i.h + 6 / camera.z}
              fill="none"
              stroke={i.locked ? '#8a8a94' : '#4262ff'}
              strokeDasharray={i.locked ? `${4 / camera.z} ${3 / camera.z}` : undefined}
              strokeWidth={1.5 / camera.z}
              pointerEvents="none"
            />
          </g>
        )}
      </g>
    );
  }
  // Reuse an object's rendered element when nothing it depends on changed, so React skips that
  // subtree (items are immutable: unchanged objects keep their identity between board versions).
  const cache = React.useRef(new WeakMap<Item, { sig: string; deps: unknown[]; el: React.ReactNode }>());
  const zoomDependent = (i: Item) =>
    i.type === 'frame' ||
    !!gridOwner(shown, i.id)?.locked ||
    i.type === 'arrow' ||
    !!i.locked ||
    !!i.linkTo ||
    selected.includes(i.id) ||
    matches.ids.has(i.id) ||
    !!viewFor(i.type);
  function renderCached(i: Item): React.ReactNode {
    const sig = [
      selected.includes(i.id),
      !!gridOwner(shown, i.id)?.locked,
      editing === i.id,
      matches.ids.has(i.id),
      matches.current === i.id,
      privateSet.has(i.id),
      mindEditId === i.id,
      zoomDependent(i) ? camera.z : 0,
    ].join('|');
    const deps: unknown[] = [
      i.type === 'arrow' ? geometries.get(i.id) : null,
      i.type === 'arrow' ? jumps.get(i.id) : null,
      viewFor(i.type) || richKinds.includes(i.type) ? shown : null,
      i.assetId ? assets[i.assetId] : null,
      // Widgets read the prototype preview state and selection through their context.
      viewFor(i.type) ? previewState : null,
    ];
    const hit = cache.current.get(i);
    if (hit && hit.sig === sig && hit.deps.every((d, k) => d === deps[k])) return hit.el;
    const el = renderItem(i);
    cache.current.set(i, { sig, deps, el });
    return el;
  }
  return { renderItem: renderCached };
}
