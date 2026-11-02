# Boardroom — local React + TypeScript prototype

Independent whiteboard implementation informed by REA 6.8.0 observations of the reference whiteboard. The prototype does not use the reference source, accounts, tokens, or backend APIs.

## Run

From this directory:

```powershell
npm install
npm run dev
```

Open the Local URL printed by Vite. In the current workspace the dependencies are already available, and the development server uses http://127.0.0.1:5173/.

For an offline development environment with these packages already installed elsewhere, `node scripts/use-local-packages.mjs <absolute-node_modules-path>` copies the required public packages and their dependencies. It does not copy that project's source. A normal installation is preferred when registry access is available.

## Tools

- Select, shift-select, drag-to-select, move, resize using the bottom-right handle, duplicate, delete, and layer ordering.
- Sticky notes, text, rectangles, ellipses, diamonds, connectors, freehand pen, and frames. Frames are backdrop regions; they do not group or constrain their contents.
- Click a creation tool, then click or drag on the canvas. Double-click a tool to add an object at the center (except pen and pan).
- Double-click an object or select it and press Enter to edit its text. Escape or Ctrl+Enter finishes editing.
- Connectors attach when dragged between two objects and follow their endpoints. Removing an endpoint removes its connectors.
- Undo/redo, arrow-key movement, Space+drag to pan, Ctrl+scroll to zoom, fit to screen, and object outline navigation.
- Browser local storage, editable JSON backup/import, and SVG image export. SVG includes foreignObject text; some vector editors have limited support for this SVG feature.

Use the keyboard button for shortcut help. Click "Explore a sample board" for demonstration data.

## Validation

```powershell
npm test
npm run build
```

Ninety-one regression tests pass (see `NEXT-20-ITEMS-PLAN.md` for the next-20 integration and its browser checks). TypeScript type checking and the Vite production build pass. REA browser checks verify sample rendering, note selection, rectangle creation/editing, duplicate/delete/undo, and persistence across reload. Additional scenarios verify bulk note creation, mind map branch editing, Mermaid rendering, shared record view switching and persistence, double-click sticky editing, and frame keyboard movement with undo/redo storage restoration. The saved screenshots cover desktop and phone menus, group selections, anchored sticky palettes, phone fit, and visible canvas keyboard focus. `qa/browser-checks.json` records the original bounded scenarios.

Pointer drag, freehand drawing, resizing, import file selection, and downloaded file rendering have not received a complete automated browser exercise. Model tests cover connector geometry, endpoint deletion, history branching, and invalid imports. These checks are not a claim of full the reference whiteboard equivalence.

Visual review verdict: ship. Mobile fit, visible keyboard focus, and documented reference direction were all resolved; no material findings remain in the final screenshot review.

## New tool menus

- **Formats and Flows** (top toolbar icon): Diagram with Mermaid code, Table, Timeline, Kanban.
- **Tools, media and integrations** (three dots): Essentials includes Sticky note, Bulk mode and Mind map. Switch categories using the gallery navigation; search filters the active category.
- **Shapes and lines** groups Rectangle, Ellipse, Diamond and Connector.
- Bulk mode accepts one note per line, up to 100, committed as one undoable batch.
- Double-click a diagram, mind map or record view (or select it and press Enter) to reopen its editor. Done applies changes; Cancel discards editor changes. Creation inserts a starter object; Undo removes it.
- Mind maps support editable topics, children, siblings and recursive branch deletion; Tab adds a child and Enter adds a sibling from the topic text field.
- Mermaid uses the MIT-licensed Mermaid package, loaded on demand with strict rendering security. Four starters and custom syntax are available.
- Table, Kanban and Timeline share a record dataset. Edit title, status, assignee and dates; add/delete records, filter, search or sort. Change view without losing records. Duplicating a record object creates a linked view of the same dataset.
- Sticky editing uses the note color. Canvas text cannot be selected while dragging; note text remains selectable in the editor.

## Canvas interactions

- Use Select to grab an object and drag it. Plain text and rich format objects have full hit areas. Attached connectors dragged on their own detach from stationary endpoints and move visibly; endpoints moving in the same selection stay attached.
- Shift-click toggles objects in a selection. Drag on empty canvas to select fully enclosed objects; Shift adds to the selection.
- Eight handles resize individual objects and groups. Shift at a corner preserves proportions. Group resize scales positions and pen points. Single-connector endpoint resizing is not implemented.
- Moving a frame also moves objects fully inside it at the start of the gesture. Overlapping and outside objects remain in place. Nested contents move once; resizing a frame alone changes its boundary without scaling contents.
- Edge/center snapping shows blue guides. The magnet control toggles snapping; Alt bypasses it during a move. Shift constrains a move to one axis.
- Escape, pointer cancellation, lost pointer capture or window blur cancels the active gesture. Each completed move or resize is one undo step. Keyboard arrows move the selection and contained frame objects by 1 pixel, or 10 with Shift.
- Tool palettes open beside their toolbar button and clamp to the viewport, including the sticky-note palette and grouped menus.

Model tests cover these geometry rules. Native pointer dragging remains incompletely verified because Computer Use could not reliably validate the browser URL; do not interpret the screenshots and keyboard scenarios as a full live drag exercise.

## Connector controls

Select a connector to choose Straight, Elbow or Curved, line color, thickness, dash pattern and start/end arrowheads. Existing arrows retain straight/2 px/solid/end-arrow defaults. Double-click or press Enter to edit its label; Enter applies, Shift+Enter inserts a line break, and Escape cancels the inline edit.

Connector details opens an anchored panel for a label and explicit Start/End connection selectors. Apply changes both bindings and the label in one undoable edit. Endpoint circles are blue when attached and white when free. Drag a circle near a note, shape, text or rich-format object to reconnect; Alt keeps it free. The selectors provide a keyboard alternative. Frames, pen strokes, other connectors and self-connections are not eligible targets. Routing does not yet avoid obstacles or expose bend handles.

## Service limits

This is a single-user local prototype. No real-time multiplayer, server sync, account permissions, AI, comments, templates library, native import of third-party backups, external integrations, or PDF export. Data is specific to this browser and origin; export JSON to keep a portable backup. Clearing browser storage removes local work. The document supports up to 2,000 objects, 6,000 characters per text field, and 80 retained undo snapshots.

Selected notes and text objects expose font, size, bold, italic, underline, alignment and list formatting. Formatting persists in local storage and JSON backups. Sticky notes default to centered text in both directions and Auto size, which maximizes text within the available space and shrinks as content grows. The editor checks actual rendered height to keep every line visible. Numeric sizes override Auto. Font options and the selected font name preview their own typeface.

Sticky-note additions: choose Top/Middle/Bottom text alignment and Small/Medium/Large size from the selection bar. Links and tags opens a panel with Apply/Cancel and an explicit Open saved link action. Add connected note creates a matching empty note and attached connector in one undo step; it omits copied links and tags and begins editing the new note.

## Next-20 integration

- **Connectors:** elbow/curved routes avoid objects (clearance in Connector details), draggable bend handles with a keyboard bend editor and Reset to automatic, self-loops and chosen attachment sides.
- **Shapes:** rounded rectangle, triangle, cylinder, parallelogram, hexagon, predefined process and terminator; border colour, thickness, pattern and opacity.
- **Arrange:** align, distribute, persistent nested groups (Ctrl G / Ctrl Shift G) and locking (Ctrl Shift L; Board contents lists locked objects with Unlock).
- **Images:** upload (Tools → Image), drop or paste PNG/JPEG/GIF/WebP up to 4 MB; crop and replace. Image data lives in IndexedDB and is embedded in JSON backups.
- **Sticky notes:** emoji marker and Convert to text, shape or record.
- **Navigation:** board search (Ctrl F), minimap, frame presets/orientation and presentation mode with stored frame order.
- **Records:** Kanban drag-and-drop or Alt + arrow keys; Timeline milestones and dependencies with cycle prevention.
- **Code blocks:** Tools → Code; Prism highlighting and an isolated editor (react-simple-code-editor).

## Items 21–50

- **Tools gallery:** eight categories (Formats, Essentials, Media, Diagramming, Planning, Collaboration, Wireframes, Prototyping) generated from the widget registry (`src/widget-specs.ts`, `src/widgets.tsx`).
- **Collaborate and review menu** (people icon, top right): dot voting, timer, comments (C), private mode, templates and the accessibility check.
- **Layers** (stack icon) replaces Board contents: reorder, rename, hide and lock.
- **Export:** SVG, PNG, JPG, PDF (one page per frame) and records as CSV.
- **Mind maps:** F2 or Alt+double-click edits topics on the canvas. **Mermaid:** Convert to shapes in its editor.
