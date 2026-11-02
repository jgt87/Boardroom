// Board application state and behaviour. UI components read it through useApp().
import React, { useEffect, useRef, useState } from 'react';
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
  Undo2,
  Redo2,
  Minus,
  Plus,
  Maximize,
  Download,
  Upload,
  Copy,
  Trash2,
  Layers,
  X,
  Check,
  ChevronDown,
  MoveUp,
  MoveDown,
  Keyboard,
  LayoutTemplate,
  CloudOff,
  PanelRightClose,
  Ellipsis,
  Magnet,
  Link2,
  Lock,
  LockOpen,
  Crop as CropIcon,
  ImageUp,
  SmilePlus,
  Repeat2,
  Search as SearchIcon,
  Map as MapIcon,
  MonitorPlay,
  LayoutGrid,
  Users,
  Link as LinkIcon,
  ExternalLink as OpenIcon,
  MessageSquare,
  EyeOff,
} from 'lucide-react';
import {
  colors,
  clone,
  createItem,
  newBoard,
  commit,
  undo,
  redo,
  removeItems,
  parseBoard,
  endpoints,
  bulkNotes,
  richKinds,
  addConnectedNote,
} from './model';
import type { Board, History, Item, Kind, Point, ImageAsset, Crop, FrameFormat } from './model';
import { TextControls, formatStyle, CanvasTextEditor, textLayout, TextBody } from './text-format';
import { ToolGallery, FormatEditor, BulkPanel, RichPreview, starters } from './formats';
import {
  translate,
  selectWithin,
  snapMove,
  resizeBounds,
  resizeItems,
  selectionBounds,
  handles,
  handlePoint,
} from './interactions';
import type { Handle, Guide } from './interactions';
import { AnchoredPanel } from './anchored-panel';
import { NoteSizeControl, NoteDetails, NoteBadges } from './sticky-tools';
import {
  connectorGeometry,
  ConnectorControls,
  ConnectorMarkers,
  ConnectorDetails,
  ConnectorCaption,
} from './connectors';
import { moveConnectorEndpoint, setConnectorConnections, dragBend, bendHandles } from './connector-geometry';
import { isShapeKind, shapeLabels } from './shapes';
import type { ShapeKind } from './shapes';
import { ShapeBody, ShapeMenuItems, BorderControls, shapeTextBox } from './shape-tools';
import {
  alignSelection,
  distributeSelection,
  canAlign,
  canDistribute,
  groupSelection,
  ungroupSelection,
  expandGroups,
  isGrouped,
  canGroup,
  setLocked,
  editableIds,
  moveIds,
  duplicateItems,
} from './arrange';
import { ArrangePanel } from './arrange-tools';
import {
  IMAGE_ACCEPT,
  createImageItem,
  applyCrop,
  replaceImage,
  withAssets,
  splitAssets,
  referencedAssets,
} from './images';
import { loadAssets, saveAsset, pruneAssets, readImageFile } from './assets-store';
import { ImageBody, CropEditor } from './image-tools';
import { setNoteEmoji, convertNote } from './notes';
import { EmojiBadge, EmojiPicker, ConvertPanel } from './note-extras';
import { SearchPanel } from './search-panel';
import { Minimap } from './minimap';
import { FrameControls, PresentationPanel, PresentOverlay } from './presentation';
import { moveInPresentation, presentationFrames } from './navigation';
import { wireframeItem } from './specs-media';
import { OPEN_EDITOR_EVENT } from './widgets-media';
import { PREVIEW_EVENT, PreviewContext, usePreviewState, PrototypePreview } from './prototype-preview';
import { MarkdownPastePanel } from './markdown-paste';
import { looksLikeMarkdown, markdownToItems } from './markdown';
import { MindmapCanvasEditor } from './mindmap-canvas';
import { applyLayouts, adoptIntoContainers, containerOf, moveChild, removeChild, insertionPreview } from './autolayout';
import { applyFrameFormat } from './frame-presets';
import { CodePreview, CodeEditorDialog } from './code-block';
import {
  stackNext,
  simplify,
  strokePath,
  strokeFromPoints,
  eraseAt,
  eraseAlong,
  penPresets,
  urlsIn,
  startVoting,
  castVote,
  endVoting,
  privateIds,
  setPrivate,
  addThread,
  replyThread,
  setResolved,
  deleteThread,
  threadPoint,
  detachComments,
  setLinkTo,
  setFrameContentHidden,
  frameContentHidden,
  coveredIds,
  reorderLayer,
  setHidden,
  renameItem,
  lineJumps,
  jumpPath,
  pointAlong,
  nearestAlong,
  recordsCsv,
  checkAccessibility,
  templateItems,
} from './board-tools';
import type { PenStyle, TemplateName } from './board-tools';
import {
  PenOptions,
  VotingPanel,
  VoteBadge,
  BoardTimer,
  CommentThreadView,
  NewComment,
  CommentsPanel,
  LinkPicker,
  LayersPanel,
  A11yPanel,
  TemplatesPanel,
} from './board-panels';
import { viewFor } from './widgets';
import { specFor } from './widget-specs';
import type { WidgetCtx } from './widget-types';

export const KEY = 'boardroom.document.v1';
export function load(): { board: Board; error: string } {
  try {
    const raw = localStorage.getItem(KEY);
    return { board: raw ? parseBoard(JSON.parse(raw)) : newBoard(), error: '' };
  } catch {
    return {
      board: newBoard(),
      error:
        'Saved board could not be loaded. Import a JSON backup to recover it. The saved copy has not been overwritten.',
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
      mode: 'move' | 'resize' | 'pan' | 'draw' | 'create' | 'marquee' | 'endpoint' | 'bend';
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

export function useBoardApp() {
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
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, z: 1 });
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
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
    [penColor, setPenColor] = useState('#25252a');
  const stackLast = useRef<string | null>(null);
  const eraseLast = useRef<Point | null>(null);
  const [facilitate, setFacilitate] = useState(false),
    [facil, setFacil] = useState<'voting' | 'comments' | 'templates' | 'a11y' | null>(null),
    [timerOn, setTimerOn] = useState(false);
  const [thread, setThread] = useState<{ id: string } | { x: number; y: number; itemId?: string } | null>(null);
  const [widgetEditId, setWidgetEditId] = useState<string | null>(null);
  const [previewStart, setPreviewStart] = useState<{ screenId: string; camera: Camera; selected: string[] } | null>(
      null,
    ),
    [mdPaste, setMdPaste] = useState<string | null>(null),
    [mindEditId, setMindEditId] = useState<string | null>(null);
  useEffect(() => {
    setDetailsId(null);
    setConnectorDetailsId(null);
    setPanel(null);
  }, [selected.join(',')]);
  const [assets, setAssets] = useState<Record<string, ImageAsset>>({}),
    assetsRef = useRef(assets);
  assetsRef.current = assets;
  const [cropId, setCropId] = useState<string | null>(null),
    [codeId, setCodeId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false),
    [matches, setMatches] = useState<{ ids: Set<string>; current: string | null }>({ ids: new Set(), current: null });
  const [minimap, setMinimap] = useState(() => innerWidth > 600),
    [presentPanel, setPresentPanel] = useState(false);
  const [presenting, setPresenting] = useState<{ start: number; camera: Camera; selected: string[] } | null>(null);
  const imageFile = useRef<HTMLInputElement>(null),
    replaceFile = useRef<HTMLInputElement>(null),
    insertAt = useRef<Point | null>(null);
  const [dropLine, setDropLine] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]),
    [snapping, setSnapping] = useState(true);
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
    const next = applyLayouts(input);
    return normalizeText(next);
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
  const update = (input: Board) => {
    if (input.items.length > 2000) return display('This prototype supports up to 2,000 objects per board.');
    const next = normalize(input);
    boardRef.current = next;
    pauseSave.current = false;
    setHistory(h => commit(h, next));
  };
  const selectedItem = shown.items.find(i => i.id === selected[0]);
  const patch = (changes: Partial<Item>) =>
    update({
      ...boardRef.current,
      items: boardRef.current.items.map(i => (selected.includes(i.id) && !i.locked ? { ...i, ...changes } : i)),
    });
  const patchStyle = (style: Item['style']) =>
    update({
      ...boardRef.current,
      items: boardRef.current.items.map(i =>
        selected.includes(i.id) && !i.locked && isShapeKind(i.type) ? { ...i, style: { ...i.style, ...style } } : i,
      ),
    });
  const selectionLocked = selected.some(id => shown.items.find(i => i.id === id)?.locked);
  const deleteSelection = () => {
    if (!selected.length) return;
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
    setCamera(c => {
      const z = Math.max(0.1, Math.min(4, c.z * factor));
      return { z, x: at.x - ((at.x - c.x) * z) / c.z, y: at.y - ((at.y - c.y) * z) / c.z };
    });
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
    mediaKind = useRef<string | null>(null);
  const chooseFormat = (choice: string) => {
    setGallery(null);
    setShapes(false);
    setTool('select');
    setEditing(null);
    if (choice === 'bulk') {
      setBulk(true);
      return;
    }
    if (choice === 'stack') {
      stackLast.current = null;
      setTool('stack');
      return;
    }
    const center = toWorld(size.w / 2, size.h / 2);
    if (choice.startsWith('wf:')) {
      const item = wireframeItem(choice.slice(3) as never, center, (t: Kind, x: number, y: number) =>
        createItem(t, x, y),
      );
      update({ ...boardRef.current, items: [...boardRef.current.items, item] });
      setSelected([item.id]);
      return;
    }
    const view = viewFor(choice);
    if (view?.fromFile) {
      mediaKind.current = choice;
      if (mediaFile.current) {
        mediaFile.current.accept = view.fromFile.accept;
        mediaFile.current.click();
      }
      return;
    }
    if (specFor(choice)) {
      const item = createItem(choice as Kind, center.x, center.y);
      item.x -= item.w / 2;
      item.y -= item.h / 2;
      update({ ...boardRef.current, items: [...boardRef.current.items, item] });
      setSelected([item.id]);
      if (view?.Editor && ['bookmark', 'embed', 'grid', 'orgchart', 'storymap', 'doc'].includes(choice))
        setWidgetEditId(item.id);
      return;
    }
    const kind = choice as Kind;
    const p = toWorld(size.w / 2, size.h / 2),
      item = createItem(kind, p.x, p.y, '#ffffff');
    item.x -= item.w / 2;
    item.y -= item.h / 2;
    const next = clone(boardRef.current);
    if (kind === 'mermaid') item.text = starters.Flowchart;
    if (kind === 'mindmap') {
      const root = crypto.randomUUID();
      item.nodes = [
        { id: root, parent: null, text: 'Central topic' },
        { id: crypto.randomUUID(), parent: root, text: 'First idea' },
        { id: crypto.randomUUID(), parent: root, text: 'Second idea' },
      ];
    }
    if (['table', 'kanban', 'timeline'].includes(kind)) {
      item.datasetId = crypto.randomUUID();
      next.datasets = {
        ...next.datasets,
        [item.datasetId]: [
          { id: crypto.randomUUID(), title: 'First task', status: 'Not started', assignee: '', start: '', end: '' },
        ],
      };
    }
    if (kind === 'image') {
      insertAt.current = null;
      imageFile.current?.click();
      return;
    }
    if (kind === 'code') {
      item.text = 'function greet(name) {\n  return `Hello, ${name}!`;\n}';
      item.language = 'javascript';
      next.items.push(item);
      update(next);
      setSelected([item.id]);
      setCodeId(item.id);
      return;
    }
    next.items.push(item);
    update(next);
    setSelected([item.id]);
    setFormatId(item.id);
    fit([item]);
  };
  const openEditor = (id: string) => {
    const item = boardRef.current.items.find(i => i.id === id);
    if (item?.locked) {
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
    if (item && richKinds.includes(item.type)) {
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
        if (!initial.error) pruneAssets(referencedAssets(boardRef.current)).catch(() => {});
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
    addEventListener('paste', paste);
    return () => removeEventListener('paste', paste);
  });
  useEffect(() => {
    const canvas = svg.current!;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (gesture.current) return;
      if (e.ctrlKey || e.metaKey) {
        const rect = canvas.getBoundingClientRect(),
          at = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        setCamera(c => {
          const z = Math.max(0.1, Math.min(4, c.z * Math.exp(-e.deltaY * 0.008)));
          return { z, x: at.x - ((at.x - c.x) * z) / c.z, y: at.y - ((at.y - c.y) * z) / c.z };
        });
      } else setCamera(c => ({ ...c, x: c.x - e.deltaX, y: c.y - e.deltaY }));
    };
    canvas.addEventListener('wheel', wheel, { passive: false });
    return () => canvas.removeEventListener('wheel', wheel);
  }, []);
  useEffect(() => {
    if (pauseSave.current) return;
    setSaved(false);
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(board));
        setSaveError('');
        setSaved(true);
      } catch {
        setSaveError('Browser storage is full or unavailable. Export JSON to save your work.');
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [board]);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (
        !formatId &&
        !widgetEditId &&
        !mindEditId &&
        !presenting &&
        !previewStart &&
        e.key === 'F2' &&
        selected.length === 1 &&
        selectedItem?.type === 'mindmap' &&
        !selectedItem.locked
      ) {
        e.preventDefault();
        setMindEditId(selectedItem.id);
        return;
      }
      if (
        formatId ||
        cropId ||
        codeId ||
        widgetEditId ||
        mindEditId ||
        presenting ||
        previewStart ||
        (e.target as HTMLElement).closest?.(
          'input,textarea,select,[contenteditable=true],.minimap,.kanban-preview,video,iframe,.widget-interactive',
        )
      )
        return;
      const key = e.key.toLowerCase(),
        mod = e.ctrlKey || e.metaKey;
      if (gesture.current) {
        if (key === 'escape') {
          e.preventDefault();
          cancelGesture();
        }
        return;
      }
      if (key === ' ') {
        e.preventDefault();
        space.current = true;
      }
      if (mod && key === 'z') {
        e.preventDefault();
        setEditing(null);
        setHistory(h => (e.shiftKey ? redo(h) : undo(h)));
      } else if (mod && key === 'y') {
        e.preventDefault();
        setHistory(redo);
      } else if (mod && key === 'a') {
        e.preventDefault();
        setSelected(boardRef.current.items.map(i => i.id));
      } else if (mod && key === 'd') {
        e.preventDefault();
        duplicate();
      } else if (mod && key === 'f') {
        e.preventDefault();
        setSearchOpen(true);
      } else if (mod && key === 'g') {
        e.preventDefault();
        if (e.shiftKey) ungroupNow();
        else groupNow();
      } else if (mod && e.shiftKey && key === 'l') {
        e.preventDefault();
        toggleLock();
      } else if (key === 'delete' || key === 'backspace') {
        e.preventDefault();
        deleteSelection();
      } else if (key === 'escape') {
        setSelected([]);
        setEditing(null);
        setTool('select');
        setHelp(false);
        setMenu(false);
        setGallery(null);
        setShapes(false);
        setBulk(false);
      } else if (key === 'enter' && selected.length === 1 && selectedItem && selectedItem.type !== 'pen') {
        e.preventDefault();
        openEditor(selectedItem.id);
      } else if (key.startsWith('arrow') && selected.length) {
        e.preventDefault();
        const d = e.shiftKey ? 10 : 1,
          ids = moveIds(boardRef.current, selected);
        if (!ids.length) {
          display('Locked objects cannot be moved.');
          return;
        }
        update(
          translate(boardRef.current, ids, {
            x: key === 'arrowright' ? d : key === 'arrowleft' ? -d : 0,
            y: key === 'arrowdown' ? d : key === 'arrowup' ? -d : 0,
          }),
        );
      } else if (!mod && !e.altKey && key === 'c') {
        setTool('comment');
        setEditing(null);
      } else if (!mod && !e.altKey) {
        const t = tools.find(t => t.key.toLowerCase() === key);
        if (t) {
          setTool(t.id);
          setEditing(null);
          setEraser(false);
        }
        if (key === '?') setHelp(h => !h);
      }
      if (mod && key === '0') {
        e.preventDefault();
        setCamera(c => ({ ...c, z: 1 }));
      }
      if (e.altKey && key === '1') {
        e.preventDefault();
        fit();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === ' ') space.current = false;
    };
    const blur = () => {
      space.current = false;
      cancelGesture();
    };
    addEventListener('keydown', down);
    addEventListener('keyup', up);
    addEventListener('blur', blur);
    return () => {
      removeEventListener('keydown', down);
      removeEventListener('keyup', up);
      removeEventListener('blur', blur);
    };
  });
  const hit = (e: React.PointerEvent) => (e.target as Element).closest<SVGGElement>('[data-item]')?.dataset.item;
  function cancelGesture() {
    const g = gesture.current;
    gesture.current = null;
    if (g?.mode === 'pan') setCamera(g.camera);
    setDraft(null);
    setDropLine(null);
    setMarquee(null);
    setGuides([]);
  }
  function transformed(g: Gesture, p: Point, shift: boolean, alt: boolean) {
    const delta = { x: p.x - g.start.x, y: p.y - g.start.y };
    if (g.mode === 'move') {
      const result = snapMove(g.board, g.ids, delta, 6 / g.camera.z, !snapping || alt, shift);
      return { board: translate(g.board, g.ids, result.delta), guides: result.guides };
    }
    const bounds = selectionBounds(g.board.items, g.ids),
      images = g.ids.length > 0 && g.ids.every(id => g.board.items.find(i => i.id === id)?.type === 'image');
    return {
      board: bounds
        ? resizeItems(g.board, g.ids, bounds, resizeBounds(bounds, g.handle ?? 'se', delta, shift !== images))
        : g.board,
      guides: [],
    };
  }
  function pointerDown(e: React.PointerEvent<SVGSVGElement>) {
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
      pin = (e.target as Element).closest('[data-comment]');
    if (linkEl && e.button === 0) {
      const target = current.items.find(i => i.id === linkEl.getAttribute('data-link'));
      if (target) {
        setSelected([target.id]);
        fit([target]);
      }
      return;
    }
    if (pin && e.button === 0) {
      setThread({ id: pin.getAttribute('data-comment')! });
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
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
    } else if ((e.target as Element).getAttribute('data-resize'))
      gesture.current = {
        ...base,
        mode: 'resize',
        ids: editableIds(current, selected),
        handle: (e.target as Element).getAttribute('data-resize') as Handle,
      };
    else if (tool === 'select') {
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
        gesture.current = { ...base, ids: moveIds(current, ids), mode: 'move' };
      } else {
        if (!e.shiftKey) setSelected([]);
        gesture.current = { ...base, ids: e.shiftKey ? selected : [], mode: 'marquee' };
      }
    } else {
      const next = createItem(tool as Kind, start.x, start.y, fill);
      if (tool === 'arrow') {
        next.w = 0;
        next.h = 0;
        if (item && !['arrow', 'pen', 'frame'].includes(item.type)) next.from = item.id;
      }
      if (tool === 'pen') {
        next.points = [{ x: 0, y: 0 }];
        next.fill = penColor;
        next.data = { style: penStyle, width: penWidth };
      }
      gesture.current = { ...base, mode: tool === 'pen' ? 'draw' : 'create', item: next };
      setSelected([next.id]);
      setDraft({ ...board, items: [...board.items, next] });
    }
  }
  function pointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const g = gesture.current;
    if (!g) return;
    const p = toWorld(e.clientX, e.clientY),
      dx = p.x - g.start.x,
      dy = p.y - g.start.y;
    if (Math.hypot(e.clientX - g.screen.x, e.clientY - g.screen.y) > 3) g.moved = true;
    if (g.mode === 'pan')
      setCamera({ ...g.camera, x: g.camera.x + e.clientX - g.screen.x, y: g.camera.y + e.clientY - g.screen.y });
    else if (g.mode === 'endpoint' && g.moved)
      setDraft(moveConnectorEndpoint(g.board, g.ids[0], g.endpoint!, p, 12 / g.camera.z, !e.altKey));
    else if (g.mode === 'bend' && g.moved) setDraft(dragBend(g.board, g.ids[0], g.bend!, p));
    else if (g.mode === 'erase') {
      const from = eraseLast.current ?? g.start;
      eraseLast.current = p;
      setDraft(d => eraseAlong(d ?? g.board, from, p, 10 / g.camera.z, precise));
    } else if (g.mode === 'label' && g.moved) {
      const geo = geometryOf(
        g.board.items.find(i => i.id === g.ids[0])!,
        g.board.items,
      );
      setDraft({
        ...g.board,
        items: g.board.items.map(i =>
          i.id === g.ids[0] ? { ...i, connector: { ...i.connector, labelAt: nearestAlong(geo.nodes, p) } } : i,
        ),
      });
    } else if (g.mode === 'move' || g.mode === 'resize') {
      if (g.moved) {
        const next = transformed(g, p, e.shiftKey, e.altKey);
        setDraft(next.board);
        setGuides(next.guides);
        setDropLine(g.mode === 'move' ? (insertionPreview(next.board, g.ids)?.line ?? null) : null);
      }
    } else if (g.mode === 'marquee')
      setMarquee({ x: Math.min(p.x, g.start.x), y: Math.min(p.y, g.start.y), w: Math.abs(dx), h: Math.abs(dy) });
    else if (g.item) {
      if (g.mode === 'draw') {
        if ((g.item.points?.length ?? 0) < 20000) g.item.points!.push({ x: dx, y: dy });
      } else if (g.item.type === 'arrow') {
        g.item.w = dx;
        g.item.h = dy;
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
    const g = gesture.current;
    if (!g) return;
    gesture.current = null;
    const final = toWorld(e.clientX, e.clientY),
      moved = g.moved || Math.hypot(e.clientX - g.screen.x, e.clientY - g.screen.y) > 3;
    if (g.mode === 'marquee' && moved)
      setSelected([
        ...new Set([
          ...g.ids,
          ...expandGroups(
            g.board,
            selectWithin(g.board.items, {
              x: Math.min(final.x, g.start.x),
              y: Math.min(final.y, g.start.y),
              w: Math.abs(final.x - g.start.x),
              h: Math.abs(final.y - g.start.y),
            }).filter(id => !g.board.items.find(i => i.id === id)?.locked),
          ),
        ]),
      ]);
    else if (g.item) {
      if (g.item.type === 'arrow') {
        const p = toWorld(e.clientX, e.clientY);
        const target = [...g.board.items]
          .reverse()
          .find(
            i =>
              !['arrow', 'pen', 'frame'].includes(i.type) &&
              p.x >= i.x &&
              p.x <= i.x + i.w &&
              p.y >= i.y &&
              p.y <= i.y + i.h,
          );
        if (target && target.id !== g.item.from) g.item.to = target.id;
        if (!g.moved) g.item.w = 180;
      }
      if (g.item.type === 'pen') {
        const absolute = simplify(
          g.item.points!.map(p => ({ x: g.item!.x + p.x, y: g.item!.y + p.y })),
          0.6 / g.camera.z,
        );
        Object.assign(
          g.item,
          strokeFromPoints(
            g.item,
            absolute.length > 1 ? absolute : [...absolute, { x: absolute[0].x + 0.5, y: absolute[0].y + 0.5 }],
          ),
        );
      }
      update({ ...g.board, items: [...g.board.items, g.item] });
      if (g.item.type !== 'pen') {
        setTool('select');
        if (!['frame', 'arrow'].includes(g.item.type)) setEditing(g.item.id);
      }
    } else if (g.mode === 'endpoint') {
      if (moved) update(moveConnectorEndpoint(g.board, g.ids[0], g.endpoint!, final, 12 / g.camera.z, !e.altKey));
    } else if (g.mode === 'bend') {
      if (moved) update(dragBend(g.board, g.ids[0], g.bend!, final));
    } else if (g.mode === 'erase') {
      if (draft) update(draft);
    } else if (g.mode === 'label') {
      if (moved && draft) update(draft);
    } else if (g.mode === 'move' || g.mode === 'resize') {
      if (moved) {
        const next = transformed(g, final, e.shiftKey, e.altKey).board;
        update(g.mode === 'move' ? adoptIntoContainers(next, g.ids) : next);
      }
    } else if (draft && g.moved && g.mode !== 'pan') update(draft);
    setDraft(null);
    setDropLine(null);
    setMarquee(null);
    setGuides([]);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }
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
    cancelGesture,
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
    hit,
    imageFile,
    importFile,
    insertAt,
    insertImages,
    insertMedia,
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
    pointerDown,
    pointerMove,
    pointerUp,
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
    transformed,
    ungroupNow,
    update,
    widgetCtx,
    widgetEditId,
    zoom,
  };
}
export type BoardApp = ReturnType<typeof useBoardApp>;
export const AppContext = React.createContext<BoardApp | null>(null);
export function useApp(): BoardApp {
  const app = React.useContext(AppContext);
  if (!app) throw new Error('useApp must be used inside AppContext');
  return app;
}
