// Import a board exported through another whiteboard service's public REST API (the "v2" board items and
// connectors endpoints) as a new Boardroom board. Pure: no React, no DOM. The export file is written by
// scripts/export-whiteboard.mjs: { format: 'whiteboard-rest-v2', board, items, connectors, tags?, itemTags? }.
// Mapping follows the public API reference: item positions are the centre of the item, either on the canvas or
// relative to the top-left corner of the parent frame; rich text arrives as HTML, which is read as data into
// plain text plus style spans (never placed in the page as markup). Anything that cannot be mapped is skipped
// and counted per source type in the report.
import { createItem, normalizeNoteLink, parseBoard } from './model.ts';
import type {
  Board,
  ConnectorFormat,
  ConnectorHead,
  ConnectorLabel,
  ImageAsset,
  Item,
  Kind,
  TextFormat,
} from './model.ts';
import { fromRuns, isSafeHref, normalizeHref, textHash } from './rich-text.ts';
import type { Run, SpanStyle, TextSpan } from './rich-text.ts';
import { embedSource, normalizeHttpsUrl } from './specs-media.ts';
import { canRotate, normalizeRotation } from './rotation.ts';
import { isIsoDate } from './facilitation-widgets.ts';
import { MAX_TAG_LENGTH, tagPalette } from './card-tools.ts';
import { BOARD_DESCRIPTION_MAX } from './board-settings.ts';
import { LABEL_SIZE_MAX, LABEL_SIZE_MIN } from './diagram-extras.ts';
import { MAX_IMAGE_BYTES } from './model-ext.ts';
import type { ShapeKind } from './shapes.ts';

export const WHITEBOARD_FORMAT = 'whiteboard-rest-v2';
export const WHITEBOARD_OBJECT_LIMIT = 2000;
/** Largest export file read (JSON text). */
export const WHITEBOARD_MAX_BYTES = 120_000_000;

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
/** Numbers may arrive as strings ("2.0"); anything else is undefined. */
const numOf = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** `#rgb` or `#rrggbb` as lower-case `#rrggbb`, else undefined. */
export function hexColor(v: unknown): string | undefined {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(str(v).trim());
  if (!m) return undefined;
  return `#${(m[1].length === 3 ? [...m[1]].map(c => c + c).join('') : m[1]).toLowerCase()}`;
}
/** A percentage string ("50%") or number as a fraction in [0, 1]. */
const fraction = (v: unknown): number | undefined => {
  const n = numOf(str(v).replace('%', ''));
  return n === undefined ? undefined : clamp(n / 100, 0, 1);
};

/** True when `json` looks like an export written by the export script (or a hand-made one in that shape). */
export function isWhiteboardRestExport(json: unknown): boolean {
  if (!isObj(json) || !Array.isArray(json.items)) return false;
  if (json.format === WHITEBOARD_FORMAT) return true;
  // No marker: accept when items carry the REST API's position shape.
  return (
    json.items.length > 0 &&
    json.items.slice(0, 20).every(i => isObj(i) && typeof i.type === 'string' && typeof i.id !== 'undefined') &&
    json.items.some(
      i => isObj(i) && isObj(i.position) && (i.position.origin === 'center' || 'relativeTo' in i.position),
    )
  );
}

// ---- Rich text ------------------------------------------------------------------------------
const entities: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", nbsp: ' ' };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return entities[e.toLowerCase()] ?? m;
  });
}
const blockTags = new Set([
  'p',
  'div',
  'li',
  'ul',
  'ol',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'tr',
  'pre',
]);
/** Elements whose content is never text: dropped with everything inside them. */
const dropped = /<(script|style|template|head|title|iframe|object|svg|math|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const attrOf = (attrs: string, name: string): string | undefined => {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attrs);
  return m ? decodeEntities(m[1] ?? m[2] ?? m[3] ?? '') : undefined;
};
const cssColor = (v: string | undefined): string | undefined => {
  if (!v) return undefined;
  const hex = hexColor(v.trim());
  if (hex) return hex;
  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(v.trim());
  if (!rgb || (rgb[4] !== undefined && Number(rgb[4]) === 0)) return undefined;
  return '#' + [rgb[1], rgb[2], rgb[3]].map(c => clamp(Number(c), 0, 255).toString(16).padStart(2, '0')).join('');
};
const styleProp = (style: string | undefined, prop: string): string | undefined => {
  if (!style) return undefined;
  const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i').exec(style);
  return m?.[1];
};

/**
 * Plain text and style spans from the API's HTML content: paragraphs and line breaks become new lines, list
 * items get a bullet, bold, italic, underline, strike-through, colours and safe links become spans. Scripts,
 * styles and unknown tags are dropped (their text stays for unknown tags); nothing is kept as markup.
 */
export function htmlToRich(html: string, max = 6000): { text: string; spans: TextSpan[] } {
  const src = str(html).slice(0, 400_000);
  if (!/[<&]/.test(src)) {
    const text = src.replace(/\r\n?/g, '\n').trim().slice(0, max);
    return { text, spans: [] };
  }
  const clean = src.replace(/<!--[\s\S]*?-->/g, '').replace(dropped, '');
  type Frame = { tag: string; style: SpanStyle; list?: { ordered: boolean; n: number }; start?: number };
  const stack: Frame[] = [];
  const runs: Run[] = [];
  let out = '';
  const push = (text: string, style: SpanStyle) => {
    if (!text) return;
    runs.push({ text, style });
    out += text;
  };
  /** End of the last list bullet: a paragraph right inside a list item stays on the bullet's line. */
  let bulletEnd = -1;
  const newline = () => {
    if (out && !out.endsWith('\n') && out.length !== bulletEnd) push('\n', {});
  };
  const current = (): SpanStyle => Object.assign({}, ...stack.map(f => f.style));
  const token = /<(\/?)([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)|</g;
  for (let m = token.exec(clean); m; m = token.exec(clean)) {
    if (out.length > max + 200) break;
    if (m[4] !== undefined || m[0] === '<') {
      const raw = m[4] ?? '<';
      const inPre = stack.some(f => f.tag === 'pre');
      const text = decodeEntities(inPre ? raw : raw.replace(/[ \t\r\n]+/g, ' '));
      // Leading spaces at the start of a line are layout, not content.
      push(out === '' || out.endsWith('\n') ? text.replace(/^ +/, '') : text, current());
      continue;
    }
    const closing = !!m[1],
      tag = m[2].toLowerCase(),
      attrs = m[3] ?? '';
    if (tag === 'br') {
      push('\n', {});
      continue;
    }
    if (closing) {
      const at = stack.map(f => f.tag).lastIndexOf(tag),
        open = at >= 0 ? stack[at] : undefined;
      if (at >= 0) stack.splice(at);
      // An empty paragraph is an empty line.
      if ((tag === 'p' || tag === 'div') && open?.start === out.length && out) push('\n', {});
      else if (blockTags.has(tag)) newline();
      continue;
    }
    if (/\/\s*$/.test(attrs)) continue;
    const style: SpanStyle = {};
    if (tag === 'b' || tag === 'strong') style.bold = true;
    else if (tag === 'i' || tag === 'em') style.italic = true;
    else if (tag === 'u' || tag === 'ins') style.underline = true;
    else if (tag === 's' || tag === 'strike' || tag === 'del') style.strike = true;
    else if (/^h[1-6]$/.test(tag)) style.bold = true;
    else if (tag === 'a') {
      const href = attrOf(attrs, 'href'),
        safe = href ? normalizeHref(href) : null;
      if (safe && isSafeHref(safe)) style.href = safe;
    }
    const css = attrOf(attrs, 'style');
    const color = cssColor(styleProp(css, 'color') ?? (tag === 'font' ? attrOf(attrs, 'color') : undefined)),
      highlight = cssColor(styleProp(css, 'background-color') ?? styleProp(css, 'background'));
    if (color) style.color = color;
    if (highlight) style.highlight = highlight;
    const weight = styleProp(css, 'font-weight');
    if (weight && (/bold/i.test(weight) || Number(weight) >= 600)) style.bold = true;
    if (/italic/i.test(styleProp(css, 'font-style') ?? '')) style.italic = true;
    const deco = styleProp(css, 'text-decoration') ?? '';
    if (/underline/.test(deco)) style.underline = true;
    if (/line-through/.test(deco)) style.strike = true;
    const frame: Frame = { tag, style };
    if (tag === 'ul' || tag === 'ol') frame.list = { ordered: tag === 'ol', n: 0 };
    if (blockTags.has(tag)) newline();
    frame.start = out.length;
    // Void and self-contained elements do not open a frame.
    if (!['img', 'hr', 'input', 'meta', 'link', 'wbr', 'col', 'area', 'source'].includes(tag)) stack.push(frame);
    if (tag === 'li') {
      const list = [...stack].reverse().find(f => f.list)?.list;
      if (list) list.n++;
      push(list?.ordered ? `${list.n}. ` : '• ', {});
      bulletEnd = out.length;
    }
  }
  // Normalise white space across runs: no space at the start or end, at most one empty line in a row, and the
  // text capped at `max`. A keep-mask over the joined text keeps every run's style on the characters it keeps.
  const joined = runs.map(r => r.text).join(''),
    keep = new Array<boolean>(joined.length).fill(true);
  const first = joined.search(/\S/);
  for (let k = 0; k < joined.length; k++) if (first < 0 || k < first) keep[k] = false;
  for (let k = joined.length - 1; k >= 0 && /\s/.test(joined[k]); k--) keep[k] = false;
  for (let k = 0, newlines = 0; k < joined.length; k++) {
    if (joined[k] === '\n') {
      newlines++;
      if (newlines > 2) keep[k] = false;
    } else if (!/[ \t]/.test(joined[k])) newlines = 0;
  }
  // Spaces just before a line break are layout only.
  for (let k = joined.length - 1, beforeBreak = false; k >= 0; k--) {
    if (joined[k] === '\n') beforeBreak = true;
    else if (joined[k] === ' ' && beforeBreak) keep[k] = false;
    else beforeBreak = false;
  }
  const kept: Run[] = [];
  let at = 0,
    total = 0;
  for (const r of runs) {
    let t = '';
    for (let k = 0; k < r.text.length; k++, at++)
      if (keep[at] && total < max) {
        t += r.text[k] === ' ' ? ' ' : r.text[k];
        total++;
      }
    if (t) kept.push({ text: t, style: r.style });
  }
  return fromRuns(kept);
}
const runsFrom = (text: string, spans: TextSpan[]): Run[] => {
  const out: Run[] = [];
  let at = 0;
  for (const s of spans) {
    if (s.start < at) continue;
    if (s.start > at) out.push({ text: text.slice(at, s.start), style: {} });
    const { start, end, ...style } = s;
    out.push({ text: text.slice(start, end), style });
    at = end;
  }
  if (at < text.length) out.push({ text: text.slice(at), style: {} });
  return out;
};
/** Plain text of HTML content (titles, descriptions, captions). */
export const htmlToPlain = (html: unknown, max: number) => htmlToRich(str(html), max).text;

// ---- Mapping tables ------------------------------------------------------------------------
/** Sticky note colour names (public API enum) to the Boardroom sticky palette. */
export const stickyColors: Record<string, string> = {
  light_yellow: '#fff49b',
  yellow: '#ffe36e',
  orange: '#ffb879',
  light_green: '#d1ec9c',
  green: '#a9e8bb',
  dark_green: '#166534',
  cyan: '#8ce3eb',
  light_pink: '#f7c5ef',
  pink: '#f7c5ef',
  violet: '#d3b7f6',
  red: '#ffa0a7',
  light_blue: '#a8cdff',
  blue: '#3d5afe',
  dark_blue: '#1e3a8a',
  gray: '#e4e4e7',
  black: '#1f1f23',
};
/** Tag colour names to the Boardroom tag palette (pale backgrounds). */
const tagColorMap: Record<string, (typeof tagPalette)[number]> = {
  red: '#ffe3e6',
  magenta: '#ffe3e6',
  light_green: '#e3f6e9',
  green: '#e3f6e9',
  dark_green: '#e3f6e9',
  cyan: '#e1f4fb',
  yellow: '#fff1d6',
  blue: '#edf0ff',
  dark_blue: '#edf0ff',
  violet: '#f1e8ff',
  gray: '#f0f0f4',
  black: '#f0f0f4',
};
/** Shape names (public API enum, plus the flowchart shapes) to Boardroom shape kinds. */
export const shapeMap: Record<string, ShapeKind> = {
  rectangle: 'rectangle',
  round_rectangle: 'roundrect',
  circle: 'ellipse',
  triangle: 'triangle',
  rhombus: 'diamond',
  parallelogram: 'parallelogram',
  trapezoid: 'trapezoid',
  pentagon: 'pentagon',
  hexagon: 'hexagon',
  octagon: 'octagon',
  wedge_round_rectangle_callout: 'callout',
  star: 'star',
  flow_chart_predefined_process: 'predefined',
  cloud: 'cloud',
  cross: 'cross',
  can: 'cylinder',
  right_arrow: 'arrowright',
  left_right_arrow: 'arrowboth',
  flow_chart_process: 'rectangle',
  flow_chart_decision: 'diamond',
  flow_chart_terminator: 'terminator',
  flow_chart_document: 'document',
  flow_chart_multidocuments: 'multidoc',
  flow_chart_manual_input: 'manualinput',
  flow_chart_manual_operation: 'manualop',
  flow_chart_delay: 'delay',
  flow_chart_display: 'display',
  flow_chart_offpage_connector: 'offpage',
  flow_chart_merge: 'merge',
  flow_chart_magnetic_disk: 'cylinder',
  flow_chart_magnetic_drum: 'cylinder',
  flow_chart_stored_data: 'storeddata',
  flow_chart_online_storage: 'storeddata',
  flow_chart_internal_storage: 'internalstorage',
  flow_chart_punched_card: 'punchcard',
  flow_chart_card: 'punchcard',
  flow_chart_summing_junction: 'summing',
  flow_chart_or: 'orgate',
  flow_chart_collate: 'collate',
  flow_chart_sort: 'sort',
  flow_chart_loop_limit: 'looplimit',
  flow_chart_preparation: 'hexagon',
  flow_chart_connector: 'ellipse',
  flow_chart_input_output: 'parallelogram',
  flow_chart_extract: 'triangle',
};
/** Shapes with no exact Boardroom counterpart, drawn as the nearest one (counted as approximated). */
const nearShapes: Record<string, ShapeKind> = {
  left_arrow: 'arrowboth',
  left_brace: 'rectangle',
  right_brace: 'rectangle',
};
/** Connector end caps (public API enum) to Boardroom connector heads. */
export const capMap: Record<string, ConnectorHead> = {
  none: 'none',
  stealth: 'arrow',
  rounded_stealth: 'arrow',
  arrow: 'open',
  triangle: 'arrow',
  filled_triangle: 'arrow',
  diamond: 'diamond',
  filled_diamond: 'diamond',
  oval: 'circle',
  filled_oval: 'circle',
  erd_one: 'one',
  erd_only_one: 'one',
  erd_many: 'many',
  erd_zero_or_one: 'zero-one',
  erd_one_or_many: 'one-many',
  erd_zero_or_many: 'zero-many',
  unknown: 'arrow',
};
const fontMap: Record<string, TextFormat['fontFamily']> = {
  georgia: 'Georgia',
  times_new_roman: 'Times New Roman',
  eb_garamond: 'Times New Roman',
  pt_serif: 'Times New Roman',
  roboto_slab: 'Times New Roman',
  plex_serif: 'Times New Roman',
  tiempos_text: 'Times New Roman',
  roboto_mono: 'monospace',
  plex_mono: 'monospace',
  caveat: 'Handwriting',
  permanent_marker: 'Handwriting',
  lemon_tuesday: 'Handwriting',
  fredoka_one: 'Rounded',
};
/** Readable names for source types in the report. */
const typeLabels: Record<string, [string, string]> = {
  sticky_note: ['sticky note', 'sticky notes'],
  shape: ['shape', 'shapes'],
  text: ['text', 'texts'],
  frame: ['frame', 'frames'],
  card: ['card', 'cards'],
  app_card: ['app card', 'app cards'],
  image: ['image', 'images'],
  embed: ['embed', 'embeds'],
  document: ['document', 'documents'],
  preview: ['link preview', 'link previews'],
  connector: ['connector', 'connectors'],
  mindmap_node: ['mind map node', 'mind map nodes'],
  doc_format: ['doc', 'docs'],
  data_table_format: ['table', 'tables'],
  usm: ['story map', 'story maps'],
  kanban: ['kanban board', 'kanban boards'],
  unsupported: ['unsupported object', 'unsupported objects'],
};
export const typeLabel = (type: string, n: number) => {
  const known = typeLabels[type];
  if (known) return known[n === 1 ? 0 : 1];
  const name =
    type
      .replace(/[^a-z0-9]+/gi, ' ')
      .trim()
      .toLowerCase()
      .slice(0, 40) || 'unknown';
  return n === 1 ? `${name} object` : `${name} objects`;
};

// ---- Report ---------------------------------------------------------------------------------
export type WhiteboardImportReport = {
  /** Objects created, by source type. */
  imported: Record<string, number>;
  /** Source objects left out, by source type (unknown types, malformed entries). */
  skipped: Record<string, number>;
  /** Objects that did not fit the board's object limit. */
  overLimit: number;
  /** Shapes drawn as the nearest Boardroom shape. */
  approximated: number;
  /** Images kept as links because the export carried no image file. */
  imageLinks: number;
  /** Cards whose assignee is only a user id in the export. */
  unnamedAssignees: number;
  /** Connectors whose ends point at objects that were not imported. */
  danglingConnectors: number;
};
const bump = (r: Record<string, number>, k: string, n = 1) => {
  r[k] = (r[k] ?? 0) + n;
};
const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en')} ${n === 1 ? one : many}`;
/** One status message for the import: what was created and what was left out. */
export function whiteboardImportNote(r: WhiteboardImportReport): string {
  const total = Object.values(r.imported).reduce((a, b) => a + b, 0);
  const list = (m: Record<string, number>) =>
    Object.entries(m)
      .sort((a, b) => b[1] - a[1])
      .map(([t, n]) => `${n.toLocaleString('en')} ${typeLabel(t, n)}`)
      .join(', ');
  const parts = [
    `Imported ${plural(total, 'object', 'objects')} as a new board${total ? ` (${list(r.imported)})` : ''}.`,
  ];
  if (Object.keys(r.skipped).length) parts.push(`Skipped ${list(r.skipped)}.`);
  if (r.overLimit)
    parts.push(
      `${plural(r.overLimit, 'object', 'objects')} did not fit the ${WHITEBOARD_OBJECT_LIMIT.toLocaleString('en')}-object limit.`,
    );
  if (r.danglingConnectors)
    parts.push(
      `${plural(r.danglingConnectors, 'connector was', 'connectors were')} left out (an end was not imported).`,
    );
  if (r.approximated) parts.push(`${plural(r.approximated, 'shape is', 'shapes are')} drawn as the nearest shape.`);
  if (r.imageLinks)
    parts.push(`${plural(r.imageLinks, 'image is', 'images are')} kept as a link (the export has no image file).`);
  if (r.unnamedAssignees)
    parts.push(`${plural(r.unnamedAssignees, 'card assignee', 'card assignees')} could not be named (only a user id).`);
  return parts.join(' ');
}

// ---- Import ---------------------------------------------------------------------------------
export type WhiteboardImport = {
  board: Board;
  report: WhiteboardImportReport;
  /** Image files carried by the export (data URLs), keyed by the new items' assetId. */
  assets: Record<string, ImageAsset>;
};
type Source = {
  raw: Json;
  id: string;
  type: string;
  data: Json;
  style: Json;
  parent?: string;
  relative: boolean;
  cx: number;
  cy: number;
  w?: number;
  h?: number;
  rotation: number;
};
const MAX_COORD = 5_000_000,
  MAX_SIZE = 1_000_000;
const imageMime = (url: string): string | undefined => /^data:(image\/(?:png|jpeg|gif|webp));base64,/.exec(url)?.[1];

/** A tag list for an item from the export's `itemTags` (or an undocumented `tagIds` field). */
function tagsFor(src: Source, json: Json, tagTitles: Map<string, string>): string[] | undefined {
  const byItem = isObj(json.itemTags) ? json.itemTags[src.id] : undefined;
  const ids = Array.isArray(byItem) ? byItem : Array.isArray(src.raw.tagIds) ? src.raw.tagIds : src.data.tagIds;
  if (!Array.isArray(ids)) return undefined;
  const titles = ids
    .map(t => (isObj(t) ? str(t.title) : (tagTitles.get(str(t)) ?? '')))
    .map(t => t.replace(/\s+/g, ' ').trim().slice(0, MAX_TAG_LENGTH).trim())
    .filter(Boolean);
  const unique = [...new Set(titles)].slice(0, 10);
  return unique.length ? unique : undefined;
}

/**
 * A new Boardroom board from a REST export. Throws a readable error when the file is not an export; malformed
 * entries inside it are skipped and counted. The result always passes `parseBoard`.
 */
export function importWhiteboardRest(json: unknown, limit = WHITEBOARD_OBJECT_LIMIT): WhiteboardImport {
  if (!isWhiteboardRestExport(json)) throw new Error('This file is not a whiteboard JSON export.');
  const root = json as Json;
  const report: WhiteboardImportReport = {
    imported: {},
    skipped: {},
    overLimit: 0,
    approximated: 0,
    imageLinks: 0,
    unnamedAssignees: 0,
    danglingConnectors: 0,
  };
  const assets: Record<string, ImageAsset> = {};
  const boardInfo = isObj(root.board) ? root.board : {};
  const title = htmlToPlain(boardInfo.name, 200).replace(/\s+/g, ' ').trim() || 'Imported board';
  const tagTitles = new Map<string, string>();
  const tagColors: Record<string, string> = {};
  for (const t of Array.isArray(root.tags) ? root.tags.slice(0, 5000) : []) {
    if (!isObj(t)) continue;
    const name = str(t.title).replace(/\s+/g, ' ').trim().slice(0, MAX_TAG_LENGTH).trim();
    if (!name) continue;
    tagTitles.set(str(t.id), name);
    const c = tagColorMap[str(t.fillColor)];
    if (c) tagColors[name] = c;
  }

  // Read every item defensively.
  const sources: Source[] = [];
  const seen = new Set<string>();
  for (const raw of (root.items as unknown[]).slice(0, 50_000)) {
    if (!isObj(raw) || typeof raw.type !== 'string' || !str(raw.id) || seen.has(str(raw.id))) {
      bump(report.skipped, isObj(raw) && typeof raw.type === 'string' ? raw.type : 'unsupported');
      continue;
    }
    const id = str(raw.id),
      pos = isObj(raw.position) ? raw.position : {},
      geo = isObj(raw.geometry) ? raw.geometry : {},
      parent = isObj(raw.parent) ? str(raw.parent.id) || undefined : undefined;
    seen.add(id);
    const w = numOf(geo.width),
      h = numOf(geo.height);
    sources.push({
      raw,
      id,
      type: raw.type,
      data: isObj(raw.data) ? raw.data : {},
      style: isObj(raw.style) ? raw.style : {},
      parent,
      relative: !!parent && pos.relativeTo !== 'canvas_center',
      cx: numOf(pos.x) ?? 0,
      cy: numOf(pos.y) ?? 0,
      w: w !== undefined && w > 0 ? Math.min(w, MAX_SIZE) : undefined,
      h: h !== undefined && h > 0 ? Math.min(h, MAX_SIZE) : undefined,
      rotation: numOf(geo.rotation) ?? 0,
    });
  }
  const byId = new Map(sources.map(s => [s.id, s]));
  const sizeOf = (s: Source, kind: Kind): [number, number] => {
    const base = createItem(kind, 0, 0);
    if (s.type === 'text') return [s.w ?? base.w, s.h ?? Math.max(30, (numOf(s.style.fontSize) ?? 14) * 1.6)];
    if (s.type === 'sticky_note') {
      const w = s.w ?? s.h ?? base.w;
      return [w, s.h ?? (str(s.data.shape) === 'rectangle' ? w / 2 : w)];
    }
    return [s.w ?? base.w, s.h ?? base.h];
  };
  /** Absolute centre: children of frames are placed relative to the frame's top-left corner. */
  const centreOf = (s: Source, depth = 0): { x: number; y: number } => {
    if (!s.relative || depth > 20) return { x: s.cx, y: s.cy };
    const p = byId.get(s.parent!);
    if (!p) return { x: s.cx, y: s.cy };
    const pc = centreOf(p, depth + 1),
      [pw, ph] = [p.w ?? 0, p.h ?? 0];
    return { x: pc.x - pw / 2 + s.cx, y: pc.y - ph / 2 + s.cy };
  };
  const depthOf = (s: Source): number => {
    let d = 0;
    for (let p = s.parent ? byId.get(s.parent) : undefined; p && d < 20; p = p.parent ? byId.get(p.parent) : undefined)
      d++;
    return d;
  };
  // Paint order: frames first (outer before inner), then the rest in export order.
  const ordered = [
    ...sources
      .filter(s => s.type === 'frame')
      .map((s, k) => ({ s, k, d: depthOf(s) }))
      .sort((a, b) => a.d - b.d || a.k - b.k)
      .map(x => x.s),
    ...sources.filter(s => s.type !== 'frame'),
  ];

  const items: Item[] = [];
  const idMap = new Map<string, Item>();
  /** Accept an item only when it would load on its own (guards against odd values slipping through). */
  const accept = (src: Source, item: Item): boolean => {
    try {
      parseBoard({
        version: 1,
        title: 'check',
        items: [item],
        ...(Object.keys(tagColors).length ? { tagColors } : {}),
      });
    } catch {
      bump(report.skipped, src.type);
      return false;
    }
    items.push(item);
    idMap.set(src.id, item);
    bump(report.imported, src.type);
    return true;
  };
  const place = (src: Source, kind: Kind, fill?: string): Item => {
    const [w, h] = sizeOf(src, kind),
      c = centreOf(src),
      item = createItem(kind, 0, 0, fill);
    item.w = Math.max(1, Math.round(w));
    item.h = Math.max(1, Math.round(h));
    item.x = Math.round(clamp(c.x - item.w / 2, -MAX_COORD, MAX_COORD));
    item.y = Math.round(clamp(c.y - item.h / 2, -MAX_COORD, MAX_COORD));
    const rot = normalizeRotation(src.rotation);
    if (rot && canRotate(item)) item.rotation = rot;
    if (src.raw.locked === true || src.data.locked === true) item.locked = true;
    return item;
  };
  const textFormat = (src: Source, item: Item, withSize: boolean) => {
    const s = src.style,
      format: TextFormat = { ...item.format };
    const align = str(s.textAlign),
      valign = str(s.textAlignVertical),
      font = fontMap[str(s.fontFamily)],
      size = numOf(s.fontSize);
    if (align === 'left' || align === 'center' || align === 'right') format.align = align;
    if (valign === 'top' || valign === 'middle' || valign === 'bottom') format.valign = valign;
    if (font) format.fontFamily = font;
    if (withSize && size !== undefined) format.fontSize = clamp(Math.round(size), 10, 96);
    if (Object.keys(format).length) item.format = format;
  };
  const setRich = (item: Item, html: unknown, baseColor?: string) => {
    const rich = htmlToRich(str(html), 6000);
    item.text = rich.text;
    let spans = rich.spans;
    if (baseColor && rich.text) {
      // Colour the whole text, keeping colours set on individual words.
      const runs = runsFrom(rich.text, spans).map(r => ({ ...r, style: { color: baseColor, ...r.style } }));
      spans = fromRuns(runs).spans;
    }
    if (spans.length) {
      item.spans = spans;
      item.spansFor = textHash(rich.text);
    }
  };
  const link = (src: Source, url: string, title: string, description: string): Item | null => {
    let https: string | undefined;
    try {
      https = normalizeHttpsUrl(url);
    } catch {
      https = undefined;
    }
    if (https) {
      const item = place(src, 'bookmark');
      item.data = { url: https, title: title.slice(0, 300), description: description.slice(0, 1000), layout: 'none' };
      return item;
    }
    // Not an https address: a text object carrying the link when it is a web address at all.
    let web: string | undefined;
    try {
      web = normalizeNoteLink(url);
    } catch {
      web = undefined;
    }
    if (!web) return null;
    const item = place(src, 'text');
    item.text = (title || web).slice(0, 6000);
    item.link = web;
    return item;
  };

  for (const src of ordered) {
    if (items.length >= limit) {
      report.overLimit++;
      continue;
    }
    const d = src.data,
      s = src.style;
    switch (src.type) {
      case 'sticky_note': {
        const item = place(src, 'note', stickyColors[str(s.fillColor)] ?? stickyColors.light_yellow);
        if (str(d.shape) === 'rectangle') item.noteShape = 'rectangle';
        setRich(item, d.content);
        textFormat(src, item, false);
        const tags = tagsFor(src, root, tagTitles);
        if (tags) item.tags = tags;
        accept(src, item);
        break;
      }
      case 'shape': {
        const name = str(d.shape) || 'rectangle';
        let kind: ShapeKind = shapeMap[name];
        if (!kind) {
          kind = nearShapes[name] ?? 'rectangle';
          report.approximated++;
        }
        const fillOpacity = numOf(s.fillOpacity),
          fill = hexColor(s.fillColor) ?? '#ffffff';
        const item = place(src, kind, fillOpacity === 0 ? '#ffffff' : fill);
        const border = hexColor(s.borderColor),
          width = numOf(s.borderWidth),
          opacity = numOf(s.borderOpacity),
          dash = str(s.borderStyle);
        const style: NonNullable<Item['style']> = {};
        if (opacity === 0) style.borderWidth = 0;
        else {
          if (border) style.borderColor = border;
          if (width !== undefined) style.borderWidth = clamp(width, 0, 24);
          if (opacity !== undefined && opacity < 1) style.borderOpacity = clamp(opacity, 0, 1);
        }
        if (dash === 'dashed' || dash === 'dotted') style.borderStyle = dash;
        if (Object.keys(style).length) item.style = style;
        const color = hexColor(s.color);
        setRich(item, d.content, color && color !== '#1a1a1a' ? color : undefined);
        textFormat(src, item, true);
        accept(src, item);
        break;
      }
      case 'text': {
        const item = place(src, 'text');
        item.fill = hexColor(s.color) ?? '#25252a';
        setRich(item, d.content);
        textFormat(src, item, true);
        const bg = hexColor(s.fillColor),
          bgOpacity = numOf(s.fillOpacity);
        if (bg && bgOpacity !== undefined && bgOpacity > 0) item.format = { ...item.format, background: bg };
        if (!item.text) {
          bump(report.skipped, 'text');
          break;
        }
        accept(src, item);
        break;
      }
      case 'frame': {
        const item = place(src, 'frame');
        item.text = htmlToPlain(d.title, 200).replace(/\s+/g, ' ').trim() || 'Frame';
        const fill = hexColor(s.fillColor);
        if (fill) item.fill = fill;
        accept(src, item);
        break;
      }
      case 'card':
      case 'app_card': {
        const item = place(src, 'card');
        item.text = htmlToPlain(d.title, 20000) || (src.type === 'card' ? 'Card' : 'App card');
        let description = htmlToPlain(d.description, 20000);
        if (src.type === 'app_card' && Array.isArray(d.fields)) {
          const lines = d.fields
            .slice(0, 50)
            .filter(isObj)
            .map(f => [htmlToPlain(f.value, 500), htmlToPlain(f.tooltip, 500)].filter(Boolean).join(': '))
            .filter(Boolean);
          if (lines.length) description = [description, ...lines].filter(Boolean).join('\n').slice(0, 20000);
        }
        const accent = hexColor(src.type === 'card' ? s.cardTheme : s.fillColor);
        if (accent) item.fill = accent;
        const due = str(d.dueDate).slice(0, 10),
          start = str(d.startDate).slice(0, 10);
        const assignee = isObj(d.assignee) ? str(d.assignee.name) : str(d.assigneeName);
        if (!assignee && str(d.assigneeId)) report.unnamedAssignees++;
        item.data = {
          ...item.data,
          description,
          assignee: assignee.replace(/\s+/g, ' ').trim().slice(0, 200),
          due: isIsoDate(due) ? due : '',
        };
        if (isIsoDate(start) && (!item.data.due || start <= item.data.due)) item.data.start = start;
        const tags = tagsFor(src, root, tagTitles);
        if (tags) item.tags = tags;
        accept(src, item);
        break;
      }
      case 'image': {
        const titleText = htmlToPlain(d.title, 300),
          alt = htmlToPlain(d.altText, 1000),
          dataUrl = str(d.imageDataUrl),
          mime = imageMime(dataUrl);
        if (mime && dataUrl.length <= MAX_IMAGE_BYTES * 1.37 + 100) {
          const item = place(src, 'image');
          item.assetId = crypto.randomUUID();
          if (alt) item.alt = alt.slice(0, 1000);
          if (titleText) item.name = titleText.slice(0, 200);
          if (accept(src, item))
            assets[item.assetId] = {
              mime,
              data: dataUrl,
              width: clamp(Math.round(src.w ?? item.w), 1, 20000),
              height: clamp(Math.round(src.h ?? item.h), 1, 20000),
              name: (titleText || 'image').slice(0, 200),
            };
          break;
        }
        const item = link(src, str(d.imageUrl), titleText || alt || 'Image', alt || 'Image from the exported board');
        if (item) {
          if (accept(src, item)) report.imageLinks++;
        } else bump(report.skipped, 'image');
        break;
      }
      case 'embed':
      case 'preview': {
        const url = str(d.url),
          titleText = htmlToPlain(d.title, 300),
          description = htmlToPlain(d.description, 1000);
        let made: Item | null = null;
        if (src.type === 'embed')
          try {
            const source = embedSource(url);
            made = place(src, 'embed');
            made.data = { url: source.url, provider: source.provider };
          } catch {
            made = null;
          }
        made ??= link(src, url, titleText || url, description || str(d.providerName).slice(0, 200));
        if (made) accept(src, made);
        else bump(report.skipped, src.type);
        break;
      }
      case 'document': {
        const titleText = htmlToPlain(d.title, 300) || 'Document';
        const item = link(src, str(d.documentUrl), titleText, 'Document from the exported board');
        if (item) accept(src, item);
        else bump(report.skipped, 'document');
        break;
      }
      default:
        bump(report.skipped, src.type);
    }
  }

  // Connectors between imported objects.
  const connectors = Array.isArray(root.connectors) ? root.connectors.slice(0, 50_000) : [];
  for (const raw of connectors) {
    if (!isObj(raw)) {
      bump(report.skipped, 'connector');
      continue;
    }
    const startRef = isObj(raw.startItem) ? raw.startItem : {},
      endRef = isObj(raw.endItem) ? raw.endItem : {},
      from = idMap.get(str(startRef.id)),
      to = idMap.get(str(endRef.id));
    if (!from || !to) {
      report.danglingConnectors++;
      continue;
    }
    if (items.length >= limit) {
      report.overLimit++;
      continue;
    }
    const s = isObj(raw.style) ? raw.style : {},
      shape = str(raw.shape) || 'curved';
    const connector: ConnectorFormat = {
      path: shape === 'straight' ? 'straight' : shape === 'elbowed' ? 'elbow' : 'curved',
      startHead: capMap[str(s.startStrokeCap) || 'none'] ?? 'arrow',
      endHead: capMap[str(s.endStrokeCap) || 'stealth'] ?? 'arrow',
    };
    const width = numOf(s.strokeWidth);
    if (width !== undefined) connector.width = clamp(Math.round(width * 2) / 2, 1, 12);
    const dash = str(s.strokeStyle);
    if (dash === 'dashed' || dash === 'dotted') connector.dash = dash;
    const side = (ref: Json) => {
      const p = isObj(ref.position) ? ref.position : undefined;
      if (!p) return undefined;
      const x = fraction(p.x),
        y = fraction(p.y);
      if (x === undefined || y === undefined) return undefined;
      if (y === 0) return 'top' as const;
      if (y === 1) return 'bottom' as const;
      if (x === 0) return 'left' as const;
      if (x === 1) return 'right' as const;
      return undefined;
    };
    const startSide = side(startRef),
      endSide = side(endRef);
    if (startSide) connector.startSide = startSide;
    if (endSide) connector.endSide = endSide;
    const captionColor = hexColor(s.color),
      captionSize = numOf(s.fontSize);
    if (captionColor && captionColor !== '#1a1a1a') connector.labelColor = captionColor;
    if (captionSize !== undefined && captionSize !== 14)
      connector.labelSize = clamp(Math.round(captionSize), LABEL_SIZE_MIN, LABEL_SIZE_MAX);
    const captions = (Array.isArray(raw.captions) ? raw.captions : [])
      .filter(isObj)
      .map(c => ({ text: htmlToPlain(c.content, 200), at: fraction(c.position) ?? 0.5 }))
      .filter(c => c.text);
    const line = createItem('arrow', 0, 0);
    const a = { x: from.x + from.w / 2, y: from.y + from.h / 2 },
      b = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
    line.x = Math.round(a.x);
    line.y = Math.round(a.y);
    line.w = Math.round(b.x - a.x);
    line.h = Math.round(b.y - a.y);
    line.from = from.id;
    line.to = to.id;
    const stroke = hexColor(s.strokeColor);
    if (stroke) line.fill = stroke;
    if (captions.length) {
      line.text = captions[0].text;
      if (captions[0].at !== 0.5) connector.labelAt = captions[0].at;
      const extra: ConnectorLabel[] = captions
        .slice(1, 11)
        .map(c => ({ id: crypto.randomUUID(), text: c.text, at: c.at }));
      if (extra.length) connector.labels = extra;
    }
    line.connector = connector;
    accept({ raw, id: str(raw.id) || crypto.randomUUID(), type: 'connector' } as Source, line);
  }

  const board: Board = { version: 1, title, items };
  const description = htmlToPlain(boardInfo.description, BOARD_DESCRIPTION_MAX).trim();
  if (description) board.description = description;
  const usedTags = new Set(items.flatMap(i => i.tags ?? []));
  const colours = Object.fromEntries(Object.entries(tagColors).filter(([t]) => usedTags.has(t)));
  if (Object.keys(colours).length) board.tagColors = colours;
  return { board: parseBoard(board), report, assets };
}
