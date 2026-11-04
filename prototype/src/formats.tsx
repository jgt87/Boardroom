import React, { useEffect, useId, useRef, useState } from 'react';
import { mindViewport, type MindViewport } from './mindmap-bounds';
import {
  X,
  Plus,
  Trash2,
  Network,
  Table2,
  Columns3,
  CalendarRange,
  StickyNote,
  Search,
  Layers3,
  SquareStack,
  FlipHorizontal2,
  Grid3x3,
  Minus,
  Stamp,
  Smile,
  QrCode,
  Video,
  FileText,
  Bookmark,
  AppWindow,
  BookOpen,
  Workflow,
  Map as MapIcon,
  Smartphone,
  LayoutPanelTop,
  Grid2x2,
  Vote,
  Disc3,
  SlidersHorizontal,
  Route,
  Cloud,
  ListOrdered,
  CircleHelp,
  Pencil,
  Type,
  Frame as FrameIcon,
  MessageSquare,
  LayoutTemplate,
  Presentation,
  Square,
  Accessibility,
  Upload,
  Code,
  ImagePlus,
  MessageSquareText,
  PartyPopper,
  FileDown,
  BarChart3,
  FileSpreadsheet,
  Pin,
  PinOff,
} from 'lucide-react';
export const kindIcons: Record<string, typeof Layers3> = {
  drawio: Workflow,
  mindmap: Network,
  code: Code,
  image: ImagePlus,
  stack: Layers3,
  pen: Pencil,
  text: Type,
  frame: FrameIcon,
  comment: MessageSquare,
  note: StickyNote,
  templates: LayoutTemplate,
  slides: Presentation,
  rectangle: Square,
  layers: Layers3,
  a11y: Accessibility,
  'submenu:engage': Vote,
  'submenu:upload': Upload,
  card: SquareStack,
  flipcard: FlipHorizontal2,
  grid: Grid3x3,
  divider: Minus,
  stamp: Stamp,
  icon: Smile,
  qr: QrCode,
  video: Video,
  pdf: FileText,
  bookmark: Bookmark,
  embed: AppWindow,
  doc: BookOpen,
  orgchart: Workflow,
  storymap: MapIcon,
  screen: Smartphone,
  autolayout: LayoutPanelTop,
  matrix: Grid2x2,
  poll: Vote,
  spinner: Disc3,
  scale: SlidersHorizontal,
  journey: Route,
  planner: CalendarRange,
  wordcloud: Cloud,
  ranking: ListOrdered,
  quiz: CircleHelp,
  openended: MessageSquareText,
  reactions: PartyPopper,
  'import:markdown': FileDown,
  'import:pptx': Presentation,
  'import:table': FileSpreadsheet,
  'import:grid': Grid3x3,
  'import:docx': FileText,
  chart: BarChart3,
};
import { catalog, toolCategories } from './tool-catalog';
import type { CatalogEntry } from './tool-catalog';
import { wireframeComponents } from './specs-media';
import { allKinds, clone, removeBranch } from './model';
import type { Board, Item, Kind, MindNode, RecordRow } from './model';
import { KanbanView, TimelineView } from './record-views';
import { schemaOf } from './record-schema';
import { addDependency, removeDependency, deleteRecord, setMilestone, recordsError } from './records';
import {
  mindLayout,
  mindBranchPath,
  mindStyleOf,
  mindLabelLines,
  MIND_NODE_W,
  MIND_COL,
  MIND_ROW,
  manualMindNodes,
  MIND_NODE_H,
  mindTopicColor,
  mindShapeRx,
  mindHiddenCount,
  toggleMindCollapse,
  revealMindNode,
  setMindColor,
  mindPalette,
  mindColorNames,
} from './mindmap-style';
import type { MindStyle } from './mindmap-style';
import { convertToLinked } from './mermaid-link';

export const starters: Record<string, string> = {
  Flowchart: 'flowchart LR\n  A[Start with an idea] --> B[Explore possibilities]\n  B --> C[Make it happen]',
  Sequence: 'sequenceDiagram\n  Alice->>Bob: Share an idea\n  Bob-->>Alice: Build together',
  Class: 'classDiagram\n  class Board {\n    +title: string\n    +addItem()\n  }\n  Board --> Item',
  'Entity relationship': 'erDiagram\n  BOARD ||--o{ ITEM : contains\n  BOARD {\n    string title\n  }',
};
export function MermaidPreview({ code }: { code: string }) {
  const [svg, setSvg] = useState(''),
    [error, setError] = useState(''),
    id = useId().replace(/[^a-z0-9]/gi, ''),
    sequence = useRef(0);
  useEffect(() => {
    let active = true;
    const run = ++sequence.current;
    const timer = setTimeout(async () => {
      try {
        const { default: mermaid } = await import('mermaid');
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'default',
          suppressErrorRendering: true,
          flowchart: { htmlLabels: false },
        });
        const result = await mermaid.render(`diagram${id}x${run}`, code);
        if (active) {
          setSvg(result.svg);
          setError('');
        }
      } catch {
        if (active) {
          setError('Check the Mermaid syntax. The diagram could not be rendered.');
          setSvg('');
        }
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [code, id]);
  return error ? (
    <p className="format-error" role="alert">
      {error}
    </p>
  ) : svg ? (
    <div className="mermaid-preview" dangerouslySetInnerHTML={{ __html: svg }} />
  ) : (
    <p className="format-hint">Rendering diagram…</p>
  );
}
export { mindLayout as layout } from './mindmap-style';
export function MindPreview({
  nodes,
  style = { branchStyle: 'curved', colorful: false },
  viewport,
}: {
  nodes: MindNode[];
  style?: MindStyle;
  viewport?: MindViewport;
}) {
  const positions = mindLayout(nodes, style.autoLayout ?? true, style.layout),
    minX = Math.min(0, ...[...positions.values()].map(p => p.x)),
    minY = Math.min(0, ...[...positions.values()].map(p => p.y)),
    maxX = Math.max(0, ...[...positions.values()].map(p => p.x)),
    maxY = Math.max(0, ...[...positions.values()].map(p => p.y));
  return (
    <svg
      className="mind-preview"
      viewBox={
        viewport
          ? `${viewport.x} ${viewport.y} ${viewport.w} ${viewport.h}`
          : `${minX - 8} ${minY - 8} ${maxX - minX + MIND_NODE_W + 16} ${maxY - minY + MIND_NODE_H + 22}`
      }
      aria-label="Mind map diagram"
    >
      {nodes.map(n => {
        const p = positions.get(n.id),
          parent = n.parent ? positions.get(n.parent) : null,
          color = mindTopicColor(nodes, n.id, style.colorful),
          tinted = style.colorful || !!n.color,
          more = n.collapsed ? mindHiddenCount(nodes, n.id) : 0;
        return (
          p && (
            <g key={n.id} data-mind-topic={n.id}>
              {parent && (
                <path
                  d={mindBranchPath(style.branchStyle, parent, p, style.layout)}
                  fill="none"
                  stroke={color}
                  strokeWidth="2"
                />
              )}
              <rect
                x={p.x}
                y={p.y}
                width={MIND_NODE_W}
                height={MIND_NODE_H}
                rx={mindShapeRx(n.shape)}
                fill={
                  n.shape === 'underline'
                    ? 'transparent'
                    : n.parent
                      ? tinted
                        ? color + '22'
                        : '#edf0ff'
                      : (n.color ?? '#4262ff')
                }
                stroke={n.shape !== 'underline' && n.parent && tinted ? color : 'none'}
              />
              {n.shape === 'underline' && (
                <line
                  x1={p.x}
                  x2={p.x + MIND_NODE_W}
                  y1={p.y + MIND_NODE_H}
                  y2={p.y + MIND_NODE_H}
                  stroke={color}
                  strokeWidth="2.5"
                />
              )}
              {n.link && (
                <g className="mind-link-badge" aria-label="Topic has a link">
                  <circle cx={p.x + MIND_NODE_W - 10} cy={p.y + 10} r="7" fill="#4262ff" />
                  <path
                    d={`M${p.x + MIND_NODE_W - 13} ${p.y + 13} l6 -6 m-4 0 h4 v4`}
                    stroke="#ffffff"
                    strokeWidth="1.4"
                    fill="none"
                  />
                </g>
              )}
              {more > 0 && (
                <g className="mind-collapsed-badge">
                  <rect
                    x={p.x + MIND_NODE_W - 30}
                    y={p.y + MIND_NODE_H - 10}
                    width="34"
                    height="18"
                    rx="9"
                    fill={color}
                  />
                  <text
                    x={p.x + MIND_NODE_W - 13}
                    y={p.y + MIND_NODE_H + 3}
                    fontSize="11"
                    fill="#ffffff"
                    textAnchor="middle"
                  >
                    +{more}
                  </text>
                </g>
              )}
              <text
                x={p.x + 12}
                y={p.y + 29 - (mindLabelLines(n.text).length - 1) * 8}
                fill={n.parent || n.shape === 'underline' ? '#25252c' : '#ffffff'}
                fontSize={mindLabelLines(n.text).length > 2 ? 11 : 14}
              >
                {mindLabelLines(n.text).map((line, k) => (
                  <tspan key={k} x={p.x + 12} dy={k ? 16 : 0}>
                    {line}
                  </tspan>
                ))}
              </text>
            </g>
          )
        );
      })}
    </svg>
  );
}
export function RecordsPreview({ rows, view }: { rows: RecordRow[]; view: string }) {
  if (view === 'kanban') return <KanbanView rows={rows} limit={4} />;
  if (view === 'timeline') return <TimelineView rows={rows.slice(0, 8)} />;
  const points = rows.reduce((s, r) => s + (r.points ?? 0), 0),
    estimated = rows.some(r => r.points !== undefined);
  return (
    <table className="records-preview">
      <thead>
        <tr>
          <th>Title</th>
          <th>Status</th>
          <th>Assignee</th>
          <th>Start date</th>
          {estimated && <th>Points</th>}
        </tr>
      </thead>
      <tbody>
        {rows.slice(0, 8).map(r => (
          <tr key={r.id}>
            <td>{r.title || 'Untitled record'}</td>
            <td>{r.status}</td>
            <td>{r.assignee || '—'}</td>
            <td>{r.start || '—'}</td>
            {estimated && <td>{r.points ?? '—'}</td>}
          </tr>
        ))}
      </tbody>
      {estimated && (
        <tfoot>
          <tr>
            <td colSpan={4}>Total points{rows.length > 8 ? ` (all ${rows.length} records)` : ''}</td>
            <td>{points}</td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}
export function RichPreview({ item, board }: { item: Item; board: Board }) {
  return (
    <div
      className={`rich-object ${item.type === 'mindmap' && item.data?.autoLayout === false ? 'mind-manual-object' : ''}`}
    >
      <div className="rich-title">
        {item.type === 'mermaid'
          ? 'Diagram'
          : item.type === 'mindmap'
            ? 'Mind map'
            : item.type[0].toUpperCase() + item.type.slice(1)}
        <small>Double-click to edit</small>
      </div>
      <div className="rich-body">
        {item.type === 'mermaid' ? (
          <MermaidPreview code={item.text} />
        ) : item.type === 'mindmap' ? (
          <MindPreview
            nodes={item.nodes ?? []}
            style={mindStyleOf(item)}
            viewport={item.data?.autoLayout === false ? mindViewport(item) : undefined}
          />
        ) : (
          <RecordsPreview rows={board.datasets?.[item.datasetId!] ?? []} view={item.type} />
        )}
      </div>
    </div>
  );
}
/** Drag data type for a tool dragged from the toolbar or the tool gallery onto the board (gap F12). */
export const TOOL_MIME = 'application/x-boardroom-tool';
export function ToolGallery({
  initial,
  onClose,
  onChoose,
  onPrimitive,
  pinned = [],
  onTogglePin,
}: {
  initial: 'Formats' | 'Essentials';
  onClose: () => void;
  onChoose: (kind: string) => void;
  onPrimitive: (kind: Kind) => void;
  /** Kinds pinned to the creation toolbar (gap F12). */
  pinned?: string[];
  onTogglePin?: (kind: string) => void;
}) {
  const [category, setCategory] = useState<string>(initial),
    [query, setQuery] = useState(''),
    [sub, setSub] = useState<string | null>(null);
  const isFormats = initial === 'Formats';
  const submenus: Record<string, CatalogEntry[]> = {
    diagram: [
      { label: 'Shapes and lines', kind: 'rectangle', description: 'Build a diagram on the canvas' },
      { label: 'Build with Mermaid code', kind: 'mermaid', description: 'Create a diagram from code' },
      { label: 'Draw.io Diagrams', kind: 'drawio', description: 'Create or import an editable technical diagram' },
      { label: 'Mind map', kind: 'mindmap', description: 'Organize connected ideas' },
    ],
    engage: catalog['Engage activities'],
    images: [
      { label: 'Upload image', kind: 'image', description: 'Choose an image from your device' },
      { label: 'Icons', kind: 'icon', description: 'Search icons' },
      { label: 'Emoji and stamps', kind: 'stamp', description: 'Choose an emoji or stamp' },
    ],
    upload: [
      { label: 'Image', kind: 'image', description: '' },
      { label: 'Video', kind: 'video', description: '' },
      { label: 'PDF', kind: 'pdf', description: '' },
      { label: 'Markdown as Doc', kind: 'import:markdown', description: 'A .md file becomes an editable Doc' },
      { label: 'PowerPoint as Slides', kind: 'import:pptx', description: 'Slide titles and text from a .pptx file' },
      { label: 'Word as Doc', kind: 'import:docx', description: 'Headings, lists and text from a .docx file' },
      {
        label: 'Spreadsheet as Table',
        kind: 'import:table',
        description: 'A .csv or .xlsx file becomes Table records',
      },
      { label: 'Spreadsheet as Grid', kind: 'import:grid', description: 'A .csv or .xlsx file fills a Grid' },
    ],
    wireframes: wireframeComponents.map(c => ({
      label: c.label,
      kind: 'wf:' + c.id,
      description: 'Wireframe component',
    })),
  };
  const available = sub
    ? (submenus[sub] ?? [])
    : query.trim()
      ? Object.values(catalog)
          .flat()
          .filter((e, k, a) => a.findIndex(x => x.kind === e.kind) === k)
      : (catalog[category] ?? []);
  const entries = available.filter(e => (e.label + ' ' + e.description).toLowerCase().includes(query.toLowerCase()));
  const pick = (entry: CatalogEntry) => {
    if (entry.kind.startsWith('submenu:')) {
      setSub(entry.kind.slice(8));
      setQuery('');
      return;
    }
    if (['note', 'text', 'pen', 'frame', 'rectangle'].includes(entry.kind)) onPrimitive(entry.kind as Kind);
    else onChoose(entry.kind);
  };
  return (
    <aside
      className={'tool-gallery floating ' + (isFormats ? 'formats-menu' : '')}
      aria-label={isFormats ? 'Formats and Flows' : 'Tools, media and integrations'}
    >
      <div className="panel-heading">
        <h2>
          {sub ? (
            <button
              onClick={() => {
                setSub(null);
                setQuery('');
              }}
            >
              Back
            </button>
          ) : isFormats ? (
            'Formats and Flows'
          ) : (
            'Tools, Media and Integrations'
          )}
        </h2>
        <button className="icon-button" aria-label="Close tools" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      {!isFormats && (
        <label className="gallery-search">
          <Search size={17} />
          <input
            aria-label="Search tools"
            placeholder="Search tools"
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setSub(null);
            }}
          />
        </label>
      )}
      <div className="gallery-layout">
        {!isFormats && (
          <nav aria-label="Tool categories">
            {toolCategories.map(c => (
              <button
                key={c}
                className={category === c && !sub ? 'active' : ''}
                aria-pressed={category === c && !sub}
                onClick={() => {
                  setCategory(c);
                  setSub(null);
                  setQuery('');
                }}
              >
                <span>{c}</span>
              </button>
            ))}
          </nav>
        )}
        <div className="gallery-items">
          {!isFormats && !sub && <h3>{category}</h3>}
          {entries.map(entry => {
            const Icon =
              kindIcons[entry.kind] ??
              (entry.kind === 'mermaid' || entry.kind === 'submenu:diagram'
                ? Network
                : entry.kind === 'table'
                  ? Table2
                  : entry.kind === 'timeline'
                    ? CalendarRange
                    : entry.kind === 'kanban'
                      ? Columns3
                      : entry.kind === 'note'
                        ? StickyNote
                        : Layers3);
            const placeable = !entry.unavailable && (allKinds as string[]).includes(entry.kind),
              isPinned = pinned.includes(entry.kind);
            const button = (
              <button
                key={entry.kind}
                className="gallery-pick"
                disabled={entry.unavailable}
                onClick={() => pick(entry)}
                draggable={placeable}
                onDragStart={e => {
                  // Drag a tool onto the board to place it there (gap F12).
                  e.dataTransfer.setData(TOOL_MIME, entry.kind);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
              >
                <Icon size={22} />
                <span>
                  <strong>{entry.label}</strong>
                  {!isFormats && (
                    <small>{entry.description || (entry.unavailable ? 'Not available' : 'Click to choose')}</small>
                  )}
                  {isFormats && entry.unavailable && <small>Not available</small>}
                </span>
                {entry.kind.startsWith('submenu:') && <span aria-hidden="true">›</span>}
              </button>
            );
            if (!placeable || !onTogglePin) return button;
            return (
              <div className="gallery-entry" key={entry.kind}>
                {button}
                <button
                  className={`gallery-pin ${isPinned ? 'active' : ''}`}
                  aria-label={`${isPinned ? 'Unpin' : 'Pin'} ${entry.label} ${isPinned ? 'from' : 'to'} the toolbar`}
                  title={isPinned ? 'Unpin from the toolbar' : 'Pin to the toolbar'}
                  aria-pressed={isPinned}
                  onClick={() => onTogglePin(entry.kind)}
                >
                  {isPinned ? <PinOff size={14} /> : <Pin size={14} />}
                </button>
              </div>
            );
          })}
          {!entries.length && <p>No matching tools.</p>}
        </div>
      </div>
    </aside>
  );
}
export function FormatEditor({
  item,
  board,
  onApply,
  onClose,
  onReplace,
}: {
  item: Item;
  board: Board;
  onApply: (item: Item, rows?: RecordRow[]) => void;
  onClose: () => void;
  /** Replace the Mermaid object with a linked frame of native shapes and connectors (one undo step in the caller). */
  onReplace?: (items: Item[], notes: string[]) => void;
}) {
  const [convertError, setConvertError] = useState('');
  const statuses = schemaOf(board, item.datasetId ?? '').statuses;
  const [draft, setDraft] = useState(() => clone(item)),
    [rows, setRows] = useState(() => clone(board.datasets?.[item.datasetId!] ?? [])),
    [rowError, setRowError] = useState(''),
    [active, setActive] = useState(item.nodes?.[0]?.id ?? ''),
    [search, setSearch] = useState(''),
    [status, setStatus] = useState('All'),
    [sort, setSort] = useState(false);
  const dialog = useRef<HTMLDivElement>(null),
    close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const prior = document.activeElement as HTMLElement;
    close.current?.focus();
    return () => prior?.focus();
  }, []);
  const nodes = draft.nodes ?? [],
    chosen = nodes.find(n => n.id === active),
    records = ['table', 'kanban', 'timeline'].includes(draft.type);
  const addNode = (sibling = false) => {
    if (nodes.length >= 200 || !chosen) return;
    const p = mindLayout(nodes, mindStyleOf(draft).autoLayout ?? true, mindStyleOf(draft).layout).get(chosen.id) ??
      chosen.position ?? { x: 0, y: 0 };
    const n = {
      id: crypto.randomUUID(),
      parent: sibling && chosen.parent ? chosen.parent : chosen.id,
      text: 'New topic',
      ...(mindStyleOf(draft).autoLayout === false
        ? { position: { x: Math.min(100000, p.x + (sibling ? 0 : MIND_COL)), y: Math.min(100000, p.y + MIND_ROW) } }
        : {}),
    };
    setDraft({ ...draft, nodes: revealMindNode([...nodes, n], n.id) });
    setActive(n.id);
  };
  const visible = rows
    .filter(
      r =>
        (r.title + ' ' + r.assignee).toLowerCase().includes(search.toLowerCase()) &&
        (status === 'All' || r.status === status),
    )
    .sort((a, b) => (sort ? a.title.localeCompare(b.title) : 0));
  const changeRow = (id: string, key: keyof RecordRow, value: string) =>
    setRows(rows.map(r => (r.id === id ? { ...r, [key]: value } : r)));
  const validation = recordsError(rows),
    invalidDates = !!validation,
    title = (id: string) => rows.find(r => r.id === id)?.title || 'Untitled record';
  const tryRows = (change: () => RecordRow[]) => {
    try {
      setRows(change());
      setRowError('');
    } catch (err) {
      setRowError((err as Error).message);
    }
  };
  return (
    <div
      className="format-overlay"
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Escape') onClose();
        if (e.key === 'Tab') {
          const focusable = dialog.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input,textarea,select,[tabindex="0"]',
          );
          if (focusable?.length) {
            const first = focusable[0],
              last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }
      }}
    >
      <div ref={dialog} className="format-editor" role="dialog" aria-modal="true" aria-label={`Edit ${item.type}`}>
        <header>
          <div>
            <h2>
              {item.type === 'mermaid' ? 'Diagram · Build with code' : item.type === 'mindmap' ? 'Mind map' : 'Records'}
            </h2>
            <p>
              {records
                ? 'Table, Kanban and Timeline share these records.'
                : 'Changes are applied to the canvas when you choose Done.'}
            </p>
          </div>
          <button ref={close} className="icon-button" aria-label="Cancel editing" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        {draft.type === 'mermaid' && (
          <div className="diagram-workspace">
            <section>
              <label>
                Start with a diagram
                <select
                  aria-label="Diagram starter"
                  defaultValue=""
                  onChange={e => {
                    setDraft({ ...draft, text: starters[e.target.value] });
                  }}
                >
                  <option value="" disabled>
                    Choose a starter
                  </option>
                  {Object.keys(starters).map(s => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                Mermaid code
                <textarea
                  aria-label="Mermaid code"
                  spellCheck={false}
                  maxLength={6000}
                  value={draft.text}
                  onChange={e => {
                    setDraft({ ...draft, text: e.target.value });
                    setConvertError('');
                  }}
                />
              </label>
              {onReplace && (
                <div className="format-actions">
                  <button
                    onClick={() => {
                      try {
                        const r = convertToLinked(draft.text, { x: item.x, y: item.y });
                        onReplace(r.items, r.notes);
                      } catch (err) {
                        setConvertError((err as Error).message);
                      }
                    }}
                  >
                    Convert to shapes
                  </button>
                  <span className="format-hint">
                    Flowchart, sequence, class, state and ER diagrams become editable shapes and connectors in a frame
                    that stays linked to this code; subgraphs become frames.
                  </span>
                </div>
              )}
              {convertError && (
                <p className="format-error" role="alert">
                  {convertError}
                </p>
              )}
            </section>
            <div className="diagram-live">
              <MermaidPreview code={draft.text} />
            </div>
          </div>
        )}
        {draft.type === 'mindmap' && (
          <div className="mind-workspace">
            <section>
              <p className="format-hint">
                Select a topic. Tab adds a child; Enter adds a sibling. On the canvas, press F2 on a selected mind map
                to edit topics in place.
              </p>
              <div className="mind-style-row">
                <label className="check-inline">
                  <input
                    type="checkbox"
                    aria-label="Automatic topic layout"
                    checked={mindStyleOf(draft).autoLayout !== false}
                    onChange={e => {
                      setDraft({
                        ...draft,
                        data: { ...draft.data, autoLayout: e.target.checked },
                        ...(!e.target.checked ? { nodes: manualMindNodes(nodes, mindStyleOf(draft).layout) } : {}),
                      });
                    }}
                  />
                  Auto layout
                </label>
                <label>
                  Branches
                  <select
                    aria-label="Branch style"
                    value={mindStyleOf(draft).branchStyle}
                    onChange={e => setDraft({ ...draft, data: { ...draft.data, branchStyle: e.target.value } })}
                  >
                    <option value="curved">Curved</option>
                    <option value="straight">Straight</option>
                    <option value="elbow">Elbow</option>
                  </select>
                </label>
                <label className="check-inline">
                  <input
                    type="checkbox"
                    aria-label="Colourful branches"
                    checked={mindStyleOf(draft).colorful}
                    onChange={e => setDraft({ ...draft, data: { ...draft.data, colorful: e.target.checked } })}
                  />
                  Colourful branches
                </label>
              </div>
              <div className="topic-list">
                {nodes.map(n => (
                  <button
                    key={n.id}
                    aria-pressed={active === n.id}
                    className={active === n.id ? 'active' : ''}
                    onClick={() => setActive(n.id)}
                  >
                    {n.parent ? '↳ ' : ''}
                    {n.text || 'Untitled topic'}
                  </button>
                ))}
              </div>
              {chosen && (
                <>
                  <label>
                    Topic text
                    <input
                      aria-label="Topic text"
                      maxLength={6000}
                      value={chosen.text}
                      onChange={e =>
                        setDraft({
                          ...draft,
                          nodes: nodes.map(n => (n.id === active ? { ...n, text: e.target.value } : n)),
                        })
                      }
                      onKeyDown={e => {
                        if (e.key === 'Tab' && !e.shiftKey) {
                          e.preventDefault();
                          addNode();
                        }
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addNode(true);
                        }
                      }}
                    />
                  </label>
                  <div className="format-actions">
                    <button disabled={nodes.length >= 200} onClick={() => addNode()}>
                      Add child
                    </button>
                    <button disabled={!chosen.parent || nodes.length >= 200} onClick={() => addNode(true)}>
                      Add sibling
                    </button>
                    <button
                      disabled={!chosen.parent}
                      onClick={() => {
                        setDraft({ ...draft, nodes: removeBranch(nodes, active) });
                        setActive(nodes[0].id);
                      }}
                    >
                      Delete branch
                    </button>
                    <button
                      disabled={!nodes.some(n => n.parent === active)}
                      aria-pressed={!!chosen.collapsed}
                      onClick={() => setDraft({ ...draft, nodes: toggleMindCollapse(nodes, active) })}
                    >
                      {chosen.collapsed ? 'Expand branch' : 'Collapse branch'}
                    </button>
                  </div>
                  <label>
                    Topic colour
                    <select
                      aria-label="Topic colour"
                      value={chosen.color ?? ''}
                      onChange={e => setDraft({ ...draft, nodes: setMindColor(nodes, active, e.target.value) })}
                    >
                      <option value="">Automatic</option>
                      {mindPalette.map((c, index) => (
                        <option key={c} value={c}>
                          {mindColorNames[index]}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </section>
            <div className="diagram-live">
              <MindPreview nodes={nodes} style={mindStyleOf(draft)} />
            </div>
          </div>
        )}
        {records && (
          <div className="records-workspace">
            <div className="records-controls">
              <div className="view-tabs" aria-label="Record view">
                {(['table', 'kanban', 'timeline'] as const).map(v => (
                  <button
                    key={v}
                    aria-pressed={draft.type === v}
                    className={draft.type === v ? 'active' : ''}
                    onClick={() => setDraft({ ...draft, type: v })}
                  >
                    {v[0].toUpperCase() + v.slice(1)}
                  </button>
                ))}
              </div>
              <input
                aria-label="Search records"
                placeholder="Search records"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <select aria-label="Filter status" value={status} onChange={e => setStatus(e.target.value)}>
                <option>All</option>
                {statuses.map(s => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <button aria-pressed={sort} onClick={() => setSort(!sort)}>
                Sort {sort ? 'A–Z' : 'off'}
              </button>
              <button
                disabled={rows.length >= 1000}
                onClick={() =>
                  setRows([
                    ...rows,
                    {
                      id: crypto.randomUUID(),
                      title: 'New task',
                      status: statuses[0],
                      assignee: '',
                      start: '',
                      end: '',
                    },
                  ])
                }
              >
                <Plus size={16} />
                Add record
              </button>
            </div>
            {draft.type === 'kanban' && (
              <KanbanView
                columns={statuses}
                rows={visible}
                allRows={rows}
                onRows={next => {
                  setRows(next);
                  setRowError('');
                }}
              />
            )}
            {draft.type === 'kanban' && (
              <p className="format-hint">
                Drag cards between or within columns, or focus a card and press Alt + arrow keys.
              </p>
            )}
            {draft.type === 'timeline' && <TimelineView rows={visible} />}
            <div className="record-grid">
              <table>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Status</th>
                    <th>Assignee</th>
                    <th>Start date</th>
                    <th>End date</th>
                    <th>Points</th>
                    <th>Milestone</th>
                    <th>Depends on</th>
                    <th>Delete</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(r => (
                    <tr key={r.id}>
                      <td>
                        <input
                          aria-label="Record title"
                          maxLength={6000}
                          value={r.title}
                          onChange={e => changeRow(r.id, 'title', e.target.value)}
                        />
                      </td>
                      <td>
                        <select
                          aria-label="Record status"
                          value={r.status}
                          onChange={e => changeRow(r.id, 'status', e.target.value)}
                        >
                          {statuses.map(s => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          aria-label="Record assignee"
                          maxLength={6000}
                          value={r.assignee}
                          onChange={e => changeRow(r.id, 'assignee', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          aria-label="Record start date"
                          type="date"
                          value={r.start}
                          onChange={e => changeRow(r.id, 'start', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          aria-label="Record end date"
                          type="date"
                          value={r.end}
                          disabled={!!r.milestone}
                          title={r.milestone ? 'Milestones use a single date' : undefined}
                          onChange={e => changeRow(r.id, 'end', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="points-input"
                          aria-label={`Points: ${r.title || 'record'}`}
                          type="number"
                          min={0}
                          max={1000}
                          step={1}
                          value={r.points ?? ''}
                          onChange={e => {
                            const v = e.target.value;
                            setRows(
                              rows.map(x => {
                                if (x.id !== r.id) return x;
                                const next = { ...x };
                                if (v === '' || !Number.isFinite(Number(v))) delete next.points;
                                else next.points = Math.max(0, Math.min(1000, Number(v)));
                                return next;
                              }),
                            );
                          }}
                        />
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Milestone: ${r.title || 'record'}`}
                          checked={!!r.milestone}
                          onChange={e => tryRows(() => setMilestone(rows, r.id, e.target.checked))}
                        />
                      </td>
                      <td>
                        <div className="dep-cell">
                          {(r.dependsOn ?? []).map(d => (
                            <span className="dep-chip" key={d}>
                              {title(d)}
                              <button
                                className="icon-button"
                                aria-label={`Remove dependency on ${title(d)}`}
                                onClick={() => tryRows(() => removeDependency(rows, r.id, d))}
                              >
                                <X size={12} />
                              </button>
                            </span>
                          ))}
                          <select
                            aria-label={`Add dependency for ${r.title || 'record'}`}
                            value=""
                            onChange={e => {
                              const d = e.target.value;
                              if (d) tryRows(() => addDependency(rows, r.id, d));
                            }}
                          >
                            <option value="">Add…</option>
                            {rows
                              .filter(o => o.id !== r.id && !r.dependsOn?.includes(o.id))
                              .map(o => (
                                <option key={o.id} value={o.id}>
                                  {o.title || 'Untitled record'}
                                </option>
                              ))}
                          </select>
                        </div>
                      </td>
                      <td>
                        <button
                          className="icon-button"
                          aria-label={`Delete ${r.title || 'record'}`}
                          onClick={() => setRows(deleteRecord(rows, r.id))}
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!visible.length && <p className="format-hint">No records match. Add a record or change the filters.</p>}
            </div>
            {(rowError || validation) && (
              <p className="format-error" role="alert">
                {rowError || validation}
              </p>
            )}
          </div>
        )}
        <footer>
          <span>{records ? `${rows.length} records · edits update linked views` : 'Saved locally after applying'}</span>
          <button onClick={onClose}>Cancel</button>
          <button
            className="primary"
            disabled={invalidDates}
            onClick={() => onApply(draft, records ? rows : undefined)}
          >
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
export function BulkPanel({ onDone, onClose }: { onDone: (text: string) => void; onClose: () => void }) {
  const [text, setText] = useState('');
  const count = text.split('\n').filter(s => s.trim()).length;
  return (
    <aside className="bulk-panel floating" aria-label="Bulk mode">
      <div className="panel-heading">
        <h2>Bulk mode</h2>
        <button className="icon-button" aria-label="Close bulk mode" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <p>One line becomes one sticky note. Add up to 100 notes at once.</p>
      <textarea
        autoFocus
        aria-label="Bulk notes"
        placeholder="Type to bulk add notes"
        value={text}
        maxLength={60000}
        onChange={e => setText(e.target.value)}
      />
      <div className="bulk-bottom">
        <span>{count} notes</span>
        <button className="primary" disabled={!count || count > 100} onClick={() => onDone(text)}>
          Done
        </button>
      </div>
    </aside>
  );
}
