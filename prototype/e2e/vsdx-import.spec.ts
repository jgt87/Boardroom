// Decision Q18: a Visio (.vsdx) file opens as native shapes, text and connectors, from the Upload gallery or
// dropped on the canvas. The package is hand-written here; no real Visio file is used.
import { strToU8, zipSync } from 'fflate';
import { test, expect, seed, waitForSave, openTools } from './helpers';

const NS = 'xmlns="http://schemas.microsoft.com/office/visio/2012/main"';
const R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const cell = (n: string, v: string | number) => `<Cell N="${n}" V="${v}"/>`;
const box = (x: number, y: number) => cell('PinX', x) + cell('PinY', y) + cell('Width', 2) + cell('Height', 1);
const vsdx = Buffer.from(
  zipSync({
    'visio/masters/masters.xml': strToU8(
      `<Masters ${NS} ${R}><Master ID="1" NameU="Process"><Rel r:id="rId1"/></Master><Master ID="2" NameU="Decision"><Rel r:id="rId2"/></Master><Master ID="3" NameU="Dynamic connector"><Rel r:id="rId3"/></Master></Masters>`,
    ),
    'visio/masters/_rels/masters.xml.rels': strToU8(
      '<Relationships><Relationship Id="rId1" Target="master1.xml"/><Relationship Id="rId2" Target="master2.xml"/><Relationship Id="rId3" Target="master3.xml"/></Relationships>',
    ),
    'visio/masters/master1.xml': strToU8(`<MasterContents ${NS}><Shapes><Shape ID="1"/></Shapes></MasterContents>`),
    'visio/masters/master2.xml': strToU8(`<MasterContents ${NS}><Shapes><Shape ID="1"/></Shapes></MasterContents>`),
    'visio/masters/master3.xml': strToU8(
      `<MasterContents ${NS}><Shapes><Shape ID="1">${cell('BeginX', 0)}${cell('BeginY', 0)}${cell('EndX', 1)}${cell('EndY', 0)}</Shape></Shapes></MasterContents>`,
    ),
    'visio/pages/pages.xml': strToU8(
      `<Pages ${NS} ${R}><Page ID="0" Name="Overview"><PageSheet>${cell('PageWidth', 8.5)}${cell('PageHeight', 11)}</PageSheet><Rel r:id="rId1"/></Page></Pages>`,
    ),
    'visio/pages/_rels/pages.xml.rels': strToU8(
      '<Relationships><Relationship Id="rId1" Target="page1.xml"/></Relationships>',
    ),
    'visio/pages/page1.xml': strToU8(
      `<PageContents ${NS}><Shapes>` +
        `<Shape ID="1" Master="1">${box(2, 10)}${cell('FillForegnd', '#dae8fc')}<Text>Collect</Text></Shape>` +
        `<Shape ID="2" Master="2">${box(5, 10)}<Text>Valid?</Text></Shape>` +
        `<Shape ID="3" Master="3">${cell('BeginX', 3)}${cell('BeginY', 10)}${cell('EndX', 4)}${cell('EndY', 10)}</Shape>` +
        `<Shape ID="4" Type="Foreign"><ForeignData ForeignType="Bitmap"/></Shape>` +
        `</Shapes><Connects><Connect FromSheet="3" FromCell="BeginX" ToSheet="1"/><Connect FromSheet="3" FromCell="EndX" ToSheet="2"/></Connects></PageContents>`,
    ),
  }),
);
type Saved = { items: { id: string; type: string; text: string; from?: string; to?: string }[] };
const imported = (b: Saved) => {
  const shape = b.items.find(i => i.text === 'Collect'),
    decision = b.items.find(i => i.text === 'Valid?'),
    line = b.items.find(i => i.type === 'arrow');
  return (
    b.items.some(i => i.type === 'frame' && i.text === 'Overview') &&
    shape?.type === 'rectangle' &&
    decision?.type === 'diamond' &&
    line?.from === shape.id &&
    line.to === decision.id
  );
};

test('Visio as shapes imports a .vsdx file from the upload gallery as one undo step', async ({ page }) => {
  await seed(page, `return {version:1,title:'Visio',items:[]};`);
  await openTools(page, 'Media');
  await page
    .locator('.gallery-items')
    .getByRole('button', { name: /^Upload/ })
    .click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page
      .locator('.gallery-items')
      .getByRole('button', { name: /^Visio as shapes/ })
      .click(),
  ]);
  await chooser.setFiles({ name: 'flow.vsdx', mimeType: 'application/vnd.ms-visio.drawing', buffer: vsdx });
  await waitForSave(page, b => b.items.length === 4 && imported(b), 'imported Visio shapes');
  await expect(
    page.getByRole('status').filter({ hasText: 'Imported 2 shapes and 1 connector from 1 page' }),
  ).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Left out: 1 picture or embedded object.' })).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await waitForSave(page, b => b.items.length === 0, 'undo import');
});

test('a .vsdx file dropped on the canvas becomes native shapes at the drop point', async ({ page }) => {
  await seed(page, `return {version:1,title:'Visio drop',items:[]};`);
  await page.locator('svg.canvas').dispatchEvent('drop', {
    dataTransfer: await page.evaluateHandle(
      bytes => {
        const d = new DataTransfer();
        d.items.add(new File([new Uint8Array(bytes)], 'Dropped.vsdx', { type: '' }));
        return d;
      },
      [...vsdx],
    ),
    clientX: 600,
    clientY: 400,
  });
  await waitForSave(page, b => b.items.length === 4 && imported(b), 'dropped Visio shapes');
  // A broken file reports a readable error and adds nothing.
  await page.locator('svg.canvas').dispatchEvent('drop', {
    dataTransfer: await page.evaluateHandle(() => {
      const d = new DataTransfer();
      d.items.add(new File(['not a drawing'], 'Broken.vsdx'));
      return d;
    }),
  });
  await expect(page.getByRole('alert').filter({ hasText: 'not a Visio (.vsdx) drawing' })).toBeVisible();
});
