// The REST export script, against a local mock API (no real network calls).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import { importWhiteboardRest } from '../src/whiteboard-import.ts';

const scriptUrl = new URL('../scripts/export-whiteboard.mjs', import.meta.url);
const TOKEN = 'secret-token-123';

type Mock = { url: string; requests: { path: string; auth?: string }[]; close: () => Promise<void> };
async function mockApi(options: { status?: number } = {}): Promise<Mock> {
  const requests: Mock['requests'] = [];
  let limited = false;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url!, 'http://x');
    requests.push({ path: url.pathname + url.search, auth: req.headers.authorization });
    const send = (body: unknown, status = 200, headers: Record<string, string> = {}) => {
      res.writeHead(status, { 'content-type': 'application/json', ...headers });
      res.end(JSON.stringify(body));
    };
    if (url.pathname === '/files/dot.png') {
      res.writeHead(200, { 'content-type': 'image/png' });
      res.end(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      return;
    }
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return send({ message: 'Unauthorized' }, 401);
    if (options.status) return send({ message: 'nope' }, options.status);
    const base = '/v2/boards/b%3D1';
    if (url.pathname === base) return send({ id: 'b=1', name: 'Mock board', description: 'From the mock' });
    if (url.pathname === `${base}/items`) {
      assert.equal(url.searchParams.get('limit'), '50');
      if (!limited) {
        // The first items request is rate limited once.
        limited = true;
        return send({ message: 'Too many requests' }, 429, { 'retry-after': '0' });
      }
      if (!url.searchParams.get('cursor'))
        return send({
          data: [
            {
              id: 'n1',
              type: 'sticky_note',
              data: { content: '<p>One</p>' },
              position: { x: 0, y: 0, origin: 'center' },
            },
            {
              id: 'i1',
              type: 'image',
              data: { imageUrl: `${'http://' + req.headers.host}${base}/resources/images/i1?format=preview` },
              position: { x: 300, y: 0, origin: 'center' },
              geometry: { width: 40, height: 40 },
            },
          ],
          total: 3,
          size: 2,
          limit: 50,
          cursor: 'page2',
        });
      assert.equal(url.searchParams.get('cursor'), 'page2');
      return send({
        data: [
          { id: 'n2', type: 'sticky_note', data: { content: 'Two' }, position: { x: 400, y: 0, origin: 'center' } },
          {
            id: 'd1',
            type: 'doc_format',
            position: { x: 0, y: 500, origin: 'center' },
            geometry: { width: 300, height: 400 },
          },
        ],
        total: 4,
        size: 2,
        limit: 50,
      });
    }
    if (url.pathname === `${base}/connectors`)
      return send({
        data: [{ id: 'c1', startItem: { id: 'n1' }, endItem: { id: 'n2' }, shape: 'straight' }],
        limit: 50,
      });
    if (url.pathname === `${base}/groups`)
      return send({ data: [{ id: 'g1', type: 'group', data: { items: ['n1', 'n2'] } }] });
    if (url.pathname === `${base}/tags`)
      return send({
        data: [{ id: 't1', title: 'Idea', fillColor: 'yellow', type: 'tag' }],
        total: 1,
        offset: 0,
        limit: 50,
      });
    if (url.pathname === `${base}/items/n1/tags`) return send({ tags: [{ id: 't1', title: 'Idea' }] });
    if (url.pathname === `${base}/items/n2/tags`) return send({ tags: [] });
    if (url.pathname === `${base}/resources/images/i1`)
      return send({ url: `http://${req.headers.host}/files/dot.png`, type: 'image' });
    send({ message: 'not found' }, 404);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  };
}
function run(args: string[], env: Record<string, string>): Promise<{ code: number; out: string }> {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [fileURLToPath(scriptUrl), ...args], {
      env: { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '', ...env },
    });
    let out = '';
    child.stdout.on('data', d => (out += d));
    child.stderr.on('data', d => (out += d));
    child.on('close', code => resolve({ code: code ?? -1, out }));
  });
}

test('exports board, all item pages, connectors, tags and images; retries 429; keeps the token secret', async () => {
  const api = await mockApi();
  const dir = await mkdtemp(path.join(tmpdir(), 'wb-export-'));
  try {
    const file = path.join(dir, 'out.json');
    const r = await run(['b=1', file, '--images'], { WHITEBOARD_TOKEN: TOKEN, WHITEBOARD_API: api.url });
    assert.equal(r.code, 0, r.out);
    assert.ok(!r.out.includes(TOKEN), 'token printed');
    assert.match(r.out, /Rate limited/);
    const json = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(json.format, 'whiteboard-rest-v2');
    assert.equal(json.board.name, 'Mock board');
    assert.deepEqual(
      json.items.map((i: { id: string }) => i.id),
      ['n1', 'i1', 'n2', 'd1'],
    );
    assert.equal(json.groups.length, 1);
    // The experimental mind map endpoint is missing on the mock: an empty list, not a failure.
    assert.deepEqual(json.mindmapNodes, []);
    assert.match(r.out, /out\.recreate\.json: 1 objects came without content/);
    const template = JSON.parse(await readFile(path.join(dir, 'out.recreate.json'), 'utf8'));
    assert.deepEqual(
      template.entries.map((e: { sourceId: string; content: unknown }) => [e.sourceId, e.content]),
      [['d1', null]],
    );
    assert.equal(json.connectors.length, 1);
    assert.deepEqual(json.itemTags, { n1: ['t1'] });
    assert.match(json.items[1].data.imageDataUrl, /^data:image\/png;base64,/);
    // The pre-signed file download is fetched without the token.
    assert.equal(api.requests.find(q => q.path === '/files/dot.png')?.auth, undefined);
    // The export imports as a board with the notes, the tag, the image and the connector.
    const { board, assets } = importWhiteboardRest(json);
    assert.equal(board.title, 'Mock board');
    assert.deepEqual(
      board.items.map(i => i.type),
      ['note', 'image', 'note', 'rectangle', 'arrow'],
    );
    assert.equal(board.items[0].group, board.items[2].group);
    assert.ok(board.items[0].group);
    assert.equal(board.items[3].name, 'Doc placeholder');
    assert.deepEqual(board.items[0].tags, ['Idea']);
    assert.equal(Object.keys(assets).length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
    await api.close();
  }
});

test('clear messages for a refused token, a forbidden or missing board, and a token on the command line', async () => {
  for (const [status, message] of [
    [401, /refused the token \(401/],
    [403, /403 Forbidden\). It needs the boards:read scope/],
    [404, /not found \(404\)\. Check the board id/],
  ] as const) {
    const api = await mockApi({ status });
    try {
      const r = await run(['b=1', path.join(tmpdir(), 'never-written.json')], {
        WHITEBOARD_TOKEN: TOKEN,
        WHITEBOARD_API: api.url,
      });
      assert.equal(r.code, 1);
      assert.match(r.out, message);
      assert.ok(!r.out.includes(TOKEN));
    } finally {
      await api.close();
    }
  }
  const noToken = await run(['b=1'], {});
  assert.equal(noToken.code, 2);
  assert.match(noToken.out, /Set WHITEBOARD_TOKEN/);
  const argvToken = await run(['b=1', `--token=${TOKEN}`], {});
  assert.equal(argvToken.code, 2);
  assert.match(argvToken.out, /environment variable only/);
  assert.ok(!argvToken.out.includes(TOKEN));
});

test('Retry-After accepts seconds and HTTP dates', async () => {
  const { retryDelay } = await import(scriptUrl.href);
  assert.equal(retryDelay('3', 0), 3000);
  assert.equal(retryDelay(new Date(10_000).toUTCString(), 0, 4_000), 6000);
  assert.equal(retryDelay(null, 2), 4000);
  assert.equal(retryDelay('junk', 10), 60_000);
});
