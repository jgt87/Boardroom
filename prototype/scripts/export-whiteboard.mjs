#!/usr/bin/env node
// Export one board from another whiteboard service's public REST API (v2) to a JSON file that Boardroom can
// import as a new board ("Whiteboard JSON (REST export)"). Dependency-free; Node 18 or later (global fetch).
//
//   WHITEBOARD_TOKEN=... node scripts/export-whiteboard.mjs <boardId> [out.json] [--images] [--no-item-tags]
//
// The access token is read from the WHITEBOARD_TOKEN environment variable only; it is never accepted on the
// command line, never printed and only sent to the API host (WHITEBOARD_API, default below). See
// README-export-whiteboard.md.
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const DEFAULT_API = 'https://api.miro.com';
export const FORMAT = 'whiteboard-rest-v2';
export const RECREATE_FORMAT = 'boardroom-recreate-v1';
/** Item types the import maps with their content; every other type goes into the recreate template. */
export const MAPPED_TYPES = [
  'sticky_note',
  'shape',
  'text',
  'frame',
  'card',
  'app_card',
  'image',
  'embed',
  'preview',
  'document',
];
const PAGE_LIMIT = 50;
const MAX_PAGES = 5000;
const MAX_ATTEMPTS = 6;
const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const MAX_IMAGE_BYTES = 4_000_000;

export class ExportError extends Error {}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Wait before retrying: the Retry-After header (seconds or an HTTP date), else exponential backoff. */
export function retryDelay(header, attempt, now = Date.now()) {
  if (header != null && header !== '') {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 300_000);
    const at = Date.parse(header);
    if (Number.isFinite(at)) return Math.min(Math.max(0, at - now), 300_000);
  }
  return Math.min(1000 * 2 ** attempt, 60_000);
}

function statusError(status, what) {
  if (status === 401)
    return new ExportError(
      'The API refused the token (401 Unauthorized). Check WHITEBOARD_TOKEN: it may be expired, revoked or mistyped.',
    );
  if (status === 403)
    return new ExportError(
      `The token may not read ${what} (403 Forbidden). It needs the boards:read scope, and the token's user needs access to the board.`,
    );
  if (status === 404)
    return new ExportError(
      `${what[0].toUpperCase()}${what.slice(1)} was not found (404). Check the board id: it is the part of the board address after /board/.`,
    );
  return new ExportError(`The API answered ${status} for ${what}.`);
}

/**
 * GET a JSON resource from the API with the bearer token. Absolute URLs (pagination links) are only followed on
 * the API's own origin, so the token never goes anywhere else. Retries 429 and temporary server errors.
 */
export async function apiGet(ctx, pathOrUrl, what = 'the board', { allowMissing = false } = {}) {
  const url = new URL(pathOrUrl, ctx.api);
  if (url.origin !== new URL(ctx.api).origin) throw new ExportError('Refusing to send the token to another host.');
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await ctx.fetch(url, { headers: { Authorization: `Bearer ${ctx.token}`, Accept: 'application/json' } });
    } catch (err) {
      if (attempt + 1 >= MAX_ATTEMPTS) throw new ExportError(`Could not reach ${url.origin}: ${err?.message ?? err}`);
      await ctx.sleep(retryDelay(null, attempt));
      continue;
    }
    if (res.ok) return res.json();
    if ((res.status === 429 || res.status >= 500) && attempt + 1 < MAX_ATTEMPTS) {
      const wait = retryDelay(res.headers.get('retry-after'), attempt);
      ctx.log(
        res.status === 429
          ? `Rate limited; waiting ${Math.ceil(wait / 1000)} s before retrying.`
          : `Server error ${res.status}; retrying.`,
      );
      await res.body?.cancel?.().catch?.(() => {});
      await ctx.sleep(wait);
      continue;
    }
    if (allowMissing && (res.status === 404 || res.status === 400)) return null;
    throw statusError(res.status, what);
  }
}

/** Every entry of a cursor-paged collection (`cursor` or `links.next`), `limit` 50 per page. */
export async function getAllPages(ctx, path, what, { allowMissing = false } = {}) {
  const all = [];
  const seen = new Set();
  let next = `${path}${path.includes('?') ? '&' : '?'}limit=${PAGE_LIMIT}`;
  for (let page = 0; next && page < MAX_PAGES; page++) {
    const body = await apiGet(ctx, next, what, { allowMissing });
    if (body === null) break;
    const data = Array.isArray(body?.data) ? body.data : [];
    all.push(...data);
    ctx.log(`Fetched ${all.length}${Number.isFinite(body?.total) ? ` of ${body.total}` : ''} ${what}.`);
    const cursor = typeof body?.cursor === 'string' && body.cursor ? body.cursor : '';
    const link = typeof body?.links?.next === 'string' ? body.links.next : '';
    if (!data.length || (!cursor && !link)) break;
    if (cursor) {
      if (seen.has(cursor)) break;
      seen.add(cursor);
      next = `${path}${path.includes('?') ? '&' : '?'}limit=${PAGE_LIMIT}&cursor=${encodeURIComponent(cursor)}`;
    } else next = link;
  }
  return all;
}

/**
 * A collection the export can do without (groups, the experimental mind map nodes): a missing or refused
 * endpoint gives an empty list with a note. A refused token (401) still stops the export.
 */
async function optionalPages(ctx, path, what) {
  try {
    return await getAllPages(ctx, path, what, { allowMissing: true });
  } catch (err) {
    if (err instanceof ExportError && /401/.test(err.message)) throw err;
    ctx.log(`Could not read ${what}; continuing without them. (${err?.message ?? err})`);
    return [];
  }
}

/**
 * The recreate template: one entry per object the API returned without content, with its place and an empty
 * `content` to fill in (see README-export-whiteboard.md). Null when every object is mapped.
 */
export function recreateTemplate(result) {
  const nodesExported = result.mindmapNodes.length > 0;
  const entries = result.items
    .filter(i => i && !MAPPED_TYPES.includes(i.type) && !(nodesExported && i.type === 'mindmap_node'))
    .map(i => ({
      sourceId: i.id,
      type: i.type,
      position: i.position,
      geometry: i.geometry,
      ...(i.parent ? { parent: i.parent } : {}),
      content: null,
    }));
  if (!entries.length) return null;
  return {
    format: RECREATE_FORMAT,
    board: result.board,
    help: [
      'Fill "content" for the objects you want rebuilt; leave it null to keep a placeholder.',
      'Kinds: table, kanban, timeline ({ kind, title, csv } or { kind, title, csvFile } or rows),',
      'doc ({ kind, markdown }), mindmap ({ kind, nodes: [{ id, parent, text }] }),',
      'storymap ({ kind, activities, releases, cards: [{ title, activity, release }] }),',
      'note or text ({ kind, text }), image ({ kind, file }), items ({ kind, items: [Boardroom objects] }).',
      'Then run: node scripts/merge-recreate.mjs <export.json> <this file>',
    ],
    entries,
  };
}

/** Board tags (offset paged); null when the board has no tag endpoint. */
async function getBoardTags(ctx, boardPath) {
  const tags = [];
  for (let offset = 0; offset < 100_000;) {
    const body = await apiGet(ctx, `${boardPath}/tags?limit=${PAGE_LIMIT}&offset=${offset}`, 'the board tags', {
      allowMissing: true,
    });
    const data = Array.isArray(body?.data) ? body.data : [];
    tags.push(...data);
    if (data.length < PAGE_LIMIT || (Number.isFinite(body?.total) && tags.length >= body.total)) break;
    offset += data.length;
  }
  return tags;
}

/** Download one image's file as a data URL (preview format when the original is not a web image). */
async function imageDataUrl(ctx, imageUrl) {
  for (const format of ['original', 'preview']) {
    const resource = new URL(imageUrl, ctx.api);
    resource.searchParams.set('format', format);
    resource.searchParams.set('redirect', 'false');
    const meta = await apiGet(ctx, resource.href, 'an image');
    if (typeof meta?.url !== 'string') return null;
    // The download address is pre-signed: fetched without the token.
    const res = await ctx.fetch(meta.url);
    if (!res.ok) return null;
    const mime = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!IMAGE_MIMES.includes(mime)) {
      await res.body?.cancel?.().catch?.(() => {});
      continue;
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > MAX_IMAGE_BYTES) return null;
    return `data:${mime};base64,${bytes.toString('base64')}`;
  }
  return null;
}

/**
 * Fetch a whole board: its details, every item, every connector and (optionally) tags and image files.
 * `ctx` = { api, token, fetch, log, sleep }.
 */
export async function exportBoard(ctx, boardId, { images = false, itemTags = true } = {}) {
  if (!boardId) throw new ExportError('Give the board id.');
  const boardPath = `/v2/boards/${encodeURIComponent(boardId)}`;
  const board = await apiGet(ctx, boardPath, 'the board');
  const items = await getAllPages(ctx, `${boardPath}/items`, 'items');
  const connectors = await getAllPages(ctx, `${boardPath}/connectors`, 'connectors');
  const tags = await getBoardTags(ctx, boardPath);
  const groups = await optionalPages(ctx, `${boardPath}/groups`, 'groups');
  const mindmapNodes = await optionalPages(
    ctx,
    `/v2-experimental/boards/${encodeURIComponent(boardId)}/mindmap_nodes`,
    'mind map nodes',
  );
  const byItem = {};
  if (itemTags && tags.length) {
    for (const item of items.filter(i => i?.type === 'sticky_note' || i?.type === 'card')) {
      const body = await apiGet(ctx, `${boardPath}/items/${encodeURIComponent(item.id)}/tags`, 'item tags', {
        allowMissing: true,
      });
      const ids = (Array.isArray(body?.tags) ? body.tags : []).map(t => t?.id).filter(Boolean);
      if (ids.length) byItem[item.id] = ids;
    }
  }
  let failedImages = 0;
  if (images)
    for (const item of items.filter(i => i?.type === 'image' && typeof i.data?.imageUrl === 'string')) {
      try {
        const dataUrl = await imageDataUrl(ctx, item.data.imageUrl);
        if (dataUrl) item.data.imageDataUrl = dataUrl;
        else failedImages++;
      } catch (err) {
        if (err instanceof ExportError && /401|403/.test(err.message)) throw err;
        failedImages++;
      }
    }
  if (failedImages) ctx.log(`${failedImages} image file(s) could not be downloaded; they stay as links.`);
  return {
    format: FORMAT,
    board: { id: board?.id, name: board?.name, description: board?.description },
    items,
    connectors,
    groups,
    mindmapNodes,
    tags: tags.map(t => ({ id: t?.id, title: t?.title, fillColor: t?.fillColor })),
    itemTags: byItem,
    exportedAt: new Date().toISOString(),
  };
}

const USAGE = `Usage: WHITEBOARD_TOKEN=<token> node scripts/export-whiteboard.mjs <boardId> [out.json] [--images] [--no-item-tags]

  --images        also download image files (embedded in the JSON, up to 4 MB each)
  --no-item-tags  skip the per-item tag requests (faster on boards with many sticky notes)

Environment: WHITEBOARD_TOKEN (required), WHITEBOARD_API (default ${DEFAULT_API}).`;

export async function main(argv = process.argv.slice(2), env = process.env) {
  const flags = new Set(argv.filter(a => a.startsWith('-')));
  const args = argv.filter(a => !a.startsWith('-'));
  if (flags.has('--help') || flags.has('-h')) {
    console.log(USAGE);
    return 0;
  }
  if ([...flags].some(f => /token/i.test(f))) {
    console.error('The token is read from the WHITEBOARD_TOKEN environment variable only, never from arguments.');
    return 2;
  }
  const unknown = [...flags].filter(f => !['--images', '--no-item-tags'].includes(f));
  if (unknown.length || !args.length || args.length > 2) {
    console.error(unknown.length ? `Unknown option ${unknown[0]}.\n\n${USAGE}` : USAGE);
    return 2;
  }
  const token = (env.WHITEBOARD_TOKEN ?? '').trim();
  if (!token) {
    console.error('Set WHITEBOARD_TOKEN to an access token with the boards:read scope.');
    return 2;
  }
  let api;
  try {
    api = new URL(env.WHITEBOARD_API || DEFAULT_API).origin;
  } catch {
    console.error('WHITEBOARD_API is not a valid address.');
    return 2;
  }
  const [boardId, outArg] = args;
  const out = outArg ?? `whiteboard-${boardId.replace(/[^\w-]+/g, '_').slice(0, 60)}.json`;
  const ctx = { api, token, fetch: globalThis.fetch, log: m => console.error(m), sleep };
  try {
    const result = await exportBoard(ctx, boardId, {
      images: flags.has('--images'),
      itemTags: !flags.has('--no-item-tags'),
    });
    await writeFile(out, JSON.stringify(result));
    console.error(
      `Wrote ${out}: ${result.items.length} items, ${result.connectors.length} connectors, ${result.groups.length} groups and ${result.mindmapNodes.length} mind map nodes. Import it in Boardroom with "Whiteboard JSON (REST export)".`,
    );
    const template = recreateTemplate(result);
    if (template) {
      const recreateOut = out.replace(/(\.json)?$/i, '.recreate.json');
      await writeFile(recreateOut, JSON.stringify(template, null, 2));
      console.error(
        `Wrote ${recreateOut}: ${template.entries.length} objects came without content and import as placeholders. Fill in that file and run scripts/merge-recreate.mjs to rebuild them.`,
      );
    }
    return 0;
  } catch (err) {
    console.error(err instanceof ExportError ? err.message : `Export failed: ${err?.message ?? err}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main();
