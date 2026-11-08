// Import a Visio (.vsdx) drawing as native shapes, text and connectors (decision Q18: import only, no export).
// Pure: no React, no DOM. A .vsdx file is a ZIP package: visio/pages/pages.xml lists the pages, each page part
// holds <Shape> elements (cells in inches, Y up from the page bottom), masters name the shape types and give
// inherited cells, style sheets in visio/document.xml give the remaining defaults, and <Connects> glue
// connectors to shapes. Only those XML parts are decompressed, with size caps against ZIP bombs. Images, embedded
// objects and anything else in the package are never decoded, executed or rendered: they are counted and reported.
import { strFromU8, unzipSync } from 'fflate';
import { parseXml } from './drawio-shapes.ts';
import type { Board, ConnectorFormat, ConnectorHead, GroupDef, Item, Kind, Point } from './model.ts';
import { parseBoard } from './model.ts';
import { textHash } from './rich-text.ts';
import { canRotate, normalizeRotation } from './rotation.ts';

export type Make = (type: Kind, x: number, y: number, fill?: string) => Item;
type XNode = ReturnType<typeof parseXml>;

/** Largest .vsdx file accepted. */
export const VSDX_MAX_BYTES = 50 * 1024 * 1024;
/** Largest single XML part, and all decompressed parts together (ZIP-bomb safety). */
export const VSDX_PART_MAX = 20 * 1024 * 1024;
export const VSDX_TOTAL_MAX = 100 * 1024 * 1024;
/** Most ZIP entries looked at, pages imported and shapes read across all pages. */
export const VSDX_MAX_ENTRIES = 10_000;
export const VSDX_MAX_PAGES = 50;
export const VSDX_MAX_SHAPES = 20_000;
/** Deepest group nesting followed. */
const MAX_DEPTH = 20;
/** World units per inch. */
const SCALE = 96;
const PAGE_PAD = 40,
  PAGE_GAP = 120;
const BOARD_LIMIT = 2000;

export type VsdxImport = {
  items: Item[];
  groups: GroupDef[];
  shapes: number;
  /** Lines glued to at least one shape. */
  connectors: number;
  /** Lines glued to nothing. */
  lines: number;
  /** Pages in the file, and pages that became frames. */
  pages: number;
  imported: number;
  /** Pictures, embedded objects and other foreign content (never decoded). */
  embedded: number;
  /** Shapes that could not be mapped (guides, empty shapes, lines without ends). */
  unsupported: number;
  /** Shapes of unknown types, drawn as rectangles. */
  approximated: number;
  /** Objects past the board's object limit. */
  overLimit: number;
  /** Pages past VSDX_MAX_PAGES, or that could not be read. */
  pagesLeftOut: number;
  /** Shapes past VSDX_MAX_SHAPES (not read at all). */
  shapesCapped: number;
};

const local = (tag: string) => tag.slice(tag.lastIndexOf(':') + 1);
const kids = (n: XNode | undefined, name: string) => (n ? n.children.filter(c => local(c.tag) === name) : []);
const kid = (n: XNode | undefined, name: string) => n?.children.find(c => local(c.tag) === name);
const num = (v: string | undefined): number | undefined => {
  if (v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Visio's 24 fixed colour indexes (cells written as "0"..."23"). */
const indexColors = [
  '#000000',
  '#ffffff',
  '#ff0000',
  '#00ff00',
  '#0000ff',
  '#ffff00',
  '#ff00ff',
  '#00ffff',
  '#800000',
  '#008000',
  '#000080',
  '#808000',
  '#800080',
  '#008080',
  '#c0c0c0',
  '#e6e6e6',
  '#cdcdcd',
  '#b3b3b3',
  '#9a9a9a',
  '#808080',
  '#666666',
  '#4d4d4d',
  '#333333',
  '#1a1a1a',
];
/** A colour cell (`#rrggbb`, `#rgb`, an index or RGB(r,g,b)) as `#rrggbb`; anything else undefined. */
export function visioColor(v: string | undefined, f?: string): string | undefined {
  for (const s of [v, f]) {
    if (!s) continue;
    const t = s.trim();
    const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(t);
    if (hex) {
      const h = hex[1].length === 3 ? [...hex[1]].map(c => c + c).join('') : hex[1];
      return `#${h.toLowerCase()}`;
    }
    if (/^\d{1,2}$/.test(t) && Number(t) < indexColors.length) return indexColors[Number(t)];
    const rgb = /RGB\((\d{1,3}),(\d{1,3}),(\d{1,3})\)/i.exec(t.replace(/\s/g, ''));
    if (rgb)
      return (
        '#' +
        rgb
          .slice(1, 4)
          .map(c => clamp(Number(c), 0, 255).toString(16).padStart(2, '0'))
          .join('')
      );
  }
  return undefined;
}

/** Arrowhead index to a Boardroom connector end (approximate: Visio has 45 heads). */
export function visioHead(v: number | undefined, fallback: ConnectorHead): ConnectorHead {
  if (v === undefined) return fallback;
  const n = Math.round(v);
  if (n <= 0) return 'none';
  if ([10, 20, 21, 41, 42].includes(n)) return 'circle';
  if ([11, 22, 23, 24].includes(n)) return 'diamond';
  if ([1, 7, 8, 9, 15, 16, 17, 18].includes(n)) return 'open';
  return 'arrow';
}

// ---------------------------------------------------------------------------------------------------------------
// Sheets: a shape, master shape or style sheet with its cells, inherited from its master and style sheets.

type Sheet = {
  node: XNode;
  /** The master shape this shape inherits from. */
  master?: Sheet;
};
type Styles = Map<string, XNode>;
/** Which style sheet attribute a cell falls back to. */
const styleAttr = (name: string) =>
  /^Fill|^Shdw/.test(name) ? 'FillStyle' : /^Line|Arrow|^Rounding|^Cap$/.test(name) ? 'LineStyle' : 'TextStyle';
type CellValue = { v?: string; f?: string };
const ownCell = (n: XNode, name: string): CellValue | undefined => {
  const c = n.children.find(k => local(k.tag) === 'Cell' && k.attrs.N === name);
  return c ? { v: c.attrs.V, f: c.attrs.F } : undefined;
};
const ownSectionCell = (n: XNode, section: string, row: string, name: string): CellValue | undefined => {
  for (const s of kids(n, 'Section'))
    if (s.attrs.N === section)
      for (const r of kids(s, 'Row'))
        if ((r.attrs.IX ?? '0') === row) {
          const c = kids(r, 'Cell').find(k => k.attrs.N === name);
          if (c) return { v: c.attrs.V, f: c.attrs.F };
        }
  return undefined;
};

class Lookup {
  private styles: Styles;
  constructor(styles: Styles) {
    this.styles = styles;
  }
  /** The style attribute (FillStyle, LineStyle, TextStyle) of a sheet or its master. */
  private styleOf(sheet: Sheet, attr: string): string | undefined {
    for (let s: Sheet | undefined = sheet, d = 0; s && d < MAX_DEPTH; s = s.master, d++)
      if (s.node.attrs[attr] !== undefined) return s.node.attrs[attr];
    return undefined;
  }
  private fromStyles(id: string | undefined, attr: string, read: (n: XNode) => CellValue | undefined) {
    for (let d = 0; id !== undefined && d < MAX_DEPTH; d++) {
      const s = this.styles.get(id);
      if (!s) return undefined;
      const hit = read(s);
      if (hit) return hit;
      const next = s.attrs[attr];
      id = next === id ? undefined : next;
    }
    return undefined;
  }
  cell(sheet: Sheet, name: string): CellValue | undefined {
    for (let s: Sheet | undefined = sheet, d = 0; s && d < MAX_DEPTH; s = s.master, d++) {
      const hit = ownCell(s.node, name);
      if (hit) return hit;
    }
    const attr = styleAttr(name);
    return this.fromStyles(this.styleOf(sheet, attr), attr, n => ownCell(n, name));
  }
  num(sheet: Sheet, name: string): number | undefined {
    return num(this.cell(sheet, name)?.v);
  }
  section(sheet: Sheet, section: string, row: string, name: string): CellValue | undefined {
    for (let s: Sheet | undefined = sheet, d = 0; s && d < MAX_DEPTH; s = s.master, d++) {
      const hit = ownSectionCell(s.node, section, row, name);
      if (hit) return hit;
    }
    return this.fromStyles(this.styleOf(sheet, 'TextStyle'), 'TextStyle', n => ownSectionCell(n, section, row, name));
  }
  /** Geometry sections from the nearest sheet that has any. */
  geometry(sheet: Sheet): XNode[] {
    for (let s: Sheet | undefined = sheet, d = 0; s && d < MAX_DEPTH; s = s.master, d++) {
      const g = kids(s.node, 'Section').filter(k => k.attrs.N === 'Geometry');
      if (g.length) return g;
    }
    return [];
  }
  text(sheet: Sheet): string | undefined {
    for (let s: Sheet | undefined = sheet, d = 0; s && d < MAX_DEPTH; s = s.master, d++) {
      const t = kid(s.node, 'Text');
      if (t) return t.text;
    }
    return undefined;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Kinds.

/** Boardroom shape kind for a Visio master or shape name; undefined when the name says nothing. */
export function visioKind(rawName: string): Kind | 'text' | undefined {
  const name = rawName
    .toLowerCase()
    .replace(/\.\d+$/, '')
    .trim();
  if (!name) return undefined;
  const rules: [RegExp, Kind][] = [
    [/^text$|text block|^title$|^heading$/, 'text'],
    [/decision|diamond|rhombus/, 'diamond'],
    [/rounded (rectangle|process|square)|alternate process/, 'roundrect'],
    [/start\/end|terminator|terminal/, 'terminator'],
    [/predefined process|sub-?process/, 'predefined'],
    [/multiple documents|multi.?doc/, 'multidoc'],
    [/document/, 'document'],
    [/manual input/, 'manualinput'],
    [/manual operation/, 'manualop'],
    [/stored data/, 'storeddata'],
    [/internal storage/, 'internalstorage'],
    [/database|cylinder|data ?store|direct data|disk storage/, 'cylinder'],
    [/^data$|parallelogram|input\/output|^i\/o$/, 'parallelogram'],
    [/preparation|hexagon/, 'hexagon'],
    [/off-?page reference/, 'offpage'],
    [/on-?page reference|circle|ellipse|oval|^start$|^end$/, 'ellipse'],
    [/delay/, 'delay'],
    [/display/, 'display'],
    [/merge/, 'merge'],
    [/triangle|extract/, 'triangle'],
    [/pentagon/, 'pentagon'],
    [/octagon/, 'octagon'],
    [/star/, 'star'],
    [/cross/, 'cross'],
    [/trapezoid/, 'trapezoid'],
    [/chevron/, 'chevron'],
    [/cloud/, 'cloud'],
    [/actor|stick figure/, 'actor'],
    [/note|comment|annotation/, 'umlnote'],
    [/callout/, 'callout'],
    [/process|rectangle|square|^box$|^sheet$|^shape$/, 'rectangle'],
  ];
  for (const [re, kind] of rules) if (re.test(name)) return kind;
  return undefined;
}

type Geometry = { visible: boolean; noFill: boolean; noLine: boolean; ellipse: boolean; rect: boolean };
function readGeometry(sections: XNode[]): Geometry {
  const shown = sections.filter(s => ownCell(s, 'NoShow')?.v !== '1');
  const rows = shown.flatMap(s => kids(s, 'Row'));
  const lineRows = rows.filter(r => /LineTo$/.test(r.attrs.T ?? '')).length;
  return {
    visible: shown.length > 0 && rows.length > 0,
    noFill: shown.length > 0 && shown.every(s => ownCell(s, 'NoFill')?.v === '1'),
    noLine: shown.length > 0 && shown.every(s => ownCell(s, 'NoLine')?.v === '1'),
    ellipse: shown.length === 1 && rows.some(r => r.attrs.T === 'Ellipse'),
    rect: shown.length === 1 && lineRows === 4 && rows.every(r => /LineTo$|MoveTo$/.test(r.attrs.T ?? '')),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Affine transforms: [a, b, c, d, e, f] maps (x, y) to (a x + c y + e, b x + d y + f).

type M = [number, number, number, number, number, number];
const ID: M = [1, 0, 0, 1, 0, 0];
const mul = (p: M, q: M): M => [
  p[0] * q[0] + p[2] * q[1],
  p[1] * q[0] + p[3] * q[1],
  p[0] * q[2] + p[2] * q[3],
  p[1] * q[2] + p[3] * q[3],
  p[0] * q[4] + p[2] * q[5] + p[4],
  p[1] * q[4] + p[3] * q[5] + p[5],
];
const apply = (m: M, x: number, y: number): Point => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });

// ---------------------------------------------------------------------------------------------------------------
// Package.

type Pkg = { text: (path: string) => string; has: (path: string) => boolean };
/** Unzip only the XML parts the import reads, within the size caps. */
export function readVsdxPackage(bytes: Uint8Array): Pkg {
  if (bytes.length > VSDX_MAX_BYTES) throw new Error('Visio files up to 50 MB can be imported.');
  let entries = 0,
    total = 0,
    tooBig = false;
  const wanted = (name: string) =>
    /^visio\/(document\.xml|pages\/(pages\.xml|page\d+\.xml|_rels\/pages\.xml\.rels)|masters\/(masters\.xml|master\d+\.xml|_rels\/masters\.xml\.rels))$/.test(
      name,
    );
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: f => {
        entries++;
        if (entries > VSDX_MAX_ENTRIES || !wanted(f.name)) return false;
        if (f.originalSize > VSDX_PART_MAX || total + f.originalSize > VSDX_TOTAL_MAX) {
          tooBig = true;
          return false;
        }
        total += f.originalSize;
        return true;
      },
    });
  } catch {
    throw new Error('This file is not a Visio (.vsdx) drawing.');
  }
  if (tooBig) throw new Error('This Visio drawing expands to more data than can be imported safely.');
  if (entries > VSDX_MAX_ENTRIES) throw new Error('This Visio file holds too many parts to import.');
  if (!files['visio/pages/pages.xml']) throw new Error('This file is not a Visio (.vsdx) drawing.');
  return {
    text: path => (files[path] ? strFromU8(files[path]).replace(/^\uFEFF/, '') : ''),
    has: path => !!files[path],
  };
}
const xml = (src: string): XNode | undefined => {
  if (!src) return undefined;
  try {
    return parseXml(src);
  } catch {
    return undefined;
  }
};
/** Relationship id to part path, resolved against `dir`. */
function rels(src: string, dir: string): Map<string, string> {
  const out = new Map<string, string>();
  const doc = xml(src);
  for (const r of kids(kid(doc, 'Relationships'), 'Relationship')) {
    const id = r.attrs.Id,
      target = r.attrs.Target;
    if (!id || !target || r.attrs.TargetMode === 'External') continue;
    out.set(id, target.startsWith('/') ? target.slice(1) : `${dir}/${target.replace(/^\.\//, '')}`);
  }
  return out;
}
const relId = (n: XNode) => {
  const rel = kid(n, 'Rel');
  if (!rel) return undefined;
  const key = Object.keys(rel.attrs).find(k => local(k) === 'id');
  return key ? rel.attrs[key] : undefined;
};

type MasterInfo = { name: string; shapes: Map<string, XNode>; top?: XNode };
function readMasters(pkg: Pkg): Map<string, MasterInfo> {
  const out = new Map<string, MasterInfo>();
  const list = kid(xml(pkg.text('visio/masters/masters.xml')), 'Masters');
  if (!list) return out;
  const map = rels(pkg.text('visio/masters/_rels/masters.xml.rels'), 'visio/masters');
  for (const m of kids(list, 'Master')) {
    const id = m.attrs.ID;
    if (id === undefined) continue;
    const info: MasterInfo = { name: m.attrs.NameU ?? m.attrs.Name ?? '', shapes: new Map() };
    const path = map.get(relId(m) ?? '');
    const contents = path ? kid(xml(pkg.text(path)), 'MasterContents') : undefined;
    const top = kids(kid(contents, 'Shapes'), 'Shape');
    info.top = top[0];
    const walk = (list: XNode[], depth: number) => {
      if (depth > MAX_DEPTH) return;
      for (const s of list) {
        if (s.attrs.ID !== undefined) info.shapes.set(s.attrs.ID, s);
        walk(kids(kid(s, 'Shapes'), 'Shape'), depth + 1);
      }
    };
    walk(top, 0);
    out.set(id, info);
  }
  return out;
}
function readStyles(pkg: Pkg): Styles {
  const out: Styles = new Map();
  const doc = kid(xml(pkg.text('visio/document.xml')), 'VisioDocument');
  for (const s of kids(kid(doc, 'StyleSheets'), 'StyleSheet')) if (s.attrs.ID !== undefined) out.set(s.attrs.ID, s);
  return out;
}
type PageInfo = { name: string; w: number; h: number; path?: string };
function readPages(pkg: Pkg): PageInfo[] {
  const list = kid(xml(pkg.text('visio/pages/pages.xml')), 'Pages');
  if (!list) throw new Error('The Visio drawing has no pages.');
  const map = rels(pkg.text('visio/pages/_rels/pages.xml.rels'), 'visio/pages');
  const pages = kids(list, 'Page');
  return pages.map((p, k) => {
    const sheet = kid(p, 'PageSheet');
    const w = num(sheet && ownCell(sheet, 'PageWidth')?.v),
      h = num(sheet && ownCell(sheet, 'PageHeight')?.v);
    let path = map.get(relId(p) ?? '');
    if (!path && pkg.has(`visio/pages/page${k + 1}.xml`)) path = `visio/pages/page${k + 1}.xml`;
    return {
      name: (p.attrs.Name ?? p.attrs.NameU ?? '').trim().slice(0, 200) || `Page ${k + 1}`,
      w: w && w > 0 && w < 1000 ? w : 8.5,
      h: h && h > 0 && h < 1000 ? h : 11,
      path,
    };
  });
}

// ---------------------------------------------------------------------------------------------------------------
// One page.

type Counts = Pick<
  VsdxImport,
  'shapes' | 'connectors' | 'lines' | 'embedded' | 'unsupported' | 'approximated' | 'overLimit' | 'shapesCapped'
>;
type PageResult = { items: Item[]; groups: GroupDef[] };
type Ctx = {
  look: Lookup;
  masters: Map<string, MasterInfo>;
  make: Make;
  counts: Counts;
  /** Shapes left to read in the whole file. */
  budget: { shapes: number };
};

/** Accept an item only when it loads on its own (guards against odd values slipping through). */
const loads = (item: Item) => {
  try {
    parseBoard({ version: 1, title: 'check', items: [item] });
    return true;
  } catch {
    return false;
  }
};
const plainText = (t: string | undefined) =>
  (t ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u2028\u2029]/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/\s+$/, '')
    .slice(0, 6000);

function pageToItems(page: XNode, pageH: number, ctx: Ctx, limit: number): PageResult {
  const { look, masters, make, counts } = ctx;
  const toBoard = (p: Point): Point => ({ x: p.x * SCALE, y: (pageH - p.y) * SCALE });
  type Placed = { item: Item; group?: string };
  type Line = { sheet: Sheet; id: string; world: M; text: string; isConnector: boolean };
  const shapes: Placed[] = [],
    lines: Line[] = [],
    groups: GroupDef[] = [],
    byId = new Map<string, Item>();

  const add = (kind: Kind, sheet: Sheet, world: M, w: number, h: number, text: string, group?: string) => {
    const c = toBoard(apply(world, w / 2, h / 2)),
      W = Math.max(1, Math.round(w * SCALE)),
      H = Math.max(1, Math.round(h * SCALE));
    const fillPattern = look.num(sheet, 'FillPattern'),
      fill =
        fillPattern === 0
          ? undefined
          : visioColor(look.cell(sheet, 'FillForegnd')?.v, look.cell(sheet, 'FillForegnd')?.f),
      textColor = visioColor(look.section(sheet, 'Character', '0', 'Color')?.v);
    const item: Item = {
      ...make(kind, 0, 0, kind === 'text' ? (textColor ?? '#25252a') : (fill ?? '#ffffff')),
      w: kind === 'text' ? Math.max(20, W) : W,
      h: kind === 'text' ? Math.max(20, H) : H,
      text,
    };
    item.x = Math.round(c.x - item.w / 2);
    item.y = Math.round(c.y - item.h / 2);
    if (kind !== 'text') {
      const style: Item['style'] = {},
        pattern = look.num(sheet, 'LinePattern'),
        weight = look.num(sheet, 'LineWeight'),
        line = visioColor(look.cell(sheet, 'LineColor')?.v, look.cell(sheet, 'LineColor')?.f);
      if (pattern === 0) style.borderWidth = 0;
      else {
        if (line) style.borderColor = line;
        if (weight !== undefined) style.borderWidth = clamp(Math.round(weight * SCALE * 2) / 2, 0.5, 24);
        if (pattern !== undefined && pattern > 1)
          style.borderStyle = [3, 10, 16].includes(pattern) ? 'dotted' : 'dashed';
      }
      if (Object.keys(style).length) item.style = style;
      if (textColor && textColor !== '#000000' && text) {
        item.spans = [{ start: 0, end: text.length, color: textColor }];
        item.spansFor = textHash(text);
      }
    }
    const format: Item['format'] = { ...item.format },
      size = num(look.section(sheet, 'Character', '0', 'Size')?.v),
      bits = num(look.section(sheet, 'Character', '0', 'Style')?.v) ?? 0,
      align = num(look.section(sheet, 'Paragraph', '0', 'HorzAlign')?.v),
      valign = look.num(sheet, 'VerticalAlign');
    if (size) format.fontSize = clamp(Math.round(size * SCALE), 10, 96);
    if (bits & 1) format.bold = true;
    if (bits & 2) format.italic = true;
    if (bits & 4) format.underline = true;
    if (align !== undefined) format.align = align === 0 ? 'left' : align === 2 ? 'right' : 'center';
    if (valign !== undefined) format.valign = valign === 0 ? 'top' : valign === 2 ? 'bottom' : 'middle';
    if (Object.keys(format).length) item.format = format;
    if (canRotate(item)) {
      const deg = normalizeRotation(-(Math.atan2(world[1], world[0]) * 180) / Math.PI);
      if (deg) item.rotation = deg;
    }
    if (!loads(item)) return counts.unsupported++;
    shapes.push({ item, group });
    if (sheet.node.attrs.ID !== undefined) byId.set(sheet.node.attrs.ID, item);
  };

  const walk = (list: XNode[], parent: M, master: MasterInfo | undefined, group: string | undefined, depth: number) => {
    for (const node of list) {
      if (ctx.budget.shapes <= 0) {
        counts.shapesCapped++;
        continue;
      }
      ctx.budget.shapes--;
      const m = node.attrs.Master !== undefined ? masters.get(node.attrs.Master) : master;
      const masterShape =
        node.attrs.MasterShape !== undefined
          ? m?.shapes.get(node.attrs.MasterShape)
          : node.attrs.Master !== undefined
            ? m?.top
            : undefined;
      const sheet: Sheet = { node, master: masterShape ? { node: masterShape } : undefined };
      const type = node.attrs.Type ?? masterShape?.attrs.Type ?? 'Shape';
      if (type === 'Foreign' || kid(node, 'ForeignData')) {
        counts.embedded++;
        continue;
      }
      if (type === 'Guide') {
        counts.unsupported++;
        continue;
      }
      const w = look.num(sheet, 'Width') ?? 0,
        h = look.num(sheet, 'Height') ?? 0,
        own: M = (() => {
          const a = look.num(sheet, 'Angle') ?? 0,
            px = look.num(sheet, 'PinX') ?? 0,
            py = look.num(sheet, 'PinY') ?? 0,
            lx = look.num(sheet, 'LocPinX') ?? w / 2,
            ly = look.num(sheet, 'LocPinY') ?? h / 2,
            cos = Math.cos(a),
            sin = Math.sin(a);
          return [cos, sin, -sin, cos, px - (cos * lx - sin * ly), py - (sin * lx + cos * ly)];
        })(),
        world = mul(parent, own);
      const text = plainText(look.text(sheet));
      const names = [m?.name ?? '', node.attrs.NameU ?? '', node.attrs.Name ?? ''];
      const isLine = look.cell(sheet, 'BeginX') !== undefined && look.cell(sheet, 'EndX') !== undefined;
      if (isLine && type !== 'Group') {
        const isConnector = names.some(n => /connector/i.test(n)) || look.num(sheet, 'ObjType') === 2;
        lines.push({ sheet, id: node.attrs.ID ?? '', world: parent, text: text.slice(0, 200), isConnector });
        continue;
      }
      if (type === 'Group') {
        let children = kids(kid(node, 'Shapes'), 'Shape'),
          childMaster = m;
        // A group instance that leaves its sub-shapes to the master: they carry their own cells.
        if (!children.length && masterShape) {
          children = kids(kid(masterShape, 'Shapes'), 'Shape');
          childMaster = undefined;
        }
        if (depth >= MAX_DEPTH) {
          counts.unsupported += children.length;
          continue;
        }
        const id = crypto.randomUUID();
        groups.push({ id, parent: group ?? null });
        if (text && w > 0 && h > 0) add('text', sheet, world, w, h, text, id);
        walk(children, world, childMaster, id, depth + 1);
        continue;
      }
      if (!(w > 0 && h > 0)) {
        counts.unsupported++;
        continue;
      }
      const geo = readGeometry(look.geometry(sheet));
      let kind: Kind | undefined;
      for (const n of names) {
        kind = visioKind(n);
        if (kind) break;
      }
      // Text only: a shape whose outline draws nothing, or one with neither an outline nor a known type name.
      if ((geo.visible && geo.noFill && geo.noLine) || (!geo.visible && !kind) || kind === 'text') {
        if (!text) {
          counts.unsupported++;
          continue;
        }
        kind = 'text';
      } else if (!kind) {
        if (geo.ellipse) kind = 'ellipse';
        else if (geo.rect) kind = 'rectangle';
        else {
          kind = 'rectangle';
          counts.approximated++;
        }
      }
      if (kind === 'rectangle' && (look.num(sheet, 'Rounding') ?? 0) > 0) kind = 'roundrect';
      add(kind, sheet, world, w, h, text, group);
    }
  };
  walk(kids(kid(kid(page, 'PageContents'), 'Shapes'), 'Shape'), ID, undefined, undefined, 0);

  // Glue: connector id and end ("BeginX"/"EndX") to the shape it is attached to.
  const glue = new Map<string, string>();
  for (const c of kids(kid(kid(page, 'PageContents'), 'Connects'), 'Connect')) {
    const from = c.attrs.FromSheet,
      to = c.attrs.ToSheet,
      end = c.attrs.FromCell === 'EndX' ? 'end' : c.attrs.FromCell === 'BeginX' ? 'begin' : undefined;
    if (from && to && end) glue.set(`${from}:${end}`, to);
  }

  const items: Item[] = [];
  const kept = new Set<string>();
  for (const s of shapes) {
    if (items.length >= limit) {
      counts.overLimit++;
      continue;
    }
    if (s.group) s.item.group = s.group;
    items.push(s.item);
    kept.add(s.item.id);
    counts.shapes++;
  }
  for (const l of lines) {
    const { sheet, world } = l;
    const pt = (x: string, y: string) => {
      const vx = look.num(sheet, x),
        vy = look.num(sheet, y);
      return vx === undefined || vy === undefined ? undefined : toBoard(apply(world, vx, vy));
    };
    const a = pt('BeginX', 'BeginY'),
      b = pt('EndX', 'EndY');
    const target = (end: string) => {
      const t = byId.get(glue.get(`${l.id}:${end}`) ?? '');
      return t && kept.has(t.id) ? t : undefined;
    };
    const from = target('begin'),
      to = target('end');
    if ((!from && !a) || (!to && !b) || (from && from === to && !a)) {
      counts.unsupported++;
      continue;
    }
    if (items.length >= limit) {
      counts.overLimit++;
      continue;
    }
    const isConnector = l.isConnector || !!from || !!to;
    const route = look.num(sheet, 'ConLineRouteExt'),
      pattern = look.num(sheet, 'LinePattern'),
      weight = look.num(sheet, 'LineWeight'),
      color = visioColor(look.cell(sheet, 'LineColor')?.v, look.cell(sheet, 'LineColor')?.f);
    const connector: ConnectorFormat = {
      path: route === 2 ? 'curved' : l.isConnector && route !== 1 ? 'elbow' : 'straight',
      endHead: visioHead(look.num(sheet, 'EndArrow'), l.isConnector ? 'arrow' : 'none'),
      startHead: visioHead(look.num(sheet, 'BeginArrow'), 'none'),
    };
    if (weight !== undefined) connector.width = clamp(Math.round(weight * SCALE), 1, 12);
    if (pattern !== undefined && pattern > 1) connector.dash = [3, 10, 16].includes(pattern) ? 'dotted' : 'dashed';
    const start = a ?? { x: from!.x + from!.w / 2, y: from!.y + from!.h / 2 },
      end = b ?? { x: to!.x + to!.w / 2, y: to!.y + to!.h / 2 };
    const line: Item = {
      ...make('arrow', Math.round(start.x), Math.round(start.y)),
      w: Math.round(end.x - start.x),
      h: Math.round(end.y - start.y),
      text: l.text,
      connector,
    };
    if (color) line.fill = color;
    if (from) line.from = from.id;
    if (to) line.to = to.id;
    if (!loads(line)) {
      counts.unsupported++;
      continue;
    }
    items.push(line);
    if (isConnector && (from || to)) counts.connectors++;
    else counts.lines++;
  }
  return { items, groups: tidyGroups(groups, items) };
}

/** Drop groups with fewer than two members (objects or groups), moving their members to the parent group. */
function tidyGroups(groups: GroupDef[], items: Item[]): GroupDef[] {
  let list = [...groups];
  for (let changed = true; changed;) {
    changed = false;
    for (const g of [...list].reverse()) {
      const members = items.filter(i => i.group === g.id).length + list.filter(c => c.parent === g.id).length;
      if (members >= 2) continue;
      for (const i of items) if (i.group === g.id) i.group = g.parent ?? undefined;
      list = list.filter(x => x !== g).map(c => (c.parent === g.id ? { ...c, parent: g.parent } : c));
      changed = true;
    }
  }
  for (const i of items) if (i.group === undefined) delete i.group;
  return list;
}

// ---------------------------------------------------------------------------------------------------------------

const span = (i: Item) => ({
  x0: Math.min(i.x, i.x + i.w),
  y0: Math.min(i.y, i.y + i.h),
  x1: Math.max(i.x, i.x + i.w),
  y1: Math.max(i.y, i.y + i.h),
});

/**
 * Native objects for a .vsdx file, centred on `at`. Every page becomes a frame named after it, side by side.
 * `limit` caps the number of objects (the board's remaining room): per page, the frame comes first, then shapes,
 * then lines between shapes that were kept. Throws an Error with a readable message when nothing can be imported.
 */
export function vsdxToItems(bytes: Uint8Array, at: Point, make: Make, limit = BOARD_LIMIT): VsdxImport {
  const pkg = readVsdxPackage(bytes);
  const pages = readPages(pkg);
  if (!pages.length) throw new Error('The Visio drawing has no pages.');
  const ctx: Ctx = {
    look: new Lookup(readStyles(pkg)),
    masters: readMasters(pkg),
    make,
    counts: {
      shapes: 0,
      connectors: 0,
      lines: 0,
      embedded: 0,
      unsupported: 0,
      approximated: 0,
      overLimit: 0,
      shapesCapped: 0,
    },
    budget: { shapes: VSDX_MAX_SHAPES },
  };
  const items: Item[] = [],
    groups: GroupDef[] = [];
  let x = 0,
    imported = 0,
    left = Math.max(0, pages.length - VSDX_MAX_PAGES);
  for (const page of pages.slice(0, VSDX_MAX_PAGES)) {
    const doc = page.path ? xml(pkg.text(page.path)) : undefined;
    if (!doc || !kid(doc, 'PageContents')) {
      left++;
      continue;
    }
    if (items.length >= limit) {
      ctx.counts.overLimit++;
      continue;
    }
    const r = pageToItems(doc, page.h, ctx, Math.max(0, limit - items.length - 1));
    // The frame covers the page, grown to hold anything drawn off the page.
    let x0 = 0,
      y0 = 0,
      x1 = page.w * SCALE,
      y1 = page.h * SCALE;
    const box = r.items.map(span);
    if (box.some(b => b.x0 < x0 || b.y0 < y0 || b.x1 > x1 || b.y1 > y1)) {
      x0 = Math.min(x0, ...box.map(b => b.x0)) - PAGE_PAD;
      y0 = Math.min(y0, ...box.map(b => b.y0)) - PAGE_PAD;
      x1 = Math.max(x1, ...box.map(b => b.x1)) + PAGE_PAD;
      y1 = Math.max(y1, ...box.map(b => b.y1)) + PAGE_PAD;
    }
    const frame: Item = {
      ...make('frame', 0, 0, '#ffffff'),
      x,
      y: 0,
      w: Math.max(1, Math.round(x1 - x0)),
      h: Math.max(1, Math.round(y1 - y0)),
      text: page.name,
    };
    const dx = x - x0,
      dy = -y0;
    items.push(frame, ...r.items.map(i => ({ ...i, x: Math.round(i.x + dx), y: Math.round(i.y + dy) })));
    groups.push(...r.groups);
    imported++;
    x += frame.w + PAGE_GAP;
  }
  if (!items.length) throw new Error('The Visio drawing has no pages that could be read.');
  if (!items.some(i => i.type !== 'frame') && !ctx.counts.overLimit)
    throw new Error(
      ctx.counts.embedded
        ? 'The Visio drawing holds only pictures or embedded objects, which are not imported.'
        : 'The Visio drawing has no shapes to import.',
    );
  const box = items.map(span),
    cx = (Math.min(...box.map(b => b.x0)) + Math.max(...box.map(b => b.x1))) / 2,
    cy = (Math.min(...box.map(b => b.y0)) + Math.max(...box.map(b => b.y1))) / 2;
  const placed = items.map(i => ({ ...i, x: Math.round(i.x + at.x - cx), y: Math.round(i.y + at.y - cy) }));
  // The whole result must load as a board (ids, groups and every object).
  const check: Board = { version: 1, title: 'check', items: placed, ...(groups.length ? { groups } : {}) };
  parseBoard(check);
  return { items: placed, groups, pages: pages.length, imported, pagesLeftOut: left, ...ctx.counts };
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en')} ${n === 1 ? one : many}`;
/** Status message after an import: what was imported, then everything left out or approximated, in one message. */
export function vsdxImportNote(r: VsdxImport): string {
  const what = [plural(r.shapes, 'shape', 'shapes'), plural(r.connectors, 'connector', 'connectors')];
  if (r.lines) what.push(plural(r.lines, 'line', 'lines'));
  const parts = [
    `Imported ${what.slice(0, -1).join(', ')} and ${what[what.length - 1]} from ${plural(r.imported, 'page', 'pages')}, each in a frame named after it.`,
  ];
  const out: string[] = [];
  if (r.embedded) out.push(plural(r.embedded, 'picture or embedded object', 'pictures or embedded objects'));
  if (r.unsupported) out.push(plural(r.unsupported, 'unsupported shape', 'unsupported shapes'));
  if (r.pagesLeftOut)
    out.push(`${plural(r.pagesLeftOut, 'page', 'pages')} (empty, unreadable or past the ${VSDX_MAX_PAGES}-page cap)`);
  if (r.shapesCapped)
    out.push(`${plural(r.shapesCapped, 'shape', 'shapes')} past the ${VSDX_MAX_SHAPES.toLocaleString('en')}-shape cap`);
  if (r.overLimit)
    out.push(`${plural(r.overLimit, 'object', 'objects')} past the ${BOARD_LIMIT.toLocaleString('en')}-object limit`);
  if (out.length) parts.push(`Left out: ${out.join(', ')}.`);
  if (r.approximated)
    parts.push(
      `${plural(r.approximated, 'shape of an unknown type is', 'shapes of unknown types are')} drawn as rectangles.`,
    );
  return parts.join(' ');
}
