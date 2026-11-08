// Formats and content gaps B3, B15, I1–I6: CSV and XLSX import into Table records, charts, Doc shortcuts,
// status chips, Doc PDF layout and .docx import, starter templates and selection templates.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { strToU8, zipSync } from 'fflate';
import { createItem, newBoard, parseBoard } from '../src/model.ts';
import type { Board, Item } from '../src/model.ts';
import {
  csvTable,
  importIntoDataset,
  importRecordTable,
  importTitle,
  inferFieldType,
  mapColumns,
  parseDate,
  parseNumber,
  tableFromImport,
  IMPORT_FIELDS_MAX,
  IMPORT_ROWS_MAX,
} from '../src/record-import.ts';
import { defaultSchema, schemaOf } from '../src/record-schema.ts';
import {
  columnIndex,
  dateStyles,
  docxMarkdown,
  parseDocx,
  parseXlsx,
  serialDate,
  sharedStrings,
  sheetRows,
} from '../src/office-import.ts';
import {
  barRects,
  chartFromGrid,
  chartFromRecords,
  chartScale,
  chartToGrid,
  defaultChart,
  linePoints,
  pieSlices,
  validateChart,
  CHART_LABELS_MAX,
  CHART_SERIES_MAX,
} from '../src/specs-charts.ts';
import type { ChartData } from '../src/specs-charts.ts';
import { docShortcut } from '../src/doc-tools.ts';
import { nextItemStatus, validateItemStatus, withItemStatus, boardStatuses } from '../src/board-settings.ts';
import { docBlocks, pdfFileName, pdfSafe, pdfUnicodeSafe } from '../src/doc-pdf.ts';
import { templateItems, templateNames } from '../src/board-tools.ts';
import { filterTemplates, templateCatalog, starterNames } from '../src/starter-templates.ts';
import {
  makeSelectionTemplate,
  selectionTemplateIds,
  selectionTemplateName,
  templatePayload,
} from '../src/user-templates.ts';
import { validateWidget } from '../src/widget-specs.ts';

let n = 0;
const ids = () => `id-${++n}`;
const board = (items: Item[], extra: Partial<Board> = {}): Board => ({ ...newBoard(), items, ...extra });

// ---- B3 CSV import ------------------------------------------------------------------------------------

test('header row maps to built-in record fields; the rest become custom fields', () => {
  const m = mapColumns([
    'Task',
    'State',
    'Owner',
    'Start date',
    'Due',
    'Story points',
    'Notes',
    'Labels',
    'URL',
    'Team',
  ]);
  assert.deepEqual(
    m.map(c => c.target),
    ['title', 'status', 'assignee', 'start', 'end', 'points', 'description', 'tags', 'link', { field: 'Team' }],
  );
  // Without a title column the first unmapped column is the title.
  assert.equal(mapColumns(['Status', 'Feature', 'Area'])[1].target, 'title');
});

test('cell values: numbers, dates and inferred field types', () => {
  assert.equal(parseNumber('12,5'), 12.5);
  assert.equal(parseNumber('-3e2'), -300);
  assert.equal(parseNumber('12 apples'), null);
  assert.equal(parseDate('2026-03-04T10:00:00Z'), '2026-03-04');
  assert.equal(parseDate('4.3.2026'), '2026-03-04');
  assert.equal(parseDate('2026-02-30'), null);
  assert.equal(parseDate('03/04/2026'), null, 'ambiguous day/month order is not guessed');
  assert.equal(inferFieldType(['1', '2.5', '']).type, 'number');
  assert.equal(inferFieldType(['2026-01-01', '2026-02-01']).type, 'date');
  assert.equal(inferFieldType(['yes', 'no', 'yes']).type, 'checkbox');
  assert.equal(inferFieldType(['https://a.example', 'www.b.example']).type, 'url');
  assert.deepEqual(inferFieldType(['Web', 'App', 'Web']), { type: 'select', options: ['Web', 'App'] });
  assert.equal(inferFieldType(['one', 'two', 'three']).type, 'text');
});

test('CSV rows become valid records with new statuses and typed custom fields', () => {
  const csv =
    String.fromCharCode(0xfeff) +
    'Title,Status,Assignee,Start,End,Points,Team,Budget,Done,Notes\r\n' +
    'Design,In progress,Ana,2026-01-05,2026-01-20,3,Web,1200,yes,"Quoted, with comma"\r\n' +
    'Build,Blocked,Ben,2026-01-21,not a date,5,App,900,no,\r\n' +
    'Ship,complete,,,,,Web,abc,yes,\r\n';
  const result = importRecordTable(csvTable(csv), defaultSchema, [], ids);
  assert.equal(result.rows.length, 3);
  assert.deepEqual(result.schema.statuses, ['Not started', 'In progress', 'Complete', 'Blocked']);
  assert.equal(result.rows[2].status, 'Complete', 'status matching ignores case');
  const team = result.schema.fields.find(f => f.name === 'Team')!,
    budget = result.schema.fields.find(f => f.name === 'Budget')!,
    done = result.schema.fields.find(f => f.name === 'Done')!;
  assert.equal(team.type, 'select');
  assert.equal(budget.type, 'text', 'one non-numeric value keeps the column as text');
  assert.equal(done.type, 'checkbox');
  assert.equal(result.rows[0].points, 3);
  assert.equal(result.rows[0].description, 'Quoted, with comma');
  assert.equal(result.rows[0].values?.[done.id], true);
  assert.equal(result.rows[1].end, '');
  assert.match(result.notes.join(' '), /1 value was left empty/);
  // Imported into a board, everything passes the loader's validation.
  const made = tableFromImport(board([]), csvTable(csv), importTitle('Plan_2026.csv'), { x: 0, y: 0 }, ids);
  assert.equal(made.item.text, 'Plan 2026');
  assert.equal(made.count, 3);
  parseBoard(JSON.parse(JSON.stringify(made.board)));
});

test('import into an existing table appends rows and reuses fields by name', () => {
  const first = tableFromImport(
    board([]),
    [
      ['Title', 'Size'],
      ['A', '1'],
    ],
    'T',
    { x: 0, y: 0 },
    ids,
  );
  const datasetId = first.item.datasetId!;
  const next = importIntoDataset(
    first.board,
    datasetId,
    [
      ['Name', 'size', 'Extra'],
      ['B', '2', 'x'],
      ['C', '3', 'y'],
    ],
    ids,
  );
  assert.equal(next.count, 2);
  const rows = next.board.datasets![datasetId],
    schema = schemaOf(next.board, datasetId);
  assert.deepEqual(
    rows.map(r => r.title),
    ['A', 'B', 'C'],
  );
  assert.deepEqual(
    schema.fields.map(f => f.name),
    ['Size', 'Extra'],
  );
  assert.equal(rows[2].values?.[schema.fields[0].id], 3);
  parseBoard(JSON.parse(JSON.stringify(next.board)));
});

test('row and column limits are enforced and reported', () => {
  const header = ['Title', ...Array.from({ length: 40 }, (_, k) => `F${k}`)],
    body = Array.from({ length: IMPORT_ROWS_MAX + 5 }, (_, r) => [`Row ${r}`, ...header.slice(1).map(() => 'v' + r)]);
  const result = importRecordTable([header, ...body], defaultSchema, [], ids);
  assert.equal(result.rows.length, IMPORT_ROWS_MAX);
  assert.equal(result.schema.fields.length, IMPORT_FIELDS_MAX);
  assert.match(result.notes.join(' '), /first 1000 rows/);
  assert.match(result.notes.join(' '), /10 columns were skipped/);
  assert.throws(() => importRecordTable([['Title']], defaultSchema), /header row and at least one row/);
  assert.throws(() => csvTable('a,b\u0000'), /does not contain CSV/);
});

// ---- B15 XLSX import ----------------------------------------------------------------------------------

function xlsxFixture(): Uint8Array {
  const xml = (s: string) => strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${s}`);
  return zipSync({
    '[Content_Types].xml': xml('<Types/>'),
    'xl/workbook.xml': xml(
      '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Tasks &amp; dates" sheetId="1" r:id="rId3"/></sheets></workbook>',
    ),
    'xl/_rels/workbook.xml.rels': xml(
      '<Relationships><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/data.xml"/></Relationships>',
    ),
    'xl/sharedStrings.xml': xml(
      '<sst><si><t>Title</t></si><si><t>Due</t></si><si><r><t>Write </t></r><r><t xml:space="preserve">spec</t></r></si><si><t>Owner</t></si><si><t>Ana &lt;PM&gt;</t></si></sst>',
    ),
    'xl/styles.xml': xml(
      '<styleSheet><numFmts><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/></cellXfs></styleSheet>',
    ),
    'xl/worksheets/data.xml': xml(
      '<worksheet><sheetData>' +
        '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>3</v></c><c r="D1" t="inlineStr"><is><t>Points</t></is></c><c r="E1" t="inlineStr"><is><t>Paid</t></is></c></row>' +
        '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" s="1"><v>46027</v></c><c r="C2" t="s"><v>4</v></c><c r="D2"><v>3</v></c><c r="E2" t="b"><v>1</v></c></row>' +
        '<row r="4"><c r="A4" t="str"><f>A2</f><v>Copy</v></c><c r="B4" s="2"><v>46028</v></c><c r="E4" t="b"><v>0</v></c></row>' +
        '</sheetData></worksheet>',
    ),
  });
}

test('XLSX parts: column letters, shared strings, date styles and serial dates', () => {
  assert.equal(columnIndex('A1'), 0);
  assert.equal(columnIndex('AB12'), 27);
  assert.deepEqual(sharedStrings('<sst><si><t>a</t></si><si/><si><r><t>b</t></r><rPh><t>x</t></rPh></si></sst>'), [
    'a',
    '',
    'b',
  ]);
  assert.deepEqual(
    dateStyles(
      '<numFmts><numFmt numFmtId="170" formatCode="0.00"/></numFmts><cellXfs><xf numFmtId="14"/><xf numFmtId="170"/></cellXfs>',
    ),
    [true, false],
  );
  assert.equal(serialDate(46027), '2026-01-05');
  assert.deepEqual(sheetRows('<row r="2"><c r="C2"><v>5</v></c></row>'), [['', '', '5']]);
});

test('XLSX file imports the first worksheet into Table records', () => {
  const { sheet, rows } = parseXlsx(xlsxFixture());
  assert.equal(sheet, 'Tasks & dates');
  assert.deepEqual(rows, [
    ['Title', 'Due', 'Owner', 'Points', 'Paid'],
    ['Write spec', '2026-01-05', 'Ana <PM>', '3', 'TRUE'],
    ['', '', '', '', ''],
    ['Copy', '2026-01-06', '', '', 'FALSE'],
  ]);
  const made = tableFromImport(board([]), rows, 'Sheet', { x: 0, y: 0 }, ids);
  const data = made.board.datasets![made.item.datasetId!];
  assert.equal(data.length, 2, 'blank rows are skipped');
  assert.equal(data[0].end, '2026-01-05');
  assert.equal(data[0].assignee, 'Ana <PM>');
  const paid = schemaOf(made.board, made.item.datasetId!).fields.find(f => f.name === 'Paid')!;
  assert.equal(paid.type, 'checkbox');
  assert.equal(data[1].values?.[paid.id], false);
  parseBoard(JSON.parse(JSON.stringify(made.board)));
  assert.throws(() => parseXlsx(strToU8('not a zip')), /not a readable Excel file/);
});

// ---- I4 Charts ----------------------------------------------------------------------------------------

test('chart data validation and grid round trip', () => {
  const d = defaultChart();
  validateChart(d);
  const chart = createItem('chart', 0, 0);
  validateWidget(chart);
  assert.equal(chart.text, 'Chart');
  parseBoard(board([chart]));
  const bad = (patch: Partial<ChartData>) => () => validateChart({ ...d, ...patch });
  assert.throws(bad({ chart: 'radar' as never }), /bar, line or pie/);
  assert.throws(bad({ labels: [] }), /categories/);
  assert.throws(bad({ series: [{ name: 'x', values: [1], color: '#000000' }] }), /one number per category/);
  assert.throws(bad({ series: [{ name: 'x', values: [1, 2, 3, Infinity], color: '#000000' }] }));
  assert.throws(() => parseBoard(board([{ ...chart, data: { ...d, legend: 'yes' } }])), /legend/);
  const round = chartFromGrid(chartToGrid(d), d);
  assert.deepEqual(round.data, d);
  assert.equal(round.truncated, false);
});

test('chart from pasted cells fills blanks with 0 and caps the size', () => {
  const made = chartFromGrid([
    ['', 'Sales'],
    ['Jan', '10'],
    ['Feb', ''],
    ['', 'x'],
  ]);
  assert.deepEqual(made.data.labels, ['Jan', 'Feb', 'Item 3']);
  assert.deepEqual(made.data.series[0].values, [10, 0, 0]);
  const wide = [
    ['', ...Array.from({ length: 12 }, (_, k) => `S${k}`)],
    ...Array.from({ length: 60 }, (_, r) => [`R${r}`, ...Array(12).fill('1')]),
  ];
  const big = chartFromGrid(wide);
  assert.equal(big.data.labels.length, CHART_LABELS_MAX);
  assert.equal(big.data.series.length, CHART_SERIES_MAX);
  assert.equal(big.truncated, true);
  assert.throws(() => chartFromGrid([['only header']]), /header row/);
});

test('chart geometry: scale, bars, line points and pie slices', () => {
  assert.deepEqual(chartScale(0, 23), { lo: 0, hi: 30, step: 10 });
  assert.deepEqual(chartScale(0, 9), { lo: 0, hi: 10, step: 2.5 });
  assert.equal(chartScale(-7, 3).lo, -7.5);
  const d: ChartData = {
    chart: 'bar',
    legend: false,
    labels: ['a', 'b'],
    series: [{ name: 's', values: [10, 5], color: '#4262ff' }],
  };
  const plot = { x: 0, y: 0, w: 200, h: 100 };
  const bars = barRects(d, plot);
  assert.equal(bars.length, 2);
  assert.equal(bars[0].h, 100);
  assert.equal(bars[1].h, 50);
  assert.ok(bars[1].x > bars[0].x + bars[0].w);
  const pts = linePoints(d, plot)[0];
  assert.deepEqual(pts, [
    { x: 50, y: 0 },
    { x: 150, y: 50 },
  ]);
  const slices = pieSlices(d, 50, 50, 40);
  assert.equal(slices.length, 2);
  assert.ok(Math.abs(slices[0].share - 2 / 3) < 1e-9);
  assert.ok(Math.abs(slices[1].end - Math.PI * 2) < 1e-9);
  assert.equal(pieSlices({ ...d, series: [{ ...d.series[0], values: [0, -1] }] }, 0, 0, 10).length, 0);
});

test('chart from a table column counts or totals records', () => {
  const made = tableFromImport(
    board([]),
    [
      ['Title', 'Status', 'Assignee', 'Points', 'Area'],
      ['a', 'In progress', 'Ana', '3', 'Web'],
      ['b', 'In progress', '', '2', 'Web'],
      ['c', 'Complete', 'Ana', '1', 'App'],
    ],
    'T',
    { x: 0, y: 0 },
    ids,
  );
  const rows = made.board.datasets![made.item.datasetId!],
    schema = schemaOf(made.board, made.item.datasetId!);
  const byStatus = chartFromRecords(rows, schema, 'status');
  assert.deepEqual(byStatus.labels, ['Not started', 'In progress', 'Complete']);
  assert.deepEqual(byStatus.series[0].values, [0, 2, 1]);
  const people = chartFromRecords(rows, schema, 'assignee');
  assert.deepEqual(
    people.labels.map((l, k) => `${l}=${people.series[0].values[k]}`),
    ['Ana=2', 'Unassigned=1'],
  );
  const points = chartFromRecords(rows, schema, 'points');
  assert.deepEqual(points.series[0].values, [0, 5, 1]);
  const area = schema.fields.find(f => f.name === 'Area')!;
  assert.deepEqual(chartFromRecords(rows, schema, area.id).labels, ['Web', 'App']);
  assert.throws(() => chartFromRecords(rows, schema, 'nope'), /Choose a column/);
});

// ---- I1 Doc shortcuts ---------------------------------------------------------------------------------

test('doc shortcuts: strikethrough, inline code, headings and paragraph', () => {
  const key = (
    key: string,
    mods: Partial<Record<'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey', boolean>>,
    code?: string,
  ) => docShortcut({ key, code, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });
  assert.deepEqual(key('X', { ctrlKey: true, shiftKey: true }, 'KeyX'), { kind: 'strike' });
  assert.deepEqual(key('e', { metaKey: true }, 'KeyE'), { kind: 'code' });
  assert.deepEqual(key('2', { ctrlKey: true, altKey: true }, 'Digit2'), { kind: 'block', block: 'h2' });
  // Layouts where Ctrl+Alt changes the key still match by physical key.
  assert.deepEqual(key('²', { ctrlKey: true, altKey: true }, 'Digit1'), { kind: 'block', block: 'h1' });
  assert.deepEqual(key('0', { ctrlKey: true, altKey: true }, 'Digit0'), { kind: 'block', block: 'p' });
  assert.equal(key('e', {}), null);
  assert.equal(key('x', { ctrlKey: true }), null, 'Ctrl+X stays cut');
  assert.equal(key('7', { ctrlKey: true, altKey: true }, 'Digit7'), null);
});

// ---- I3 Status chips ----------------------------------------------------------------------------------

test('status chips on Doc and Slides are validated and cycle through the board statuses', () => {
  assert.equal(nextItemStatus(undefined), 'draft');
  assert.equal(nextItemStatus('draft'), 'in-progress');
  assert.equal(nextItemStatus(boardStatuses[boardStatuses.length - 1].id), undefined);
  assert.deepEqual(withItemStatus({ markdown: 'x', status: 'draft' }, undefined), { markdown: 'x' });
  validateItemStatus({ status: 'review' });
  assert.throws(() => validateItemStatus({ status: 'shipped' }), /Invalid status/);
  for (const kind of ['doc', 'slides'] as const) {
    const item = createItem(kind, 0, 0);
    parseBoard(board([{ ...item, data: withItemStatus(item.data!, 'approved') }]));
    assert.throws(() => parseBoard(board([{ ...item, data: { ...item.data, status: 'nope' } }])), /Invalid status/);
  }
});

// ---- I2 Doc PDF and .docx import ----------------------------------------------------------------------

test('doc PDF layout blocks and safe text', () => {
  const blocks = docBlocks(
    '# Title\n\nSome **bold** and ++under++ text.\n\n- [x] Done\n- Item\n  1. Nested\n\n> [!TIP]\n> Keep it short\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n---\n\n```\ncode\n```',
  );
  assert.deepEqual(
    blocks.map(b => b.kind),
    ['heading', 'paragraph', 'item', 'item', 'item', 'quote', 'table', 'rule', 'code'],
  );
  assert.deepEqual(blocks[1], { kind: 'paragraph', text: 'Some bold and under text.' });
  assert.deepEqual(blocks[2], { kind: 'item', text: 'Done', depth: 0, marker: '[x]' });
  assert.deepEqual(blocks[4], { kind: 'item', text: 'Nested', depth: 1, marker: '1.' });
  assert.deepEqual(blocks[5], { kind: 'quote', text: 'Keep it short', label: 'Tip' });
  assert.deepEqual(blocks[6], {
    kind: 'table',
    rows: [
      ['A', 'B'],
      ['1', '2'],
    ],
  });
  assert.equal(pdfSafe('“Café” – done…'), '"Café" - done...');
  assert.equal(pdfSafe('日本'), '??');
  // With the embedded Unicode font (Q17): Greek, Cyrillic, Latin Extended and typographic marks stay; CJK and
  // emoji still become "?"; ballot boxes keep their plain stand-ins.
  assert.equal(pdfUnicodeSafe('Ζεύς Москва Łódź “ok” – € →'), 'Ζεύς Москва Łódź “ok” – € →');
  assert.equal(pdfUnicodeSafe('日本 🎉 ☐'), '?? ? [ ]');
  assert.equal(pdfFileName('Plan: Q1/Q2?'), 'Plan Q1 Q2.pdf');
  assert.equal(pdfFileName('  '), 'doc.pdf');
});

const docxXml = (body: string) =>
  `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr/></w:body></w:document>`;
const p = (text: string, props = '', runProps = '') =>
  `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ''}<w:r>${runProps ? `<w:rPr>${runProps}</w:rPr>` : ''}<w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

test('.docx document XML becomes Markdown headings, lists, emphasis and tables', () => {
  const md = docxMarkdown(
    docxXml(
      p('Report', '<w:pStyle w:val="Title"/>') +
        p('Intro', '<w:pStyle w:val="Heading2"/>') +
        '<w:p><w:r><w:t xml:space="preserve">Plain </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>bold</w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve"> text</w:t></w:r><w:r><w:rPr><w:i/><w:b w:val="0"/></w:rPr><w:t xml:space="preserve"> and *stars*</w:t></w:r></w:p>' +
        p('First', '<w:pStyle w:val="ListBullet"/>') +
        p('Second', '<w:numPr><w:ilvl w:val="1"/><w:numId w:val="1"/></w:numPr>') +
        p('Gone', '', '<w:strike/>') +
        '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>B|C</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>1</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' +
        '<w:p/>' +
        p('&lt;End&gt; &amp; out'),
    ),
  );
  assert.equal(
    md,
    [
      '# Report',
      '',
      '## Intro',
      '',
      'Plain **bold text** *and \\*stars\\**',
      '',
      '- First',
      '  - Second',
      '',
      '~~Gone~~',
      '',
      '| A | B\\|C |',
      '| --- | --- |',
      '| 1 |  |',
      '',
      '<End> & out',
    ].join('\n'),
  );
  const file = zipSync({ 'word/document.xml': strToU8(docxXml(p('Hello', '<w:pStyle w:val="Heading1"/>'))) });
  assert.deepEqual(parseDocx(file), { markdown: '# Hello', truncated: false });
  assert.throws(() => parseDocx(zipSync({ 'other.xml': strToU8('<x/>') })), /not a readable Word file/);
});

// ---- I5 Starter templates -----------------------------------------------------------------------------

test('every gallery template builds a valid board and is listed in the catalog', () => {
  assert.ok(templateNames.length >= 10);
  assert.deepEqual(
    templateCatalog.map(t => t.name),
    templateNames,
  );
  for (const name of starterNames) {
    const items = templateItems(name, { x: 100, y: 50 }, (t, x, y, f) => createItem(t, x, y, f));
    assert.ok(items.length >= 4, name);
    assert.equal(new Set(items.map(i => i.id)).size, items.length);
    parseBoard(JSON.parse(JSON.stringify(board(items))));
  }
});

test('template search matches names, categories, descriptions and keywords', () => {
  assert.deepEqual(
    filterTemplates('retro').map(t => t.name),
    ['Retrospective', 'Kanban retro'],
  );
  assert.deepEqual(
    filterTemplates('', 'Research').map(t => t.name),
    ['Customer journey'],
  );
  assert.deepEqual(
    filterTemplates('canvas strategy').map(t => t.name),
    ['Business model canvas', 'Lean canvas'],
  );
  assert.equal(filterTemplates('ux').length, 1);
  assert.equal(filterTemplates('zzz').length, 0);
  assert.equal(filterTemplates('').length, templateCatalog.length);
});

// ---- I6 Selection templates ---------------------------------------------------------------------------

test('a selected frame saves with its contents and internal connectors, without media', () => {
  const frame = { ...createItem('frame', 0, 0), id: 'f', text: 'Sprint board', w: 600, h: 400 };
  const a = { ...createItem('note', 20, 20), id: 'a', text: 'A' };
  const b = { ...createItem('rectangle', 300, 40), id: 'b', text: 'B' };
  const outside = { ...createItem('note', 900, 0), id: 'out' };
  const inner = { ...createItem('arrow', 0, 0), id: 'ab', from: 'a', to: 'b' };
  const leaving = { ...createItem('arrow', 0, 0), id: 'ax', from: 'a', to: 'out' };
  const photo = { ...createItem('image', 40, 200), id: 'img', assetId: 'asset-1', w: 100, h: 80 };
  const src = board([frame, a, b, outside, inner, leaving, photo]);
  assert.deepEqual(selectionTemplateIds(src, ['f']), ['f', 'a', 'b', 'ab']);
  assert.equal(selectionTemplateName(src, ['f']), 'Sprint board');
  assert.equal(selectionTemplateName({ ...src, title: 'Plan' }, ['a', 'b']), 'Plan selection');
  const t = makeSelectionTemplate(src, ['f'], 'Sprint board', 't1', new Date('2026-11-04T00:00:00Z'));
  assert.ok(!('error' in t));
  if ('error' in t) return;
  assert.equal(t.count, 4);
  const payload = templatePayload(t)!;
  assert.deepEqual(payload.items.map(i => i.id).sort(), ['a', 'ab', 'b', 'f']);
  const onlyMedia = makeSelectionTemplate(src, ['img'], 'x', 't2', new Date());
  assert.ok('error' in onlyMedia && /other than media/.test(onlyMedia.error));
});
