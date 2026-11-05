import { flushSync } from 'react-dom';
import { selectionBounds } from './interactions';
import { slideFrames } from './navigation';
import { recordsCsv } from './board-tools';
import { cardsCsv } from './card-tools';
import { boardTextCsv } from './csv';
import { exportLinks, standaloneHtml } from './html-export';
import { useApp } from './board-app';
import { sensitivityBadge, badgeInk, sensitivityStampBox } from './board-settings';
import { exportIds, frameExportRegion, FRAME_TITLE_OFFSET, FRAME_TITLE_SIZE, type Region } from './export-area';

/** SVG, PNG/JPG, PDF and CSV export of the board or selection. */
export function useExporters() {
  const { assets, boardRef, display, download, selected, selectedItem, setMenu, svg, setRenderAll } = useApp();
  /** SVG of a dragged area, of the selection only (gap b3-4), or of the whole board. */
  const exportSvg = (area?: Region) => {
    const only = area ? undefined : selectionOnly(),
      built = buildSvg(area ?? (only ? selectionRegion() : undefined), only);
    download(built.svg, 'boardroom.svg', 'image/svg+xml');
    if (area || only) setMenu(false);
  };
  /** Ids kept by a selection-only export, or undefined when nothing is selected. */
  const selectionOnly = () => {
    const ids = selected.filter(id => boardRef.current.items.some(i => i.id === id));
    return ids.length ? exportIds(boardRef.current.items, ids) : undefined;
  };
  /** Serialise the board (or a region) as standalone SVG. Large boards render every object first (gap A2). */
  const buildSvg = (region?: Region, only?: Set<string>) => {
    if (boardRef.current.items.length < 400) return buildRenderedSvg(region, only);
    flushSync(() => setRenderAll(true));
    try {
      return buildRenderedSvg(region, only);
    } finally {
      setRenderAll(false);
    }
  };
  /** Serialise what is currently rendered, with the page styles embedded. `only` keeps just those objects. */
  const buildRenderedSvg = (region?: Region, only?: Set<string>) => {
    const ns = 'http://www.w3.org/2000/svg',
      out = document.createElementNS(ns, 'svg');
    out.setAttribute('xmlns', ns);
    out.setAttribute('xmlns:xhtml', 'http://www.w3.org/1999/xhtml');
    const group = svg.current!.querySelector('#objects')!.cloneNode(true) as SVGGElement;
    group.removeAttribute('transform');
    group.querySelectorAll('.selection,.search-hit,.lock-badge,textarea,.object-editor').forEach(n => n.remove());
    // Frame titles are sized for the current zoom on screen; exports draw them at a fixed world size so
    // they fit the title band kept above each frame page.
    group.querySelectorAll('text.frame-title').forEach(t => {
      t.setAttribute('font-size', String(FRAME_TITLE_SIZE));
      t.setAttribute('y', String(-FRAME_TITLE_OFFSET));
    });
    out.append(group);
    const liveTexts = svg.current!.querySelectorAll<HTMLElement>('#objects .object-text');
    group.querySelectorAll<HTMLElement>('.object-text').forEach((node, index) => {
      const computed = getComputedStyle(liveTexts[index]);
      for (const key of [
        'display',
        'align-items',
        'justify-content',
        'text-align',
        'white-space',
        'overflow-wrap',
        'line-height',
        'font-family',
        'font-size',
        'font-weight',
        'color',
        'background',
        'padding',
        'border-radius',
        'height',
        'width',
        'overflow',
      ])
        node.style.setProperty(key, computed.getPropertyValue(key));
    });
    const liveCode = svg.current!.querySelectorAll<HTMLElement>('#objects .code-block, #objects .code-block *');
    group.querySelectorAll<HTMLElement>('.code-block, .code-block *').forEach((node, index) => {
      const computed = getComputedStyle(liveCode[index]);
      if (!computed) return;
      for (const key of [
        'display',
        'flex-direction',
        'gap',
        'font-family',
        'font-size',
        'line-height',
        'color',
        'background',
        'padding',
        'margin',
        'border-bottom',
        'border-radius',
        'height',
        'width',
        'overflow',
        'white-space',
        'overflow-wrap',
        'position',
        'min-height',
        'text-align',
        'font-style',
        'font-weight',
      ])
        node.style.setProperty(key, computed.getPropertyValue(key));
    });
    group.querySelectorAll('.link-badge,.vote-badge,.comment-pin,.gif-toggle').forEach(n => n.remove());
    // Selection-only export: drop every object outside the kept set (styles were copied above, by index).
    if (only)
      group.querySelectorAll('[data-item]').forEach(n => {
        if (only.has(n.getAttribute('data-item') ?? '')) return;
        const owner = n.parentElement?.closest('[data-item]');
        if (!owner || !only.has(owner.getAttribute('data-item') ?? '')) n.remove();
      });
    const b = (svg.current!.querySelector('#objects') as SVGGElement).getBBox(),
      box = region ?? { x: b.x - 30, y: b.y - 45, w: Math.max(200, b.width + 60), h: Math.max(200, b.height + 90) };
    out.setAttribute('viewBox', `${box.x} ${box.y} ${box.w} ${box.h}`);
    out.setAttribute('width', String(box.w));
    out.setAttribute('height', String(box.h));
    // Sensitivity label (track R2-K): stamped in the bottom-right corner of every SVG, PNG, PDF page and print.
    const badge = sensitivityBadge(boardRef.current.sensitivity);
    if (badge) {
      const at = sensitivityStampBox(box, badge.label),
        stamp = document.createElementNS(ns, 'g'),
        rect = document.createElementNS(ns, 'rect'),
        text = document.createElementNS(ns, 'text');
      stamp.setAttribute('class', 'sensitivity-stamp');
      rect.setAttribute('x', String(at.x));
      rect.setAttribute('y', String(at.y));
      rect.setAttribute('width', String(at.w));
      rect.setAttribute('height', String(at.h));
      rect.setAttribute('rx', String(at.h / 2));
      rect.setAttribute('fill', badge.color);
      text.setAttribute('x', String(at.x + at.w / 2));
      text.setAttribute('y', String(at.y + at.h / 2));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'central');
      text.setAttribute('font-family', 'Arial, Helvetica, sans-serif');
      text.setAttribute('font-weight', '600');
      text.setAttribute('font-size', String(at.font));
      text.setAttribute('fill', badgeInk(badge.color));
      text.textContent = badge.label;
      stamp.append(rect, text);
      out.append(stamp);
    }
    const css = [...document.styleSheets]
        .map(sheet => {
          try {
            return [...sheet.cssRules].map(r => r.cssText).join('\n');
          } catch {
            return '';
          }
        })
        .join('\n'),
      style = document.createElementNS(ns, 'style');
    style.textContent = css;
    const defs = svg.current!.querySelector('defs')!.cloneNode(true);
    out.prepend(defs);
    out.prepend(style);
    out.style.background = '#fff';
    return { svg: new XMLSerializer().serializeToString(out), box };
  };
  /** Rasterise SVG markup to a PNG/JPEG blob at `scale`. */
  const rasterize = (markup: string, box: { w: number; h: number }, type: 'image/png' | 'image/jpeg', scale = 2) =>
    new Promise<Blob>((resolve, reject) => {
      const img = new Image(),
        url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup),
        max = 16000,
        k = Math.min(scale, max / box.w, max / box.h);
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(box.w * k));
          c.height = Math.max(1, Math.round(box.h * k));
          const g = c.getContext('2d')!;
          g.fillStyle = '#ffffff';
          g.fillRect(0, 0, c.width, c.height);
          g.drawImage(img, 0, 0, c.width, c.height);
          c.toBlob(b => (b ? resolve(b) : reject(new Error('The image could not be created.'))), type, 0.92);
        } catch (err) {
          reject(
            err instanceof Error && /taint/i.test(err.message)
              ? new Error('This browser blocked drawing the board as an image. Use SVG export instead.')
              : err instanceof Error
                ? err
                : new Error('The image could not be created.'),
          );
        }
      };
      img.onerror = () => {
        reject(new Error('The board could not be drawn as an image.'));
      };
      img.src = url;
    });
  const saveBlob = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob),
      a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMenu(false);
  };
  const selectionRegion = () => {
    const ids = selected.filter(id => boardRef.current.items.some(i => i.id === id));
    if (!ids.length) return undefined;
    const b = selectionBounds(boardRef.current.items, ids)!;
    return { x: b.x - 20, y: b.y - 20, w: b.w + 40, h: b.h + 40 };
  };
  /** PNG or JPEG of the selection or whole board; `scale` 1, 2 or 4 (gap B12). */
  const exportRaster = async (type: 'image/png' | 'image/jpeg', scale = 2, area?: Region) => {
    try {
      const built = buildSvg(area ?? selectionRegion());
      saveBlob(await rasterize(built.svg, built.box, type, scale), `boardroom.${type === 'image/png' ? 'png' : 'jpg'}`);
    } catch (err) {
      display((err as Error).message);
    }
  };
  /** Copy the selection (or the board) as a PNG image (gap B11). Falls back to a download without clipboard access. */
  const copyImage = async () => {
    try {
      const built = buildSvg(selectionRegion()),
        blob = await rasterize(built.svg, built.box, 'image/png', 2);
      const Item = (globalThis as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
      if (window.isSecureContext && navigator.clipboard?.write && Item) {
        try {
          await navigator.clipboard.write([new Item({ 'image/png': blob })]);
          display(selected.length ? 'Copied the selection as an image.' : 'Copied the board as an image.');
          return;
        } catch {
          /* Permission denied or unsupported: download instead. */
        }
      }
      saveBlob(blob, 'boardroom.png');
      display('The image could not be put on the clipboard here, so it was downloaded instead.');
    } catch (err) {
      display((err as Error).message || 'The image could not be copied.');
    }
  };
  /** PDF with one page per frame (title band included), or one page of a dragged area. */
  const exportPdf = async (area?: Region) => {
    try {
      const { jsPDF } = await import('jspdf'),
        // Selected frames only when frames are selected; otherwise the slides as presented (hidden frames skipped).
        chosen = area ? [] : boardRef.current.items.filter(i => i.type === 'frame' && selected.includes(i.id)),
        frames = area ? [] : chosen.length ? chosen : slideFrames(boardRef.current),
        regions = area ? [area] : frames.length ? frames.map(frameExportRegion) : [buildSvg().box];
      let pdf: InstanceType<typeof jsPDF> | null = null;
      for (const r of regions) {
        const built = buildSvg(r),
          blob = await rasterize(built.svg, built.box, 'image/jpeg', Math.min(2, 2400 / Math.max(r.w, r.h))),
          data = await new Promise<string>(res => {
            const fr = new FileReader();
            fr.onload = () => res(String(fr.result));
            fr.readAsDataURL(blob);
          }),
          orientation = r.w >= r.h ? 'landscape' : 'portrait';
        if (!pdf) pdf = new jsPDF({ orientation, unit: 'px', format: [r.w, r.h], hotfixes: ['px_scaling'] });
        else pdf.addPage([r.w, r.h], orientation);
        pdf.addImage(data, 'JPEG', 0, 0, r.w, r.h);
      }
      saveBlob(pdf!.output('blob'), 'boardroom.pdf');
      if (frames.length)
        display(`PDF exported with ${frames.length} page${frames.length === 1 ? '' : 's'} in presentation order.`);
    } catch (err) {
      display((err as Error).message || 'The PDF could not be created.');
    }
  };
  /**
   * Print the selection (only the selected objects) or the whole board (gap b3-4). The drawing is placed in a
   * print-only element shown by `@media print` rules, so no new window or script is needed under the CSP.
   */
  const printBoard = async (area?: Region) => {
    setMenu(false);
    try {
      const only = area ? undefined : selectionOnly(),
        built = buildSvg(area ?? (only ? selectionRegion() : undefined), only),
        root = document.createElement('div'),
        img = document.createElement('img');
      root.id = 'print-root';
      img.alt = boardRef.current.title || 'Board';
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(built.svg);
      root.append(img);
      document.querySelector('#print-root')?.remove();
      document.body.append(root);
      document.body.classList.add('printing');
      await img.decode().catch(() => undefined);
      const done = () => {
        root.remove();
        document.body.classList.remove('printing');
        window.removeEventListener('afterprint', done);
      };
      window.addEventListener('afterprint', done);
      window.print();
      // Browsers without the afterprint event still clean up.
      if (!('onafterprint' in window)) setTimeout(done, 1000);
    } catch (err) {
      display((err as Error).message || 'The board could not be printed.');
    }
  };
  /** Portable backup with media stored as files instead of base64 text. */
  const exportBundle = async () => {
    try {
      const { encodeBundle } = await import('./media-bundle');
      const bytes = encodeBundle(boardRef.current, assets);
      saveBlob(new Blob([bytes as BlobPart], { type: 'application/zip' }), 'board.boardroom');
    } catch (err) {
      display((err as Error).message || 'The backup could not be created.');
    }
  };
  const exportCsv = () => {
    const items = boardRef.current.items,
      chosen = items.filter(i => i.type === 'card' && selected.includes(i.id));
    if (chosen.length) {
      download('\uFEFF' + cardsCsv(chosen), 'boardroom-cards.csv', 'text/csv');
      setMenu(false);
      return;
    }
    const view =
      selectedItem && ['table', 'kanban', 'timeline'].includes(selectedItem.type)
        ? selectedItem
        : boardRef.current.items.find(i => ['table', 'kanban', 'timeline'].includes(i.type));
    const rows = view?.datasetId ? boardRef.current.datasets?.[view.datasetId] : undefined;
    if (!rows) {
      const cards = items.filter(i => i.type === 'card');
      if (cards.length) {
        download('\uFEFF' + cardsCsv(cards), 'boardroom-cards.csv', 'text/csv');
        setMenu(false);
        return;
      }
      display('Select cards, or add a Table, Kanban or Timeline, to export a spreadsheet.');
      setMenu(false);
      return;
    }
    download('\ufeff' + recordsCsv(rows), 'boardroom-records.csv', 'text/csv');
  };
  if (import.meta.env.DEV)
    (window as unknown as { __boardroomExport?: unknown }).__boardroomExport = {
      svg: () => buildSvg(),
      png: async () => {
        const b = buildSvg();
        return (await rasterize(b.svg, b.box, 'image/png')).size;
      },
      csv: () => {
        const rows = Object.values(boardRef.current.datasets ?? {})[0];
        return rows ? recordsCsv(rows) : '';
      },
    };
  /** Read-only HTML copy of the board or selection with a pan/zoom viewer (gap B17). */
  const exportHtml = () => {
    try {
      const built = buildSvg(selectionRegion());
      const name =
        (boardRef.current.title || 'board')
          .replace(/[\\/:*?"<>|]+/g, ' ')
          .trim()
          .slice(0, 80) || 'board';
      // Objects linked to another object or frame click through to it in the page (track J).
      download(
        standaloneHtml(built.svg, boardRef.current.title, new Date(), exportLinks(boardRef.current, built.box)),
        `${name}.html`,
        'text/html',
      );
    } catch (err) {
      display((err as Error).message || 'The HTML copy could not be created.');
    }
  };
  /** Text of notes, shapes, text, cards and frames as a spreadsheet (gap B5). */
  const exportTextCsv = () => {
    download('\uFEFF' + boardTextCsv(boardRef.current, selected), 'boardroom-text.csv', 'text/csv');
    setMenu(false);
  };
  return {
    exportSvg,
    buildSvg,
    rasterize,
    saveBlob,
    exportRaster,
    copyImage,
    exportPdf,
    printBoard,
    exportCsv,
    exportTextCsv,
    exportHtml,
    exportBundle,
  };
}
