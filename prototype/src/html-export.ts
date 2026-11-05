// Standalone read-only HTML export (gap B17): one file holding the board as SVG plus a small inline
// pan/zoom viewer. It is downloaded, not served by the app, so it carries its own (inline) script. Pure.
// Objects linked to another object or frame (`linkTo`) become click-through hotspots (track J): clicking one
// flies the view to its target, and Back returns to the previous view.
import { escapeHtml } from './markdown.ts';
import type { Board } from './model.ts';
import { inHiddenLayer } from './layers.ts';

/** A clickable area and the area it shows, in exported-page pixels (relative to the exported region). */
export type ExportLink = {
  x: number;
  y: number;
  w: number;
  h: number;
  tx: number;
  ty: number;
  tw: number;
  th: number;
  label: string;
};
type Region = { x: number; y: number; w: number; h: number };
const overlaps = (a: Region, b: Region) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/**
 * Click-through links of the exported region `box`: visible objects (not connectors) whose `linkTo` target
 * exists and is at least partly inside the region. Later objects paint (and hit-test) on top.
 */
export function exportLinks(board: Board, box: Region): ExportLink[] {
  const byId = new Map(board.items.map(i => [i.id, i]));
  const visible = (i: Board['items'][number]) => !i.hidden && !inHiddenLayer(board, i);
  const out: ExportLink[] = [];
  for (const i of board.items) {
    if (!i.linkTo || i.type === 'arrow' || i.type === 'pen' || !visible(i)) continue;
    const t = byId.get(i.linkTo);
    if (!t || t.id === i.id || !visible(t) || !overlaps(i, box) || !overlaps(t, box)) continue;
    const name = (t.name || t.text || t.type).replace(/\s+/g, ' ').trim().slice(0, 80);
    out.push({
      x: i.x - box.x,
      y: i.y - box.y,
      w: i.w,
      h: i.h,
      tx: t.x - box.x,
      ty: t.y - box.y,
      tw: t.w,
      th: t.h,
      label: `Go to ${name}`,
    });
  }
  return out;
}
/** A finite number with at most one decimal, for markup attributes (never anything else). */
const num = (v: number) => (Number.isFinite(v) ? String(Math.round(v * 10) / 10) : '0');
const hotspot = (l: ExportLink) =>
  `<button class="hotspot" type="button" style="left:${num(l.x)}px;top:${num(l.y)}px;width:${num(Math.max(1, l.w))}px;height:${num(Math.max(1, l.h))}px" data-x="${num(l.tx)}" data-y="${num(l.ty)}" data-w="${num(Math.max(1, l.tw))}" data-h="${num(Math.max(1, l.th))}" aria-label="${escapeHtml(l.label)}" title="${escapeHtml(l.label)}"></button>`;

/** Wrap serialised SVG markup in a self-contained page. `svg` must come from the app's own exporter. */
export function standaloneHtml(svg: string, title: string, exportedAt = new Date(), links: ExportLink[] = []): string {
  const name = escapeHtml(title.trim() || 'Board');
  const stamp = escapeHtml(exportedAt.toISOString().slice(0, 16).replace('T', ' '));
  // The SVG is placed inside a <div>; a closing </script> or </div> sequence inside it cannot occur because
  // the exporter serialises XML (text is escaped), but guard against it anyway.
  const safeSvg = svg.replace(/<\/script/gi, '<\\/script');
  const spots = links.slice(0, 2000).map(hotspot).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${name}</title>
<style>
  html, body { margin: 0; height: 100%; background: #f4f4f6; font-family: Arial, sans-serif; overflow: hidden; }
  header { position: fixed; top: 0; left: 0; right: 0; display: flex; gap: 12px; align-items: center; padding: 8px 14px;
    background: #fff; border-bottom: 1px solid #e5e5eb; z-index: 1; font-size: 13px; color: #25252c; }
  header strong { font-size: 14px; }
  header small { color: #696973; }
  header button { border: 1px solid #e5e5eb; background: #fff; border-radius: 6px; padding: 4px 9px; cursor: pointer; }
  #stage { position: absolute; inset: 41px 0 0 0; cursor: grab; touch-action: none; }
  #stage.dragging { cursor: grabbing; }
  #board { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
  #board > svg { display: block; background: #fff; box-shadow: 0 2px 12px #2424421a; }
  #board.flying { transition: transform 0.35s ease; }
  /* The board's own styles travel inside the SVG, so the viewer's controls state theirs firmly. */
  [hidden] { display: none !important; }
  #board .hotspot { position: absolute; display: block; padding: 0; border: 0; border-radius: 4px; background: transparent; cursor: pointer; }
  #board .hotspot:hover, #board .hotspot:focus-visible { outline: 2px solid #4262ff; outline-offset: 2px; background: #4262ff14; }
</style>
</head>
<body>
<header><strong>${name}</strong><small>Read-only copy · exported ${stamp}</small>
  <span style="flex:1"></span>
  <button id="back" hidden aria-label="Back to the previous view">← Back</button>
  <button id="zoom-out" aria-label="Zoom out">−</button><button id="fit">Fit</button><button id="zoom-in" aria-label="Zoom in">+</button>
</header>
<div id="stage"><div id="board">${safeSvg}${spots}</div></div>
<script>
(function () {
  var stage = document.getElementById('stage'), board = document.getElementById('board');
  var svg = board.querySelector('svg'), back = document.getElementById('back'), x = 0, y = 0, z = 1, drag = null, views = [];
  function apply() { board.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + z + ')'; }
  function fit() {
    var w = svg.width.baseVal.value || svg.getBoundingClientRect().width, h = svg.height.baseVal.value || svg.getBoundingClientRect().height;
    var r = stage.getBoundingClientRect();
    z = Math.min(r.width / (w + 80), r.height / (h + 80), 4);
    x = (r.width - w * z) / 2; y = (r.height - h * z) / 2; apply();
  }
  function zoomAt(f, cx, cy) {
    var nz = Math.min(8, Math.max(0.05, z * f));
    x = cx - (cx - x) * (nz / z); y = cy - (cy - y) * (nz / z); z = nz; apply();
  }
  stage.addEventListener('wheel', function (e) {
    e.preventDefault();
    var r = stage.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY / 300), e.clientX - r.left, e.clientY - r.top);
    else { x -= e.deltaX; y -= e.deltaY; apply(); }
  }, { passive: false });
  function glide() { board.classList.add('flying'); apply(); setTimeout(function () { board.classList.remove('flying'); }, 400); }
  function fly(b) {
    var tx = +b.getAttribute('data-x'), ty = +b.getAttribute('data-y'), tw = +b.getAttribute('data-w'), th = +b.getAttribute('data-h');
    var r = stage.getBoundingClientRect();
    views.push({ x: x, y: y, z: z });
    z = Math.min(r.width / (tw + 80), r.height / (th + 80), 4);
    x = (r.width - tw * z) / 2 - tx * z; y = (r.height - th * z) / 2 - ty * z;
    back.hidden = false; glide();
  }
  Array.prototype.forEach.call(board.querySelectorAll('.hotspot'), function (b) {
    b.addEventListener('click', function (e) { e.stopPropagation(); fly(b); });
  });
  back.onclick = function () {
    var v = views.pop();
    if (v) { x = v.x; y = v.y; z = v.z; glide(); }
    back.hidden = !views.length;
  };
  stage.addEventListener('pointerdown', function (e) { if (e.target.closest && e.target.closest('.hotspot')) return; drag = { x: e.clientX - x, y: e.clientY - y }; stage.classList.add('dragging'); stage.setPointerCapture(e.pointerId); });
  stage.addEventListener('pointermove', function (e) { if (drag) { x = e.clientX - drag.x; y = e.clientY - drag.y; apply(); } });
  stage.addEventListener('pointerup', function () { drag = null; stage.classList.remove('dragging'); });
  document.getElementById('zoom-in').onclick = function () { var r = stage.getBoundingClientRect(); zoomAt(1.25, r.width / 2, r.height / 2); };
  document.getElementById('zoom-out').onclick = function () { var r = stage.getBoundingClientRect(); zoomAt(0.8, r.width / 2, r.height / 2); };
  document.getElementById('fit').onclick = fit;
  window.addEventListener('resize', fit);
  fit();
})();
</script>
</body>
</html>
`;
}
