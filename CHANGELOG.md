# Changelog

## Unreleased

## 0.2.0 — 2026-11-03

### Added
- Connector obstacle avoidance with configurable clearance and a blocked-route fallback.
- Editable connector bends (elbow segments, curve control points), keyboard bend editor and Reset to automatic.
- Self-loop connectors and selectable attachment sides.
- Shape border colour, thickness, pattern and opacity.
- Rounded rectangle, triangle, cylinder, parallelogram, hexagon, predefined process and terminator shapes.
- Align and distribute commands; persistent nested groups; object locking with Unlock all.
- Image upload, drop and paste with IndexedDB storage and embedded JSON backups; crop editor and image replacement.
- Sticky-note emoji markers and conversion to text, shape or record.
- Board search, minimap, frame presets with orientation, presentation mode with stored order.
- Kanban card drag-and-drop and keyboard movement; Timeline milestones and dependencies with cycle prevention.
- Code blocks with syntax highlighting (prismjs, react-simple-code-editor).

- Widget registry and 21 new object kinds: cards, flip cards, grids, dividers, stamps, icons, QR codes, video, PDF, bookmarks, embeds, docs, org charts, story maps, wireframes, prototype screens, auto-layout containers, 2×2 matrix, poll, spinner and alignment scale.
- Sticky stack tool; pen styles (pen/marker/highlighter), smoothing and a whole/precise eraser.
- Text highlight, background, strikethrough, auto height and link opening.
- Markdown paste (text, notes or doc); Mermaid flowchart conversion to native shapes; on-canvas mind-map editing and branch styles.
- Dot voting, board timer, private mode, comments, links to objects, hidden frame content and a layers panel.
- Connector line jumps and draggable labels; PNG/JPG/PDF/CSV export; templates; accessibility check; record points and estimates.

- Journey map, planner (program board), word cloud, ranking and quiz widgets; Doc formatting toolbar with Ctrl+B/I/K.
- Compact `.boardroom` backup (ZIP with media as files) for export and import.
- Insertion indicator when dragging into an auto-layout container; curved connectors now take part in line jumps.
- Per-cell bold, italic, colour and alignment in grids; story map and org chart edits undo one change at a time.
- `npm run format`, `format:check` and `check` scripts (Prettier).

### Fixed
- JSON backups now embed video and PDF data, not only images.
- Native drag-and-drop in story map, org chart, planner, ranking and Layers (drops were ignored outside synthetic tests).
- Accessibility scan findings: contrast of Kanban point totals and story placeholders, poll and toolbar accessible names, checklist checkbox names, nested interactive roles, empty table headers, org list roles.
- Phone layout: header no longer overlaps the search button; gallery categories scroll horizontally.
- Tool gallery rows and categories are left-aligned with a fixed icon column, each widget has its own icon, and the panel no longer grows past the window.
- Wireframes and other interactive widgets (poll, scale, video, embed) can be selected and dragged by their body again; their own controls still work.

### Changed
- The main component was split: state and behaviour in `board-app.tsx` (exposed through `useApp()`), UI in `canvas-surface`, `top-bar`, `tool-rail`, `selection-bars`, `floating-panels` and `board-chrome`, with `use-render-item` and `use-exporters` hooks; all source is Prettier-formatted.
- Large boards: per-object render caching, text layout caching and off-screen culling; vendor code split into cached chunks and backup code loaded on demand (main bundle 767 kB → 442 kB).
- Same-object connections are now allowed (self-loops) instead of rejected.
- JSON import limit raised to 120 MB to accommodate embedded images.
- Board contents is now the Layers panel; the Tools gallery has eight categories.
- New dependencies: qrcode-generator, pdfjs-dist, marked and jspdf (jsqr is used only in tests).
