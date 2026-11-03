// Warm-up: load the lazily imported libraries once so the dev server finishes optimising them
// (which can trigger a full page reload) before any test runs.
import { chromium, type FullConfig } from '@playwright/test';
import { pdfBytes } from './helpers';

export default async function globalSetup(config: FullConfig) {
  const baseURL = String(config.projects[0].use.baseURL);
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage();
  await page.goto(baseURL);
  await page.waitForSelector('svg.canvas');
  const pdf = pdfBytes(1).toString('base64');
  await page.evaluate(async b64 => {
    const tasks: Promise<unknown>[] = [];
    const media = await import('/src/widgets-media.tsx' as string);
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const loader = media.mediaViews.find((v: { kind: string }) => v.kind === 'pdf');
    tasks.push(loader.fromFile.load(new File([bytes], 'warm.pdf', { type: 'application/pdf' })).catch(() => null));
    tasks.push(import('/src/media-bundle.ts' as string).catch(() => null));
    await Promise.all(tasks);
  }, pdf);
  // Mermaid and the icon set load when such objects render.
  await page.evaluate(async () => {
    const m = await import('/src/model.ts' as string);
    const items = [{ ...m.createItem('mermaid', 0, 0), text: 'flowchart LR\n  A --> B' }, m.createItem('icon', 700, 0)];
    localStorage.setItem('boardroom.document.v1', JSON.stringify({ version: 1, title: 'Warm-up', items }));
  });
  await page.reload();
  await page.waitForSelector('.mermaid-preview svg', { timeout: 30_000 }).catch(() => null);
  await page.waitForTimeout(1500);
  await browser.close();
}
