// Board application state and behaviour. UI components read it through useApp().
import React, { useEffect, useRef, useState } from 'react';
import { zoomCameraAt, clampZoom, centeredCamera } from './camera';
import { loadViewPrefs, saveViewPrefs, wheelLooksLikeMouse, type ViewPrefs } from './view-prefs';
import { useLatest } from './use-latest';
import { deepLinkUrl, parseDeepLink } from './deep-link';
import { rememberTemplateUse } from './user-templates';
import { starterUseKey } from './starter-templates';
import { slideFrames } from './navigation';
import { parsePenPresets, PEN_PRESETS_KEY, type PenPreset } from './pen-smart';
import { activityKey, appendActivity, diffActivity, parseActivity } from './activity';
import {
  MousePointer2,
  Hand,
  StickyNote,
  Type,
  Square,
  Circle,
  Diamond,
  ArrowUpRight,
  Pencil,
  Frame,
} from 'lucide-react';
import {
  colors,
  createItem,
  newBoard,
  commit,
  removeItems,
  parseBoard,
  endpoints,
  richKinds,
  addConnectedNote,
  allKinds,
} from './model';
import type { Board, History, Item, Kind, Point, ImageAsset } from './model';
import { isValidAsset } from './model-ext';
import type { PeelState } from './peel-motion';
import { textLayout } from './text-format';
import { isShapeKind } from './shapes';
import { starters } from './formats';
import type { Handle, Guide } from './interactions';
import { rotatedCorners, stripRotation } from './rotation';
import { mergeStyle, styledKind } from './inspector-model';
import { connectorGeometry } from './connectors';
import { groupSelection, ungroupSelection, expandGroups, setLocked, editableIds, duplicateItems } from './arrange';
import { createImageItem, decodeDataUrl, replaceImage, splitAssets, referencedAssets } from './images';
import { droppedImageName, type DroppedImage } from './web-drop';
import { loadAssets, saveAsset, pruneAssets, readImageWithOriginal } from './assets-store';
import { wireframeItem } from './specs-media';
import { OPEN_EDITOR_EVENT } from './widgets-media';
import { startObjectOf } from './board-settings';
import { stampChoice } from './widgets-graphics';
import { PREVIEW_EVENT, usePreviewState } from './prototype-preview';
import { looksLikeMarkdown } from './markdown';
import { applyLayouts } from './autolayout';
import { syncRecordCards } from './record-canvas';
import {
  PASTE_NOTES_MAX,
  classifyPaste,
  gridFromCells,
  itemsFromText,
  notesFromCells,
  parseDelimited,
} from './smart-paste';
import type { GridData } from './grid';
import { maybeSnapshot } from './versions';
import { decryptBackup, isEncryptedBackup } from './encrypted-backup';
import { askPassphrase } from './passphrase-dialog';
import { askSheet } from './sheet-picker';
import { recordVisit } from './activity';
import { BASE_LAYER, assignNewToLayer, inLockedLayer, sortByLayer } from './layers';
import { applyGridLayouts, gridOwner } from './grid-canvas';
import { applyMindBounds } from './mindmap-bounds';
import { fitSwimlanes } from './swimlane';
import {
  privateIds,
  detachComments,
  coveredIds,
  lineJumps,
  templateItems,
  setPrivate,
  threadPoint,
} from './board-tools';
import type { PenStyle, TemplateName } from './board-tools';
import { viewFor } from './widgets';
import {
  openLibrary,
  saveActive,
  switchTo,
  liveBoards,
  createBoard,
  renameBoard,
  duplicateBoard,
  trashBoards,
  restoreBoards,
  purgeBoards,
  addBoards,
  createSpace,
  renameSpace,
  deleteSpace,
  spacesOf,
  assetRefsAcrossBoards,
  LEGACY_KEY,
  setBoardMeta,
  setSpaceInfo,
  spaceInfoOf,
} from './board-library';
import type { BoardMetaPatch, Library, OpenTarget, SpaceInfo } from './board-library';
import { createFromBlueprint, type Blueprint } from './blueprints';
import { copySelection, clipboardFormats, readClipboardHtml, pastePayload, cutIds } from './clipboard';
import type { ClipPayload } from './clipboard';
import { useCanvasGestures } from './use-canvas-gestures';
import { useKeyboardShortcuts } from './use-keyboard-shortcuts';
import { useDeepLinks } from './use-deep-links';
import type { WidgetCtx } from './widget-types';
import { readDrawioFile } from './drawio-files';
import { BOARD_OBJECT_LIMIT, drawioImportNote, drawioToItems } from './drawio-shapes';
import { docFromMarkdown, DOC_FILE_MAX } from './doc-tools';
import { validateWidget } from './widget-specs';
import { stampAuthors, cleanAuthor, AUTHOR_KEY } from './authors';
import { stampTimes } from './item-times';
import { linkOf, syncMermaidLinks } from './mermaid-link';
import { lastColors, rememberKindColors } from './last-color';
import { modeRefusal } from './board-modes';

export const KEY = LEGACY_KEY;
/** Open the local board library (migrating a legacy single board on first run). */
export function load(): { board: Board; error: string; library: Library } {
  try {
    return openLibrary(localStorage, parseBoard, newBoard);
  } catch {
    return {
      board: newBoard(),
      library: { version: 1, activeId: crypto.randomUUID(), boards: [] },
      error: 'Browser storage is unavailable, so boards cannot be saved here. Export JSON to keep your work.',
    };
  }
}
export const initial = load();
export const tools = [
  { id: 'select', label: 'Select', key: 'V', icon: MousePointer2 },
  { id: 'hand', label: 'Pan', key: 'H', icon: Hand },
  { id: 'note', label: 'Sticky note', key: 'N', icon: StickyNote },
  { id: 'text', label: 'Text', key: 'T', icon: Type },
  { id: 'rectangle', label: 'Rectangle', key: 'R', icon: Square },
  { id: 'ellipse', label: 'Ellipse', key: 'O', icon: Circle },
  { id: 'diamond', label: 'Diamond', key: 'D', icon: Diamond },
  { id: 'arrow', label: 'Connector', key: 'L', icon: ArrowUpRight },
  { id: 'pen', label: 'Pen', key: 'P', icon: Pencil },
  { id: 'frame', label: 'Frame', key: 'F', icon: Frame },
] as const;
export type Tool = 'select' | 'hand' | Kind | 'stack' | 'comment';
export type Camera = { x: number; y: number; z: number };
/** Which import the shared document file chooser was opened for. */
type DocImportKind = 'markdown' | 'pptx' | 'docx' | 'odt' | 'odp' | 'table' | 'grid' | 'drawio';
export type Gesture =
  | {
      mode: 'move' | 'resize' | 'pan' | 'draw' | 'create' | 'marquee' | 'endpoint' | 'bend' | 'lasso' | 'rotate';
      /** Rotate gesture (gap D1): the turning point and the pointer angle at the start. */
      pivot?: Point;
      angle?: number;
      /** Lasso outline in world coordinates. */
      path?: Point[];
      start: Point;
      screen: Point;
      board: Board;
      ids: string[];
      item?: Item;
      camera: Camera;
      moved: boolean;
      duplicate?: boolean;
      originalIds?: string[];
      handle?: Handle;
      endpoint?: 'start' | 'end';
      bend?: { kind: 'bend' | 'segment'; index: number };
      /** Pulling a note off a sticky stack (item 133); the note is only taken once `peel.live.detached`. */
      peel?: PeelState;
    }
  | {
      mode: 'erase' | 'label' | 'tail';
      /** Label drag: the extra label being moved; missing for the main caption (track R2-H). */
      labelId?: string;
      start: Point;
      screen: Point;
      board: Board;
      ids: string[];
      item?: Item;
      camera: Camera;
      moved: boolean;
      handle?: Handle;
      endpoint?: 'start' | 'end';
      bend?: { kind: 'bend' | 'segment'; index: number };
      /** Pulling a note off a sticky stack (item 133); the note is only taken once `peel.live.detached`. */
      peel?: PeelState;
    };

function useBoardCore() {
  const [gallery, setGallery] = useState<'Formats' | 'Essentials' | null>(null),
    [bulk, setBulk] = useState(false),
    [formatId, setFormatId] = useState<string | null>(null),
    /** Frame whose linked Mermaid code is open in the side panel. */
    [mermaidLinkId, setMermaidLinkId] = useState<string | null>(null),
    [shapes, setShapes] = useState(false);
  const [history, setHistory] = useState<History>({ past: [], current: initial.board, future: [] });
  const board = history.current,
    boardRef = useRef(board);
  boardRef.current = board;
  const [draft, setDraft] = useState<Board | null>(null),
    shown = draft ?? board;
  const [tool, setTool] = useState<Tool>('select'),
    [fill, setFill] = useState(colors[0]);
  const [selected, setSelected] = useState<string[]>([]),
    [editing, setEditing] = useState<string | null>(null);
  const [pendingPlacement, setPendingPlacement] = useState<string | null>(null);
  const editSeed = useRef<{ id: string; text: string } | null>(null);
  // A board with a start view (item 103) opens there; otherwise at the origin.
  const [camera, setCamera] = useState<Camera>(() =>
    initial.board.startView
      ? centeredCamera(initial.board.startView, initial.board.startView.z, { w: innerWidth, h: innerHeight })
      : { x: 0, y: 0, z: 1 },
  );
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [library, setLibrary] = useState<Library>(initial.library),
    [dashboard, setDashboard] = useState(false),
    [inspector, setInspector] = useState(false),
    [contextMenu, setContextMenu] = useState<{ x: number; y: number; world: Point; onItem: boolean } | null>(null);
  const libraryRef = useRef(library);
  libraryRef.current = library;
  const clipRef = useRef<ClipPayload | null>(null),
    pasteCount = useRef(0),
    clipSignature = useRef(''),
    lastPointer = useRef<Point | null>(null);
  // Remember when each board was opened, for "Since my last visit" in Catch up (gap C14).
  useEffect(() => {
    recordVisit(localStorage, library.activeId);
  }, [library.activeId]);
  // Layer that new objects go to (gap D9); kept per tab.
  const [activeLayer, setActiveLayer] = useState(BASE_LAYER),
    activeLayerRef = useRef(activeLayer);
  activeLayerRef.current = activeLayer;
  // Exports turn off large-board culling while they clone the rendered SVG (gap A2).
  const [renderAll, setRenderAll] = useState(false);
  const [outline, setOutline] = useState(false),
    // Board outline by frame for screen readers (track R1, Alt+O).
    [boardOutline, setBoardOutline] = useState(false),
    // Docked board notes panel (track L, Alt+N).
    [notesOpen, setNotesOpen] = useState(false),
    [help, setHelp] = useState(false),
    [menu, setMenu] = useState(false);
  const [notice, setNotice] = useState(initial.error),
    [saveError, setSaveError] = useState(initial.error),
    [saved, setSaved] = useState(false);
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [connectorDetailsId, setConnectorDetailsId] = useState<string | null>(null);
  const [panel, setPanel] = useState<'arrange' | 'emoji' | 'convert' | 'link' | null>(null);
  const [penStyle, setPenStyle] = useState<PenStyle>('pen'),
    [penWidth, setPenWidth] = useState(3),
    [eraser, setEraser] = useState(false),
    [precise, setPrecise] = useState(false),
    // Pen panel mode (item 102): plain ink, smart pen (strokes become shapes) or lasso selection.
    [penMode, setPenMode] = useState<'draw' | 'smart' | 'lasso'>('draw'),
    [lasso, setLasso] = useState<Point[] | null>(null),
    [penPresetList, setPenPresetList] = useState<PenPreset[]>(() => {
      try {
        return parsePenPresets(localStorage.getItem(PEN_PRESETS_KEY));
      } catch {
        return parsePenPresets(null);
      }
    }),
    [activePreset, setActivePreset] = useState<number | null>(null),
    [penColor, setPenColor] = useState('#25252a');
  const stackLast = useRef<string | null>(null);
  const eraseLast = useRef<Point | null>(null);
  const [facilitate, setFacilitate] = useState(false),
    [facil, setFacil] = useState<
      | 'voting'
      | 'comments'
      | 'templates'
      | 'a11y'
      | 'reactions'
      | 'authors'
      | 'talktrack'
      | 'photobooth'
      | 'validation'
      | 'stickies'
      | null
    >(null),
    [timerOn, setTimerOn] = useState(false);
  const [thread, setThread] = useState<{ id: string } | { x: number; y: number; itemId?: string } | null>(null);
  const [widgetEditId, setWidgetEditId] = useState<string | null>(null);
  const [previewStart, setPreviewStart] = useState<{ screenId: string; camera: Camera; selected: string[] } | null>(
      null,
    ),
    [mdPaste, setMdPaste] = useState<string | null>(null),
    [mindEditId, setMindEditId] = useState<string | null>(null);
  const selectionKey = selected.join(',');
  useEffect(() => {
    setDetailsId(null);
    setConnectorDetailsId(null);
    setPanel(null);
  }, [selectionKey]);
  const [assets, setAssets] = useState<Record<string, ImageAsset>>({}),
    assetsRef = useRef(assets);
  assetsRef.current = assets;
  const [cropId, setCropId] = useState<string | null>(null),
    [codeId, setCodeId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false),
    [matches, setMatches] = useState<{ ids: Set<string>; current: string | null }>({ ids: new Set(), current: null });
  const [authorName, setAuthorNameState] = useState(() => {
      try {
        return cleanAuthor(localStorage.getItem(AUTHOR_KEY) ?? '');
      } catch {
        return '';
      }
    }),
    authorRef = useRef(authorName);
  authorRef.current = authorName;
  const setAuthorName = (name: string) => {
    const clean = cleanAuthor(name);
    setAuthorNameState(clean);
    try {
      if (clean) localStorage.setItem(AUTHOR_KEY, clean);
      else localStorage.removeItem(AUTHOR_KEY);
    } catch {
      /* The name still applies for this session when storage is unavailable. */
    }
  };
  const [minimap, setMinimap] = useState(false),
    [presentPanel, setPresentPanel] = useState(false);
  const [presenting, setPresenting] = useState<{ start: number; camera: Camera; selected: string[] } | null>(null);
  const imageFile = useRef<HTMLInputElement>(null),
    replaceFile = useRef<HTMLInputElement>(null),
    insertAt = useRef<Point | null>(null);
  const [dropLine, setDropLine] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]),
    [snapping, setSnapping] = useState(true);
  const [viewPrefs, setViewPrefsState] = useState<ViewPrefs>(loadViewPrefs);
  // Spelling marks follow the page's spellcheck attribute, which every editor inherits.
  useEffect(() => {
    document.documentElement.spellcheck = viewPrefs.spellcheck;
  }, [viewPrefs.spellcheck]);
  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', viewPrefs.reduceMotion);
  }, [viewPrefs.reduceMotion]);
  useEffect(() => {
    if (viewPrefs.dnd) document.documentElement.dataset.dnd = 'on';
    else delete document.documentElement.dataset.dnd;
  }, [viewPrefs.dnd]);
  const navigationRef = useLatest(viewPrefs.navigation);
  const [commandsOpen, setCommandsOpen] = useState(false);
  const [connectTarget, setConnectTarget] = useState<string | null>(null),
    [peeling, setPeeling] = useState<PeelState | null>(null);
  const setViewPrefs = (patch: Partial<ViewPrefs>) =>
    setViewPrefsState(prev => {
      const next = { ...prev, ...patch };
      saveViewPrefs(next);
      return next;
    });
  const svg = useRef<SVGSVGElement>(null),
    gesture = useRef<Gesture | null>(null),
    file = useRef<HTMLInputElement>(null),
    space = useRef(false);
  const pauseSave = useRef(Boolean(initial.error)),
    noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** A one-click follow-up shown in the notification, e.g. "One sticky per cell" after a grid paste. */
  const [noticeAction, setNoticeAction] = useState<{ message: string; label: string; run: () => void } | null>(null);
  const display = (message: string, action?: { label: string; run: () => void }) => {
    setNotice(message);
    setNoticeAction(action ? { message, ...action } : null);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), action ? 8000 : 5000);
  };
  const normalize = (input: Board): Board => {
    const next = applyGridLayouts(applyLayouts(syncRecordCards(stripRotation(input), boardRef.current)));
    // A linked flowchart whose shapes changed gets its code rewritten in the same undo step.
    return syncMermaidLinks(normalizeText(fitSwimlanes(applyMindBounds(next, boardRef.current))));
  };
  const normalizeText = (next: Board): Board => {
    let changed = false;
    const items = next.items.map(i => {
      if (i.type !== 'text' || !i.format?.autoHeight) return i;
      const h = Math.max(30, Math.ceil(textLayout(i).height + 8));
      if (Math.abs(h - i.h) < 0.5) return i;
      changed = true;
      return { ...i, h };
    });
    return changed ? { ...next, items } : next;
  };
  /** Record what changed for History and Catch up (item 106). Storage failures never block editing. */
  const logActivity = (prev: Board, next: Board) => {
    try {
      const entries = diffActivity(prev, next, new Date().toISOString(), () => crypto.randomUUID());
      if (!entries.length) return;
      const key = activityKey(libraryRef.current.activeId);
      localStorage.setItem(key, JSON.stringify(appendActivity(parseActivity(localStorage.getItem(key)), entries)));
    } catch {
      /* History is best effort. */
    }
  };
  const update = (input: Board) => {
    if (input.items.length > 2000) return display('This prototype supports up to 2,000 objects per board.');
    const prev = boardRef.current;
    // View-only boards (gap C16) refuse every change except turning view-only off; comment-only boards
    // (track R2-K) accept comment changes only.
    const refusal = modeRefusal(prev, input);
    if (refusal) return display(refusal);
    let next: Board;
    try {
      next = stampTimes(
        prev,
        normalize(
          stampAuthors(
            boardRef.current,
            sortByLayer(assignNewToLayer(prev, input, activeLayerRef.current)),
            authorRef.current,
          ),
        ),
        new Date().toISOString(),
      );
    } catch (error) {
      display((error as Error).message);
      return;
    }
    boardRef.current = next;
    pauseSave.current = false;
    setHistory(h => commit(h, next));
    logActivity(prev, next);
  };
  const rawSelectedItem = shown.items.find(i => i.id === selected[0]);
  const selectedItem =
    rawSelectedItem && gridOwner(shown, rawSelectedItem.id)?.locked
      ? { ...rawSelectedItem, locked: true }
      : rawSelectedItem;
  const patch = (changes: Partial<Item>) => {
    const editable = (i: Item) => selected.includes(i.id) && !i.locked && !gridOwner(boardRef.current, i.id)?.locked;
    // A colour applied to shapes, text or connectors becomes the default for new ones of that kind (session only).
    if (changes.fill) rememberKindColors(boardRef.current.items.filter(editable), changes.fill);
    update({
      ...boardRef.current,
      items: boardRef.current.items.map(i => (editable(i) ? { ...i, ...changes } : i)),
    });
  };
  const patchStyle = (style: Item['style']) =>
    update({
      ...boardRef.current,
      items: boardRef.current.items.map(i =>
        selected.includes(i.id) && !i.locked && styledKind(i.type) ? { ...i, style: mergeStyle(i.style, style) } : i,
      ),
    });
  const selectionLocked = selected.some(id => {
    const it = shown.items.find(i => i.id === id);
    return it?.locked || (it && inLockedLayer(shown, it)) || gridOwner(shown, id)?.locked;
  });
  /** Delete the given objects (the selection by default) in one undo step, keeping locked ones. */
  const deleteObjects = (chosen: string[]) => {
    if (!chosen.length) return;
    if (chosen.some(id => gridOwner(boardRef.current, id)?.locked))
      return display('Unlock the containing Grid to edit its objects.');
    const ids = editableIds(boardRef.current, chosen);
    if (ids.length < chosen.length) display('Locked objects were kept. Unlock them to delete.');
    if (!ids.length) return;
    const removed = detachComments(boardRef.current, removeItems(boardRef.current, ids));
    update(removed.board);
    if (removed.kept.length)
      display(
        `${removed.kept.length} comment thread${removed.kept.length === 1 ? ' was' : 's were'} kept on the canvas. Open Comments to remove ${removed.kept.length === 1 ? 'it' : 'them'}.`,
      );
    setSelected(selected.filter(id => !ids.includes(id)));
    setEditing(null);
  };
  const deleteSelection = () => deleteObjects(selected);
  /** Paste objects: repeated pastes of the same copy step down-right; otherwise at the pointer or view centre. */
  function pasteObjects(payload: ClipPayload, at?: Point) {
    if (boardRef.current.items.length + payload.items.length > 2000)
      return display('This prototype supports up to 2,000 objects per board.');
    // The same copy pasted again (the clipboard returns a fresh object each time) steps down-right.
    const signature = payload.items.map(i => i.id).join(',');
    if (clipSignature.current !== signature) {
      clipSignature.current = signature;
      pasteCount.current = 0;
    }
    pasteCount.current += 1;
    const fromHere = boardRef.current.items.some(i => payload.items.some(p => p.id === i.id)),
      center = toWorld(size.w / 2, size.h / 2),
      step = 32 * (fromHere ? pasteCount.current : pasteCount.current - 1),
      base = fromHere
        ? { x: payload.bounds.x, y: payload.bounds.y }
        : (lastPointer.current ?? { x: center.x - payload.bounds.w / 2, y: center.y - payload.bounds.h / 2 }),
      target = at ?? { x: base.x + step, y: base.y + step };
    // Pasted payloads can come from any page: keep only well-formed files under the usual limits.
    const media = Object.entries(payload.assets ?? {}).filter(
      ([id, asset]) => !assetsRef.current[id] && /^[\w-]{1,100}$/.test(id) && isValidAsset(asset),
    );
    for (const [id, asset] of media) saveAsset(id, asset).catch(() => {});
    if (media.length) setAssets(a => ({ ...a, ...Object.fromEntries(media) }));
    const result = pastePayload(boardRef.current, payload, target);
    update(result.board);
    setSelected(result.ids);
    setEditing(null);
  }
  /** Context-menu paste: read the system clipboard when allowed, otherwise use the last copy in this tab. */
  async function pasteFromMenu(at: Point) {
    let payload: ClipPayload | null = null;
    try {
      for (const entry of await navigator.clipboard.read()) {
        if (entry.types.includes('text/html'))
          payload = readClipboardHtml(await (await entry.getType('text/html')).text());
        if (payload) break;
      }
    } catch {
      // Clipboard access denied or unsupported: fall back to the copy made in this tab.
    }
    payload ??= clipRef.current;
    if (payload) pasteObjects(payload, at);
    else display('Nothing to paste. Copy objects first (Ctrl C).');
  }
  /** Copy through the browser's copy event (works without clipboard permission). */
  const copyNow = (cut = false) => {
    if (!document.execCommand(cut ? 'cut' : 'copy')) display('Copy is not available here. Use Ctrl C.');
  };
  /** Persist the current board immediately (before switching boards). */
  const flushSave = (): Library => {
    let lib = libraryRef.current;
    try {
      lib = saveActive(localStorage, lib, boardRef.current);
      setLibrary(lib);
    } catch {
      display('The current board could not be saved before switching. Export it to keep a copy.');
    }
    return lib;
  };
  /** Select and show an object, and/or open a comment thread (a dashboard content or comment match). */
  const focusTarget = (board: Board, target?: OpenTarget): boolean => {
    const item = target?.itemId ? board.items.find(i => i.id === target.itemId) : undefined;
    if (item) {
      setSelected([item.id]);
      fit([item]);
    }
    const thread = target?.threadId ? board.comments?.find(t => t.id === target.threadId) : undefined;
    if (thread) {
      setThread({ id: thread.id });
      if (!item) {
        const p = threadPoint(board, thread);
        fit([{ ...createItem('rectangle', p.x - 200, p.y - 150), w: 400, h: 300 }]);
      }
    }
    return !!item || !!thread;
  };
  const showBoard = (next: Board, lib: Library, target?: OpenTarget) => {
    setLibrary(lib);
    setHistory({ past: [], current: next, future: [] });
    boardRef.current = next;
    setSelected([]);
    setEditing(null);
    setDraft(null);
    setPanel(null);
    setThread(null);
    setDashboard(false);
    pauseSave.current = false;
    const skipStart = skipStartObject.current;
    skipStartObject.current = false;
    requestAnimationFrame(() => {
      if (focusTarget(next, target)) return;
      // A board set to open in a format object (track D) opens that object's focus view.
      if (!target && !skipStart && openStartObject(next)) return;
      if (next.startView) setCamera(centeredCamera(next.startView, next.startView.z, size));
      else fit(next.items);
    });
  };
  /** Set while a deep link opens a board, so the link (not the board's start object) decides what opens. */
  const skipStartObject = useRef(false);
  /** Select, reveal and optionally open an object in its focus view (deep links with focus=1, start objects). */
  const showObject = (target: Item, focus: boolean) => {
    setSelected([target.id]);
    fit([target]);
    if (focus) openEditor(target.id);
  };
  const openStartObject = (b: Board) => {
    const id = startObjectOf(b),
      target = id ? b.items.find(i => i.id === id) : undefined;
    if (!target) return false;
    showObject(target, true);
    return true;
  };
  /** Apply a library change now, so several actions in one event see each other's result. */
  const commitLibrary = (lib: Library) => {
    libraryRef.current = lib;
    setLibrary(lib);
  };
  const storageError = (err: unknown) =>
    display((err as Error).message || 'Browser storage is full. Delete or export boards to make room.');
  /** Store a new board, optionally filed under a space, and open it. */
  const openNew = (fresh: Board, space?: string) => {
    let lib = createBoard(localStorage, flushSave(), fresh).library;
    if (space) lib = setBoardMeta(localStorage, lib, lib.activeId, { space });
    showBoard(fresh, lib);
    libraryRef.current = lib;
  };
  const boardActions = {
    /** Save the open board now and return the up-to-date library (used before a library backup). */
    flush: () => {
      const lib = flushSave();
      libraryRef.current = lib;
      return lib;
    },
    /** Open a board, optionally at an object or comment thread (dashboard content search, comments list). */
    open: (id: string, target?: OpenTarget) => {
      if (id === libraryRef.current.activeId) {
        setDashboard(false);
        if (target) requestAnimationFrame(() => focusTarget(boardRef.current, target));
        return;
      }
      try {
        const opened = switchTo(localStorage, flushSave(), id, parseBoard);
        showBoard(opened.board, opened.library, target);
      } catch (err) {
        display((err as Error).message || 'That board could not be opened.');
      }
    },
    create: (template: TemplateName | null, space?: string) => {
      try {
        const fresh: Board = { ...newBoard(), title: template ?? 'Untitled board' };
        if (template) rememberTemplateUse(starterUseKey(template));
        if (template) fresh.items = templateItems(template, { x: 0, y: 0 }, (t, x, y, f) => createItem(t, x, y, f));
        openNew(fresh, space);
      } catch (err) {
        storageError(err);
      }
    },
    /** Store and open a ready-made board (a saved template or an imported backup). */
    createFrom: (fresh: Board, space?: string) => {
      try {
        openNew(fresh, space);
        return true;
      } catch (err) {
        storageError(err);
        return false;
      }
    },
    rename: (id: string, title: string) => {
      try {
        if (id === libraryRef.current.activeId) update({ ...boardRef.current, title: title.slice(0, 200) });
        else commitLibrary(renameBoard(localStorage, libraryRef.current, id, title, parseBoard));
      } catch (err) {
        display((err as Error).message);
      }
    },
    duplicate: (id: string, title?: string) => {
      try {
        const lib = id === libraryRef.current.activeId ? flushSave() : libraryRef.current;
        commitLibrary(duplicateBoard(localStorage, lib, id, parseBoard, undefined, title).library);
      } catch (err) {
        storageError(err);
      }
    },
    /** File under a space or star one or more boards (item 107). */
    setMeta: (id: string | string[], patch: BoardMetaPatch) => {
      try {
        commitLibrary(setBoardMeta(localStorage, libraryRef.current, id, patch));
      } catch (err) {
        display((err as Error).message || 'Browser storage is full.');
      }
    },
    /** Move boards to the trash (gap C1). */
    remove: (id: string | string[]) => {
      const ids = Array.isArray(id) ? id : [id];
      try {
        const lib = ids.includes(libraryRef.current.activeId) ? flushSave() : libraryRef.current;
        const result = trashBoards(localStorage, lib, ids, parseBoard, newBoard);
        if (result.board) showBoard(result.board, result.library);
        libraryRef.current = result.library;
        setLibrary(result.library);
        display(ids.length === 1 ? 'Board moved to trash.' : `${ids.length} boards moved to trash.`);
      } catch (err) {
        display((err as Error).message);
      }
    },
    restore: (ids: string[]) => {
      try {
        commitLibrary(restoreBoards(localStorage, libraryRef.current, ids));
        display(ids.length === 1 ? 'Board restored.' : `${ids.length} boards restored.`);
      } catch (err) {
        storageError(err);
      }
    },
    /** Delete trashed boards for good. Their media is removed at the next start. */
    purge: (ids: string[]) => {
      try {
        commitLibrary(purgeBoards(localStorage, libraryRef.current, ids));
        display(ids.length === 1 ? 'Board deleted permanently.' : `${ids.length} boards deleted permanently.`);
      } catch (err) {
        display((err as Error).message);
      }
    },
    /** Add boards from a library backup without opening them (gap C3). */
    addBoards: (
      entries: Parameters<typeof addBoards>[2],
      spaces: string[] = [],
      spaceInfo: Record<string, SpaceInfo> = {},
    ) => {
      try {
        let lib = addBoards(localStorage, libraryRef.current, entries).library;
        for (const s of spaces) if (!spacesOf(lib).includes(s)) lib = createSpace(localStorage, lib, s);
        // Space details from the backup fill in what this library does not have yet.
        for (const [s, info] of Object.entries(spaceInfo)) {
          const have = spaceInfoOf(lib, s);
          if (!have.emoji && !have.description) lib = setSpaceInfo(localStorage, lib, s, info);
        }
        commitLibrary(lib);
        return true;
      } catch (err) {
        storageError(err);
        return false;
      }
    },
    /** Spaces (gap C12). */
    space: (change: { create: string } | { rename: string; to: string } | { remove: string }) => {
      try {
        const lib = libraryRef.current;
        commitLibrary(
          'create' in change
            ? createSpace(localStorage, lib, change.create)
            : 'rename' in change
              ? renameSpace(localStorage, lib, change.rename, change.to)
              : deleteSpace(localStorage, lib, change.remove),
        );
        return true;
      } catch (err) {
        display((err as Error).message || 'Browser storage is full.');
        return false;
      }
    },
    /** A space's emoji and description (track R3). */
    spaceInfo: (name: string, info: SpaceInfo) => {
      try {
        commitLibrary(setSpaceInfo(localStorage, libraryRef.current, name, info));
        return true;
      } catch (err) {
        display((err as Error).message || 'Browser storage is full.');
        return false;
      }
    },
    /** Create a space holding a blueprint's boards (track R3). Returns the new space's name. */
    fromBlueprint: (bp: Blueprint, name?: string): string | null => {
      try {
        const made = createFromBlueprint(localStorage, flushSave(), bp, name);
        commitLibrary(made.library);
        display(
          `Created the space "${made.space}" with ${made.ids.length} ${made.ids.length === 1 ? 'board' : 'boards'}.`,
        );
        return made.space;
      } catch (err) {
        storageError(err);
        return null;
      }
    },
    /** Duplicate several boards at once (copies keep their space and are not opened). */
    duplicateMany: (ids: string[]) => {
      try {
        let lib = ids.includes(libraryRef.current.activeId) ? flushSave() : libraryRef.current;
        for (const id of ids) lib = duplicateBoard(localStorage, lib, id, parseBoard).library;
        commitLibrary(lib);
        display(ids.length === 1 ? 'Board duplicated.' : `${ids.length} boards duplicated.`);
      } catch (err) {
        storageError(err);
      }
    },
  };
  const duplicate = () => {
    if (!selected.length) return;
    const next = duplicateItems(boardRef.current, expandGroups(boardRef.current, selected));
    update(next.board);
    setSelected(next.ids);
  };
  const run = (change: (b: Board) => Board, after?: () => void) => {
    try {
      update(change(boardRef.current));
      after?.();
    } catch (error) {
      display((error as Error).message);
    }
  };
  const toggleLock = () => {
    if (!selected.length) return;
    const lock = !selectionLocked;
    if (lock && selected.some(id => gridOwner(boardRef.current, id)))
      return display('Move objects out of the Grid before locking them.');
    run(b => setLocked(b, selected, lock));
    setEditing(null);
    display(lock ? 'Locked. Select it and choose Unlock to edit again.' : 'Unlocked.');
  };
  const groupNow = () =>
    run(b => {
      const r = groupSelection(b, selected);
      return r.board;
    });
  const ungroupNow = () => run(b => ungroupSelection(b, selected));
  /** Smart paste or drop of plain text (gap list B2, B6, B7, B8). Returns false when nothing was added. */
  function insertText(text: string, at?: Point): boolean {
    const center = at ?? toWorld(size.w / 2, size.h / 2),
      made = itemsFromText(text, center);
    if (!made?.items.length) return false;
    update({ ...boardRef.current, items: [...boardRef.current.items, ...made.items] });
    setSelected(made.items.map(i => i.id));
    setTool('select');
    const what = {
      url: made.items[0].type === 'embed' ? 'Added an embed.' : 'Added a link bookmark.',
      cells: 'Pasted the cells as a grid.',
      mermaid: 'Added a Mermaid diagram.',
      lines: `Added ${made.items.length} sticky notes.`,
      doc: 'Long text pasted as a Doc.',
      text: '',
    }[made.kind];
    const message = [what, made.note].filter(Boolean).join(' ');
    if (made.kind === 'cells') {
      // Offer the other reading of spreadsheet cells without asking up front (one click, then gone).
      const gridId = made.items[0].id;
      display(message, { label: 'One sticky per cell', run: () => cellsAsNotes(gridId, text, center) });
    } else if (message) display(message);
    return true;
  }
  /** Replace a just-pasted Grid with one sticky note per non-empty cell. */
  function cellsAsNotes(gridId: string, text: string, center: Point) {
    const b = boardRef.current;
    if (!b.items.some(i => i.id === gridId)) return display('The pasted grid is no longer on the board.');
    const n = notesFromCells(parseDelimited(text.trim(), '\t'), center);
    if (!n.items.length) return;
    update({ ...b, items: [...b.items.filter(i => i.id !== gridId), ...n.items] });
    setSelected(n.items.map(i => i.id));
    display(
      [
        `Added ${n.items.length} sticky notes.`,
        n.truncated ? `Only the first ${PASTE_NOTES_MAX} cells were pasted.` : '',
      ]
        .filter(Boolean)
        .join(' '),
    );
  }
  /** Store an added image file, plus the download-only original of a converted SVG or BMP (gap R2-Q3). */
  async function storeImageFile(f: File): Promise<{ id: string; asset: ImageAsset; originalId?: string }> {
    const { asset, original } = await readImageWithOriginal(f),
      id = crypto.randomUUID();
    await saveAsset(id, asset);
    // If the original cannot be stored, the image is still added; "Download original" then saves the PNG.
    let originalId: string | undefined;
    if (original) {
      const candidate = crypto.randomUUID();
      originalId = await saveAsset(candidate, original).then(
        () => candidate,
        () => undefined,
      );
    }
    setAssets(a => ({ ...a, [id]: asset, ...(original && originalId ? { [originalId]: original } : {}) }));
    return { id, asset, originalId };
  }
  async function insertImages(files: File[], at?: Point) {
    const images = files.filter(f => f.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(f.name));
    if (!images.length) {
      if (files.length) display('Only image files can be added to the board.');
      return;
    }
    const center = at ?? toWorld(size.w / 2, size.h / 2),
      added: Item[] = [],
      errors: string[] = [];
    for (const [index, f] of images.slice(0, 20).entries()) {
      try {
        const { id, asset, originalId } = await storeImageFile(f);
        added.push(createImageItem(id, asset, { x: center.x + index * 32, y: center.y + index * 32 }, originalId));
      } catch (error) {
        errors.push(error instanceof Error && error.message ? error.message : `"${f.name}" could not be stored.`);
      }
    }
    if (added.length) {
      update({ ...boardRef.current, items: [...boardRef.current.items, ...added] });
      setSelected(added.map(i => i.id));
      setTool('select');
    }
    if (errors.length) display(errors.join(' '));
    else if (images.length > 20) display('Up to 20 images are added at a time.');
  }
  /**
   * A picture dragged from a web page (gap b6-7). Embedded (data:) pictures are added directly; other
   * addresses are downloaded when the site and this page's security policy allow it, otherwise the address
   * is added as a bookmark with the reason.
   */
  async function insertWebImage(picture: DroppedImage, at: Point) {
    try {
      let file: File;
      if (picture.kind === 'data') {
        const { mime, bytes } = decodeDataUrl(picture.url);
        file = new File([bytes as BlobPart], droppedImageName(picture.url, mime), { type: mime });
      } else {
        const response = await fetch(picture.url, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        if (!blob.type.startsWith('image/')) throw new Error('not an image');
        file = new File([blob], droppedImageName(picture.url, blob.type), { type: blob.type });
      }
      await insertImages([file], at);
    } catch {
      if (picture.kind === 'data') return display('The dropped picture could not be read.');
      if (insertText(picture.url, at))
        display(
          `The picture from ${new URL(picture.url).hostname} could not be downloaded (the site or this app's security settings do not allow it), so a bookmark was added. Save the picture and drop the file to add it as an image.`,
        );
    }
  }
  async function insertDrawio(files: File[], at?: Point) {
    const center = at ?? toWorld(size.w / 2, size.h / 2),
      added: Item[] = [],
      errors: string[] = [];
    for (const [index, file] of files.slice(0, 20).entries()) {
      try {
        const xml = await readDrawioFile(file);
        const item = createItem('drawio', center.x + index * 32, center.y + index * 32);
        item.text = file.name.replace(/\.(drawio|xml)$/i, '').slice(0, 200);
        item.data = { xml };
        added.push(item);
      } catch (error) {
        errors.push((error as Error).message);
      }
    }
    if (added.length) {
      update({ ...boardRef.current, items: [...boardRef.current.items, ...added] });
      setSelected(added.map(i => i.id));
      setTool('select');
      if (added.length === 1) setWidgetEditId(added[0].id);
    }
    if (errors.length) display(errors.join(' '));
  }
  /** A .drawio file as native shapes and connectors (track R2-H), centred on `at` or the view; one undo step. */
  async function importDrawioShapes(file: File, at?: Point) {
    const center = at ?? toWorld(size.w / 2, size.h / 2);
    try {
      const xml = await readDrawioFile(file),
        current = boardRef.current,
        room = BOARD_OBJECT_LIMIT - current.items.length;
      if (room <= 0) return display('This prototype supports up to 2,000 objects per board.');
      const made = drawioToItems(xml, center, (t, x, y, f) => createItem(t, x, y, f), room);
      update({ ...current, items: [...current.items, ...made.items] });
      setSelected(made.items.map(i => i.id));
      setTool('select');
      display(drawioImportNote(made));
    } catch (error) {
      display((error as Error).message);
    }
  }
  /** Add a recorded or captured file (Talktrack video, Photobooth photo) to the board. */
  async function insertCaptured(file: File) {
    if (file.type.startsWith('image/')) return insertImages([file]);
    mediaKind.current = 'video';
    return insertMedia(file);
  }
  async function insertMedia(file: File, kindOverride?: string, at?: Point) {
    const kind = kindOverride ?? mediaKind.current,
      view = kind ? viewFor(kind as Kind) : undefined;
    if (!kind || !view?.fromFile) return;
    try {
      const loaded = await view.fromFile.load(file),
        id = crypto.randomUUID(),
        center = at ?? toWorld(size.w / 2, size.h / 2);
      await saveAsset(id, loaded.asset);
      setAssets(a => ({ ...a, [id]: loaded.asset }));
      const item: Item = {
        ...createItem(kind as Kind, center.x, center.y),
        w: loaded.size[0],
        h: loaded.size[1],
        assetId: id,
        data: loaded.data,
        text: loaded.text ?? file.name.slice(0, 200),
      };
      item.x -= item.w / 2;
      item.y -= item.h / 2;
      update({ ...boardRef.current, items: [...boardRef.current.items, item] });
      setSelected([item.id]);
    } catch (error) {
      display((error as Error).message || 'The file could not be added.');
    }
  }
  async function replaceSelectedImage(file: File) {
    const target = selectedItem;
    if (!target || target.type !== 'image') return;
    try {
      const { id, asset, originalId } = await storeImageFile(file);
      update(replaceImage(boardRef.current, target.id, id, asset, originalId));
      display('Image replaced. Undo restores the previous image.');
    } catch (error) {
      display((error as Error).message || 'The image could not be replaced.');
    }
  }
  const toWorld = (x: number, y: number): Point => {
    const r = svg.current!.getBoundingClientRect();
    return { x: (x - r.left - camera.x) / camera.z, y: (y - r.top - camera.y) / camera.z };
  };
  const zoom = (factor: number, at: Point = { x: size.w / 2, y: size.h / 2 }) =>
    setCamera(c => zoomCameraAt(c, c.z * factor, at));
  const fit = (items = boardRef.current.items) => {
    if (!items.length) return setCamera({ x: 0, y: 0, z: 1 });
    const pts = items.flatMap(i =>
      i.type === 'arrow'
        ? endpoints(i, boardRef.current.items)
        : i.rotation
          ? rotatedCorners(i, i.rotation)
          : [
              { x: i.x, y: i.y },
              { x: i.x + i.w, y: i.y + i.h },
            ],
    );
    const x = Math.min(...pts.map(p => p.x)),
      y = Math.min(...pts.map(p => p.y)),
      w = Math.max(...pts.map(p => p.x)) - x,
      h = Math.max(...pts.map(p => p.y)) - y;
    const left = size.w <= 600 ? 65 : 100,
      // Leave room for the outline or the linked Mermaid code panel on the right.
      right = outline
        ? 320
        : notesOpen && size.w > 900
          ? 420
          : mermaidLinkId && size.w > 900
            ? 470
            : size.w <= 600
              ? 20
              : 40;
    const usableW = Math.max(100, size.w - left - right),
      z = Math.max(0.1, Math.min(1.4, (usableW - 32) / Math.max(w, 1), (size.h - 220) / Math.max(h, 1)));
    setCamera({ z, x: left + (usableW - w * z) / 2 - x * z, y: 90 + (size.h - 180 - h * z) / 2 - y * z });
  };
  /** Internal links (gap D12): jump to the target and offer a timed way back to the previous view. */
  const [backView, setBackView] = useState<Camera | null>(null),
    backTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const followLink = (target: Item) => {
    setBackView({ ...camera });
    clearTimeout(backTimer.current);
    backTimer.current = setTimeout(() => setBackView(null), 8000);
    setSelected([target.id]);
    fit([target]);
  };
  const goBack = () => {
    clearTimeout(backTimer.current);
    if (backView) setCamera(backView);
    setBackView(null);
  };
  const addCentered = (kind: Kind) => {
    const p = toWorld(size.w / 2, size.h / 2),
      i = lastColors.apply(createItem(kind, p.x, p.y, fill));
    i.x -= i.w / 2;
    i.y -= i.h / 2;
    update({ ...boardRef.current, items: [...boardRef.current.items, i] });
    setSelected([i.id]);
    setTool('select');
    if (!['arrow', 'pen', 'frame'].includes(kind)) setEditing(i.id);
  };
  /** Place a tool dropped on the board (gap F12): object kinds are created at the point, others open as usual. */
  const placeAt = (kind: string, at: Point) => {
    if (!(allKinds as string[]).includes(kind) || ['image', 'video', 'pdf', 'file', 'drawio', 'pen'].includes(kind)) {
      chooseFormat(kind);
      return;
    }
    const i = lastColors.apply(createItem(kind as Kind, at.x, at.y, kind === 'note' ? fill : undefined));
    i.x -= i.w / 2;
    i.y -= i.h / 2;
    update({ ...boardRef.current, items: [...boardRef.current.items, i] });
    setSelected([i.id]);
    setTool('select');
    if (['note', 'text', 'card'].includes(kind) || isShapeKind(kind)) setEditing(i.id);
  };
  const mediaFile = useRef<HTMLInputElement>(null),
    mediaKind = useRef<string | null>(null),
    docImportFile = useRef<HTMLInputElement>(null),
    docImportKind = useRef<DocImportKind>('markdown');
  /**
   * Markdown and Word files become Docs, PowerPoint files become Slides decks (items 79 and 84), and CSV or
   * Excel files become a Table of records (gap list B3, B15, I2).
   */
  async function importDocument(file: File, at?: Point, into?: 'grid' | { gridId: string }) {
    const center = at ?? toWorld(size.w / 2, size.h / 2);
    try {
      let item: Item,
        note = '';
      if (into && /\.(csv|tsv|xlsx)$/i.test(file.name)) {
        // Spreadsheet into a Grid (gap b3-5): a new one, or the cells of the grid it was dropped on.
        const { readTableFile, importIntoGrid, gridImportNote } = await import('./table-file'),
          rows = await readTableFile(file, askSheet);
        if (!rows) return;
        if (into !== 'grid') {
          const made = importIntoGrid(boardRef.current, into.gridId, rows);
          if (!made) return display('This grid is locked or no longer exists.');
          update(made.board);
          setSelected([into.gridId]);
          display(gridImportNote(made.data, made.truncated));
          return;
        }
        const made = gridFromCells(rows, center),
          name = file.name.replace(/\.(csv|tsv|xlsx)$/i, '').slice(0, 200);
        if (name) made.item.name = name;
        update({ ...boardRef.current, items: [...boardRef.current.items, made.item] });
        setSelected([made.item.id]);
        setTool('select');
        display(gridImportNote(made.item.data as GridData, made.truncated));
        return;
      }
      if (/\.(csv|tsv|xlsx)$/i.test(file.name)) {
        const { importTitle, tableFromImport } = await import('./record-import'),
          { readTableFile } = await import('./table-file'),
          table = await readTableFile(file, askSheet);
        if (!table) return;
        const made = tableFromImport(boardRef.current, table, importTitle(file.name), center);
        update(made.board);
        setSelected([made.item.id]);
        setTool('select');
        display(
          [`Imported ${made.count} ${made.count === 1 ? 'record' : 'records'} into a table.`, ...made.notes].join(' '),
        );
        return;
      }
      if (/\.docx$/i.test(file.name)) {
        const { parseDocx, OFFICE_MAX_BYTES } = await import('./office-import');
        if (file.size > OFFICE_MAX_BYTES) throw new Error('Word files up to 20 MB can be imported.');
        const doc = parseDocx(new Uint8Array(await file.arrayBuffer()));
        item = createItem('doc', center.x, center.y, '#ffffff');
        item.data = { ...item.data, markdown: doc.markdown };
        item.text = docFromMarkdown(doc.markdown, file.name.replace(/\.docx$/i, '.md')).title;
        note = doc.truncated
          ? 'The document was shortened to 60,000 characters.'
          : `Imported ${file.name}. Images and page layout are not imported.`;
      } else if (/\.(odt|rtf)$/i.test(file.name)) {
        // OpenDocument text and Rich Text Format (track J): read as data into a Doc's Markdown.
        const rtf = /\.rtf$/i.test(file.name);
        if (file.size > 20 * 1024 * 1024)
          throw new Error(`${rtf ? 'RTF' : 'OpenDocument'} files up to 20 MB can be imported.`);
        const bytes = new Uint8Array(await file.arrayBuffer()),
          doc = rtf
            ? (await import('./rtf-import')).parseRtf(bytes)
            : (await import('./opendoc-import')).parseOdt(bytes);
        item = createItem('doc', center.x, center.y, '#ffffff');
        item.data = { ...item.data, markdown: doc.markdown };
        item.text = docFromMarkdown(doc.markdown, file.name.replace(/\.(odt|rtf)$/i, '.md')).title;
        note = doc.truncated
          ? 'The document was shortened to 60,000 characters.'
          : `Imported ${file.name}. Images and page layout are not imported.`;
      } else if (/\.(pptx|odp)$/i.test(file.name)) {
        const odp = /\.odp$/i.test(file.name);
        let slides;
        if (odp) {
          if (file.size > 20 * 1024 * 1024) throw new Error('OpenDocument files up to 20 MB can be imported.');
          slides = (await import('./opendoc-import')).parseOdp(new Uint8Array(await file.arrayBuffer()));
        } else {
          const { parsePptx, PPTX_MAX_BYTES } = await import('./pptx');
          if (file.size > PPTX_MAX_BYTES) throw new Error('PowerPoint files up to 50 MB can be imported.');
          slides = parsePptx(new Uint8Array(await file.arrayBuffer()));
        }
        item = createItem('slides', center.x, center.y);
        item.data = { slides, current: 0 };
        item.text = file.name.replace(/\.(pptx|odp)$/i, '').slice(0, 200) || 'Imported deck';
        note = `${slides.length} ${slides.length === 1 ? 'slide' : 'slides'} imported. Images and layouts are not imported.`;
      } else {
        if (file.size > DOC_FILE_MAX) throw new Error('Markdown files up to 1 MB can be imported.');
        const doc = docFromMarkdown(await file.text(), file.name);
        item = createItem('doc', center.x, center.y, '#ffffff');
        item.data = { ...item.data, markdown: doc.markdown };
        item.text = doc.title;
        note = doc.truncated ? 'The document was shortened to 60,000 characters.' : `Imported ${file.name}.`;
      }
      validateWidget(item);
      item.x -= item.w / 2;
      item.y -= item.h / 2;
      update({ ...boardRef.current, items: [...boardRef.current.items, item] });
      setSelected([item.id]);
      setTool('select');
      display(note);
    } catch (error) {
      display((error as Error).message || 'The file could not be imported.');
    }
  }
  const makePlacedItem = (kind: Kind, point: Point): Item => {
    const item = pendingPlacement?.startsWith('wf:')
      ? wireframeItem(pendingPlacement.slice(3) as never, point, (t: Kind, x: number, y: number) => createItem(t, x, y))
      : lastColors.apply(createItem(kind, point.x, point.y, fill));
    const stamp =
      kind === 'stamp' && pendingPlacement?.startsWith('stamp:') ? stampChoice(pendingPlacement.slice(6)) : null;
    if (stamp) Object.assign(item, { data: stamp.data, fill: stamp.fill });
    if (kind === 'mermaid') item.text = starters.Flowchart;
    // Compact shapes menu line presets (item 109).
    if (kind === 'arrow' && pendingPlacement === 'line:line') item.connector = { endHead: 'none' };
    if (kind === 'arrow' && pendingPlacement === 'line:elbow') item.connector = { path: 'elbow' };
    if (kind === 'arrow' && pendingPlacement?.startsWith('line:')) setPendingPlacement(null);
    if (kind === 'mindmap') item.nodes = [{ id: crypto.randomUUID(), parent: null, text: 'Central topic' }];
    if (kind === 'code') {
      item.text = '// Start writing code';
      item.language = 'javascript';
    }
    return item;
  };
  const finishPlacedItem = (base: Board, item: Item): Board => {
    const next = { ...base, items: [...base.items, item] };
    if (['table', 'kanban', 'timeline'].includes(item.type)) {
      item.datasetId = crypto.randomUUID();
      next.datasets = {
        ...base.datasets,
        [item.datasetId]: [
          { id: crypto.randomUUID(), title: 'First task', status: 'Not started', assignee: '', start: '', end: '' },
        ],
      };
    }
    setPendingPlacement(null);
    return next;
  };
  const chooseFormat = (choice: string) => {
    setGallery(null);
    setShapes(false);
    setEditing(null);
    setSelected([]);
    setPendingPlacement(null);
    if (choice === 'templates') {
      setTool('select');
      setFacil('templates');
      return;
    }
    if (choice === 'layers') {
      setTool('select');
      setOutline(true);
      return;
    }
    if (
      choice === 'import:markdown' ||
      choice === 'import:pptx' ||
      choice === 'import:docx' ||
      choice === 'import:odt' ||
      choice === 'import:odp' ||
      choice === 'import:table' ||
      choice === 'import:drawio' ||
      choice === 'import:grid'
    ) {
      setTool('select');
      docImportKind.current = choice.slice(7) as DocImportKind;
      if (docImportFile.current) {
        docImportFile.current.accept =
          choice === 'import:pptx'
            ? '.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation'
            : choice === 'import:docx'
              ? '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
              : choice === 'import:odt'
                ? '.odt,.rtf,application/vnd.oasis.opendocument.text,application/rtf,text/rtf'
                : choice === 'import:odp'
                  ? '.odp,application/vnd.oasis.opendocument.presentation'
                  : choice === 'import:drawio'
                    ? '.drawio,.xml,application/xml,text/xml'
                    : choice === 'import:table' || choice === 'import:grid'
                      ? '.csv,.tsv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                      : '.md,.markdown,text/markdown,text/plain';
        docImportFile.current.click();
      }
      return;
    }
    if (choice === 'reactions') {
      setTool('select');
      setFacil('reactions');
      return;
    }
    if (choice === 'spellcheck') {
      setTool('select');
      setViewPrefs({ spellcheck: !viewPrefs.spellcheck });
      display(
        viewPrefs.spellcheck
          ? 'Spell check is off.'
          : 'Spell check is on. Misspelled words are underlined while you edit.',
      );
      return;
    }
    if (choice === 'talktrack' || choice === 'photobooth') {
      setTool('select');
      setFacil(choice);
      return;
    }
    if (choice === 'voting' || choice === 'a11y' || choice === 'validation' || choice === 'stickies') {
      setTool('select');
      setFacil(choice);
      return;
    }
    if (choice === 'private') {
      setTool('select');
      run(b => setPrivate(b, 'all', !b.privateMode?.all));
      return;
    }
    if (choice === 'comment') {
      setTool('comment');
      return;
    }
    if (choice === 'bulk') {
      setTool('select');
      setBulk(true);
      return;
    }
    if (choice === 'stack') {
      // Sticky stack (item 110): place a pad of notes in the current colour at the centre of the view.
      setTool('select');
      const c = toWorld(size.w / 2, size.h / 2),
        pad = createItem('stickypad', 0, 0, fill);
      pad.x = c.x - pad.w / 2;
      pad.y = c.y - pad.h / 2;
      update({ ...boardRef.current, items: [...boardRef.current.items, pad] });
      setSelected([pad.id]);
      display('Drag from the stack to take a sticky note.');
      return;
    }
    const view = viewFor(choice);
    if (view?.fromFile) {
      setTool('select');
      mediaKind.current = choice;
      if (mediaFile.current) {
        mediaFile.current.accept = view.fromFile.accept;
        mediaFile.current.click();
      }
      return;
    }
    if (choice === 'image') {
      setTool('select');
      insertAt.current = null;
      imageFile.current?.click();
      return;
    }
    setPendingPlacement(choice);
    setTool((choice.startsWith('wf:') ? 'wireframe' : choice) as Kind);
  };
  const openEditor = (id: string) => {
    editSeed.current = null;
    const item = boardRef.current.items.find(i => i.id === id);
    if (item?.locked || gridOwner(boardRef.current, id)?.locked) {
      display('This object is locked. Unlock it to edit.');
      return;
    }
    if (item && viewFor(item.type)) {
      const v = viewFor(item.type)!;
      if (v.textEdit) setEditing(id);
      else if (v.Editor) {
        setEditing(null);
        setWidgetEditId(id);
      }
      return;
    }
    if (linkOf(item)) {
      setEditing(null);
      setMermaidLinkId(id);
    } else if (item?.type === 'mindmap') {
      setEditing(null);
      setMindEditId(id);
    } else if (item && richKinds.includes(item.type)) {
      setEditing(null);
      setFormatId(id);
    } else if (item?.type === 'code') {
      setEditing(null);
      setCodeId(id);
    } else if (item?.type === 'image') {
      setEditing(null);
      if (assetsRef.current[item.assetId!]) setCropId(id);
      else display('This image is unavailable. Import a JSON backup that contains it, or replace it.');
    } else setEditing(id);
  };
  const quickAddNote = () => {
    if (!selectedItem) return;
    try {
      const source = boardRef.current.items.find(i => i.id === selectedItem.id)!;
      const next = addConnectedNote(boardRef.current, source.id);
      update(next.board);
      setSelected([next.note.id]);
      setTool('select');
      setEditing(next.note.id);
      fit([source, next.note]);
    } catch (error) {
      display((error as Error).message);
    }
  };
  useEffect(() => {
    const resize = () => setSize({ w: innerWidth, h: innerHeight });
    addEventListener('resize', resize);
    return () => removeEventListener('resize', resize);
  }, []);
  useEffect(() => {
    const open = (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail?.id;
      if (id && boardRef.current.items.some(i => i.id === id)) {
        setEditing(null);
        setWidgetEditId(id);
      }
    };
    const preview = (e: Event) => {
      const id = (e as CustomEvent<{ screenId: string }>).detail?.screenId;
      if (id) {
        setPreviewStart({ screenId: id, camera, selected });
        setSelected([]);
        setEditing(null);
      }
    };
    addEventListener(OPEN_EDITOR_EVENT, open);
    addEventListener(PREVIEW_EVENT, preview);
    return () => {
      removeEventListener(OPEN_EDITOR_EVENT, open);
      removeEventListener(PREVIEW_EVENT, preview);
    };
  });
  const previewState = usePreviewState(board, previewStart?.screenId ?? null);
  const stopPreview = () => {
    if (!previewStart) return;
    setCamera(previewStart.camera);
    setSelected(previewStart.selected.filter(id => boardRef.current.items.some(i => i.id === id)));
    setPreviewStart(null);
  };
  useEffect(() => {
    loadAssets()
      .then(all => {
        setAssets(all);
        if (!initial.error)
          pruneAssets(
            new Set([
              ...referencedAssets(boardRef.current),
              ...assetRefsAcrossBoards(localStorage, libraryRef.current),
            ]),
          ).catch(() => {});
      })
      .catch(() => {
        if (boardRef.current.items.some(i => i.type === 'image'))
          display('Stored images could not be loaded in this browser.');
      });
  }, []);
  useEffect(() => {
    const paste = (e: ClipboardEvent) => {
      if (
        formatId ||
        cropId ||
        codeId ||
        presenting ||
        previewStart ||
        (e.target as HTMLElement)?.closest?.('input,textarea,select,[contenteditable=true]')
      )
        return;
      const objects = readClipboardHtml(e.clipboardData?.getData('text/html') ?? '');
      if (objects) {
        e.preventDefault();
        pasteObjects(objects);
        return;
      }
      const files = [...(e.clipboardData?.files ?? [])].filter(f => f.type.startsWith('image/'));
      if (!files.length) {
        const text = e.clipboardData?.getData('text/plain') ?? '';
        if (text && looksLikeMarkdown(text) && classifyPaste(text) !== 'cells' && classifyPaste(text) !== 'mermaid') {
          e.preventDefault();
          setMdPaste(text.slice(0, 60000));
          return;
        }
        if (text && insertText(text)) e.preventDefault();
        return;
      }
      e.preventDefault();
      insertImages(files);
    };
    const copy = (e: ClipboardEvent) => {
      if (
        formatId ||
        cropId ||
        codeId ||
        presenting ||
        previewStart ||
        dashboard ||
        (e.target as HTMLElement)?.closest?.('input,textarea,select,[contenteditable=true]') ||
        !selected.length ||
        window.getSelection()?.toString()
      )
        return;
      const payload = copySelection(boardRef.current, expandGroups(boardRef.current, selected), assetsRef.current);
      if (!payload) return;
      const formats = clipboardFormats(payload);
      e.clipboardData?.setData('text/html', formats.html);
      e.clipboardData?.setData('text/plain', formats.text);
      e.preventDefault();
      clipRef.current = payload;
      pasteCount.current = 0;
      clipSignature.current = '';
      // Cut removes exactly what was copied: a linked Mermaid frame goes with its diagram.
      if (e.type === 'cut') deleteObjects(cutIds(boardRef.current, selected));
      else display(`Copied ${payload.items.length} ${payload.items.length === 1 ? 'object' : 'objects'}.`);
    };
    addEventListener('paste', paste);
    addEventListener('copy', copy);
    addEventListener('cut', copy);
    return () => {
      removeEventListener('paste', paste);
      removeEventListener('copy', copy);
      removeEventListener('cut', copy);
    };
  });
  useEffect(() => {
    const canvas = svg.current!;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (gesture.current) return;
      // Mouse mode: the wheel zooms and Shift+wheel pans; trackpad mode: the wheel pans and Ctrl+wheel zooms.
      const mouse =
        navigationRef.current === 'mouse' || (navigationRef.current === 'auto' && wheelLooksLikeMouse(e) && !e.ctrlKey);
      if (mouse && e.shiftKey && !e.ctrlKey && !e.metaKey)
        return setCamera(c => ({ ...c, x: c.x - (e.deltaX || e.deltaY), y: c.y }));
      if (e.ctrlKey || e.metaKey || mouse) {
        const rect = canvas.getBoundingClientRect(),
          at = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        setCamera(c => {
          const z = clampZoom(c.z * Math.exp(-e.deltaY * 0.008));
          return { z, x: at.x - ((at.x - c.x) * z) / c.z, y: at.y - ((at.y - c.y) * z) / c.z };
        });
      } else setCamera(c => ({ ...c, x: c.x - e.deltaX, y: c.y - e.deltaY }));
    };
    canvas.addEventListener('wheel', wheel, { passive: false });
    return () => canvas.removeEventListener('wheel', wheel);
  }, [navigationRef]);
  useEffect(() => {
    if (pauseSave.current) return;
    setSaved(false);
    const timer = setTimeout(() => {
      try {
        setLibrary(lib => saveActive(localStorage, lib, board));
        setSaveError('');
        setSaved(true);
        maybeSnapshot(localStorage, libraryRef.current.activeId, board);
      } catch {
        setSaveError('Browser storage is full or unavailable. Export JSON to save your work.');
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [board]);
  function download(data: string, name: string, type: string) {
    const url = URL.createObjectURL(new Blob([data], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMenu(false);
  }
  async function importFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    e.target.value = '';
    try {
      if (f.size > 320_000_000) throw new Error('Choose a backup smaller than 300 MB.');
      const bytes = new Uint8Array(await f.arrayBuffer());
      let parsed: Board;
      const { isBundle, decodeBundle } = await import('./media-bundle');
      if (isBundle(bytes)) {
        const bundle = decodeBundle(bytes);
        parsed = {
          ...parseBoard(bundle.board),
          ...(Object.keys(bundle.assets).length ? { assets: bundle.assets } : {}),
        };
      } else {
        if (f.size > 120_000_000)
          throw new Error('Choose a JSON board smaller than 120 MB, or use a .boardroom bundle.');
        let raw: unknown = JSON.parse(new TextDecoder().decode(bytes));
        // Passphrase-protected backups (gap B18).
        if (isEncryptedBackup(raw)) {
          const pass = await askPassphrase('Open encrypted backup');
          if (pass === null) return display('Import cancelled.');
          raw = JSON.parse(await decryptBackup(raw, pass));
        }
        parsed = parseBoard(raw);
      }
      const split = splitAssets(parsed, assetsRef.current);
      for (const [id, asset] of Object.entries(split.assets))
        await saveAsset(id, asset).catch(() => {
          throw new Error('Media in this backup could not be stored in this browser.');
        });
      setAssets(a => ({ ...a, ...split.assets }));
      update(split.board);
      setSelected([]);
      setEditing(null);
      display(
        split.missing
          ? `Board imported. ${split.missing} media file${split.missing === 1 ? ' is' : 's are'} missing from this backup.`
          : 'Board imported. Undo restores your previous board.',
      );
    } catch (err) {
      display(err instanceof Error ? err.message : 'Unable to import this file.');
    }
  }
  const addExample = () => {
    const note = createItem('note', 300, 250);
    note.text = 'A space to think\ntogether.';
    const second = createItem('note', 580, 310, colors[6]);
    second.text = 'Start with a question.\nMake the next move.';
    const arrow = createItem('arrow', 0, 0);
    arrow.from = note.id;
    arrow.to = second.id;
    const title = createItem('text', 300, 140);
    title.text = 'Ideas start here';
    title.w = 450;
    update({ ...board, items: [note, second, arrow, title] });
    setCamera({ x: 0, y: 0, z: 1 });
  };
  function geometryOf(item: Item, items: Item[]) {
    return connectorGeometry(item, items);
  }
  const geometries = React.useMemo(
    () => new Map(shown.items.filter(i => i.type === 'arrow').map(i => [i.id, connectorGeometry(i, shown.items)])),
    [shown.items],
  );
  const jumps = React.useMemo(
    () =>
      lineJumps(
        shown.items
          .filter(i => i.type === 'arrow' && i.connector?.jumps !== false && !i.hidden)
          .map(i => ({ id: i.id, nodes: geometries.get(i.id)!.samples })),
      ),
    [geometries, shown.items],
  );
  const privateSet = React.useMemo(() => privateIds(shown), [shown]);
  const covered = React.useMemo(() => coveredIds(shown), [shown]);
  const searchExclude = React.useMemo(() => new Set([...privateSet, ...covered]), [privateSet, covered]);
  const selectedLatest = useLatest(selected);
  const widgetCtx = (item: Item): WidgetCtx => ({
    selection: () => selectedLatest.current,
    board: shown,
    assets,
    storeAsset: async asset => {
      const id = crypto.randomUUID();
      await saveAsset(id, asset);
      setAssets(previous => ({ ...previous, [id]: asset }));
      return id;
    },
    zoom: camera.z,
    selected: selected.includes(item.id),
    update: change => run(change),
    display,
    preview: previewState ?? undefined,
    openEditor: () => openEditor(item.id),
  });
  // Border controls cover shapes and images (gap D11).
  const firstShape = selected.map(id => shown.items.find(i => i.id === id)).find(i => i && styledKind(i.type));
  const allShapes =
    selected.length > 0 &&
    selected.every(id => {
      const t = shown.items.find(i => i.id === id)?.type;
      return !!t && styledKind(t);
    });
  const mixedBorders =
    allShapes && new Set(selected.map(id => JSON.stringify(shown.items.find(i => i.id === id)?.style ?? {}))).size > 1;
  // Action Shortcut buttons (item 99) are answered by ShortcutRunner (shortcut-runner.tsx).
  /** Follow a deep link in the URL fragment: open its board, then select, show or focus its object. */
  const followDeepLink = useLatest(() => {
    const link = parseDeepLink(location.hash);
    if (!link) return;
    try {
      window.history.replaceState(null, '', location.pathname + location.search);
    } catch {
      /* history is not writable here */
    }
    if (link.board && link.board !== libraryRef.current.activeId) {
      if (!liveBoards(libraryRef.current).some(b => b.id === link.board))
        return display('That board is not in this browser. Links only open boards stored on this device.');
      skipStartObject.current = !!link.object;
      boardActions.open(link.board);
    }
    setDashboard(false);
    if (!link.object) return;
    // Wait until a board switch has rendered and fitted the view.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const target = boardRef.current.items.find(i => i.id === link.object);
        if (!target) return display('That object is no longer on this board.');
        showObject(target, !!link.focus);
      }),
    );
  });
  /** On first load, open the board's start object (track D) unless a link in the URL names an object. */
  const openInitialStart = useLatest(() => {
    if (/(^|[#&])(object|item|frame)=/.test(location.hash)) return;
    requestAnimationFrame(() => requestAnimationFrame(() => openStartObject(boardRef.current)));
  });
  useEffect(() => {
    openInitialStart.current();
  }, [openInitialStart]);
  useEffect(() => {
    followDeepLink.current();
    const follow = () => followDeepLink.current();
    addEventListener('hashchange', follow);
    return () => removeEventListener('hashchange', follow);
  }, [followDeepLink]);
  /** A link to an object on this board (optionally opening it in focus), for this device's browser. */
  const objectLink = (id: string, focus = false) =>
    deepLinkUrl(location.href, { board: libraryRef.current.activeId, object: id, focus });
  const startPresenting = (start: number) => {
    // Frames exist but every one is hidden from the presentation (gap G2).
    if (boardRef.current.items.some(i => i.type === 'frame') && !slideFrames(boardRef.current).length) {
      display('Every frame is hidden from the presentation. Show a frame in the Present panel first.');
      return;
    }
    setPresentPanel(false);
    setPresenting({ start, camera, selected });
    setSelected([]);
    setEditing(null);
    setSearchOpen(false);
  };
  const stopPresenting = () => {
    if (!presenting) return;
    setCamera(presenting.camera);
    setSelected(presenting.selected.filter(id => boardRef.current.items.some(i => i.id === id)));
    setPresenting(null);
  };
  return {
    dropLine,
    addCentered,
    addExample,
    allShapes,
    assets,
    assetsRef,
    board,
    boardRef,
    bulk,
    camera,
    chooseFormat,
    codeId,
    connectorDetailsId,
    covered,
    cropId,
    deleteSelection,
    detailsId,
    display,
    download,
    draft,
    duplicate,
    editing,
    eraseLast,
    eraser,
    facil,
    facilitate,
    file,
    fill,
    firstShape,
    fit,
    followLink,
    backView,
    goBack,
    formatId,
    mermaidLinkId,
    setMermaidLinkId,
    gallery,
    geometries,
    geometryOf,
    gesture,
    groupNow,
    guides,
    help,
    history,
    imageFile,
    importFile,
    importDocument,
    docImportFile,
    docImportKind,
    authorName,
    setAuthorName,
    insertAt,
    insertImages,
    insertWebImage,
    insertText,
    placeAt,
    insertMedia,
    insertCaptured,
    jumps,
    marquee,
    matches,
    mdPaste,
    mediaFile,
    mediaKind,
    menu,
    mindEditId,
    minimap,
    mixedBorders,
    normalize,
    normalizeText,
    notice,
    noticeAction,
    noticeTimer,
    openEditor,
    outline,
    boardOutline,
    setBoardOutline,
    notesOpen,
    setNotesOpen,
    panel,
    patch,
    patchStyle,
    pauseSave,
    penColor,
    penStyle,
    penWidth,
    precise,
    presentPanel,
    presenting,
    previewStart,
    previewState,
    privateSet,
    quickAddNote,
    replaceFile,
    replaceSelectedImage,
    run,
    saveError,
    saved,
    searchExclude,
    searchOpen,
    selected,
    selectedItem,
    selectionLocked,
    setAssets,
    setBulk,
    setCamera,
    setCodeId,
    setConnectorDetailsId,
    setCropId,
    setDetailsId,
    setDraft,
    setEditing,
    setEraser,
    setFacil,
    setFacilitate,
    setFill,
    setFormatId,
    setGallery,
    setGuides,
    setHelp,
    setHistory,
    setMarquee,
    setMatches,
    setMdPaste,
    setMenu,
    setMindEditId,
    setMinimap,
    setNotice,
    setOutline,
    setPanel,
    setPenColor,
    setPenStyle,
    setPenWidth,
    setPrecise,
    setPresentPanel,
    setPresenting,
    setPreviewStart,
    setSaveError,
    setSaved,
    setSearchOpen,
    setSelected,
    setShapes,
    setSize,
    setSnapping,
    setViewPrefs,
    viewPrefs,
    penMode,
    setPenMode,
    commandsOpen,
    setCommandsOpen,
    connectTarget,
    setConnectTarget,
    peeling,
    setPeeling,
    lasso,
    setLasso,
    penPresetList,
    activePreset,
    setActivePreset,
    savePenPresets: (list: PenPreset[]) => {
      setPenPresetList(list);
      try {
        localStorage.setItem(PEN_PRESETS_KEY, JSON.stringify(list));
      } catch {
        /* Presets still apply for this session. */
      }
    },
    setThread,
    setTimerOn,
    setTool,
    setWidgetEditId,
    shapes,
    shown,
    size,
    snapping,
    space,
    stackLast,
    startPresenting,
    objectLink,
    stopPresenting,
    stopPreview,
    svg,
    thread,
    timerOn,
    toWorld,
    toggleLock,
    tool,
    ungroupNow,
    update,
    widgetCtx,
    renderAll,
    setRenderAll,
    activeLayer,
    setActiveLayer,
    insertDrawio,
    importDrawioShapes,
    editSeed,
    pendingPlacement,
    setPendingPlacement,
    makePlacedItem,
    finishPlacedItem,
    widgetEditId,
    zoom,
    setDropLine,
    library,
    dashboard,
    setDashboard,
    inspector,
    setInspector,
    contextMenu,
    setContextMenu,
    lastPointer,
    pasteObjects,
    pasteFromMenu,
    copyNow,
    boardActions,
    clipRef,
  };
}
export type BoardCore = ReturnType<typeof useBoardCore>;
/** Board state and behaviour, composed from the core state, canvas gestures and keyboard shortcuts. */
export function useBoardApp() {
  const core = useBoardCore();
  const gestures = useCanvasGestures(core);
  useKeyboardShortcuts(core, gestures);
  useDeepLinks(core);
  return { ...core, ...gestures };
}
export type BoardApp = ReturnType<typeof useBoardApp>;
export const AppContext = React.createContext<BoardApp | null>(null);
export function useApp(): BoardApp {
  const app = React.useContext(AppContext);
  if (!app) throw new Error('useApp must be used inside AppContext');
  return app;
}
