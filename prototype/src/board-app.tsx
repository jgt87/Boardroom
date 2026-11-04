// Board application state and behaviour. UI components read it through useApp().
import React, { useEffect, useRef, useState } from 'react';
import { zoomCameraAt, clampZoom, centeredCamera } from './camera';
import { loadViewPrefs, saveViewPrefs, wheelLooksLikeMouse, type ViewPrefs } from './view-prefs';
import { useLatest } from './use-latest';
import { presentationFrames } from './navigation';
import { SHORTCUT_EVENT, type ShortcutData } from './specs-shortcut';
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
} from './model';
import type { Board, History, Item, Kind, Point, ImageAsset } from './model';
import { textLayout } from './text-format';
import { starters } from './formats';
import type { Handle, Guide } from './interactions';
import { connectorGeometry } from './connectors';
import { isShapeKind } from './shapes';
import { groupSelection, ungroupSelection, expandGroups, setLocked, editableIds, duplicateItems } from './arrange';
import { createImageItem, replaceImage, splitAssets, referencedAssets } from './images';
import { loadAssets, saveAsset, pruneAssets, readImageFile } from './assets-store';
import { wireframeItem } from './specs-media';
import { OPEN_EDITOR_EVENT } from './widgets-media';
import { stampChoice } from './widgets-graphics';
import { PREVIEW_EVENT, usePreviewState } from './prototype-preview';
import { looksLikeMarkdown } from './markdown';
import { applyLayouts } from './autolayout';
import { syncRecordCards } from './record-canvas';
import { applyGridLayouts, gridOwner } from './grid-canvas';
import { applyMindBounds } from './mindmap-bounds';
import { privateIds, detachComments, coveredIds, lineJumps, templateItems, setPrivate } from './board-tools';
import type { PenStyle, TemplateName } from './board-tools';
import { viewFor } from './widgets';
import {
  openLibrary,
  saveActive,
  switchTo,
  createBoard,
  renameBoard,
  duplicateBoard,
  deleteBoard,
  assetRefsAcrossBoards,
  LEGACY_KEY,
  setBoardMeta,
} from './board-library';
import type { Library } from './board-library';
import { copySelection, clipboardFormats, readClipboardHtml, pastePayload } from './clipboard';
import type { ClipPayload } from './clipboard';
import { useCanvasGestures } from './use-canvas-gestures';
import { useKeyboardShortcuts } from './use-keyboard-shortcuts';
import type { WidgetCtx } from './widget-types';
import { readDrawioFile } from './drawio-files';
import { docFromMarkdown, DOC_FILE_MAX } from './doc-tools';
import { validateWidget } from './widget-specs';
import { stampAuthors, cleanAuthor, AUTHOR_KEY } from './authors';

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
export type Gesture =
  | {
      mode: 'move' | 'resize' | 'pan' | 'draw' | 'create' | 'marquee' | 'endpoint' | 'bend' | 'lasso';
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
    }
  | {
      mode: 'erase' | 'label';
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
    };

function useBoardCore() {
  const [gallery, setGallery] = useState<'Formats' | 'Essentials' | null>(null),
    [bulk, setBulk] = useState(false),
    [formatId, setFormatId] = useState<string | null>(null),
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
  const [outline, setOutline] = useState(false),
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
  const [minimap, setMinimap] = useState(() => innerWidth > 600),
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
  const display = (message: string) => {
    setNotice(message);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), 5000);
  };
  const normalize = (input: Board): Board => {
    const next = applyGridLayouts(applyLayouts(syncRecordCards(input, boardRef.current)));
    return normalizeText(applyMindBounds(next, boardRef.current));
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
    let next: Board;
    try {
      next = normalize(stampAuthors(boardRef.current, input, authorRef.current));
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
  const patch = (changes: Partial<Item>) =>
    update({
      ...boardRef.current,
      items: boardRef.current.items.map(i =>
        selected.includes(i.id) && !i.locked && !gridOwner(boardRef.current, i.id)?.locked ? { ...i, ...changes } : i,
      ),
    });
  const patchStyle = (style: Item['style']) =>
    update({
      ...boardRef.current,
      items: boardRef.current.items.map(i =>
        selected.includes(i.id) && !i.locked && isShapeKind(i.type) ? { ...i, style: { ...i.style, ...style } } : i,
      ),
    });
  const selectionLocked = selected.some(
    id => shown.items.find(i => i.id === id)?.locked || gridOwner(shown, id)?.locked,
  );
  const deleteSelection = () => {
    if (!selected.length) return;
    if (selected.some(id => gridOwner(boardRef.current, id)?.locked))
      return display('Unlock the containing Grid to edit its objects.');
    const ids = editableIds(boardRef.current, selected);
    if (ids.length < selected.length) display('Locked objects were kept. Unlock them to delete.');
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
    const media = Object.entries(payload.assets ?? {}).filter(([id]) => !assetsRef.current[id]);
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
  const showBoard = (next: Board, lib: Library) => {
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
    requestAnimationFrame(() =>
      next.startView ? setCamera(centeredCamera(next.startView, next.startView.z, size)) : fit(next.items),
    );
  };
  const boardActions = {
    open: (id: string) => {
      if (id === libraryRef.current.activeId) return setDashboard(false);
      try {
        const opened = switchTo(localStorage, flushSave(), id, parseBoard);
        showBoard(opened.board, opened.library);
      } catch (err) {
        display((err as Error).message || 'That board could not be opened.');
      }
    },
    create: (template: TemplateName | null) => {
      try {
        const fresh: Board = { ...newBoard(), title: template ?? 'Untitled board' };
        if (template) fresh.items = templateItems(template, { x: 0, y: 0 }, (t, x, y, f) => createItem(t, x, y, f));
        const created = createBoard(localStorage, flushSave(), fresh);
        showBoard(fresh, created.library);
      } catch (err) {
        display((err as Error).message || 'Browser storage is full. Delete or export boards to make room.');
      }
    },
    rename: (id: string, title: string) => {
      try {
        if (id === libraryRef.current.activeId) update({ ...boardRef.current, title: title.slice(0, 200) });
        else setLibrary(renameBoard(localStorage, libraryRef.current, id, title, parseBoard));
      } catch (err) {
        display((err as Error).message);
      }
    },
    duplicate: (id: string) => {
      try {
        const lib = id === libraryRef.current.activeId ? flushSave() : libraryRef.current;
        setLibrary(duplicateBoard(localStorage, lib, id, parseBoard).library);
      } catch (err) {
        display((err as Error).message || 'Browser storage is full. Delete or export boards to make room.');
      }
    },
    /** File under a space or star a board (item 107). */
    setMeta: (id: string, patch: { space?: string | null; starred?: boolean }) => {
      try {
        setLibrary(setBoardMeta(localStorage, libraryRef.current, id, patch));
      } catch (err) {
        display((err as Error).message || 'Browser storage is full.');
      }
    },
    remove: (id: string) => {
      try {
        const result = deleteBoard(localStorage, libraryRef.current, id, parseBoard, newBoard);
        if (result.board) showBoard(result.board, result.library);
        else setLibrary(result.library);
        display('Board deleted.');
      } catch (err) {
        display((err as Error).message);
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
  async function insertImages(files: File[], at?: Point) {
    const images = files.filter(f => f.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(f.name));
    if (!images.length) {
      if (files.length) display('Only image files can be added to the board.');
      return;
    }
    const center = at ?? toWorld(size.w / 2, size.h / 2),
      added: Item[] = [],
      errors: string[] = [];
    for (const [index, f] of images.slice(0, 20).entries()) {
      try {
        const asset = await readImageFile(f),
          id = crypto.randomUUID();
        await saveAsset(id, asset);
        setAssets(a => ({ ...a, [id]: asset }));
        added.push(createImageItem(id, asset, { x: center.x + index * 32, y: center.y + index * 32 }));
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
  /** Add a recorded or captured file (Talktrack video, Photobooth photo) to the board. */
  async function insertCaptured(file: File) {
    if (file.type.startsWith('image/')) return insertImages([file]);
    mediaKind.current = 'video';
    return insertMedia(file);
  }
  async function insertMedia(file: File) {
    const kind = mediaKind.current,
      view = kind ? viewFor(kind) : undefined;
    if (!kind || !view?.fromFile) return;
    try {
      const loaded = await view.fromFile.load(file),
        id = crypto.randomUUID(),
        center = toWorld(size.w / 2, size.h / 2);
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
      const asset = await readImageFile(file),
        id = crypto.randomUUID();
      await saveAsset(id, asset);
      setAssets(a => ({ ...a, [id]: asset }));
      update(replaceImage(boardRef.current, target.id, id, asset));
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
      right = outline ? 320 : size.w <= 600 ? 20 : 40;
    const usableW = Math.max(100, size.w - left - right),
      z = Math.max(0.1, Math.min(1.4, (usableW - 32) / Math.max(w, 1), (size.h - 220) / Math.max(h, 1)));
    setCamera({ z, x: left + (usableW - w * z) / 2 - x * z, y: 90 + (size.h - 180 - h * z) / 2 - y * z });
  };
  const addCentered = (kind: Kind) => {
    const p = toWorld(size.w / 2, size.h / 2),
      i = createItem(kind, p.x, p.y, fill);
    i.x -= i.w / 2;
    i.y -= i.h / 2;
    update({ ...boardRef.current, items: [...boardRef.current.items, i] });
    setSelected([i.id]);
    setTool('select');
    if (!['arrow', 'pen', 'frame'].includes(kind)) setEditing(i.id);
  };
  const mediaFile = useRef<HTMLInputElement>(null),
    mediaKind = useRef<string | null>(null),
    docImportFile = useRef<HTMLInputElement>(null),
    docImportKind = useRef<'markdown' | 'pptx'>('markdown');
  /** Markdown files become Docs and PowerPoint files become Slides decks (items 79 and 84). */
  async function importDocument(file: File, at?: Point) {
    const center = at ?? toWorld(size.w / 2, size.h / 2);
    try {
      let item: Item,
        note = '';
      if (/.pptx$/i.test(file.name)) {
        const { parsePptx, PPTX_MAX_BYTES } = await import('./pptx');
        if (file.size > PPTX_MAX_BYTES) throw new Error('PowerPoint files up to 50 MB can be imported.');
        const slides = parsePptx(new Uint8Array(await file.arrayBuffer()));
        item = createItem('slides', center.x, center.y);
        item.data = { slides, current: 0 };
        item.text = file.name.replace(/.pptx$/i, '').slice(0, 200) || 'Imported deck';
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
      : createItem(kind, point.x, point.y, fill);
    const stamp =
      kind === 'stamp' && pendingPlacement?.startsWith('stamp:') ? stampChoice(pendingPlacement.slice(6)) : null;
    if (stamp) Object.assign(item, { data: stamp.data, fill: stamp.fill });
    if (kind === 'mermaid') item.text = starters.Flowchart;
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
    if (choice === 'import:markdown' || choice === 'import:pptx') {
      setTool('select');
      docImportKind.current = choice === 'import:pptx' ? 'pptx' : 'markdown';
      if (docImportFile.current) {
        docImportFile.current.accept =
          choice === 'import:pptx'
            ? '.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation'
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
      stackLast.current = null;
      setTool('stack');
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
    if (item?.type === 'mindmap') {
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
        if (text && looksLikeMarkdown(text)) {
          e.preventDefault();
          setMdPaste(text.slice(0, 60000));
        }
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
      if (e.type === 'cut') deleteSelection();
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
        parsed = parseBoard(JSON.parse(new TextDecoder().decode(bytes)));
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
  const widgetCtx = (item: Item): WidgetCtx => ({
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
  });
  const firstShape = selected.map(id => shown.items.find(i => i.id === id)).find(i => i && isShapeKind(i.type));
  const allShapes =
    selected.length > 0 &&
    selected.every(id => {
      const t = shown.items.find(i => i.id === id)?.type;
      return !!t && isShapeKind(t);
    });
  const mixedBorders =
    allShapes && new Set(selected.map(id => JSON.stringify(shown.items.find(i => i.id === id)?.style ?? {}))).size > 1;
  // Action Shortcut buttons (item 99) ask the board to navigate, present or open the timer.
  const runShortcutAction = useLatest((d: ShortcutData) => {
    if (d.action === 'timer') setTimerOn(true);
    else if (d.action === 'present') {
      if (presentationFrames(boardRef.current).length) startPresenting(0);
      else display('Add a frame to present.');
    } else if (d.action === 'frame') {
      const frame = boardRef.current.items.find(i => i.id === d.target && i.type === 'frame');
      if (frame) {
        setSelected([frame.id]);
        fit([frame]);
      } else display('The frame for this shortcut no longer exists.');
    }
  });
  useEffect(() => {
    const handle = (e: Event) => runShortcutAction.current((e as CustomEvent<ShortcutData>).detail);
    window.addEventListener(SHORTCUT_EVENT, handle);
    return () => window.removeEventListener(SHORTCUT_EVENT, handle);
  }, [runShortcutAction]);
  const startPresenting = (start: number) => {
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
    formatId,
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
    authorName,
    setAuthorName,
    insertAt,
    insertImages,
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
    noticeTimer,
    openEditor,
    outline,
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
    insertDrawio,
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
  return { ...core, ...gestures };
}
export type BoardApp = ReturnType<typeof useBoardApp>;
export const AppContext = React.createContext<BoardApp | null>(null);
export function useApp(): BoardApp {
  const app = React.useContext(AppContext);
  if (!app) throw new Error('useApp must be used inside AppContext');
  return app;
}
