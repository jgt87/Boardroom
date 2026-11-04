import { flushSync } from 'react-dom';
import { selectionBounds } from './interactions';
import { slideFrames } from './navigation';
import { recordsCsv } from './board-tools';
import { cardsCsv } from './card-tools';
import { boardTextCsv } from './csv';
import { standaloneHtml } from './html-export';
import { useApp } from './board-app';

/** SVG, PNG/JPG, PDF and CSV export of the board or selection. */
export function useExporters() {
  const { assets, boardRef, display, download, selected, selectedItem, setMenu, svg, setRenderAll } = useApp();
  const exportSvg = () => {
    const built = buildSvg();
    download(built.svg, 'boardroom.svg', 'image/svg+xml');
  };
  /** Serialise the board (or a region) as standalone SVG. Large boards render every object first (gap A2). */
  const buildSvg = (region?: { x: number; y: number; w: number; h: number }) => {
    if (boardRef.current.items.length < 400) return buildRenderedSvg(region);
    flushSync(() => setRenderAll(true));
    try {
      return buildRenderedSvg(region);
    } finally {
      setRenderAll(false);
    }
  };
  /** Serialise what is currently rendered, with the page styles embedded. */
  const buildRenderedSvg = (region?: { x: number; y: number; w: number; h: number }) => {
    const ns = 'http://www.w3.org/2000/svg',
      out = document.createElementNS(ns, 'svg');
    out.setAttribute('xmlns', ns);
    out.setAttribute('xmlns:xhtml', 'http://www.w3.org/1999/xhtml');
    const group = svg.current!.querySelector('#objects')!.cloneNode(true) as SVGGElement;
    group.removeAttribute('transform');
    group.querySelectorAll('.selection,.search-hit,.lock-badge,textarea').forEach(n => n.remove());
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
        'text-align',
        'font-style',
        'font-weight',
      ])
        node.style.setProperty(key, computed.getPropertyValue(key));
    });
    group.querySelectorAll('.link-badge,.vote-badge,.comment-pin').forEach(n => n.remove());
    const b = (svg.current!.querySelector('#objects') as SVGGElement).getBBox(),
      box = region ?? { x: b.x - 30, y: b.y - 45, w: Math.max(200, b.width + 60), h: Math.max(200, b.height + 90) };
    out.setAttribute('viewBox', `${box.x} ${box.y} ${box.w} ${box.h}`);
    out.setAttribute('width', String(box.w));
    out.setAttribute('height', String(box.h));
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
  const exportRaster = async (type: 'image/png' | 'image/jpeg', scale = 2) => {
    try {
      const built = buildSvg(selectionRegion());
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
  const exportPdf = async () => {
    try {
      const { jsPDF } = await import('jspdf'),
        // Selected frames only when frames are selected; otherwise the slides as presented (hidden frames skipped).
        chosen = boardRef.current.items.filter(i => i.type === 'frame' && selected.includes(i.id)),
        frames = chosen.length ? chosen : slideFrames(boardRef.current),
        regions = frames.length ? frames.map(f => ({ x: f.x, y: f.y, w: f.w, h: f.h })) : [buildSvg().box];
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
      download(standaloneHtml(built.svg, boardRef.current.title), `${name}.html`, 'text/html');
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
    exportCsv,
    exportTextCsv,
    exportHtml,
    exportBundle,
  };
}
