// Standalone read-only HTML export (gap B17): one file holding the board as SVG plus a small inline
// pan/zoom viewer. It is downloaded, not served by the app, so it carries its own (inline) script. Pure.
import { escapeHtml } from './markdown.ts';

/** Wrap serialised SVG markup in a self-contained page. `svg` must come from the app's own exporter. */
export function standaloneHtml(svg: string, title: string, exportedAt = new Date()): string {
  const name = escapeHtml(title.trim() || 'Board');
  const stamp = escapeHtml(exportedAt.toISOString().slice(0, 16).replace('T', ' '));
  // The SVG is placed inside a <div>; a closing </script> or </div> sequence inside it cannot occur because
  // the exporter serialises XML (text is escaped), but guard against it anyway.
  const safeSvg = svg.replace(/<\/script/gi, '<\\/script');
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
</style>
</head>
<body>
<header><strong>${name}</strong><small>Read-only copy · exported ${stamp}</small>
  <span style="flex:1"></span>
  <button id="zoom-out" aria-label="Zoom out">−</button><button id="fit">Fit</button><button id="zoom-in" aria-label="Zoom in">+</button>
</header>
<div id="stage"><div id="board">${safeSvg}</div></div>
<script>
(function () {
  var stage = document.getElementById('stage'), board = document.getElementById('board');
  var svg = board.querySelector('svg'), x = 0, y = 0, z = 1, drag = null;
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
  stage.addEventListener('pointerdown', function (e) { drag = { x: e.clientX - x, y: e.clientY - y }; stage.classList.add('dragging'); stage.setPointerCapture(e.pointerId); });
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
