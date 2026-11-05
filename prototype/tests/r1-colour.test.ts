// Track R1a: colour system. Base palette with shades, typed hex colours, palette keyboard steps and the
// last-used colour per object kind.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItem } from '../src/model.ts';
import { PALETTE, gridStep, paletteName, paletteRows, parseHexInput, shadeName } from '../src/color-palette.ts';
import { spokenColor } from '../src/access-tools.ts';
import { LAST_COLOR_KEY, colorFamily, createLastColorStore, parseLastColors } from '../src/last-color.ts';

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

test('the palette has ten hues in five shades, light to dark, all distinct and valid', () => {
  assert.equal(PALETTE.length, 10);
  const all = PALETTE.flatMap(h => h.shades);
  assert.equal(new Set(all).size, all.length);
  for (const hue of PALETTE) {
    assert.equal(hue.shades.length, 5, hue.name);
    for (const c of hue.shades) assert.match(c, /^#[0-9a-f]{6}$/);
    for (let i = 1; i < hue.shades.length; i++)
      assert.ok(luminance(hue.shades[i]) < luminance(hue.shades[i - 1]), `${hue.name} shade ${i} is darker`);
  }
});

test('palette rows group one shade of every hue, with spoken names', () => {
  const rows = paletteRows();
  assert.equal(rows.length, 5);
  for (const row of rows) assert.equal(row.length, 10);
  assert.deepEqual(
    rows.map(r => r.find(c => c.hex === PALETTE[6].shades[rows.indexOf(r)])?.name),
    ['Pale blue', 'Light blue', 'Blue', 'Dark blue', 'Deep blue'],
  );
  assert.equal(shadeName(PALETTE[0], 0), 'White');
  assert.equal(shadeName(PALETTE[0], 4), 'Black');
  assert.equal(paletteName('#B91C1C'), 'Dark red');
  assert.equal(paletteName('#123456'), null);
  // Screen readers hear palette names; older palette names still win.
  assert.equal(spokenColor('#b91c1c'), 'Dark red');
  assert.equal(spokenColor('#fff49b'), 'Light yellow');
});

test('hex entry accepts #rgb and #rrggbb and rejects anything else', () => {
  assert.deepEqual(parseHexInput('#4262FF'), { hex: '#4262ff' });
  assert.deepEqual(parseHexInput(' #48f '), { hex: '#4488ff' });
  assert.deepEqual(parseHexInput('abc'), { hex: '#aabbcc' });
  for (const bad of ['', '#', '#12', '#12345', '#1234567', '#ggg', 'red', 'rgb(1,2,3)'])
    assert.ok('error' in parseHexInput(bad), `rejects ${JSON.stringify(bad)}`);
});

test('arrow keys move through the palette grid and stop at its edges', () => {
  const at = { row: 1, col: 1 };
  assert.deepEqual(gridStep(5, 10, at, 'ArrowRight'), { row: 1, col: 2 });
  assert.deepEqual(gridStep(5, 10, at, 'ArrowLeft'), { row: 1, col: 0 });
  assert.deepEqual(gridStep(5, 10, at, 'ArrowUp'), { row: 0, col: 1 });
  assert.deepEqual(gridStep(5, 10, at, 'ArrowDown'), { row: 2, col: 1 });
  assert.deepEqual(gridStep(5, 10, { row: 0, col: 0 }, 'ArrowUp'), { row: 0, col: 0 });
  assert.deepEqual(gridStep(5, 10, { row: 4, col: 9 }, 'ArrowRight'), { row: 4, col: 9 });
  assert.deepEqual(gridStep(5, 10, at, 'End'), { row: 1, col: 9 });
  assert.deepEqual(gridStep(5, 10, at, 'Home'), { row: 1, col: 0 });
  assert.equal(gridStep(5, 10, at, 'Enter'), null);
});

test('colour families: shapes, text and connectors; other kinds keep their own colours', () => {
  assert.equal(colorFamily('rectangle'), 'shape');
  assert.equal(colorFamily('ellipse'), 'shape');
  assert.equal(colorFamily('text'), 'text');
  assert.equal(colorFamily('arrow'), 'connector');
  for (const kind of ['note', 'frame', 'pen', 'card', 'image']) assert.equal(colorFamily(kind), null);
});

const memoryStorage = () => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
};

test('the last-used colour per kind applies to new objects of that kind only', () => {
  const storage = memoryStorage(),
    store = createLastColorStore(() => storage);
  const plain = createItem('rectangle', 0, 0);
  assert.equal(store.apply(plain), plain, 'nothing remembered yet');
  store.remember('rectangle', '#F97316');
  store.remember('text', '#1d4ed8');
  store.remember('arrow', '#e5484d');
  store.remember('note', '#000000');
  store.remember('arrow', 'not a colour');
  assert.equal(store.apply(createItem('diamond', 0, 0)).fill, '#f97316');
  assert.equal(store.apply(createItem('text', 0, 0)).fill, '#1d4ed8');
  assert.equal(store.apply(createItem('arrow', 0, 0)).fill, '#e5484d');
  const note = createItem('note', 0, 0);
  assert.equal(store.apply(note).fill, note.fill);
  // Mirrored to session storage and read back by a fresh store.
  assert.deepEqual(JSON.parse(storage.data.get(LAST_COLOR_KEY)!), {
    shape: '#f97316',
    text: '#1d4ed8',
    connector: '#e5484d',
  });
  assert.equal(createLastColorStore(() => storage).get('connector'), '#e5484d');
});

test('the last-used store works without storage and ignores bad stored data', () => {
  const broken = {
    getItem: (): string | null => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
  };
  const store = createLastColorStore(() => broken);
  assert.equal(store.get('shape'), undefined);
  store.remember('rectangle', '#123456');
  assert.equal(store.get('shape'), '#123456', 'kept in memory');
  assert.equal(createLastColorStore(() => null).get('text'), undefined);
  assert.deepEqual(parseLastColors('{"shape":"#abc","text":5,"connector":"nope","x":"#000000"}'), { shape: '#aabbcc' });
  assert.deepEqual(parseLastColors('not json'), {});
  assert.deepEqual(parseLastColors(null), {});
});
