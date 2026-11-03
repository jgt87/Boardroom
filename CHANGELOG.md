# Changelog

## Unreleased

### Camera and appearance controls
- The zoom percentage opens precise zoom and world-center coordinates, a 100% shortcut, and Reset view (origin centered at 100%). Existing wheel/button zoom shares the tested camera math.
- Properties → Appearance adds whole-object opacity, numeric font weight and vertical text offset. Font weight is also selectable in the text toolbar; Bold stays consistent with numeric weights. Auto text reserves space for the offset.
- Optional document fields are validated and preserved through saving, undo/redo and SVG export. Existing boards keep their default appearance.
- Export retains an accessible name on phones, where its visible text is hidden.

### Emoji and stickers in the tool rail
- New **Emoji and stickers** button in the left tool rail: pick any emoji (search, categories, skin tones, recent) or one of eight built-in stickers, then click the board to place it. Esc cancels.
- Fixed the emoji picker's accessibility roles (a list of options instead of a grid without rows).

### Faster loading — 2026-11-03
- Added `npm run serve`: an optimized production build on port 4173 (LAN-reachable). It loads in 8 compressed requests (0.26 MB) instead of the dev server's ~150 source files, which could leave other devices, or a busy browser, on "Opening Boardroom…".
- The dev server now compiles every source module at startup instead of on first request.

### Analysis re-scan: items 78–85 — 2026-11-03
- **Slides decks:** a new Slides object with seven layouts, six templates and poll activity slides. Edit on the canvas; add, duplicate, delete and reorder slides (Alt + arrows on thumbnails); present full screen with arrow keys and Escape. The Slides format now places a deck; frame presentation remains on the Presentation button.
- **Docs:** Note/Tip/Important/Warning callouts (stored as `> [!NOTE]` Markdown), a `/` slash menu on empty lines, four starter templates, Export as Markdown, and Markdown upload (Upload menu or canvas drop) as a new Doc.
- **Shape packs:** 43 new shapes in Basic, Flowchart, Callouts, UML, BPMN and ERD packs, chosen from pack tabs in Shapes and lines. They attach connectors, hold text, convert, join Grids and get contrast checks like the original shapes.
- **Wireframe buttons:** Solid, Outline, Rounded and Link styles with optional icons, in the library and the properties editor.
- **Open-ended activity:** collect free-text responses on the canvas and convert them into sticky notes in one undo step.
- **Reactions:** six emoji reactions float across the screen and are announced to screen readers; they are not saved. Reduced motion shows a static burst.
- **PowerPoint import:** `.pptx` files become Slides decks with titles and text in slide order (no images or layouts).
- **Note authors:** a display name stored on this device is recorded on new sticky notes; a board setting shows author labels.
- Fixed: the Grid object filter named a non-existent `process` shape, so predefined-process shapes could not join a Grid.
- Verified: 179 unit tests, 7 new browser scenarios with axe checks, formatting, lint, TypeScript and production build.

### Record layout menu — 2026-11-03
- Replaced permanent Table/Kanban/Timeline tabs with a compact current-layout menu, icons and checked choice. Added keyboard navigation, dismissal and lock enforcement; independent tool creation and dataset identity are preserved.
- Rebuilt on port 5173. Formatting, lint, 159 unit tests, TypeScript/build and 11 targeted browser scenarios passed.

- Verified that new Table/Kanban/Timeline tools create independent objects/datasets, while switching layouts retains the selected entity's data and leaves other objects unchanged. Added a passing Chrome regression for this distinction.

- Final parity-batch verification: formatting, lint, 159 unit tests, TypeScript and production build passed; full browser suite 61/61 passed in 2.8 minutes. Prototype rebuilt and available on port 5173. See `ADVANCED-CANVAS-INTEGRATION.md` for scope and remaining service/live-comparison limits.

### Advanced canvas workflows — 2026-11-03
- Replaced passive Planner, Journey and Ranking previews with interactive canvas renderers. Planner supports card movement/order, inline fields/axes, points and dependency controls; Journey supports inline cells, stages/lanes, text movement and emotion controls; Ranking supports native/keyboard order, editing and reset.
- Updates validate current widget data, respect locks and use board history/persistence. Fixed self-drop ordering, consecutive keyboard-move focus and dependency geometry observation after fresh review.
- Four new browser scenarios passed before the final Planner focus/undo extension; its final rerun, full 61-scenario suite and combined checks are pending. Mechanical design scan found zero issues. See ADVANCED-CANVAS-INTEGRATION.md for evidence and service boundaries; no full parity with the reference whiteboard claim.


### Manual mind-map workflows — 2026-11-03
- Added validated manual topic positions, Auto layout controls in the toolbar and larger editor, branch grips that move descendants, Ctrl/Meta parent preservation and Alt + arrow movement.
- Attachment targets show a highlight and status; self/descendant targets are excluded, and Escape/pointer cancellation discard the drag preview. New topics receive positions in both editing paths.
- All 157 unit tests, formatting, lint, TypeScript and production build passed; the full browser suite passed 57/57 in 2.5 minutes, exit 0. See `MINDMAP-WORKFLOW-INTEGRATION.md` for evidence, fixed-object fit/session-history limits and the live-comparison boundary.

### Record schemas and Grid integration — 2026-11-03
- Added configurable shared statuses and Text, Number, Date, Single select and Checkbox fields, with visibility/order controls, single-select Kanban grouping, synced-card inputs and portable schema bindings.
- Grid contains supported objects, grows cells, carries members on movement, remaps structural edits and portable copies, and offers native/keyboard row-column ordering and one-step border resizing. Lock/group guards apply.
- 155 unit tests, formatting, lint, TypeScript, production build and four new browser scenarios passed. Full browser suite: 54/54 passed in 2.4 minutes, exit 0. See `SCHEMA-GRID-INTEGRATION.md` for evidence and limits; live reference comparison remains unavailable.

### Record workflow integration — 2026-11-03
- Record integration verification: 149 unit tests and all 50 browser tests passed; formatting, lint, TypeScript and production build passed. Prototype remains available on port 5173. Full evidence is in `RECORD-WORKFLOW-INTEGRATION.md`.
- Pointer drops copy notes/cards into Table, Kanban and Timeline while preserving the source object and position. Kanban drops adopt the target status; drops on a record insert before it.
- Record handles create synced canvas cards by native drag or keyboard-accessible click. Supported card/record fields synchronize bidirectionally; deleting a card preserves its record, while deleting a record leaves a blank bound card. Clipboard copies remap dataset bindings.
- Timeline now schedules undated records directly and shows partial ranges with a gradient and missing-date action. Added lock/capacity guards and unit/browser regressions.
- See `RECORD-WORKFLOW-INTEGRATION.md` for evidence and remaining limits. Live reference comparison remains unavailable; full parity is not claimed.

### Workflow verification — 2026-11-03
- Re-ran ten canvas workflow browser tests successfully; added eight reproducible gap observations using an isolated profile. Confirmed missing ingestion/containment, direct undated scheduling and advanced canvas controls.
- Added `WORKFLOW-VERIFICATION.md` with evidence levels and acceptance checks. Live reference comparison remains pending because the debugging endpoint is unavailable.

### Draw.io integration — 2026-11-03
- Enabled Draw.io Diagrams under Diagramming and the Diagram submenu. Added a focused hosted editor with `.drawio`/XML import/export, file drop, local XML source and PNG preview assets, undo/reload and portable backup support.
- Added exact iframe sender checks, bounded source/preview validation, phone layout and focus containment, and a composed network-failure view with retry/import/source-only recovery.
- Added model/protocol and browser workflow tests. The real hosted-editor request is blocked by this environment's network policy; live-service verification remains explicitly limited. See `DRAWIO-INTEGRATION.md`.

- Formats and Flows now uses a distinct Shapes icon; Templates keeps its layout icon. Creation tools use a single custom hover tooltip instead of showing both custom and browser-native labels. Verified in Chrome and rebuilt successfully.

### Canvas workflows and menus — 2026-11-03
- Table, Kanban, Timeline, Grid, org chart, story map and Doc now expose direct canvas editing. Kanban cards, reporting relationships and stories support child dragging; Timeline bars move/resize dates.
- Added sticky select-and-type, undoable Alt-drag duplication, inline standalone card titles/Tab creation, and inline mind-map entry with multiline labels and branch reassignment.
- Formats and widgets enter click-to-place creation, with Escape cancellation. Aligned the rail, compact Formats flyout, nested Diagram/Engage/Upload/library menus and eleven Tools categories with the observed reference structure; unsupported services are clearly disabled.
- Added canvas workflow regression tests and preserved explicit toolbar editors. See `WORKFLOW-IMPLEMENTATION.md` for the tested behavior and remaining feature limits.

### Verification fixes — 2026-11-03
- Board search prepares ordinary ASCII labels without per-character Unicode normalization, keeping the 2,000-object search within its existing performance budget. Unicode matching and highlighting retain their original path.
- Video upload browser tests use a tiny locally generated VP8 fixture rather than canvas MediaRecorder output, which could produce an undecodable clip in headless Chrome.

### Added
- Tool workflow audit (`TOOL-WORKFLOW-AUDIT.md`) with 16 reproducible browser observations, source analysis, official reference documentation and prioritized acceptance gates. It distinguishes functional modal editors from direct canvas interaction; no application behavior changed in this investigation.
- Boards dashboard: many boards per browser with create (blank or template), open, rename, duplicate, delete and find; the legacy single board migrates automatically.
- Context menu (right-click, long-press, Shift+F10) with selection-aware actions.
- Copy, cut and paste of objects across boards and tabs, keeping connectors, groups, links and datasets.
- Properties inspector with exact geometry, appearance, arrangement and metadata.
- Fuzzy, ranked board search with highlighted matches.
- Full emoji picker (about 1,900 emoji, search, skin tones, recently used) for note markers and emoji stamps.
- Playwright browser test suite (`npm run test:e2e`) covering native drags, file choosers, real downloads, clipboard paste, phone layout, accessibility and performance.
- ESLint with React hooks rules (`npm run lint`).
- Content Security Policy for the app (development adds only the hot-reload websocket).

### Changed
- Gesture handling and keyboard shortcuts moved out of the board state hook into their own hooks; the basic widget views are split by family with a shared widget kit.
- Callback props in long-lived effects are read through a latest-value ref instead of stale closures (presentation, prototype preview, search, mind-map editor, live editors).

### Security
- Vite updated to 6.4.5 (dev-server cross-origin script execution and Windows editor-launch advisories); `minimatch` pinned to 11 through an override. `npm audit` reports no vulnerabilities.
- The startup script moved out of `index.html` so the policy can forbid inline scripts.

### Fixed
- Opening the app from another device over plain HTTP (for example http://192.168.1.52:5173) failed with "The editor could not finish loading": `crypto.randomUUID` exists only on HTTPS or localhost. A fallback built on `crypto.getRandomValues` is now installed first (`polyfills.ts`).
- The startup screen reports real load errors straight away and no longer shows the failure message after a fixed 10 seconds while loading is merely slow.
- The development server no longer reloads open tabs when browser-test reports change, and it prepares the app's modules at start-up.
- Prototype preview: wireframe inputs (toggles, fields) are live again during the preview; the per-object render cache now accounts for preview state.
- Phone layout: the header no longer covers the Search button, and header menus stay on screen.
- Accessibility: the logo button's name starts with its visible text; Kanban column titles no longer break heading order.
- Live editors (journey, planner, word cloud, ranking, quiz): Esc reverts an unsaved field first and otherwise closes the dialog.
- Video upload: the poster frame no longer waits 8 s on recordings that report no duration.
- Repeated pastes step down-right instead of landing on top of each other.

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

### Next six workflow refinements (2026-11-03)

- Added saved record filters (all/any), sorting, Table grouping/collapse/group drops, search and visible-selection bulk edits/duplicate/delete/card creation.
- Added Timeline calendar scales, saved ranges, Autofit, row ordering and direct dependency connections; Table relation columns expose the same dependency graph.
- Added Grid Auto/Manual sizing and Ctrl/Meta drop bypass; merged row/column blocks reorder together with their metadata and objects.
- Manual mind-map edits preserve coordinate scale; committed outer moves expand the map while untouched topics retain their positions.
- Added configurable Draw.io editor hosting, endpoint validation and matching CSP, plus optional Docker setup. Real hosted save/reopen failed before initialization because the environment denied network access; local Docker engine access was also denied.
- Validation: 169 unit tests, format/lint/TypeScript and production build pass. Workflow-specific browser results and live verification status are in PARITY-NEXT-SIX.md. Rebuilt after each integration for testing on port 5173.
