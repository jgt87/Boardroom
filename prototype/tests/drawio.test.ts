import { drawioEndpoint } from '../src/drawio-endpoint.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItem, newBoard, parseBoard, commit, undo } from '../src/model.ts';
import { withAssets, splitAssets } from '../src/images.ts';
import {
  EMPTY_DRAWIO,
  DRAWIO_URL,
  DRAWIO_ORIGIN,
  DRAWIO_XML_LIMIT,
  assertDrawioXml,
  assertDrawioPng,
  parseDrawioMessage,
  isDrawioSender,
  drawioFilename,
} from '../src/drawio.ts';

test('Draw.io creates a valid local widget and preserves its source through history and JSON', () => {
  const item = createItem('drawio', 120, 80);
  assert.equal(item.data?.xml, EMPTY_DRAWIO);
  const board = { ...newBoard(), items: [item] };
  assert.deepEqual(parseBoard(JSON.parse(JSON.stringify(board))), board);
  const edited = {
    ...board,
    items: [{ ...item, data: { xml: EMPTY_DRAWIO.replace('Page-1', 'Edited page') }, assetId: 'preview' }],
  };
  const history = commit({ past: [], current: board, future: [] }, edited);
  assert.deepEqual(undo(history).current, board);
  assert.equal(parseBoard(edited).items[0].assetId, 'preview');
  const backup = withAssets(edited, {
    preview: {
      mime: 'image/png',
      data: 'data:image/png;base64,iVBORw0KGgoAAAA=',
      width: 320,
      height: 160,
      name: 'Diagram.png',
    },
  });
  const imported = splitAssets(parseBoard(JSON.parse(JSON.stringify(backup))), {});
  assert.equal(imported.missing, 0);
  assert.equal(imported.assets.preview.width, 320);
  assert.equal(imported.board.items[0].data?.xml, edited.items[0].data.xml);
  assert.throws(() => parseBoard({ ...board, items: [{ ...item, data: { xml: '<html>not a diagram</html>' } }] }));
});
test('Draw.io source validation accepts compressed and uncompressed containers, rejects other documents and entities', () => {
  assert.doesNotThrow(() => assertDrawioXml(EMPTY_DRAWIO));
  assert.doesNotThrow(() => assertDrawioXml('<?xml version="1.0"?><mxGraphModel><root/></mxGraphModel>'));
  assert.doesNotThrow(() => assertDrawioXml('<mxfile><diagram>encodedCompressedData</diagram></mxfile>'));
  for (const xml of [
    '',
    null,
    '<svg></svg>',
    '<mxfile>',
    '<!DOCTYPE mxfile><mxfile></mxfile>',
    '<mxfile><!ENTITY x SYSTEM "file:///private"></mxfile>',
    '<mxfile>' + ' '.repeat(DRAWIO_XML_LIMIT) + '</mxfile>',
  ])
    assert.throws(() => assertDrawioXml(xml));
});
test('Only the exact editor window and origin may send bounded JSON protocol events', () => {
  const source = {};
  assert.equal(isDrawioSender(DRAWIO_ORIGIN, source, source), true);
  assert.equal(isDrawioSender('https://evil.example', source, source), false);
  assert.equal(isDrawioSender(DRAWIO_ORIGIN, {}, source), false);
  assert.equal(isDrawioSender(DRAWIO_ORIGIN, null, null), false);
  assert.equal(parseDrawioMessage('{"event":"init"}')?.event, 'init');
  assert.equal(parseDrawioMessage('{"event":"load","error":null}')?.event, 'load');
  assert.equal(parseDrawioMessage(JSON.stringify({ event: 'autosave', xml: EMPTY_DRAWIO }))?.xml, EMPTY_DRAWIO);
  for (const msg of [
    'not json',
    'null',
    '[]',
    '{"event":"openLink","href":"javascript:alert(1)"}',
    '{"event":"autosave","xml":"<html></html>"}',
    { event: 'init' },
  ])
    assert.equal(parseDrawioMessage(msg), null);
});
test('Previews are PNG-only and exported filenames are safe', () => {
  assert.doesNotThrow(() => assertDrawioPng('data:image/png;base64,iVBORw0KGgoAAAA='));
  for (const data of [
    'https://example.com/diagram.png',
    'data:image/svg+xml,<svg/>',
    'data:image/png;base64,hello',
    null,
  ])
    assert.throws(() => assertDrawioPng(data));
  assert.equal(drawioFilename('Team / API: flow'), 'Team _ API_ flow.drawio');
  assert.equal(drawioFilename(''), 'diagram.drawio');
  const url = new URL(DRAWIO_URL);
  assert.equal(url.origin, DRAWIO_ORIGIN);
  assert.equal(url.searchParams.get('proto'), 'json');
  assert.equal(url.searchParams.has('xml'), false, 'source is sent by message, never a URL');
});

test('Draw.io deployment endpoint preserves paths and restricts executable origins', () => {
  assert.deepEqual(drawioEndpoint('http://localhost:8080/draw/'), {
    url: 'http://localhost:8080/draw/',
    origin: 'http://localhost:8080',
  });
  assert.equal(drawioEndpoint().origin, 'https://embed.diagrams.net');
  for (const invalid of [
    'javascript:alert(1)',
    'http://example.com/',
    'https://user:password@example.com/',
    'https://example.com/?x=1',
    'https://example.com/#x',
  ])
    assert.throws(() => drawioEndpoint(invalid));
});
