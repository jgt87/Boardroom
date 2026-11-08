---
name: Boardroom
description: A quiet local whiteboard with floating tools and colorful ideas.
colors:
  primary: "#4262ff"
  primary-hover: "#334fd8"
  selected: "#edf0ff"
  canvas: "#f4f4f6"
  surface: "#ffffff"
  ink: "#25252c"
  object-ink: "#25252a"
  muted: "#696973"
  border: "#e5e5eb"
  hover: "#f1f1f5"
  grid: "#e4e4e8"
  note-yellow: "#fff49b"
  note-gold: "#ffe36e"
  note-orange: "#ffb879"
  note-coral: "#ffa0a7"
  note-pink: "#f7c5ef"
  note-purple: "#d3b7f6"
  note-blue: "#a8cdff"
  note-cyan: "#8ce3eb"
  note-green: "#a9e8bb"
  note-lime: "#d1ec9c"
  note-gray: "#e4e4e7"
typography:
  body:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "14px"
  title:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "14px"
    fontWeight: 600
  label:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "12px"
  caption:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "11px"
  object:
    fontFamily: "Arial, Helvetica, sans-serif"
    lineHeight: 1.4
rounded:
  swatch: "4px"
  control: "7px"
  action: "8px"
  surface: "12px"
spacing:
  compact: "6px"
  small: "8px"
  medium: "12px"
  panel: "16px"
  edge: "20px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.action}"
    padding: "12px 19px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-icon:
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    width: "36px"
    height: "36px"
  button-icon-selected:
    backgroundColor: "{colors.selected}"
    textColor: "{colors.primary}"
  floating-surface:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.surface}"
---

# Design System: Boardroom

## Overview

**Creative North Star: "The Open Whiteboard"**

Boardroom inherits the user's chosen reference whiteboard: an open, quiet grid with floating white toolbars, blue selection, and a generous working area. This document describes the independent React and TypeScript prototype, not any existing commercial service. The reference supplies the visual world; the local Boardroom name distinguishes the implementation.

Objects carry color and meaning while the surrounding controls stay compact and restrained. The desktop and mobile captures show the same canvas grammar, with peripheral controls compressed on narrow screens. Typography and geometry are functional rather than expressive.

**Key Characteristics:**

- An uninterrupted pale grid behind editable objects.
- White floating control groups with soft ambient depth.
- Blue tool states, selection outlines, and primary actions.
- Pastel note fills kept separate from interface state colors.

## Colors

The palette combines cool neutral chrome, a clear blue interaction accent, and a multicolor note palette.

### Primary

- **Selection Blue:** primary actions, active tools, focus outlines, object selections, and chosen swatch outlines. The darker primary variant is used for primary-button hover; the pale selected variant marks active control backgrounds.

### Secondary

- **Pastel notes:** yellow, gold, orange, coral, pink, purple, blue, cyan, green, lime, white, and gray are the implemented object-fill choices. They belong to board content, not to priority or status messaging.

### Neutral

- **Canvas:** pale gray working plane.
- **Surface:** white floating containers and frame fills.
- **Ink / Object Ink:** near-black chrome text and default text, connector, and pen colors respectively.
- **Muted:** supporting labels and instructions.
- **Border / Grid:** subtle control separators and canvas grid lines.
- **Hover:** neutral rollover behind ordinary controls.

**The Content Color Rule.** Keep object fill choices separate from blue selection and action states.

**The Token Rule.** Chrome colours are CSS custom properties on `:root` in `style.css` (`--primary`, `--primary-hover`, `--on-primary`, `--selected`, `--canvas`, `--surface`, `--ink`, `--muted`, `--border`, `--border-strong`, `--hover`, `--danger`); tints are `color-mix()` of a token. Note and object colours stay literal because they are content. `tests/design-rules.test.ts` holds a ratchet on the remaining hex literals: it may only go down. The page declares `color-scheme: light`; a dark theme is not established.

## Typography

**Body Font:** Arial, Helvetica, sans-serif.

**Character:** Compact familiar sans-serif text supports the canvas without competing with it. No separate display face is established.

### Hierarchy

- **Title:** panel headings use the title role.
- **Body:** the root body role supplies ordinary controls and board-name text.
- **Label:** compact controls, secondary instructions, dropdown detail, and list rows use the label role; supporting paragraphs commonly use line-height 1.6.
- **Caption:** save status and small counts use the caption role; object subtype labels and shortcut keys are smaller still (10px).
- **Object:** sticky-note text defaults to horizontal and vertical center alignment. Auto size measures the chosen typeface and wrapped lines to fit the available note area; adding text shrinks it live while typing. Choosing a numeric size fixes the size until Auto is selected again. Object-level bold, italic, underline, alignment, and list choices apply to rendering and editing.

The empty-state heading is a surface-specific treatment (29px desktop, 26px below 900px, 23px below 600px), not a general display scale. The wordmark is likewise identity-specific.

**The Fixed Scale Rule.** Text uses 10, 11, 12, 13, 14, 16, 18 or 20px. The only exceptions are emoji glyph sizes and the two identity headings above, each marked with a `/* type-scale: glyph */` or `/* type-scale: display */` comment after the declaration; the design-rules test rejects anything else. Fluid `cqw` sizes inside scalable widgets are content and are not checked.

**The Touch Rule.** On a coarse pointer, chrome buttons keep their visual size but gain an invisible hit area of at least 44px (`--touch-target`), and form fields are at least 16px so iOS does not zoom on focus. Hover styles are written inside `@media (hover: hover)` so a tap never leaves a hover state behind. Canvas objects are excluded: they scale with the camera.

**The Calm Motion Rule.** Transitions animate `transform`, `opacity` or colour, never width, height or position. One global `prefers-reduced-motion: reduce` rule in `style.css` removes animation; an element that ships its own calm reduced-motion variant opts out with the `motion-alt` class.

## Layout

The editor occupies the viewport height (100dvh) with a positioned full-size SVG canvas. A world-space grid repeats every 40 units and scales with the camera. Controls are anchored around the canvas rather than in a scrolling page: identity at top left, document actions at top right, creation tools centered on the left, zoom controls at bottom right. Selection controls sit near the top center; object contents open in a right panel.

Desktop edges generally use the edge spacing token. The creation toolbar uses compact padding, 40px square buttons, and 3px gaps. Generic icon buttons are 36px square. Right contents panels use panel spacing and a 285px width. Shared spacing is compact and practical; the source does not establish a strict mathematical scale for every gap.

At widths of 900px and below, header text and panel widths compress and the local-save label disappears. At 600px and below, the written wordmark and export label disappear, creation buttons become 34px squares, selection controls tighten, and the footer's local-context label hides. Contents and shortcut panels use the available width with left-tool clearance. At heights of 760px and below, toolbar controls shrink and history becomes a horizontal group near the lower left. At 700px and below, the gallery categories become horizontal, focus-editor workspaces stack controls above previews, and selection formatting wraps. Record grids remain horizontally scrollable. These are implementation breakpoints, not evidence of a complete device-support guarantee.

**The Open Center Rule.** Anchor control groups around the working area and leave the center for objects.

## Elevation & Depth

Thin borders and diffuse shadows separate white control groups from the pale grid. Content notes receive a small SVG drop shadow; selected objects receive a blue outline and eight white resize squares at corners and edge centers. Depth conveys floating controls and paper-like notes, without large theatrical shadows.

### Shadow Vocabulary

- **Floating surface:** `0 3px 12px #2424420b, 0 1px 3px #24244206` across toolbars, panels, menus, and notifications.
- **Primary export:** `0 3px 8px #4262ff20` adds a restrained blue lift.
- **Note:** SVG drop shadow with vertical offset 3, standard deviation 3, and opacity .09.

## Shapes

Chrome uses gently rounded containers and tighter rounded controls. Floating surfaces share the surface radius; the creation rail slightly increases it to 13px. Controls use the control radius; swatches and shortcut keys use the swatch radius. Primary actions use the action radius, with a 10px export-button variant. One-pixel neutral borders define surfaces and dividers. Circular color selectors sit alongside square swatches.

Board content retains its native geometry: rectangular notes with a folded corner, rectangles, ellipses, diamonds, open frame outlines, straight, elbow, or curved connectors, and freehand strokes. Do not force content objects into the chrome's rounded-card silhouette.

## Components

### Buttons

Primary actions are blue with white content and weight 600. Export is a 48px-high labeled action on desktop and an icon-focused 44px action on narrow screens. Icon controls are compact rounded squares. Hover uses the neutral hover fill, except primary buttons use the darker primary variant. Active tools use blue on the pale selected fill. Disabled buttons use opacity .35. Implemented keyboard focus is a 2px blue outline with 3px offset; the canvas uses an inset offset.

### Cards / Containers

White floating surfaces unite header, tools, history, zoom, contents, help, menus, and notices. The shared border, radius, and floating shadow define the family; internal padding varies with density. They are editor chrome, not general content cards.

### Inputs / Fields

The board-name field is borderless and transparent inside the header. Sticky-note editing matches the note fill exactly, with compact side padding (4px) and no white inset, border, radius, or shadow. Measured top padding places wrapped text at the selected Top, Middle (default), or Bottom vertical alignment. Its textarea follows the object font, size, emphasis, and alignment and recomputes Auto fitting as the user types. Other canvas text editors retain a translucent white field and blue border. The canvas disables browser text selection during gestures; editing textareas explicitly restore text selection. Every colour control (object fill, line, border, text highlight and background, inspector) is a circular swatch of the current colour that opens one shared colour menu: brand colours, a ten-hue palette in five shades (light to dark, one Tab stop, arrow keys move through it), a hex field whose invalid input shows an inline red message, a native custom picker, then recent, saved and board colours. Border triggers draw the swatch as a ring. No general error-field or disabled-input system is established.

### Navigation

Creation tools form a vertical icon rail with outlined SVG icons. Formats and Flows opens a searchable gallery containing Diagram, Table, Timeline, and Kanban. The Essentials category contains Sticky note, Bulk mode, and Mind map; the ellipsis rail button opens this category. Category controls use pale blue selection; results pair bold names with muted descriptions. Shapes and lines groups rectangle, ellipse, diamond, and connector in a compact menu. Selected tools gain the shared blue state. Desktop hover reveals dark tooltips with shortcut badges; mobile hides tooltips. The board-contents list uses a small fill-color square, object text, a muted subtype, and a pale selected background.

### Sticky Notes and Selection

Pastel notes default to text centered on both axes, with Auto fitting that maximizes the font within the note and shrinks as content grows, a subtle paper fold, and the note shadow. Plain text has no note background. Blue selection sits just outside an object, with eight white square resize handles at corners and edge centers; outline and handle sizing compensate for zoom. Selection actions appear in a separate floating bar. Text-capable selections expose font family (Arial, Georgia, or Monospace), Auto or numeric size, bold, italic, underline, left/center/right alignment, and bullet/numbered lists. Active formatting uses blue selected states; controls wrap on narrow screens. The font picker previews each family name in its own typeface and renders the selected family in the closed control. Arial remains the interface default. A single selected note additionally exposes Top/Middle/Bottom vertical alignment (default Middle), plus Small (140), Medium (210), and Large (300 world-unit square) presets. Resizing preserves the note center and formatting: numeric font size stays fixed and Auto keeps fitting. Arbitrary dimensions display Custom.

### Sticky Links, Tags, and Connected Notes

The single-note Links and tags action opens a white floating details panel 8px below its action button, with viewport clamping and scrolling. Website link and comma-separated Tags fields remain drafts until Apply. Cancel, close, and Escape discard drafts; opening focuses the link field and closing restores focus. Clear a field and Apply to remove metadata. Links normalize to HTTP or HTTPS (a missing scheme becomes HTTPS), reject embedded credentials, and show validation feedback. Tags trim whitespace and remove duplicates, allowing up to ten tags of 32 characters each.

An explicit Open saved link action opens the saved URL in a new tab. Notes never navigate automatically. A link icon sits above the note; tag chips below show up to three tags and an overflow count. Badges do not intercept canvas gestures or consume note text space. Metadata, vertical alignment, and dimensions persist with the board and participate in history.

Add connected note creates a blank note 80 world units to the right, preserving source dimensions, fill, and formatting without copying text, link, or tags. Occupied positions shift it down by its height plus 40 units until clear, with 16-unit clearance; frames and connectors are excluded from collision checks. The attached source-to-new arrow and note share one history transaction: undo removes both and redo restores both. The new note becomes selected in text-edit mode, and the camera fits source and new note together.

### Connectors

A single selected connector exposes wrapping selectors for Straight (default), Elbow, or Curved routes; thickness presets of 1, 2, 3, 4, 6, 8, or 12px; Solid, Dashed, or Dotted patterns; and independent Start and End heads (None, Arrow, Open arrow, Circle, or Diamond). Line color uses the shared colour menu. Stored width accepts 1–12px. Existing connectors without style metadata retain a solid 2px straight line, no start head, and an arrow end. Selection adds a translucent blue underlay while keeping the chosen line color and heads visible.

Attached endpoints meet object boundaries. Straight routes aim toward the opposite endpoint; Elbow and Curved routes choose their primary axis from relative object centers (or free endpoint positions), then use axis-aligned boundary anchors. The white centered caption sits at the path midpoint, using 14px Arial, a 4px radius, and compact padding. Double-click, Enter, or the toolbar T action opens the inline white label editor. Enter commits, Shift+Enter inserts a line break, and Escape cancels. Labels allow up to 200 characters.

Label and connections opens a white 300px floating details panel below its originating action, constrained to the viewport. Label and Start/End connection fields remain drafts until Apply commits all three atomically. Cancel, close, and Escape discard drafts. Each selector offers Free endpoint and eligible objects; connectors, pen strokes, and frames are excluded, and both ends cannot attach to the same object. These selectors provide keyboard access to attachment changes.

A lone selected connector shows two zoom-compensated circular endpoint handles: blue-filled when attached and white-filled when free, both with a blue border. Dragging an endpoint within 12 screen pixels of an eligible object's bounds attaches it; Alt leaves it free. Reconnection previews from the gesture-start board and commits as one undo step on release. Shared gesture cancellation discards the preview. Style, labels, and attachments persist with the board and participate in undo/redo.

### Canvas Gestures and Alignment

Single and group selections expose eight resize handles at corners and edge centers; a lone connector has no resize handles. Visible handles stay 8px square with transparent 22px hit targets, and outlines compensate for zoom. Shift while dragging a corner preserves the starting aspect ratio. Group resizing scales selected positions and dimensions together. Dragging a connector detaches endpoints attached to stationary objects at their original visible positions, then translates them with the gesture. Endpoints whose objects move in the same selection stay attached, including connectors carried with frame contents.

Moving a frame carries objects fully contained within it when the gesture begins. Membership and starting geometry are frozen for that gesture; resizing a frame alone preserves content geometry. Dragging empty canvas creates a containment marquee; Shift adds to selection. Shift while moving constrains movement to the dominant axis.

Movement snaps selection edges and centers to other object edges and centers within a 6px screen-space threshold. Thin blue dashed guides show alignment. The footer magnet toggles snapping with the shared blue active state. Alt-drag duplicates the selected objects once movement begins and bypasses snapping during that gesture; cancel removes the preview copies and restores the original selection. Transparent hit rectangles keep object backgrounds draggable; structured child controls handle their own events.

Gestures preview from their starting board and commit on release. Escape, pointer cancellation, lost pointer capture, and window blur discard previews and clear guides; canceled panning restores its starting camera.

### Format Focus Editors

Explicit toolbar Edit actions retain white rounded focus editors above a dimmed canvas for settings and larger editing sessions. Title and explanatory text sit above the workspace and Cancel/Done actions below. Focus and Escape behavior follow the selected editor; draft-based editors apply on Done, while live editors commit each change. These dialogs complement the direct canvas controls.

Diagram combines a starter selector and monospace Mermaid code field with live rendering and syntax feedback. Mind map combines a topic list, topic field, and child/sibling/branch actions with a connected-node preview. Records offers Table, Kanban, and Timeline tabs over shared records, search, status filtering, sorting, and editable title, status, assignee, and date fields. Invalid date ranges show red feedback and disable Done. Bulk mode uses a smaller floating panel: each nonempty line becomes a note, with a visible count and a limit of 100 notes.

### Draw.io Focus Editor

Draw.io Diagrams joins the existing Diagram menus and click-to-place flow without changing the grid or surrounding chrome. The object is a white bordered diagram surface with a blue workflow icon, name, and editing instruction until it has a saved PNG preview. A preview fits within its bounds without cropping. Selection uses the friendly Draw.io diagram label and the shared selection controls; double-click or Edit opens the focused editor, while Export .drawio downloads its editable source.

The editor reuses the dimmed protected-focus overlay and white rounded dialog material. Its header names the diagram editor and identifies the online editor/local-save relationship. A labelled Diagram name field and Import .drawio control precede the large embedded workspace; save status, Cancel, and blue Save diagram actions sit in the footer. The dialog is limited to 1400px wide, with 20px viewport clearance. At 600px and below clearance becomes 8px, the name field takes a full row, tool controls wrap, and the footer stacks status above right-aligned wrapping actions. The editor's 18px heading is a local dialog treatment, not a new type token.

Opening focuses the labelled close control and closing restores the previous connected focus target. Host-level Tab wraps between the dialog's available controls and iframe; key and pointer events stop at the overlay so board shortcuts and gestures do not act behind it. Escape, close, and Cancel dismiss the draft while idle. Saving disables inputs and dismissal, removes the iframe from the tab sequence, and blocks its pointer interaction. The embedded application's internal keyboard behavior belongs to that online editor.

Loading has a quiet status layer. A connection or load failure replaces the iframe with a composed recovery region: workflow icon, Diagram editor unavailable heading, short source-preservation explanation, and Retry editor / Import .drawio actions. The hidden iframe leaves the tab order, an alert explains the failure, and the footer keeps Cancel and source-only recovery available. Retry retains the current draft. Imported .drawio or .xml source updates the draft and name; invalid input leaves the editor open with feedback. A preview-export failure offers retry and Save source only. Source-only saving persists XML locally and removes an outdated preview when the source changed; it does not render a new preview offline. Normal Save diagram stores XML with a locally saved PNG in one board update.

Desktop and mobile menu, protocol-editor, and unavailable-state captures verify Boardroom's host layout and recovery. The protocol-editor captures explicitly show a labelled synthetic external-editor fixture, including UTF-8 content. The hosted editor was blocked by ERR_NETWORK_ACCESS_DENIED in this environment; these captures establish neither hosted-editor visual fidelity nor a successful live-service session. The external editor requires a connection; source import/export and local persistence remain distinct capabilities.

### Structured Objects and Canvas Editing

Mind maps offer Auto layout in the selection toolbar and larger editor; older maps default to automatic layout. Inline non-root topic grips move whole branches in manual mode; Ctrl/Meta preserves the parent, and Alt + arrows move by one unit (Shift: ten). Valid attachment targets receive a blue highlight and named status. Escape cancels an active drag before finishing the session; pointer cancellation clears the preview. The fixed outer object still fits the content, and inline edits commit together on exit. The existing Arial stack in `widgets-diagrams.css` is intentional and follows the pinned interface typography despite the mechanical detector warning. See [MINDMAP-WORKFLOW-INTEGRATION.md](MINDMAP-WORKFLOW-INTEGRATION.md).

The record Fields disclosure uses existing compact controls for status names/order and typed custom fields. Visibility toggles hide inputs without discarding values; Kanban grouping exposes single-select fields. Synced cards reuse labelled typed inputs. Grid row/column grips support native dragging and Alt + arrow keys; border handles preview individual sizes before one undoable commit. Contained objects follow Grid geometry, and locked parents prevent their editing. Reordering requires unmerged cells. See [SCHEMA-GRID-INTEGRATION.md](SCHEMA-GRID-INTEGRATION.md) for supported kinds and limits.

Record handles support native drag-to-canvas and keyboard-accessible click to create a synced card beside the view. Note/card drops copy content into records and retain the source position; Kanban columns set the copied record status. Timeline uses + Schedule for undated records, a fading edge for a missing endpoint and a compact + action to complete that date. Controls retain the existing focus treatment and locking rules. See [RECORD-WORKFLOW-INTEGRATION.md](RECORD-WORKFLOW-INTEGRATION.md).

Structured objects retain white bordered surfaces and a compact draggable header. Table, Kanban and Timeline expose shared records directly on the canvas, with layout buttons in the header and scrolling for complete record access. Record titles and Grid cells are focusable fields with quiet transparent borders; focus uses the existing blue outline. Enter/blur commits a field, Escape discards its draft, and Grid Tab navigation moves between cells. Kanban cards, org-chart people and story-map cards have independent drag paths. Timeline bars move dates or resize endpoints in whole-day steps; the header still moves the widget. Grid formatting and structural actions appear above its cells. Locked objects disable editing.

Mind maps open inline on double-click/Enter or F2. Tab adds a child, Enter a sibling, Shift+Enter a line break, and Escape commits the editing session. Displayed topic labels preserve up to three visible lines, with truncation for fixed-size nodes. Docs expose editable formatted content with compact formatting controls; safe Markdown remains their storage format. Explicit selection-toolbar Edit actions retain the larger settings editors. Mermaid diagrams remain code-based previews with a focus editor.

Formats and Flows is a compact ordered flyout with nested Diagram and Engage menus. Tools, Media and Integrations keeps eleven observed categories, a cross-category search, and horizontal category scrolling on phones. Unsupported services are disabled and labelled Not available. Supported creation tools enter click-to-place mode; Escape cancels before creating an object.

### Advanced Canvas Objects

Planner, Journey and Ranking use the existing white bordered widget surface, compact draggable header and blue focus treatment. Real child controls capture their own pointer events while headers retain outer-object movement. Planner cards move natively between cells or before cards; Alt + arrows retain focus for consecutive moves. Dependency lines measure rendered card geometry and refresh on content/size changes. Journey stages and lanes have inline names and compact add/delete/order controls; cell move grips transfer text using a widget-specific drag type or Alt + left/right. Destination text is retained, and an over-limit append is rejected without truncating either cell. Emotion rows expose labelled controls and a curve. Ranking rows offer native and keyboard order changes, inline labels and question, add/delete and reset. Locked widgets disable these child actions. Larger toolbar editors remain available. See [ADVANCED-CANVAS-INTEGRATION.md](ADVANCED-CANVAS-INTEGRATION.md).

### Menus and Help

Tool galleries, Shapes and lines, Bulk mode, and tool options (including the sticky-note palette) open beside their originating rail button with a 10px horizontal gap. Placement updates on viewport or panel-size changes, clamps vertically within the working area, limits width to the remaining viewport, and scrolls when needed.

The export menu uses vertically stacked, left-aligned actions with small muted explanations. The shortcut panel pairs action labels and right-aligned key badges in a two-column list. These containers use the same floating material as other chrome.

Implementation evidence: the interaction model suite (28 tests) and production build passed. Desktop and mobile REA checks verified connector controls, style, labels, keyboard attachment changes, undo/redo, and persistence after reload, alongside earlier sticky metadata and connected-note checks. Actual native endpoint dragging remains unverified because the prior CUA URL access blocker prevented that check; drag behavior is documented from implementation.

### Next-20 Components

- **Routing and bends:** square white handles mark draggable segments; filled blue squares mark manual bends. Routing settings and a keyboard bend list sit in Connector details.
- **Arrange panel:** anchored below the selection bar; icon grid for alignment, labelled buttons for distribution and grouping, disabled states explain the minimum selection.
- **Locked objects:** small lock badge on the top-right corner, dashed grey selection outline and a reduced selection bar (Unlock, Duplicate).
- **Search:** amber highlight (#ffb020) distinguishes matches from blue selection; the current match is stronger.
- **Minimap and presentation:** minimap floats above the zoom bar; presentation hides editing chrome and leaves one floating bar with previous/next/exit.
- **Code blocks:** dark editor surface with a gutter, the only dark object on the canvas, so code reads as a distinct medium.

### Items 21–55 Components

- **Widget registry:** every new object kind is a pure spec (`specs-*.ts`, size, defaults, validation, search text) plus a view (`widgets-*.tsx`, renderer, editor, selection-bar actions). The tool gallery lists them by category with one icon each.
- **Live editors:** org chart, story map, journey, planner, ranking and quiz editors apply each structural change immediately as one undo step; text fields commit on blur or Enter; the footer has a single Close.
- **Interactive widgets:** only real controls (vote buttons, scale, preview inputs, players) capture the pointer; the body of every widget stays selectable and draggable.
- **Collaborate and review menu:** dot voting, timer, comments, private mode, templates and the accessibility check share one header button, so the header stays compact on phones.
- **Phone layout (390 px):** header text and save state collapse first; the gallery's category tabs scroll horizontally; the selection bar wraps; nothing scrolls the page sideways.
- **Accessibility:** interactive objects are announced as groups (not images), checklist previews carry names, toolbar names start with their visible text, and the axe scan is clean for the canvas, editors and panels.

## Do's and Don'ts

### Do:

- **Do** preserve the quiet grid and open canvas.
- **Do** reuse the white floating material for editor control groups.
- **Do** reserve blue states for actions, focus, and selection.
- **Do** compress peripheral chrome using the observed responsive rules.
- **Do** match sticky editing to its note fill and keep canvas gestures free of browser text selection.
- **Do** retain Boardroom's independent local identity.

### Don't:

- **Don't** add a white inset or border to sticky-note editing.
- **Don't** use note-fill colors as interface status semantics.
- **Don't** apply rounded chrome geometry to every canvas object.
- **Don't** infer service features or compliance claims from visual resemblance.
- **Don't** promote the empty-state title or wordmark typography into a general display-font system.

Manual mind maps now preserve a fixed coordinate viewport. Their displayed topics do not rescale during manual branch edits; finishing an edit expands the outer object as needed while untouched world coordinates remain fixed. Manual maps use the full body for the diagram. Auto layout retains automatic fitting. Grid sizing offers Auto/Manual; modifier drops preserve cell-relative offsets. Timeline supplies saved calendar scales/ranges, Autofit, row handles/end drop zone and drag dependency handles. See PARITY-NEXT-SIX.md for validation and limitations.
