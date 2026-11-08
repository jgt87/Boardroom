import React, { useRef } from 'react';
import { pinchCamera } from './camera';
import type { Camera } from './camera';
import { clone, createItem } from './model';
import type { Board, Item, Kind, Point } from './model';
import {
  translate,
  selectWithin,
  snapMove,
  snapToGrid,
  snapResize,
  resizeBounds,
  resizeItems,
  resizeRotated,
  rotateItems,
  rotationDelta,
  scaleTextFont,
  selectionBounds,
  textCornerScales,
} from './interactions';
import { boxCenter, canRotate, handleAngle, pointInBox } from './rotation';
import type { Bounds, Handle } from './interactions';
import { moveConnectorEndpoint, dragBend } from './connector-geometry';
import { snap45 } from './diagram-gaps';
import { canTailTarget, moveConnectorLabel, pointOnCalloutTail, setCalloutTail } from './diagram-extras';
import { expandGroups, editableIds, moveIds, duplicateItems } from './arrange';
import { adoptIntoContainers, insertionPreview } from './autolayout';
import { canCopyToRecords, copyToRecords, recordDropAt } from './record-canvas';
import { adoptGridObjects, detachGridObjects, gridDropAt } from './grid-canvas';
import { stackNext, simplify, strokeFromPoints, eraseAt, eraseAlong, nearestAlong } from './board-tools';
import { pressureOf, settlePressure } from './pen-pressure';
import { recognizeStroke, lassoSelect, lineEnds, isScribble, scribbleTargets } from './pen-smart';
import { padSheet, peelNote } from './specs-stickypad';
import { removeChipMark } from './chips';
import type { ChipBadge } from './chips';
import { detaches } from './peel-motion';
import type { PeelState } from './peel-motion';
import {
  newPenState,
  pointerPolicy,
  ignoreTouch,
  penDown,
  penUp,
  LONG_PRESS_MS,
  longPressApplies,
  longPressMoved,
} from './pointer-input';
import type { PenState } from './pointer-input';

/** Topmost object a connector being drawn would attach to at `p` (item 113). */
const connectTargetAt = (board: { items: Item[] }, p: Point, fromId?: string) =>
  [...board.items].reverse().find(
    i =>
      !['arrow', 'pen', 'frame', 'swimlane', 'stickypad'].includes(i.type) &&
      !i.hidden &&
      i.id !== fromId &&
      // A callout's tail counts as part of it (P2-Q5).
      (pointInBox(i, p) || pointOnCalloutTail(i, board.items, p)),
  );
/** Topmost object a callout tail dragged to `p` would point at (track R2-H). */
const tailTargetAt = (board: { items: Item[] }, p: Point, calloutId: string) =>
  [...board.items].reverse().find(i => canTailTarget(i, calloutId) && pointInBox(i, p));
/** A pen stroke's points in world coordinates. */
const absolutePoints = (i: Item) => (i.points ?? []).map(p => ({ x: i.x + p.x, y: i.y + p.y }));
import type { BoardCore, Gesture } from './board-app';
import { isShapeKind } from './shapes';

/** Pointer gestures on the canvas: select, move, resize, pan, draw, erase, connect, bend and label drags. */
export function useCanvasGestures(core: BoardCore) {
  const touches = useRef(new Map<number, { x: number; y: number }>()),
    pinch = useRef<{ camera: Camera; a: { x: number; y: number }; b: { x: number; y: number } } | null>(null),
    // Pen and palm handling (track R5) and the pointer that owns the current gesture.
    pen = useRef<PenState>(newPenState()),
    owner = useRef<{ id: number; touch: boolean } | null>(null),
    // A pending touch long press (track C): the finger, where it went down and its timer.
    longPress = useRef<{ id: number; x: number; y: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const {
    setDropLine,
    display,
    board,
    boardRef,
    svg,
    camera,
    draft,
    editing,
    eraseLast,
    eraser,
    fill,
    followLink,
    geometryOf,
    gesture,
    penColor,
    penStyle,
    penWidth,
    precise,
    previewStart,
    selected,
    selectedItem,
    setCamera,
    setDraft,
    setEditing,
    setGuides,
    setMarquee,
    setSelected,
    setThread,
    setTool,
    snapping,
    viewPrefs,
    space,
    stackLast,
    toWorld,
    tool,
    update,
    makePlacedItem,
    finishPlacedItem,
    setMindEditId,
    setCodeId,
    penMode,
    setLasso,
    setConnectTarget,
    setPeeling,
    setContextMenu,
  } = core;
  function clearLongPress() {
    if (longPress.current) clearTimeout(longPress.current.timer);
    longPress.current = null;
  }
  /**
   * Long press on touch (track C): holding a still finger on an object selects it and opens its context menu;
   * on empty canvas it opens the canvas menu. Moving, lifting, a second finger or the pen cancels it.
   */
  function armLongPress(e: React.PointerEvent<SVGSVGElement>, itemId: string | undefined) {
    clearLongPress();
    const { clientX: x, clientY: y, pointerId: id } = e;
    const timer = setTimeout(() => {
      if (longPress.current?.id !== id) return;
      longPress.current = null;
      const current = boardRef.current;
      cancelGesture();
      if (itemId && current.items.some(i => i.id === itemId)) setSelected(expandGroups(current, [itemId]));
      else setSelected([]);
      setContextMenu({ x, y, world: toWorld(x, y), onItem: !!itemId });
    }, LONG_PRESS_MS);
    longPress.current = { id, x, y, timer };
  }
  const hit = (e: React.PointerEvent) => (e.target as Element).closest<SVGGElement>('[data-item]')?.dataset.item;
  function cancelGesture() {
    const g = gesture.current;
    gesture.current = null;
    owner.current = null;
    clearLongPress();
    if (g?.mode === 'pan') setCamera(g.camera);
    if (g && 'originalIds' in g && g.originalIds) setSelected(g.originalIds);
    setDraft(null);
    setDropLine(null);
    setMarquee(null);
    setLasso(null);
    setConnectTarget(null);
    setPeeling(null);
    setGuides([]);
  }
  function transformed(g: Gesture, p: Point, shift: boolean, alt: boolean) {
    const delta = { x: p.x - g.start.x, y: p.y - g.start.y };
    if (g.mode === 'move') {
      const result =
        viewPrefs.snapGrid && !alt
          ? {
              delta: snapToGrid(g.board, g.ids, shift ? snapMove(g.board, g.ids, delta, 0, true, true).delta : delta),
              guides: [],
            }
          : snapMove(g.board, g.ids, delta, 6 / g.camera.z, !snapping || alt, shift);
      return { board: detachGridObjects(translate(g.board, g.ids, result.delta), g.ids), guides: result.guides };
    }
    if (g.mode === 'rotate') {
      const single = g.ids.length === 1 ? g.board.items.find(i => i.id === g.ids[0]) : undefined,
        raw = handleAngle(g.pivot!, p) - g.angle!,
        turn = rotationDelta(raw, shift, single && canRotate(single) ? (single.rotation ?? 0) : null);
      return { board: rotateItems(g.board, g.ids, turn, g.pivot!), guides: [] };
    }
    const one = g.ids.length === 1 ? g.board.items.find(i => i.id === g.ids[0]) : undefined,
      // A text object dragged by a corner scales with its font, keeping its proportions (Shift reflows instead).
      scaleText = textCornerScales(one, g.handle, shift),
      withFont = (b: Board) => (scaleText && one ? scaleTextFont(b, g.board, one.id) : b);
    // A single rotated object resizes along its own axes (gap D1); Alt resizes from the centre (gap D8).
    if (one?.rotation)
      return {
        board: withFont(
          resizeItems(
            g.board,
            g.ids,
            one,
            resizeRotated(one, g.handle ?? 'se', delta, scaleText || shift !== (one.type === 'image'), alt),
          ),
        ),
        guides: [],
      };
    const bounds = selectionBounds(g.board.items, g.ids),
      images = g.ids.length > 0 && g.ids.every(id => g.board.items.find(i => i.id === id)?.type === 'image');
    return {
      board: bounds
        ? withFont(
            resizeItems(
              g.board,
              g.ids,
              bounds,
              ((b: Bounds) => (viewPrefs.snapGrid && !shift && !alt && !scaleText ? snapResize(bounds, b) : b))(
                resizeBounds(bounds, g.handle ?? 'se', delta, scaleText || shift !== images, alt),
              ),
              true,
            ),
          )
        : g.board,
      guides: [],
    };
  }
  // Touch: two fingers pinch-zoom and pan (gap F11).
  const local = (e: { clientX: number; clientY: number }) => {
    const r = svg.current?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
  };
  function touchDown(e: React.PointerEvent<SVGSVGElement>): boolean {
    if (e.pointerType !== 'touch') return false;
    touches.current.set(e.pointerId, local(e));
    if (touches.current.size === 2) {
      if (gesture.current) cancelGesture();
      const [a, b] = [...touches.current.values()];
      pinch.current = { camera, a, b };
      return true;
    }
    return !!pinch.current;
  }
  function touchMove(e: React.PointerEvent<SVGSVGElement>): boolean {
    if (e.pointerType !== 'touch' || !touches.current.has(e.pointerId)) return false;
    touches.current.set(e.pointerId, local(e));
    const p = pinch.current;
    if (!p || touches.current.size < 2) return !!p;
    const [a, b] = [...touches.current.values()];
    setCamera(pinchCamera(p.camera, p.a, p.b, a, b));
    return true;
  }
  function touchUp(e: React.PointerEvent<SVGSVGElement>): boolean {
    if (e.pointerType !== 'touch') return false;
    touches.current.delete(e.pointerId);
    if (!pinch.current) return false;
    if (touches.current.size < 2) pinch.current = null;
    return true;
  }
  /** Owning pointer of the active gesture: other pens or fingers do not steer it (track R5). */
  const foreign = (e: React.PointerEvent) =>
    e.pointerType !== 'mouse' && !!owner.current && owner.current.id !== e.pointerId;
  function pointerDown(e: React.PointerEvent<SVGSVGElement>) {
    const policy = pointerPolicy(pen.current, e, tool, performance.now());
    if (policy === 'ignore') return;
    if (e.pointerType === 'pen') {
      pen.current = penDown(pen.current, e);
      // The pen wins over a resting palm: drop its gesture and any pinch, keeping the camera where it is.
      if (owner.current?.touch) {
        gesture.current = null;
        owner.current = null;
        setDraft(null);
        setMarquee(null);
      }
      touches.current.clear();
      pinch.current = null;
    }
    // Any other pointer going down (a second finger, the pen) cancels a pending long press.
    clearLongPress();
    const before = gesture.current;
    startGesture(e, policy === 'pan');
    const started = gesture.current;
    if (started && started !== before) {
      owner.current = { id: e.pointerId, touch: e.pointerType === 'touch' };
      if (
        longPressApplies(e.pointerType, policy, tool, touches.current.size) &&
        (started.mode === 'marquee' || (started.mode === 'move' && !started.peel))
      )
        armLongPress(e, started.mode === 'move' ? hit(e) : undefined);
    }
  }
  function startGesture(e: React.PointerEvent<SVGSVGElement>, fingerPans: boolean) {
    if (touchDown(e)) return;
    if (
      (e.target as Element).closest('textarea,input,select,video,iframe,.mindmap-canvas-editor') ||
      (e.button !== 0 && e.button !== 1) ||
      gesture.current
    )
      return;
    if (previewStart && !(e.button === 1 || space.current)) return;
    if (editing) {
      (document.activeElement as HTMLElement)?.blur();
      setEditing(null);
    }
    e.preventDefault();
    e.currentTarget.focus({ preventScroll: true });
    window.getSelection()?.removeAllRanges();
    const current = boardRef.current,
      start = toWorld(e.clientX, e.clientY),
      id = hit(e),
      item = current.items.find(i => i.id === id);
    const base = {
      start,
      screen: { x: e.clientX, y: e.clientY },
      board: clone(current),
      ids: [] as string[],
      camera: { ...camera },
      moved: false,
    };
    const linkEl = (e.target as Element).closest('[data-link]'),
      pin = (e.target as Element).closest('[data-comment]'),
      chipMark = (e.target as Element).closest('[data-chip-remove]');
    if (chipMark && id && e.button === 0 && tool === 'select' && !space.current) {
      // A placed voting dot returns to its pile; the × on a sticky's estimate or assignee removes it (track F).
      try {
        update(removeChipMark(current, id, chipMark.getAttribute('data-chip-remove') as ChipBadge));
      } catch (error) {
        display((error as Error).message, undefined, 'error');
      }
      return;
    }
    if (linkEl && e.button === 0) {
      const target = current.items.find(i => i.id === linkEl.getAttribute('data-link'));
      if (target) followLink(target);
      return;
    }
    if (pin && e.button === 0) {
      setThread({ id: pin.getAttribute('data-comment')! });
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    if (fingerPans) {
      gesture.current = { ...base, mode: 'pan' };
      return;
    }
    if (tool === 'stack' && e.button === 0 && !space.current) {
      const r = stackNext(current, stackLast.current, start, fill, (x, y, f) => createItem('note', x, y, f));
      stackLast.current = r.note.id;
      update(r.board);
      setSelected([r.note.id]);
      setEditing(r.note.id);
      return;
    }
    if (tool === 'comment' && e.button === 0 && !space.current) {
      const target = item && item.type !== 'arrow' ? item : undefined;
      setThread({ x: start.x, y: start.y, itemId: target?.id });
      setTool('select');
      return;
    }
    if (tool === 'pen' && eraser && e.button === 0 && !space.current) {
      eraseLast.current = start;
      gesture.current = { ...base, mode: 'erase' };
      setDraft(eraseAt(current, start, 10 / camera.z, precise));
      return;
    }
    if (tool === 'pen' && !eraser && penMode === 'lasso' && e.button === 0 && !space.current) {
      gesture.current = { ...base, mode: 'lasso', path: [start] };
      setLasso([start]);
      return;
    }
    if (
      (e.target as Element).getAttribute('data-caption') &&
      selectedItem?.type === 'arrow' &&
      selectedItem.id === (e.target as Element).getAttribute('data-caption') &&
      !selectedItem.locked &&
      tool === 'select'
    ) {
      gesture.current = { ...base, mode: 'label', ids: [selectedItem.id] };
      return;
    }
    const extraLabel = (e.target as Element).closest('[data-label-drag]');
    if (
      extraLabel &&
      selectedItem?.type === 'arrow' &&
      selectedItem.id === extraLabel.getAttribute('data-label-of') &&
      !selectedItem.locked &&
      tool === 'select'
    ) {
      // Extra labels slide along the line like the main caption (track R2-H).
      gesture.current = {
        ...base,
        mode: 'label',
        ids: [selectedItem.id],
        labelId: extraLabel.getAttribute('data-label-drag')!,
      };
      return;
    }
    if (
      (e.target as Element).getAttribute('data-callout-tail') &&
      selectedItem &&
      selectedItem.id === (e.target as Element).getAttribute('data-callout-tail') &&
      !selectedItem.locked &&
      tool === 'select'
    ) {
      gesture.current = { ...base, mode: 'tail', ids: [selectedItem.id] };
      return;
    }
    if (tool === 'hand' || space.current || e.button === 1) gesture.current = { ...base, mode: 'pan' };
    else if (
      (e.target as Element).getAttribute('data-connector-end') &&
      selectedItem?.type === 'arrow' &&
      !selectedItem.locked
    )
      gesture.current = {
        ...base,
        mode: 'endpoint',
        ids: [selectedItem.id],
        endpoint: (e.target as Element).getAttribute('data-connector-end') as 'start' | 'end',
      };
    else if (
      (e.target as Element).getAttribute('data-bend') &&
      selectedItem?.type === 'arrow' &&
      !selectedItem.locked
    ) {
      const [kind, index] = (e.target as Element).getAttribute('data-bend')!.split(':');
      gesture.current = {
        ...base,
        mode: 'bend',
        ids: [selectedItem.id],
        bend: { kind: kind as 'bend' | 'segment', index: Number(index) },
      };
    } else if ((e.target as Element).getAttribute('data-rotate')) {
      const ids = editableIds(current, selected),
        single = ids.length === 1 ? current.items.find(i => i.id === ids[0]) : undefined,
        bounds = selectionBounds(current.items, ids),
        pivot = single ? boxCenter(single) : bounds ? boxCenter(bounds) : start;
      gesture.current = { ...base, mode: 'rotate', ids, pivot, angle: handleAngle(pivot, start) };
    } else if ((e.target as Element).getAttribute('data-resize'))
      gesture.current = {
        ...base,
        mode: 'resize',
        ids: editableIds(current, selected),
        handle: (e.target as Element).getAttribute('data-resize') as Handle,
      };
    else if (
      (e.target as Element).getAttribute('data-anchor') &&
      selectedItem &&
      !selectedItem.locked &&
      selected.length === 1
    ) {
      // Connection dot (item 112): drag out a connector that starts at the selected object.
      const next = makePlacedItem('arrow', start);
      next.x = start.x;
      next.y = start.y;
      next.w = 0;
      next.h = 0;
      next.from = selectedItem.id;
      next.connector = { ...next.connector, path: 'curved', gap: 8 };
      gesture.current = { ...base, mode: 'create', item: next };
      setSelected([next.id]);
      setDraft({ ...board, items: [...board.items, next] });
    } else if (
      tool === 'select' &&
      item?.type === 'stickypad' &&
      !item.locked &&
      !e.shiftKey &&
      (e.target as Element).getAttribute('data-pad-peel')
    ) {
      // Sticky stack (items 110, 133): the top sheet bends while it is still glued; once pulled far enough it
      // tears off as a new note that follows the pointer. The pad stays. sticky-peel.tsx animates it.
      const note = peelNote(item, (x, y, f) => createItem('note', x, y, f)),
        sheet = padSheet(item),
        peel: PeelState = {
          note: note.id,
          pad: item.id,
          grab: start,
          grabX: (start.x - sheet.x) / sheet.s,
          sheet,
          noteSize: { w: note.w, h: note.h },
          fill: item.fill,
          live: { detached: false },
        };
      setPeeling(peel);
      setSelected([]);
      gesture.current = {
        ...base,
        board: { ...base.board, items: [...base.board.items, note] },
        ids: [note.id],
        mode: 'move',
        peel,
      };
    } else if (tool === 'select') {
      if (item) {
        const group = expandGroups(current, [id!]),
          ids = e.shiftKey
            ? selected.includes(id!)
              ? selected.filter(s => !group.includes(s))
              : [...new Set([...selected, ...group])]
            : selected.includes(id!)
              ? selected
              : group;
        setSelected(ids);
        gesture.current = { ...base, ids: moveIds(current, ids), mode: 'move', duplicate: e.altKey };
      } else {
        if (!e.shiftKey) setSelected([]);
        gesture.current = { ...base, ids: e.shiftKey ? selected : [], mode: 'marquee' };
      }
    } else {
      const next = makePlacedItem(tool as Kind, start);
      if (tool === 'arrow') {
        next.w = 0;
        next.h = 0;
        if (item && !['arrow', 'pen', 'frame', 'swimlane'].includes(item.type)) next.from = item.id;
      }
      if (tool === 'pen') {
        // A stylus records its pressure per point (track R2-K); mouse and touch strokes stay plain.
        next.points = [e.pointerType === 'pen' ? { x: 0, y: 0, p: pressureOf(e.pressure) } : { x: 0, y: 0 }];
        next.fill = penColor;
        next.data = { style: penStyle, width: penWidth };
      }
      gesture.current = { ...base, mode: tool === 'pen' ? 'draw' : 'create', item: next };
      setSelected([next.id]);
      setDraft({ ...board, items: [...board.items, next] });
    }
  }
  function pointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (ignoreTouch(pen.current, e, performance.now())) return;
    const lp = longPress.current;
    if (lp?.id === e.pointerId && longPressMoved(lp, { x: e.clientX, y: e.clientY })) clearLongPress();
    if (touchMove(e) || foreign(e)) return;
    const g = gesture.current;
    if (!g) return;
    const p = toWorld(e.clientX, e.clientY),
      dx = p.x - g.start.x,
      dy = p.y - g.start.y;
    if (Math.hypot(e.clientX - g.screen.x, e.clientY - g.screen.y) > 3) g.moved = true;
    if (g.mode === 'move' && g.peel && !g.peel.live.detached) {
      // Still glued to the pad: only the overlay bends the sheet until the pull tears it off.
      if (!detaches(g.peel.sheet, { x: dx, y: dy })) return;
      g.peel.live.detached = true;
      setSelected(g.ids);
    }
    if (g.mode === 'pan')
      setCamera({ ...g.camera, x: g.camera.x + e.clientX - g.screen.x, y: g.camera.y + e.clientY - g.screen.y });
    else if (g.mode === 'endpoint' && g.moved)
      setDraft(moveConnectorEndpoint(g.board, g.ids[0], g.endpoint!, p, 12 / g.camera.z, !e.altKey));
    else if (g.mode === 'bend' && g.moved) setDraft(dragBend(g.board, g.ids[0], g.bend!, p));
    if (g.mode === 'create' && g.item?.type === 'arrow') {
      setConnectTarget(connectTargetAt(g.board, p, g.item.from)?.id ?? null);
    }
    if (g.mode === 'lasso') {
      g.path!.push(p);
      setLasso([...g.path!]);
    } else if (g.mode === 'erase') {
      const from = eraseLast.current ?? g.start;
      eraseLast.current = p;
      setDraft(d => eraseAlong(d ?? g.board, from, p, 10 / g.camera.z, precise));
    } else if (g.mode === 'label' && g.moved) {
      const geo = geometryOf(
        g.board.items.find(i => i.id === g.ids[0])!,
        g.board.items,
      );
      setDraft(moveConnectorLabel(g.board, g.ids[0], g.labelId ?? null, nearestAlong(geo.nodes, p)));
    } else if (g.mode === 'tail' && g.moved) {
      const over = e.altKey ? undefined : tailTargetAt(g.board, p, g.ids[0]);
      setConnectTarget(over?.id ?? null);
      setDraft(setCalloutTail(g.board, g.ids[0], p, over?.id));
    } else if (g.mode === 'rotate') {
      if (g.moved) setDraft(transformed(g, p, e.shiftKey, e.altKey).board);
    } else if (g.mode === 'move' || g.mode === 'resize') {
      if (g.moved) {
        if (g.mode === 'move' && g.duplicate && !g.originalIds) {
          if (g.board.items.length + g.ids.length > 2000) return;
          g.originalIds = selected;
          const copies = duplicateItems(g.board, g.ids, 0);
          g.board = copies.board;
          g.ids = copies.ids;
          setSelected(copies.ids);
        }
        const next = transformed(g, p, e.shiftKey, e.altKey);
        setDraft(next.board);
        setGuides(next.guides);
        const drop =
          g.mode === 'move' ? recordDropAt(document.elementsFromPoint(e.clientX, e.clientY), e.clientX) : null;
        const target =
          drop && canCopyToRecords(g.board, g.ids, drop) ? g.board.items.find(i => i.id === drop.targetId) : null;
        setDropLine(
          target
            ? { x1: target.x + 12, x2: target.x + target.w - 12, y1: p.y, y2: p.y }
            : g.mode === 'move'
              ? (insertionPreview(next.board, g.ids)?.line ?? null)
              : null,
        );
      }
    } else if (g.mode === 'marquee')
      setMarquee({ x: Math.min(p.x, g.start.x), y: Math.min(p.y, g.start.y), w: Math.abs(dx), h: Math.abs(dy) });
    else if (g.item) {
      if (g.mode === 'draw') {
        const pts = g.item.points!;
        if (pts.length < 20000)
          pts.push(pts[0]?.p !== undefined ? { x: dx, y: dy, p: pressureOf(e.pressure) } : { x: dx, y: dy });
      } else if (g.item.type === 'arrow') {
        // Shift keeps the line at 45-degree steps (gap E5).
        const end = e.shiftKey ? snap45(dx, dy) : { x: dx, y: dy };
        g.item.w = end.x;
        g.item.h = end.y;
        const over = connectTargetAt(g.board, p, g.item.from),
          preview = clone(g.item);
        if (over) preview.to = over.id;
        else delete preview.to;
        setDraft({ ...g.board, items: [...g.board.items, preview] });
        return;
      } else if (g.moved)
        Object.assign(g.item, {
          x: Math.min(p.x, g.start.x),
          y: Math.min(p.y, g.start.y),
          w: Math.max(40, Math.abs(dx)),
          h: Math.max(30, Math.abs(dy)),
        });
      setDraft({ ...g.board, items: [...g.board.items, clone(g.item)] });
    }
  }
  function pointerUp(e: React.PointerEvent<SVGSVGElement>) {
    const now = performance.now();
    if (longPress.current?.id === e.pointerId) clearLongPress();
    if (e.pointerType === 'pen') pen.current = penUp(pen.current, e, now);
    else if (ignoreTouch(pen.current, e, now)) {
      touches.current.delete(e.pointerId);
      return;
    }
    if (touchUp(e) || foreign(e)) return;
    owner.current = null;
    const g = gesture.current;
    if (!g) return;
    gesture.current = null;
    setConnectTarget(null);
    setPeeling(null);
    const final = toWorld(e.clientX, e.clientY),
      moved = g.moved || Math.hypot(e.clientX - g.screen.x, e.clientY - g.screen.y) > 3;
    if (g.mode === 'lasso') {
      setLasso(null);
      const ids = lassoSelect(g.board.items, g.path ?? []);
      if (ids.length) {
        setSelected(expandGroups(g.board, ids));
        setTool('select');
      }
      return;
    }
    if (g.mode === 'marquee' && moved)
      setSelected([
        ...new Set([
          ...g.ids,
          ...expandGroups(
            g.board,
            selectWithin(
              g.board.items,
              {
                x: Math.min(final.x, g.start.x),
                y: Math.min(final.y, g.start.y),
                w: Math.abs(final.x - g.start.x),
                h: Math.abs(final.y - g.start.y),
              },
              // Holding Alt while releasing inverts the "Select objects the box touches" setting.
              viewPrefs.marqueeTouch !== e.altKey,
            ).filter(id => !g.board.items.find(i => i.id === id)?.locked),
          ),
        ]),
      ]);
    else if (g.item) {
      if (g.item.type === 'arrow') {
        const p = toWorld(e.clientX, e.clientY);
        const target = [...g.board.items]
          .reverse()
          .find(i => !['arrow', 'pen', 'frame', 'swimlane'].includes(i.type) && pointInBox(i, p));
        if (target && target.id !== g.item.from) g.item.to = target.id;
        if (!g.moved) g.item.w = 180;
      }
      if (g.item.type === 'pen') {
        const absolute = simplify(
          g.item.points!.map(p => ({ ...p, x: g.item!.x + p.x, y: g.item!.y + p.y })),
          0.6 / g.camera.z,
        );
        Object.assign(
          g.item,
          strokeFromPoints(
            g.item,
            settlePressure(
              absolute.length > 1
                ? absolute
                : [...absolute, { ...absolute[0], x: absolute[0].x + 0.5, y: absolute[0].y + 0.5 }],
            ),
          ),
        );
      }
      // Smart pen: scribbling over ink erases it (track R5); unlocked strokes only, one undo step.
      if (g.item.type === 'pen' && penMode === 'smart' && isScribble(absolutePoints(g.item))) {
        const erase = new Set(editableIds(g.board, scribbleTargets(g.board.items, absolutePoints(g.item))));
        if (erase.size) {
          update({ ...g.board, items: g.board.items.filter(i => !erase.has(i.id)) });
          setSelected([]);
          display(`Erased ${erase.size} stroke${erase.size === 1 ? '' : 's'}.`);
          return;
        }
      }
      // Smart pen: a recognisable stroke becomes a real shape or line (one undo step). A line drawn between
      // two objects becomes a connector bound to them (track R5).
      const recognized = g.item.type === 'pen' && penMode === 'smart' ? recognizeStroke(absolutePoints(g.item)) : null;
      if (recognized) {
        const ends = recognized.kind === 'line' ? lineEnds(g.board.items, recognized, 12 / g.camera.z) : {};
        const shape =
          recognized.kind === 'line'
            ? {
                ...createItem('arrow', recognized.x, recognized.y),
                w: recognized.w,
                h: recognized.h,
                ...ends,
                connector: ends.from && ends.to ? {} : { endHead: 'none' as const },
              }
            : {
                ...createItem(recognized.kind, recognized.x, recognized.y, '#ffffff'),
                w: recognized.w,
                h: recognized.h,
                text: '',
              };
        update({ ...g.board, items: [...g.board.items, shape] });
        setSelected([shape.id]);
        return;
      }
      update(finishPlacedItem(g.board, g.item));
      if (g.item.type !== 'pen') {
        setTool('select');
        if (g.item.type === 'mindmap') setMindEditId(g.item.id);
        else if (g.item.type === 'code') setCodeId(g.item.id);
        else if (['note', 'text', 'frame'].includes(g.item.type) || isShapeKind(g.item.type)) setEditing(g.item.id);
      }
    } else if (g.mode === 'endpoint') {
      if (moved) update(moveConnectorEndpoint(g.board, g.ids[0], g.endpoint!, final, 12 / g.camera.z, !e.altKey));
    } else if (g.mode === 'bend') {
      if (moved) update(dragBend(g.board, g.ids[0], g.bend!, final));
    } else if (g.mode === 'rotate') {
      if (moved) update(transformed(g, final, e.shiftKey, e.altKey).board);
    } else if (g.mode === 'erase') {
      if (draft) update(draft);
    } else if (g.mode === 'label') {
      if (moved && draft) update(draft);
    } else if (g.mode === 'tail') {
      if (moved) {
        const over = e.altKey ? undefined : tailTargetAt(g.board, final, g.ids[0]);
        update(setCalloutTail(g.board, g.ids[0], final, over?.id));
      }
    } else if (g.mode === 'move' || g.mode === 'resize') {
      // A sheet released before it tore off springs back onto the pad: nothing is taken.
      if (moved && !(g.peel && !g.peel.live.detached)) {
        const next = transformed(g, final, e.shiftKey, e.altKey).board;
        const drop =
          g.mode === 'move' ? recordDropAt(document.elementsFromPoint(e.clientX, e.clientY), e.clientX) : null;
        if (drop && canCopyToRecords(g.board, g.ids, drop)) {
          update(copyToRecords(g.board, g.ids, drop));
          display('Copied to records');
        } else {
          const cell = g.mode === 'move' ? gridDropAt(document.elementsFromPoint(e.clientX, e.clientY)) : null;
          const inGrid = cell ? adoptGridObjects(next, g.ids, cell, e.ctrlKey || e.metaKey) : next;
          update(inGrid !== next ? inGrid : g.mode === 'move' ? adoptIntoContainers(next, g.ids) : next);
        }
      }
    } else if (draft && g.moved && g.mode !== 'pan') update(draft);
    setDraft(null);
    setDropLine(null);
    setMarquee(null);
    setGuides([]);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }
  function pointerCancel(e: React.PointerEvent<SVGSVGElement>) {
    if (longPress.current?.id === e.pointerId) clearLongPress();
    if (e.pointerType === 'pen') pen.current = penUp(pen.current, e, performance.now());
    if (foreign(e)) return;
    owner.current = null;
    touches.current.delete(e.pointerId);
    if (touches.current.size < 2) pinch.current = null;
    cancelGesture();
  }
  return { cancelGesture, pointerDown, pointerMove, pointerUp, pointerCancel };
}
