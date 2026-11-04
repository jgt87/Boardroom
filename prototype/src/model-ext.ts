// Validation for optional document fields added by the next-20 integration.
// Every field is optional; boards written before these features load unchanged.
import { isValidAuthor } from './authors.ts';
import { validateBoardSettings } from './board-settings.ts';
import type { Board, Item, RecordRow } from './model.ts';
import { normalizeNoteLink } from './model.ts';
import { recordsError } from './records.ts';
import { schemaOf, validateRecordSchema, validateRecordValues } from './record-schema.ts';
import type { GridData } from './grid.ts';
import { validateRecordView } from './record-query.ts';
import { framePresets } from './frame-presets.ts';
import { codeLanguages } from './code-languages.ts';
import { validateWidget } from './widget-specs.ts';
import { validateMindStyle } from './mindmap-style.ts';

export const imageMimes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
export const mediaMimes = ['video/mp4', 'video/webm', 'application/pdf'];
export const MAX_IMAGE_BYTES = 4_000_000;
export const MAX_MEDIA_BYTES = 25_000_000;
const finite = (v: unknown, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const sides = ['top', 'right', 'bottom', 'left'];

export function validateExtensions(b: Board): void {
  if (b.groups !== undefined) {
    if (
      !Array.isArray(b.groups) ||
      b.groups.length > 2000 ||
      b.groups.some(
        g => !g || typeof g.id !== 'string' || !g.id || (g.parent !== null && typeof g.parent !== 'string'),
      ) ||
      new Set(b.groups.map(g => g.id)).size !== b.groups.length
    )
      throw new Error('Invalid groups.');
    const map = new Map(b.groups.map(g => [g.id, g]));
    for (const g of b.groups) {
      const seen = new Set<string>();
      for (let n: typeof g | undefined = g; n; n = n.parent === null ? undefined : map.get(n.parent)) {
        if (seen.has(n.id)) throw new Error('Groups cannot contain themselves.');
        if (n.parent !== null && !map.has(n.parent)) throw new Error('A group refers to a missing parent group.');
        seen.add(n.id);
      }
    }
  }
  if (
    b.presentation !== undefined &&
    (!Array.isArray(b.presentation) ||
      b.presentation.length > 2000 ||
      b.presentation.some(id => typeof id !== 'string'))
  )
    throw new Error('Invalid presentation order.');
  if (b.assets !== undefined) {
    if (!b.assets || typeof b.assets !== 'object' || Array.isArray(b.assets) || Object.keys(b.assets).length > 500)
      throw new Error('Invalid image assets.');
    for (const a of Object.values(b.assets)) {
      if (
        !a ||
        ![...imageMimes, ...mediaMimes].includes(a.mime) ||
        typeof a.data !== 'string' ||
        !a.data.startsWith(`data:${a.mime};base64,`) ||
        a.data.length > (imageMimes.includes(a.mime) ? MAX_IMAGE_BYTES : MAX_MEDIA_BYTES) * 1.4 + 100 ||
        !/^[A-Za-z0-9+/=]*$/.test(a.data.slice(a.data.indexOf(',') + 1)) ||
        !finite(a.width, 1, 20000) ||
        !finite(a.height, 1, 20000) ||
        typeof a.name !== 'string' ||
        a.name.length > 200
      )
        throw new Error('Invalid image asset.');
    }
  }
  if (
    b.comments !== undefined &&
    (!Array.isArray(b.comments) ||
      b.comments.length > 2000 ||
      b.comments.some(
        c =>
          !c ||
          typeof c.id !== 'string' ||
          !finite(c.x, -1e7, 1e7) ||
          !finite(c.y, -1e7, 1e7) ||
          (c.itemId !== undefined && typeof c.itemId !== 'string') ||
          (c.resolved !== undefined && typeof c.resolved !== 'boolean') ||
          !Array.isArray(c.messages) ||
          !c.messages.length ||
          c.messages.length > 200 ||
          c.messages.some(
            m =>
              !m ||
              typeof m.id !== 'string' ||
              typeof m.text !== 'string' ||
              !m.text.trim() ||
              m.text.length > 2000 ||
              typeof m.at !== 'string',
          ),
      ))
  )
    throw new Error('Invalid comments.');
  if (
    b.voting !== undefined &&
    (!b.voting ||
      typeof b.voting.active !== 'boolean' ||
      !finite(b.voting.budget, 1, 100) ||
      !Array.isArray(b.voting.targets) ||
      b.voting.targets.some(t => typeof t !== 'string') ||
      !b.voting.votes ||
      typeof b.voting.votes !== 'object' ||
      Object.values(b.voting.votes).some(v => !Number.isInteger(v) || v < 0) ||
      Object.values(b.voting.votes).reduce((s, v) => s + v, 0) > b.voting.budget)
  )
    throw new Error('Invalid voting session.');
  if (b.votingResults !== undefined && (!Array.isArray(b.votingResults) || b.votingResults.length > 200))
    throw new Error('Invalid voting results.');
  if (
    b.privateMode !== undefined &&
    (!b.privateMode ||
      typeof b.privateMode.all !== 'boolean' ||
      !Array.isArray(b.privateMode.frames) ||
      b.privateMode.frames.some(f => typeof f !== 'string'))
  )
    throw new Error('Invalid private mode.');
  if (b.showAuthors !== undefined && typeof b.showAuthors !== 'boolean') throw new Error('Invalid author setting.');
  validateBoardSettings(b);
  const groups = new Set(b.groups?.map(g => g.id));
  for (const i of b.items) validateItem(i, groups);
  if (
    b.recordSchemas !== undefined &&
    (!b.recordSchemas ||
      typeof b.recordSchemas !== 'object' ||
      Array.isArray(b.recordSchemas) ||
      Object.keys(b.recordSchemas).length > 2000 ||
      Object.keys(b.recordSchemas).some(id => !Object.hasOwn(b.datasets ?? {}, id)))
  )
    throw new Error('Invalid record schemas.');
  for (const [id, rows] of Object.entries(b.datasets ?? {})) {
    validateRows(rows);
    const schema = schemaOf(b, id);
    validateRecordSchema(schema);
    validateRecordValues(rows, schema);
  }
  const contained = new Set<string>();
  for (const i of b.items)
    if (i.recordView !== undefined) {
      if (!['table', 'kanban', 'timeline'].includes(i.type) || !i.datasetId)
        throw new Error('Invalid record view owner.');
      validateRecordView(i.recordView, schemaOf(b, i.datasetId));
    }
  for (const grid of b.items.filter(i => i.type === 'grid'))
    for (const o of (grid.data as GridData).objects ?? []) {
      const child = b.items.find(i => i.id === o.id);
      if (!child || child.type === 'grid' || child.locked || child.group || contained.has(o.id))
        throw new Error('Invalid Grid content.');
      contained.add(o.id);
    }
  for (const i of b.items)
    if (
      i.recordGroup !== undefined &&
      (typeof i.recordGroup !== 'string' ||
        !schemaOf(b, i.datasetId ?? '').fields.some(f => f.id === i.recordGroup && f.type === 'select'))
    )
      throw new Error('Invalid record grouping field.');
}

function validateItem(i: Item, groups: Set<string>): void {
  const c = i.connector;
  if (
    c &&
    ((c.jumps !== undefined && typeof c.jumps !== 'boolean') ||
      (c.labelAt !== undefined && !finite(c.labelAt, 0, 1)) ||
      (c.avoid !== undefined && typeof c.avoid !== 'boolean') ||
      (c.clearance !== undefined && !finite(c.clearance, 0, 80)) ||
      (c.gap !== undefined && !finite(c.gap, 0, 40)) ||
      [c.startSide, c.endSide].some(s => s !== undefined && !sides.includes(s)) ||
      (c.bends !== undefined &&
        (!Array.isArray(c.bends) ||
          c.bends.length > 20 ||
          c.bends.some(p => !p || !finite(p.u, -1000, 1000) || !finite(p.v, -1000, 1000)))))
  )
    throw new Error('Invalid connector routing.');
  const s = i.style;
  if (
    s !== undefined &&
    (!s ||
      typeof s !== 'object' ||
      Array.isArray(s) ||
      (s.borderColor !== undefined && !/^#[0-9a-f]{6}$/i.test(s.borderColor)) ||
      (s.borderWidth !== undefined && !finite(s.borderWidth, 0, 24)) ||
      (s.borderStyle !== undefined && !['solid', 'dashed', 'dotted'].includes(s.borderStyle)) ||
      (s.borderOpacity !== undefined && !finite(s.borderOpacity, 0, 1)))
  )
    throw new Error('Invalid shape border.');
  if (i.group !== undefined && (typeof i.group !== 'string' || !groups.has(i.group)))
    throw new Error('An object refers to a missing group.');
  if (i.locked !== undefined && typeof i.locked !== 'boolean') throw new Error('Invalid lock state.');
  if (i.type === 'image' && (typeof i.assetId !== 'string' || !i.assetId || i.assetId.length > 100))
    throw new Error('An image is missing its file reference.');
  if (
    i.crop !== undefined &&
    (!i.crop ||
      !finite(i.crop.x, 0, 1) ||
      !finite(i.crop.y, 0, 1) ||
      !finite(i.crop.w, 0.01, 1) ||
      !finite(i.crop.h, 0.01, 1) ||
      i.crop.x + i.crop.w > 1.0001 ||
      i.crop.y + i.crop.h > 1.0001)
  )
    throw new Error('Invalid image crop.');
  if (
    i.emoji !== undefined &&
    (typeof i.emoji !== 'string' ||
      !i.emoji ||
      i.emoji.length > 32 ||
      /[<>]/.test(i.emoji) ||
      [...i.emoji].some(ch => ch.charCodeAt(0) < 32))
  )
    throw new Error('Invalid sticky note marker.');
  if (i.author !== undefined && !isValidAuthor(i.author)) throw new Error('Invalid author name.');
  if (i.showAuthor !== undefined && typeof i.showAuthor !== 'boolean') throw new Error('Invalid author setting.');
  if (
    i.frame !== undefined &&
    (!i.frame ||
      !framePresets.some(p => p.id === i.frame!.preset) ||
      !['portrait', 'landscape'].includes(i.frame.orientation))
  )
    throw new Error('Invalid frame format.');
  if (i.language !== undefined && !codeLanguages.some(l => l.id === i.language))
    throw new Error('Unsupported code language.');
  if (
    (i.name !== undefined && (typeof i.name !== 'string' || i.name.length > 200)) ||
    (i.alt !== undefined && (typeof i.alt !== 'string' || i.alt.length > 1000)) ||
    (i.hidden !== undefined && typeof i.hidden !== 'boolean') ||
    (i.opacity !== undefined && !finite(i.opacity, 0, 1)) ||
    (i.linkTo !== undefined && (typeof i.linkTo !== 'string' || !i.linkTo))
  )
    throw new Error('Invalid object properties.');
  const f = i.format;
  if (
    f &&
    ((f.background !== undefined && !/^#[0-9a-f]{6}$/i.test(f.background)) ||
      (f.fontWeight !== undefined && (!finite(f.fontWeight, 100, 900) || !Number.isInteger(f.fontWeight))) ||
      (f.baselineOffsetY !== undefined && !finite(f.baselineOffsetY, -200, 200)) ||
      (f.highlight !== undefined && !/^#[0-9a-f]{6}$/i.test(f.highlight)) ||
      [f.strike, f.autoHeight].some(v => v !== undefined && typeof v !== 'boolean'))
  )
    throw new Error('Invalid text formatting.');
  if (
    i.type === 'pen' &&
    i.data !== undefined &&
    (!i.data || !['pen', 'marker', 'highlighter'].includes(i.data.style) || !finite(i.data.width, 1, 40))
  )
    throw new Error('Invalid drawing style.');
  if (
    i.type === 'frame' &&
    i.data !== undefined &&
    (!i.data ||
      Object.keys(i.data).some(k => k !== 'contentHidden') ||
      (i.data.contentHidden !== undefined && typeof i.data.contentHidden !== 'boolean'))
  )
    throw new Error('Invalid frame settings.');
  if (i.type === 'mindmap') validateMindStyle(i);
  validateWidget(i);
}

function validateRows(rows: RecordRow[]): void {
  for (const r of rows) {
    if (r.description !== undefined && (typeof r.description !== 'string' || r.description.length > 6000))
      throw new Error('Invalid record description.');
    if (r.milestone !== undefined && typeof r.milestone !== 'boolean') throw new Error('Invalid milestone.');
    if (
      r.dependsOn !== undefined &&
      (!Array.isArray(r.dependsOn) ||
        r.dependsOn.length > 100 ||
        r.dependsOn.some(d => typeof d !== 'string') ||
        new Set(r.dependsOn).size !== r.dependsOn.length)
    )
      throw new Error('Invalid dependencies.');
    if (
      r.tags !== undefined &&
      (!Array.isArray(r.tags) ||
        r.tags.length > 10 ||
        r.tags.some(t => typeof t !== 'string' || !t.trim() || t.length > 32))
    )
      throw new Error('Invalid record tags.');
    if (r.link !== undefined && (typeof r.link !== 'string' || normalizeNoteLink(r.link) !== r.link))
      throw new Error('Invalid record link.');
    if (r.points !== undefined && !finite(r.points, 0, 1000)) throw new Error('Invalid estimate.');
  }
  const error = recordsError(rows);
  if (error) throw new Error(`Invalid records: ${error}`);
}
