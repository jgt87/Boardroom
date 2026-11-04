import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { createItem, newBoard, parseBoard } from '../src/model.ts';
import type { Board, ImageAsset, Item } from '../src/model.ts';
import { encodeBundle, decodeBundle, isBundle } from '../src/media-bundle.ts';

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');
const asset = (mime: string, bytes: Uint8Array, name: string, w = 10, h = 10): ImageAsset => ({
  mime,
  data: `data:${mime};base64,${b64(bytes)}`,
  width: w,
  height: h,
  name,
});
const rand = (n: number) => {
  const out = new Uint8Array(n);
  let x = 12345;
  for (let i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) >>> 0;
    out[i] = x >>> 24;
  }
  return out;
};
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5]);
const media = (type: Item['type'], assetId: string) => ({ ...createItem(type, 0, 0), assetId });

test('round trip restores image, video and PDF bytes exactly and the board unchanged', () => {
  const assets = {
    img1: asset('image/png', png, 'a.png', 40, 20),
    vid1: asset('video/webm', rand(5000), 'clip.webm', 64, 48),
    pdf1: asset('application/pdf', strToU8('%PDF-1.4 fake'), 'doc.pdf', 320, 497),
    unused: asset('image/png', png, 'unused.png'),
  };
  const board: Board = {
    ...newBoard(),
    items: [media('image', 'img1'), media('video', 'vid1'), media('pdf', 'pdf1'), createItem('note', 0, 0)],
  };
  const bytes = encodeBundle(board, assets);
  assert.equal(isBundle(bytes), true);
  const out = decodeBundle(bytes);
  assert.deepEqual(Object.keys(out.assets).sort(), ['img1', 'pdf1', 'vid1']);
  for (const id of ['img1', 'vid1', 'pdf1']) assert.deepEqual(out.assets[id], assets[id as keyof typeof assets]);
  assert.deepEqual(out.missing, []);
  assert.deepEqual(out.board, JSON.parse(JSON.stringify(board)));
});
test('bundles are smaller than a base64 JSON backup for large binaries', () => {
  const big = asset('video/mp4', rand(1_000_000), 'big.mp4', 320, 240),
    board: Board = { ...newBoard(), items: [media('video', 'v')] };
  const bundle = encodeBundle(board, { v: big }),
    json = JSON.stringify({ ...board, assets: { v: big } });
  assert.ok(bundle.length < json.length * 0.8, `${bundle.length} vs ${json.length}`);
});
test('a board without assets round-trips and reports missing referenced media', () => {
  const board: Board = { ...newBoard(), items: [createItem('note', 0, 0)] },
    out = decodeBundle(encodeBundle(board, {}));
  assert.deepEqual(out.assets, {});
  assert.deepEqual(parseBoard(out.board), board);
  const withRef: Board = { ...newBoard(), items: [media('image', 'gone')] };
  assert.deepEqual(decodeBundle(encodeBundle(withRef, {})).missing, ['gone']);
});
const manifest = (assets: Record<string, unknown> = {}) =>
  strToU8(JSON.stringify({ format: 'boardroom-bundle', version: 1, assets }));
const boardJson = strToU8(JSON.stringify(newBoard()));
test('rejects traversal names, unexpected entries, bad mime types, oversized files and a missing manifest', () => {
  assert.throws(
    () => decodeBundle(zipSync({ 'manifest.json': manifest(), 'board.json': boardJson, '../evil.js': strToU8('x') })),
    /Unexpected file/,
  );
  assert.throws(
    () => decodeBundle(zipSync({ 'manifest.json': manifest(), 'board.json': boardJson, 'media/../x.png': png })),
    /Unexpected file/,
  );
  assert.throws(
    () => decodeBundle(zipSync({ 'manifest.json': manifest(), 'board.json': boardJson, 'notes.txt': strToU8('x') })),
    /Unexpected file/,
  );
  assert.throws(
    () =>
      decodeBundle(
        zipSync({
          'manifest.json': manifest({
            a: { mime: 'image/tiff', width: 1, height: 1, name: 'x', file: 'media/a.tif' },
          }),
          'board.json': boardJson,
        }),
      ),
    /Unsupported media type/,
  );
  assert.throws(
    () =>
      decodeBundle(
        zipSync({
          'manifest.json': manifest({ a: { mime: 'text/html', width: 1, height: 1, name: 'x', file: 'media/a.png' } }),
          'board.json': boardJson,
          'media/a.png': png,
        }),
      ),
    /Unsupported media type/,
  );
  assert.throws(
    () =>
      decodeBundle(
        zipSync({
          'manifest.json': manifest({ a: { mime: 'image/png', width: 1, height: 1, name: 'x', file: 'media/a.png' } }),
          'board.json': boardJson,
          'media/a.png': [rand(4_100_000), { level: 0 }],
        }),
      ),
    /larger than allowed/,
  );
  assert.throws(
    () =>
      decodeBundle(
        zipSync({
          'manifest.json': manifest({ v: { mime: 'video/mp4', width: 1, height: 1, name: 'x', file: 'media/v.mp4' } }),
          'board.json': boardJson,
          'media/v.mp4': [new Uint8Array(26_000_000), { level: 9 }],
        }),
      ),
    /too large/,
  );
  assert.throws(() => decodeBundle(zipSync({ 'board.json': boardJson })), /no manifest/);
  assert.throws(
    () =>
      decodeBundle(
        zipSync({
          'manifest.json': strToU8(JSON.stringify({ format: 'other', version: 1, assets: {} })),
          'board.json': boardJson,
        }),
      ),
    /Unsupported bundle format/,
  );
  assert.throws(
    () => decodeBundle(zipSync({ 'manifest.json': manifest(), 'board.json': boardJson, 'media/stray.png': png })),
    /Unexpected file/,
  );
  assert.throws(() => decodeBundle(new Uint8Array([1, 2, 3, 4])), /not a board bundle/);
  assert.equal(isBundle(strToU8('{"version":1}')), false);
});
