// Shared helpers for the browser suite. Boards are seeded through the app's own model module
// (loaded by the dev server) so seeded documents always pass the app's validation.
import { test as base, expect, type Page, type Locator } from '@playwright/test';
import { readFile } from 'node:fs/promises';

export type BoardJson = {
  version: 1;
  title: string;
  items: any[];
  datasets?: Record<string, any[]>;
  [k: string]: unknown;
};
export const STORAGE_KEY = 'boardroom.document.v1';

/** Test fixture that fails the test on uncaught page errors. */
export const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', e => errors.push(String(e)));
      await use(errors);
      expect(errors, 'uncaught page errors').toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

export async function openApp(page: Page) {
  await page.goto('/');
  await expect(page.locator('svg.canvas')).toBeVisible();
}

/**
 * Seed a board. `body` is the body of an async function receiving `m` (the model module) and
 * `media` (the media specs module); it must return a board object.
 */
export async function seed(page: Page, body: string) {
  await openApp(page);
  // Compose the seeding function in Node: the page's Content Security Policy forbids eval.
  const fn = new Function(
    'arg',
    `return (async ({ key }) => {
      const m = await import('/src/model.ts');
      const media = await import('/src/specs-media.ts');
      const board = await (async (m, media) => { ${body} })(m, media);
      m.parseBoard(board);
      localStorage.setItem(key, JSON.stringify(board));
    })(arg);`,
  ) as (arg: { key: string }) => Promise<void>;
  await page.evaluate(fn, { key: STORAGE_KEY });
  await page.reload();
  await expect(page.locator('svg.canvas')).toBeVisible();
}

/** Saved board (the app saves 350 ms after a change). */
export async function savedBoard(page: Page): Promise<BoardJson> {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), STORAGE_KEY);
}
export async function waitForSave(
  page: Page,
  check: (b: BoardJson) => boolean,
  message = 'saved board',
  timeout = 8000,
) {
  await expect
    .poll(
      async () => {
        const b = await savedBoard(page);
        return !!b && check(b);
      },
      { message, timeout },
    )
    .toBe(true);
}

export const item = (page: Page, id: string): Locator => page.locator(`#objects [data-item="${id}"]`).first();
export async function center(locator: Locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error('element has no box');
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
/** Real mouse drag in small steps. */
export async function mouseDrag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps = 12,
  beforeUp?: () => Promise<void>,
) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 4, from.y + 4, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps });
  if (beforeUp) await beforeUp();
  await page.mouse.up();
}

export async function fit(page: Page) {
  await page.getByRole('button', { name: 'Fit to screen' }).click();
}
/** Select an object through the Layers panel (row whose label or type starts with `text`). */
export async function selectViaLayers(page: Page, match: string, by: 'name' | 'type' = 'name') {
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  const rows = page.locator('.layer-row');
  const row =
    by === 'name'
      ? rows.filter({ has: page.locator('.layer-name', { hasText: match }) }).first()
      : rows.filter({ has: page.locator(`.layer-name small:text-matches("^${match}", "i")`) }).first();
  await row.locator('.layer-name').click();
  await page.getByRole('button', { name: 'Close layers' }).click();
}
export async function openTools(page: Page, category?: string) {
  await page.getByRole('button', { name: 'Tools, media and integrations' }).click();
  if (category) await page.locator('nav[aria-label="Tool categories"] button', { hasText: category }).click();
}
export async function chooseTool(page: Page, label: string) {
  await page
    .locator('.gallery-items > button', { has: page.locator('strong', { hasText: new RegExp(`^${label}$`) }) })
    .click();
}

/** PNG bytes generated in the page. */
export async function pngBytes(page: Page, w = 120, h = 80, color = '#e5484d'): Promise<Buffer> {
  const b64 = await page.evaluate(
    ({ w, h, color }) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d')!;
      g.fillStyle = color;
      g.fillRect(0, 0, w, h);
      return c.toDataURL('image/png').split(',')[1];
    },
    { w, h, color },
  );
  return Buffer.from(b64, 'base64');
}
/** A short WebM recorded from a canvas in the page. */
export async function webmBytes(): Promise<Buffer> {
  // A deterministic VP8 clip avoids empty/corrupt MediaRecorder output when
  // headless Chrome throttles canvas capture. No external media is fetched.
  return readFile(new URL('./fixtures/clip.webm', import.meta.url));
}
/** Minimal valid PDF with `pages` pages, built byte-exactly (correct xref offsets). */
export function pdfBytes(pages = 2): Buffer {
  const objs: string[] = [];
  const kids = Array.from({ length: pages }, (_, i) => `${3 + i * 2} 0 R`).join(' ');
  objs.push('<< /Type /Catalog /Pages 2 0 R >>');
  objs.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages} >>`);
  for (let i = 0; i < pages; i++) {
    const content = `BT /F1 24 Tf 72 720 Td (Page ${i + 1}) Tj ET`;
    objs.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${4 + i * 2} 0 R /Resources << /Font << /F1 ${3 + pages * 2} 0 R >> >> >>`,
    );
    objs.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  }
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

export async function injectAxe(page: Page) {
  if (await page.evaluate(() => 'axe' in window)) return;
  // Same-origin script URL: the page's Content Security Policy blocks inline scripts.
  await page.addScriptTag({ url: '/node_modules/axe-core/axe.min.js' });
}
export async function axeViolations(page: Page) {
  await injectAxe(page);
  return page.evaluate(async () => {
    const r = await (window as any).axe.run(document, {
      resultTypes: ['violations'],
      rules: { region: { enabled: false } },
    });
    return r.violations.map((v: any) => ({
      id: v.id,
      impact: v.impact,
      targets: v.nodes.slice(0, 3).map((n: any) => n.target.join(' ')),
    }));
  });
}
/** Wait for React to flush and force a synchronous layout; returns elapsed ms since `start`. */
export async function settle(page: Page) {
  await page.evaluate(async () => {
    for (let i = 0; i < 3; i++) await new Promise(r => setTimeout(r, 0));
    void document.body.offsetHeight;
  });
}
