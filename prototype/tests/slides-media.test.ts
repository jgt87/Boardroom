// R4-Q2: Slides and presenting media — positioned slide elements, PDF and frame image slides, videos on slides
// and frames, PowerPoint pictures and layouts. Fixtures are generated here (tiny ZIPs and file headers).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, unzipSync, strToU8 } from 'fflate';
import { createItem, newBoard, parseBoard } from '../src/model.ts';
import type { Board, ImageAsset, Item } from '../src/model.ts';
import { newSlide } from '../src/specs-activities.ts';
import type { DeckData } from '../src/specs-activities.ts';
import { widgetSearchText } from '../src/widget-specs.ts';
import {
  validateSlideElements,
  deckAssetIds,
  remapDeckAssets,
  containBox,
  usesElements,
  elementText,
} from '../src/slide-elements.ts';
import {
  imageSize,
  imageSlide,
  imageDeck,
  pdfPagePlan,
  pdfSlidesNote,
  imageDeckFrames,
  frameVideos,
  boardVideos,
  addVideoElement,
  removeElement,
  setElementText,
  videoForAsset,
  rasterScale,
  PDF_SLIDES_MAX,
} from '../src/deck-media.ts';
import { referencedAssets, withAssets } from '../src/images.ts';
import { encodeBundle } from '../src/media-bundle.ts';
import { copySelection } from '../src/clipboard.ts';
import { parsePptx, parsePptxDeck, pptxImportNote, childElements, relTargets, slideFromXml } from '../src/pptx.ts';
import { slideSvg, elementsSvg } from '../src/deck-tools.ts';
import { setHiddenSlide } from '../src/navigation.ts';

const board = (...items: Item[]): Board => ({ ...newBoard(), items });
const roundTrip = (b: Board) => assert.deepEqual(parseBoard(JSON.parse(JSON.stringify(b))), b);
const pngHeader = (w: number, h: number) => {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  return b;
};
const asset = (mime = 'image/png'): ImageAsset => ({
  mime,
  data: `data:${mime};base64,AAAA`,
  width: 10,
  height: 10,
  name: 'x',
});
const deckItem = (data: DeckData, id = 'deck'): Item => ({ ...createItem('slides', 0, 0), id, data });

test('slide elements are optional, validated and round-trip; older decks load unchanged', () => {
  const old = deckItem({ slides: [newSlide('content')], current: 0 });
  roundTrip(board(old));
  const s = imageSlide('Page 1', { assetId: 'a1', width: 100, height: 200 });
  s.elements!.push({ id: 't1', kind: 'text', x: 0.1, y: 0.1, w: 0.5, h: 0.2, text: 'Hello', size: 4, bold: true });
  roundTrip(board(deckItem({ slides: [s], current: 0 })));
  assert.equal(usesElements(s), true);
  assert.equal(usesElements(newSlide('content')), false);
  assert.match(widgetSearchText(deckItem({ slides: [s], current: 0 })), /Hello/);
  assert.equal(elementText(s), 'Page 1\nHello');
  const ok = { id: 'e', kind: 'text', x: 0, y: 0, w: 1, h: 1, text: '' };
  validateSlideElements([ok]);
  for (const bad of [
    'nope',
    [{ ...ok, kind: 'shape' }],
    [{ ...ok, x: -0.1 }],
    [{ ...ok, w: 0 }],
    [{ ...ok, x: 0.5, w: 0.8 }],
    [{ ...ok, size: 50 }],
    [{ ...ok, color: 'red' }],
    [{ ...ok, align: 'justify' }],
    [{ ...ok, text: undefined }],
    [{ ...ok, assetId: 'a' }],
    [{ ...ok, kind: 'image', text: undefined }],
    [ok, ok],
    Array.from({ length: 61 }, (_, k) => ({ ...ok, id: `e${k}` })),
  ])
    assert.throws(() => validateSlideElements(bad), JSON.stringify(bad).slice(0, 60));
  assert.throws(() =>
    parseBoard(board(deckItem({ slides: [{ ...s, elements: [{ ...ok, kind: 'video' }] as never }], current: 0 }))),
  );
});

test('assets on slides are kept by pruning, backups, bundles and copy/paste', () => {
  const s = imageSlide('A', { assetId: 'pic', width: 4, height: 3 }),
    d = addVideoElement({ slides: [s], current: 0 }, s.id, { assetId: 'vid', text: 'Talktrack', alt: '' }),
    deck = deckItem(d),
    b = board(deck);
  assert.deepEqual(deckAssetIds(d), ['pic', 'vid']);
  assert.deepEqual(deckAssetIds({}), []);
  assert.deepEqual([...referencedAssets(b)].sort(), ['pic', 'vid']);
  const assets = { pic: asset(), vid: asset('video/mp4'), other: asset() };
  assert.deepEqual(Object.keys(withAssets(b, assets).assets!).sort(), ['pic', 'vid']);
  const files = Object.keys(unzipSync(encodeBundle(b, assets))).filter(f => f.startsWith('media/'));
  assert.equal(files.length, 2);
  assert.deepEqual(Object.keys(copySelection(b, ['deck'], assets)!.assets ?? {}).sort(), ['pic', 'vid']);
  const remapped = remapDeckAssets(d, id => `${id}-new`);
  assert.deepEqual(deckAssetIds(remapped), ['pic-new', 'vid-new']);
  assert.equal(remapDeckAssets({ slides: [newSlide()], current: 0 }, () => 'x').slides.length, 1);
});

test('pictures fit inside the 16:9 slide, centred, and picture sizes come from file headers', () => {
  const wide = containBox(16 / 9);
  assert.deepEqual(wide, { x: 0, y: 0, w: 1, h: 1 });
  const tall = containBox(9 / 16);
  assert.ok(Math.abs(tall.h - 1) < 1e-9 && Math.abs(tall.w * 16 - (9 / 16) * 9) < 1e-9);
  assert.ok(Math.abs(tall.x - (1 - tall.w) / 2) < 1e-9);
  const banner = containBox(4);
  assert.equal(banner.w, 1);
  assert.ok(banner.y > 0 && banner.h < 1);
  assert.deepEqual(imageSize(pngHeader(640, 480)), { width: 640, height: 480 });
  assert.deepEqual(imageSize(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 20, 0, 10, 0])), {
    width: 20,
    height: 10,
  });
  // JPEG: SOI, an APP0 segment, then SOF0 with height 300 and width 400.
  const jpeg = new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0x01, 0x2c, 0x01, 0x90, 3, 0, 0, 0, 0,
  ]);
  assert.deepEqual(imageSize(jpeg), { width: 400, height: 300 });
  const webp = new Uint8Array(30);
  webp.set(strToU8('RIFF'), 0);
  webp.set(strToU8('WEBPVP8X'), 8);
  webp.set([99, 0, 0, 49, 0, 0], 24);
  assert.deepEqual(imageSize(webp), { width: 100, height: 50 });
  assert.equal(imageSize(new Uint8Array([1, 2, 3])), null);
  assert.equal(rasterScale(3840, 2160), 0.5);
  assert.equal(rasterScale(100, 50), 2);
});

test('PDF pages are capped and the cap is reported', () => {
  assert.deepEqual(pdfPagePlan(3), { pages: 3, capped: 0 });
  assert.deepEqual(pdfPagePlan(120), { pages: PDF_SLIDES_MAX, capped: 120 - PDF_SLIDES_MAX });
  assert.match(pdfSlidesNote(50, 70, 1), /50 pages imported.*70 more were left out.*1 page could not be drawn/);
  assert.doesNotMatch(pdfSlidesNote(1, 0), /left out/);
  const deck = imageDeck([{ title: 'Page 1', image: { assetId: 'p1', width: 595, height: 842 } }]);
  assert.equal(deck.slides[0].layout, 'blank');
  assert.equal(deck.slides[0].elements![0].assetId, 'p1');
  roundTrip(board(deckItem(deck)));
  assert.equal(imageDeck([]).slides.length, 1);
});

test('image slides come from the selected frames, or every presented frame, in presentation order', () => {
  const f1 = { ...createItem('frame', 0, 0), id: 'f1', text: 'One' },
    f2 = { ...createItem('frame', 1000, 0), id: 'f2', text: 'Two' },
    f3 = { ...createItem('frame', 2000, 0), id: 'f3', text: 'Three' };
  let b: Board = { ...board(f1, f2, f3), presentation: ['f3', 'f1', 'f2'] };
  assert.deepEqual(
    imageDeckFrames(b, ['f2', 'f3']).frames.map(f => f.id),
    ['f3', 'f2'],
  );
  b = setHiddenSlide(b, 'f1', true);
  assert.deepEqual(
    imageDeckFrames(b, []).frames.map(f => f.id),
    ['f3', 'f2'],
  );
  // Hidden frames can still be chosen explicitly.
  assert.deepEqual(
    imageDeckFrames(b, ['f1']).frames.map(f => f.id),
    ['f1'],
  );
  assert.deepEqual(imageDeckFrames(board(), []).frames, []);
});

test('videos on a presented frame and on slides: found, placed, removed', () => {
  const frame = { ...createItem('frame', 0, 0), id: 'fr', w: 800, h: 600 },
    inside = { ...createItem('video', 100, 100), id: 'v1', assetId: 'a1', text: 'Talktrack 1' },
    outside = { ...createItem('video', 2000, 100), id: 'v2', assetId: 'a2' },
    note = { ...createItem('note', 50, 50), id: 'n' },
    b = board(frame, inside, outside, note);
  assert.deepEqual(
    frameVideos(b, frame).map(v => v.id),
    ['v1'],
  );
  assert.deepEqual(
    boardVideos(b).map(v => v.id),
    ['v1', 'v2'],
  );
  assert.equal(videoForAsset(b, 'a2')?.id, 'v2');
  const s = newSlide('content'),
    d = addVideoElement({ slides: [s], current: 0 }, s.id, inside),
    el = d.slides[0].elements![0];
  assert.equal(el.kind, 'video');
  assert.equal(el.alt, 'Talktrack 1');
  assert.ok(Math.abs((el.w * 16) / (el.h * 9) - 16 / 9) < 1e-9);
  validateSlideElements(d.slides[0].elements);
  assert.equal(addVideoElement(d, 'missing', inside), d);
  assert.equal(removeElement(d, s.id, el.id).slides[0].elements, undefined);
  const t = {
    slides: [{ ...s, elements: [{ id: 't', kind: 'text' as const, x: 0, y: 0, w: 1, h: 1, text: 'a' }] }],
    current: 0,
  };
  assert.equal(setElementText(t, s.id, 't', 'b').slides[0].elements![0].text, 'b');
});

// ---- PowerPoint pictures and layouts -------------------------------------------------------------------
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const xfrm = (x: number, y: number, cx: number, cy: number) =>
  `<a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>`;
const textShape = (ph: string, text: string, box = '', run = '<a:rPr lang="en"/>') =>
  `<p:sp><p:nvSpPr><p:cNvPr id="2" name="T"/><p:cNvSpPr/><p:nvPr>${ph}</p:nvPr></p:nvSpPr><p:spPr>${box}</p:spPr><p:txBody><a:bodyPr/><a:p><a:r>${run}<a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`;
const pic = (rid: string, box: string, descr = 'Chart') =>
  `<p:pic><p:nvPicPr><p:cNvPr id="4" name="Picture 3" descr="${descr}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}"/></p:blipFill><p:spPr>${box}</p:spPr></p:pic>`;
const tree = (...shapes: string[]) =>
  `<p:sld><p:cSld><p:spTree><p:nvGrpSpPr/><p:grpSpPr/>${shapes.join('')}</p:spTree></p:cSld></p:sld>`;
function laidOutPptx(cx = 12192000, cy = 6858000) {
  return zipSync({
    'ppt/presentation.xml': strToU8(
      `<p:presentation><p:sldIdLst><p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst><p:sldSz cx="${cx}" cy="${cy}"/></p:presentation>`,
    ),
    'ppt/_rels/presentation.xml.rels': strToU8(
      `<Relationships><Relationship Id="rId1" Type="${REL}/slide" Target="slides/slide1.xml"/><Relationship Id="rId2" Type="${REL}/slide" Target="slides/slide2.xml"/></Relationships>`,
    ),
    // Slide 1: a title inherited from the layout, a positioned text box, a picture, a picture in a group,
    // a picture of an unsupported type and a broken reference.
    'ppt/slides/slide1.xml': strToU8(
      tree(
        textShape('<p:ph type="title"/>', 'Results'),
        textShape(
          '',
          'Revenue up',
          xfrm(cx / 2, cy / 2, cx / 4, cy / 4),
          '<a:rPr lang="en" sz="2400" b="1"><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></a:rPr>',
        ),
        pic('rId3', xfrm(0, cy / 2, cx / 2, cy / 2)),
        `<p:grpSp><p:nvGrpSpPr/><p:grpSpPr><a:xfrm><a:off x="${cx / 2}" y="0"/><a:ext cx="${cx / 2}" cy="${cy / 2}"/><a:chOff x="0" y="0"/><a:chExt cx="${cx}" cy="${cy}"/></a:xfrm></p:grpSpPr>${pic('rId3', xfrm(0, 0, cx, cy), 'Logo')}</p:grpSp>`,
        pic('rId4', xfrm(0, 0, 10, 10)),
        pic('rId9', xfrm(0, 0, 10, 10)),
      ),
    ),
    'ppt/slides/_rels/slide1.xml.rels': strToU8(
      `<Relationships><Relationship Id="rId1" Type="${REL}/slideLayout" Target="../slideLayouts/slideLayout2.xml"/><Relationship Id="rId3" Type="${REL}/image" Target="../media/image1.png"/><Relationship Id="rId4" Type="${REL}/image" Target="../media/image2.emf"/></Relationships>`,
    ),
    // Slide 2: no positions anywhere, so the earlier title-and-text import applies.
    'ppt/slides/slide2.xml': strToU8(
      tree(textShape('<p:ph type="title"/>', 'Plain'), textShape('<p:ph idx="1"/>', 'Point')),
    ),
    'ppt/slideLayouts/slideLayout2.xml': strToU8(
      `<p:sldLayout><p:cSld><p:spTree>${textShape('<p:ph type="title"/>', '', xfrm(cx / 10, cy / 20, (cx * 8) / 10, cy / 5))}</p:spTree></p:cSld></p:sldLayout>`,
    ),
    'ppt/media/image1.png': pngHeader(320, 240),
    'ppt/media/image2.emf': new Uint8Array(40),
  });
}

test('PowerPoint pictures become image assets and shapes keep their position and size', () => {
  const deck = parsePptxDeck(laidOutPptx()),
    [first, second] = deck.slides;
  assert.equal(first.layout, 'blank');
  assert.equal(first.title, 'Results');
  const els = first.elements!;
  assert.deepEqual(
    els.map(e => [e.kind, e.text ?? e.alt]),
    [
      ['text', 'Results'],
      ['text', 'Revenue up'],
      ['image', 'Chart'],
      ['image', 'Logo'],
    ],
  );
  assert.deepEqual([els[0].x, els[0].y, els[0].w, els[0].h], [0.1, 0.05, 0.8, 0.2]);
  assert.deepEqual([els[1].x, els[1].y, els[1].w, els[1].h], [0.5, 0.5, 0.25, 0.25]);
  assert.equal(els[1].bold, true);
  assert.equal(els[1].color, '#ff0000');
  // 24 pt on a 960 pt wide slide is 2.5 % of the width.
  assert.equal(els[1].size, 2.5);
  assert.deepEqual([els[3].x, els[3].y, els[3].w, els[3].h], [0.5, 0, 0.5, 0.5]);
  // One stored picture for both uses; the EMF and the broken link are left out.
  assert.equal(els[2].assetId, els[3].assetId);
  assert.deepEqual(Object.keys(deck.assets), [els[2].assetId]);
  assert.deepEqual(
    [deck.assets[els[2].assetId!].width, deck.assets[els[2].assetId!].height, deck.assets[els[2].assetId!].mime],
    [320, 240, 'image/png'],
  );
  assert.equal(deck.skippedImages, 1);
  assert.deepEqual(
    [second.layout, second.title, second.body, second.elements],
    ['content', 'Plain', 'Point', undefined],
  );
  roundTrip(board(deckItem({ slides: deck.slides, current: 0 })));
  assert.match(
    pptxImportNote(deck),
    /2 slides imported\. 1 keeps the PowerPoint layout\. 1 picture imported\. 1 picture was left out/,
  );
  assert.equal(parsePptx(laidOutPptx()).length, 2);
});

test('4:3 PowerPoint slides are centred in the 16:9 slide without stretching', () => {
  const deck = parsePptxDeck(laidOutPptx(9144000, 6858000)),
    full = deck.slides[0].elements![2]; // picture covering the lower-left quarter
  // 4:3 into 16:9: the content is 0.75 of the width, starting at 0.125.
  assert.deepEqual([full.x, full.y, full.w, full.h], [0.125, 0.5, 0.375, 0.5]);
});

test('PowerPoint helpers: child elements, relationship paths and bare fragments', () => {
  assert.deepEqual(
    childElements('<a/><b x="1"><c/></b><d></d>').map(c => c.name),
    ['a', 'b', 'd'],
  );
  const rels = relTargets(
    `<Relationship Id="r1" Target="../media/a.png"/><Relationship Id="r2" Target="/ppt/media/b.png"/><Relationship Id="r3" TargetMode="External" Target="https://example.com/x.png"/>`,
    'ppt/slides/slide1.xml',
  );
  assert.deepEqual(
    [...rels],
    [
      ['r1', 'ppt/media/a.png'],
      ['r2', 'ppt/media/b.png'],
    ],
  );
  // Without a context, a shape's own position still counts (16:9 default size); a sliver is dropped.
  const s = slideFromXml(tree(textShape('<p:ph type="title"/>', 'T', xfrm(0, 0, 6096000, 3429000))));
  assert.equal(s.layout, 'blank');
  assert.deepEqual(
    s.elements?.map(e => [e.w, e.h]),
    [[0.5, 0.5]],
  );
  assert.equal(slideFromXml(tree(textShape('<p:ph type="title"/>', 'T', xfrm(0, 0, 100, 100)))).layout, 'content');
});

test('slide images draw positioned pictures and text', () => {
  const s = imageSlide('A', { assetId: 'pic', width: 16, height: 9 });
  s.elements!.push({ id: 't', kind: 'text', x: 0, y: 0, w: 1, h: 0.2, text: 'Big <title>', size: 5, align: 'center' });
  const svg = slideSvg(s, undefined, { pic: { mime: 'image/png', data: 'data:image/png;base64,AAAA' } });
  assert.match(svg, /<image [^>]*href="data:image\/png;base64,AAAA"/);
  assert.match(svg, /Big &lt;title&gt;/);
  assert.match(svg, /text-anchor="middle"/);
  // A missing or non-image asset draws a grey box, never a link.
  assert.doesNotMatch(
    elementsSvg(s, { pic: { mime: 'image/svg+xml', data: 'data:image/svg+xml;base64,AA' } }),
    /<image/,
  );
});
