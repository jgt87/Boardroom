# Changelog

## Unreleased

### Import from other whiteboards: REST JSON

- New **Whiteboard JSON (REST export)** import (Upload menu): a board exported through another whiteboard
  service's public REST API (v2 board items and connectors) opens as a new library board. The same file is also
  recognised by the regular board import, by "Import as a new board" and when dropped on the canvas (other JSON
  files dropped on the canvas are still kept as File objects). Nothing on the open board is replaced.
- Mapping (`src/whiteboard-import.ts`, pure): sticky notes (colour names to the sticky palette, rectangle shape,
  alignment, tags), shapes (nearest Boardroom shape, including the flowchart shapes; fill, border colour, width,
  style and opacity, text colour, font and size), text, frames (titles, nested frames), cards and app cards (title,
  description, due date, custom fields, accent, tags), images (as images when the export carries the file,
  otherwise as links), embeds (allow-listed providers as embeds, others as bookmarks), link previews and documents
  (bookmarks), connectors (remapped ends, attached sides, straight/elbow/curved, stroke colour, width and style,
  end caps including ERD caps, captions as labels with colour and size). Item centres, frame-relative positions,
  rotation and lock state are converted; frames paint first.
- Rich text arrives as HTML and is read as data into text plus style spans (bold, italic, underline, strike,
  colours, safe links, lists, paragraphs); scripts, styles and unknown markup are dropped, never injected.
- The import message reports what was created and what was skipped, per type (for example "Skipped 3 mind map
  nodes"), plus objects over the 2,000-object limit, connectors whose ends were not imported, approximated shapes,
  images kept as links and card assignees that are only user ids. Malformed entries are skipped, never fatal.
- New `prototype/scripts/export-whiteboard.mjs` (Node 18+, no dependencies) writes the export file: board details,
  all items and connectors (cursor pagination, 50 per page), board and item tags, and optionally image files
  (`--images`). The token comes from `WHITEBOARD_TOKEN` only, is never printed and is only sent to the API host
  (`WHITEBOARD_API`); 429 responses wait for `Retry-After`; 401, 403 and 404 stop with a clear message. See
  `prototype/scripts/README-export-whiteboard.md`.
- Tests: `tests/whiteboard-import.test.ts` (hand-written fixtures: nested frames, connectors, unknown types, bad
  values, limit, random junk), `tests/export-whiteboard.test.ts` (the script against a local mock API: pagination,
  429 retry, tags, images, error messages, token never printed) and `e2e/whiteboard-import.spec.ts` (upload menu,
  regular import, drop).

### Import from other whiteboards: CSV to sticky notes

- New "CSV as sticky notes" choice in the Upload gallery: a .csv, .tsv or .xlsx file becomes one sticky note per row, laid out in a tidy grid centred on the view, in one undo step (`csv-stickies.ts`, reusing the existing CSV parser).
- With a header row, the note text comes from the first column named content, text, title, sticky, note, idea or name (else the first non-empty column). Colour columns (hex codes or colour names) map to the nearest sticky colour, tags columns (comma or semicolon separated) become note tags, author or assignee columns set the note author, and group, category, column or frame columns put each group in its own titled frame, side by side. Without a header, every non-empty cell becomes a note and each CSV column a column of notes.
- Rows without text are skipped; the import stops at the 2,000-object board limit. The message reports how many notes and frames were made, how many rows were skipped and how many notes were left out.
- A spreadsheet dropped on the board (not on a Grid) now asks "Table" (the default, as before) or "Sticky notes" in the in-app choice dialog; Cancel adds nothing.
- Pasting a note export (a header naming the text column, as tab-separated cells or comma lines) still pastes a Grid or line notes as before, and the notification now offers "Sticky notes per row" next to "One sticky per cell".

## 0.5.0 — 2026-11-05

### Decided questions, colours and records
- **Colour menu everywhere:** Kanban column colours, number colour rules and progress bars (record fields), QR code and background, icon, Action Shortcut, Grid cell and cell text, slide background and prototype screen background now use the shared colour menu (palette with shades, hex field, custom picker, recent, saved and brand colours) instead of the browser's colour input. The menu opens above editor dialogs and focus views. The sensitivity label's custom colour (inside the main menu) and the brand kit editor keep the browser picker.
- **Sticky colour memory:** a colour applied to sticky notes through the selection bar or the inspector becomes the colour for new sticky notes, and the tool-rail swatches show it (as an extra swatch when it is not one of them). Colours applied to shapes, text, connectors or a mixed selection leave it alone.
- **Unknown card estimates:** the "?" estimate chip now marks a card's story points as unknown instead of clearing them. The card shows "? pt", keeps its T-shirt size, and totals skip it; a numeric chip replaces it and Clear estimate removes it. The card bar's estimate menu has a "?" chip too, and CSV export writes "?". Stored as an optional `pointsUnknown` flag on card data, validated on load; older boards load unchanged.
- **T-shirt sizing entry:** "T-shirt sizing" in the tool gallery (Planning) places the estimate palette in Sizes mode; "Story points" still starts in Points mode. Both can be dragged onto the board.
- **Minimal result tables:** polls and voting results exported to a Table hide the Status, Assignee, Start and End columns, so rows no longer all read "Not started"; only the option or item and the result columns (votes, share or rank) show, in a narrower table. Fields → Table columns shows them again. Stored as an optional `hiddenBuiltIns` list on the record schema, validated on load.

### Decided questions, paste, modes and exports
- Pasting or duplicating objects (copy/paste, Ctrl+D, Alt+drag, Alt+arrow, duplicate layer) no longer copies the voting dots placed on them, unless their dot pile is copied too: then the copies hold the dots and count against the copied pile. The original piles keep their counts (question P1-Q5).
- On a comment-only or view-only board, board settings are read-only: the board name, status, sensitivity label, background, start view, thumbnail, emoji and description show their current value, but their controls are disabled, with a note saying why (question P2-Q11).
- The web page export shows the board's sensitivity label beside the board name and as a stamp fixed in the bottom-right corner of the window, in addition to the stamp in the SVG (question P2-Q12).
- Word (.docx), OpenDocument (.odt, .odp), RTF and PowerPoint (.pptx) files converted into a Doc or Slides are always also kept as a File object beside the conversion (up to 25 MB), in the same undo step (question P2-Q8).

### Decided questions, media and diagrams
- A video remembers its playback speed: the speed chosen in the player (menu or < and >) is stored on the video and used the next time it plays, also after a reload. Normal speed stores nothing; locked videos keep the speed for that play only.
- Talktrack and video cuts can be drawn on the waveform: drag across it to cut a part out, or drag the edge of a cut to move that end. Typed times still work, and Apply stores every change as one undo step. When the sound cannot be read, a plain timeline takes the waveform's place so cuts can still be drawn.
- A callout's custom tail is part of the callout: clicking or dragging it selects and moves the callout (with a few pixels of tolerance near the thin tip), a connector end dropped on it attaches to the callout, and on large boards a callout stays rendered while its tail is in view.
- Frames linked to Mermaid code have the same status chip as Mermaid objects: set it from the selection bar (one undo step per press). It is drawn top-left inside the frame, does not count as a diagram change for the sync badge, and stays after unlinking.
- Dropping a .drawio file on the board asks, in the app, whether to add it as a draw.io object or as native shapes; Cancel or Esc adds nothing. The "Draw.io as shapes" gallery entry still imports directly, without asking.
- Native-shape import now brings in every page of a multi-page .drawio file: the pages sit side by side, each in a frame named after its page, and empty or unreadable pages are left out and reported. Converting a multi-page draw.io object to shapes does the same.

### Decided questions, timelines and notes
- **Shared Timeline flags:** free flags now belong to the records, not to one Timeline object, so every Timeline view of the same dataset shows and edits the same flags (stored as `timelineFlags` on the dataset's columns and checked on load). Older boards move each Timeline's own flags to its dataset when they load; flags of two Timelines of one dataset are merged (identical flags kept once), and a Timeline pasted from an older copy shows its flags merged until the next flag edit moves them. Adding or removing a flag is one undo step; up to 50 flags per dataset.
- **Note templates insert at the caret:** choosing a template in Board notes no longer replaces the notes. It goes in after the paragraph holding the caret (before it when the caret is at its start, in place of an empty line), or at the end when the editor had no caret. One undo step removes it. Doc objects still replace their content.
- **Timeline starter templates:** a new Timeline offers Project roadmap, Release plan and Event schedule under "Start from a template", like the Table and Kanban column sets. Each brings statuses, fields, dated records counted from today with milestones and dependencies, a flag and a fitting scale; flags added before choosing are kept.

## 0.4.0 — 2026-11-05

### Connectors and diagrams
- Every connector label drags along its line on a selected connector, not only the main one, and each label (main or extra) has its own colour and font size in Connector details. Each drag or change is one undo step.
- Callouts (speech, oval and thought bubbles) have a tail handle: drag it onto an object and the tail points at that object and follows it when it moves; hold Alt to leave it free. "Reset callout tail" restores the built-in tail. Pasted and duplicated callouts keep pointing at copied objects, and a tail whose object is deleted stays where it pointed.
- Seven new Diagramming templates built from native shapes and connectors: Org chart, Mind map, Sequence diagram, ER diagram (crow's-foot relationships), Network diagram, Customer journey flow and Decision tree.
- Org chart people have custom fields (name and value), and each chart chooses which fields its cards show ("Shown on cards"; team and location by default). CSV import turns unknown columns into custom fields, and CSV export writes them back as columns.
- A sticky note or card dropped onto a Timeline becomes a record scheduled where it was dropped: the start is the day under the pointer and the end one day (days scale) or one week later. A card's later due date is kept as the end.
- Draw.io files import as native shapes: "Draw.io as shapes" in the Upload and Diagram menus, or "Convert to shapes" on a Draw.io widget. Plain and compressed pages are read; rectangles, rounded rectangles, ellipses, diamonds, text and other common shapes keep their fill, line and text colours, edges become connectors between them, and unknown styles become rectangles. Imports stop at the 2,000-object board limit and report what was left out.

### Pen, platform and board modes
- **Pen pressure:** strokes drawn with a stylus record the pressure of each point and are drawn as a filled outline whose width follows it (a light touch is thinner, a firm press up to 1.8× the chosen width), on the board and in SVG, PNG, PDF and print exports. Mouse and touch strokes are unchanged, and a pen that reports one constant pressure draws like a mouse. Simplifying, resizing and erasing keep each pressure with its point, and simplifying keeps a point where the pressure swings on a straight run. Pressure is checked on load (0 to 1).
- **Browser zoom up to 200%:** at about 640×400 CSS pixels (a laptop window zoomed to 200%), the tool rail starts under the header and scrolls, undo and redo sit beside it, the header shrinks so it never runs under the top-right toolbar, and the export menu scrolls. Main menu submenus that would leave the window move to the other side or overlap their parent, and scroll when taller than the window.
- **Supported browsers notice:** when the browser lacks IndexedDB, ResizeObserver, CSS `:has()`, `structuredClone`, pointer events or local storage, a notice says what will not work. It does not block the board; dismissing it is remembered on this device until a different feature goes missing.
- **Comment-only boards:** Main menu → Board → Comment only. Comments can still be added, replied to, resolved, reacted to and deleted; every other change is refused with a message. A "Comment only" badge shows in the top bar. Comment only and View only exclude each other, and both are saved with the board.
- **Sensitivity label:** Main menu → Board → Sensitivity label sets Public, Internal, Confidential or Restricted, or a custom label (up to 40 characters) with its own colour. The label shows as a badge beside the board name and on the board's dashboard card, and is stamped in the bottom-right corner of SVG, PNG, JPG and PDF exports and prints. It is validated on load.
- The View only badge in the top bar now has a background (its white text was unreadable on the white header).

### Files and containers
- **OpenDocument and RTF import:** .odt and .rtf files become a Doc (headings, bulleted and numbered lists, bold, italic, strikethrough, underline and, for .odt, simple tables); .odp files become Slides, one slide per page with its title and text. Speaker notes, comments, footnotes, pictures, font and colour tables are left out. Drop the files on the board or use Upload → "OpenDocument or RTF as Doc" / "OpenDocument slides as Slides". Files are read as data only.
- **File object:** any other file (other Office formats, archives, text…) dropped on the board, or added with Upload → Any file or Media → File, is kept as it is (up to 25 MB): a card with a type icon, the name, the size and Download. The bytes are stored as opaque data, never previewed or opened, are kept by startup pruning while referenced, and travel in JSON backups and `.boardroom` bundles.
- **Office Online and Power BI embeds:** OneDrive (`onedrive.live.com/embed`) and SharePoint (`*.sharepoint.com` with `action=embedview`) embed links and Power BI reports (`app.powerbi.com/view` and `/reportEmbed`) can be embedded; the Content Security Policy allows exactly these origins. Other links from those services are refused with a hint.
- **Duplicate layer:** a new button in Board layers copies a layer and its objects to "<name> copy" directly above it, with new ids; connectors, object links, groups, auto-layout children and Grid cell objects between copied objects point at the copies. One undo step.
- **Larger grids:** a Grid holds up to 100 rows or columns and 2,500 cells (for example 50 × 50 or 100 × 25); spreadsheet imports and pastes keep every column that fits, then as many rows. Grids over 400 cells draw cells as text with one live field on the current cell, so the canvas stays responsive.
- **Auto-layout spacing handle:** a selected auto-layout container shows a blue handle between its first two children; drag it to change the gap with a live preview (Shift snaps to 8), or use the arrow keys. One undo step; locked containers show no handle.
- **Web page export click-through:** objects linked to another object or frame are clickable in the exported web page and fly the view to their target; Back returns to the previous view. The page still loads no external scripts.

### Templates, notes and navigation
- **Board notes:** a docked notes panel per board (Alt+N, View → Board notes, or "Board notes" in Commands), edited with the same rich text editor as Docs and stored with the board, so it travels in backups.
  - Each save is one undo step. View-only boards show the notes read-only.
  - Notes are found by the dashboard's content search, and "Export notes as Markdown" saves them as "<board> notes.md".
  - Note templates: Meeting notes, Retro notes, Decision log and 1:1, each dated with today's date.
- **Doc block selection:** in a Doc (and in board notes), Esc selects the block holding the cursor; Esc again leaves the Doc.
  - With blocks selected, Up/Down moves the selection, Shift+Up/Down extends it, and Alt+Up/Down moves the blocks.
  - Delete or Backspace removes the blocks, Ctrl+C and Ctrl+X copy and cut them as Markdown, and Enter goes back to typing.
  - Esc used to discard unsaved typing; typing is now kept when you leave a Doc.
  - Leaving a Doc without changes no longer records an extra undo step.
- **Starter columns for Tables and Kanbans:** a new Table or Kanban offers "Templates…" (Bug tracker, Sprint backlog, Content calendar, CRM pipeline) with statuses, custom fields and two example records. The menu disappears once the format holds real work; Undo brings back the starter record.
- **Sticky note sets:** the sticky note tool offers "Note sets…" (Retro, Start/stop/continue, Brainstorm, SWOT). The pre-coloured notes are placed at the centre of the view as one group.
- **Template gallery sort:** sort the Templates panel by Featured, Name, Category or Recently used. The choice and the last use of each template (inserted, or used for a new board) are remembered in this browser.
- **Quick-create links:** opening the app with `#new` creates and opens a blank board; `#new=<template>` (for example `#new=kanban-retro` or `#new=swot`) starts from a starter template, and `#new=doc`, `table`, `kanban` or `timeline` makes a single-format board. The address is cleared at once, so reloading never creates another board.

### Library, history and records
- **Board emoji:** set one short emoji or symbol in Main menu → Board → Board emoji (suggestions or typed) or in Board details. It shows beside the board name and on its dashboard card, is kept in the board index (validated like space emoji), follows duplicates and travels in backups.
- **Back up one or selected boards:** each dashboard card and Board details have "Back up", and the dashboard selection bar backs up the selected boards together. The file uses the library backup format, with only those boards, their spaces, emoji and media, so Import restores it next to existing boards.
- **Catch-up walkthrough:** Catch up steps through the changed objects one by one (oldest change first) with Previous and Next, shows "n of N" and the change, and zooms to each object.
- **Restore several deleted objects:** History lets you tick deleted objects (or all of them) and restore them in one undo step. Connectors deleted in the same change come back attached when both their ends are restored or still on the board; a connector end whose object is missing is left loose instead of pointing nowhere.
- **Boards in this space:** Main menu → Board → Boards in this space lists the other boards in the open board's space (or the boards without a space) and opens one.
- **Saved view order:** "Order views" on a Table, Kanban or Timeline lists the saved views; drag one to a new place or press Alt+Up/Down on it. The order is shared by every view of the dataset.
- **Timeline flags:** add free milestone flags (date, label and colour, up to 50) from the Timeline's Flags menu. They are drawn as dashed coloured lines with a labelled flag, are kept with that Timeline (not in saved views or records) and widen the fitted range.
- **Timeline bar warnings:** a warning icon on a bar explains in its tooltip when a date is not a real calendar day, the end is before the start, a milestone has a range, or the bar starts before a record it depends on ends.
- **Status chips on Mermaid, mind-map and draw.io objects:** the selection bar's Status button steps through the board statuses as for Docs and Slides, and the chip is drawn in the object's top-left corner.

### Media and comments
- **Video and Talktrack player:** a playing video now has its own controls bar with back and forward 10 seconds, play/pause and a speed menu from 0.5× to 2×. The native controls stay available.
  - When the player has focus (it takes focus as playback starts): J or ← goes back 10 s, L or → goes forward 10 s, K or Space plays or pauses, and < or > changes the speed. These keys never reach the board.
  - The trim start and end still apply, whether you skip, scrub or play through.
- **Cut parts out of a recording:** the video editor ("Rename or trim") has a "Cut out of the middle" list. Add as many cuts as needed (up to 50), each with a start and end time. Cut parts are skipped during playback, and the poster shows the length that will actually play.
  - A waveform of the recording's sound shows the trimmed-off ends and the cuts. When the browser cannot read the sound (no audio track or an unsupported codec), a note says so, and trim and cuts still work.
  - Cuts are validated on load: sorted, non-overlapping ranges.
- **Animated GIFs:** every animated GIF has a play/pause button. It is always shown while the GIF is paused, and on hover or focus while it plays, whatever the reduce motion setting. Pausing or playing this way changes only your view.
  - The selection bar adds two stored settings: "Start animation paused", and "Play animation once" instead of looping. Pressing play replays a play-once GIF from the start.
- **Crop shapes for images:** the circle crop is now a "Crop shape" menu with circle, rounded rectangle, triangle, hexagon, star and heart, plus "No crop shape". Select several images to apply one shape to all of them as a single undo step. Locked images are left alone, and exports keep the shape.
- **Pinned comments stay open on the canvas:** a pinned, unresolved thread now shows as an open comment card beside its pin, with its latest messages, until it is unpinned. Each card can be collapsed to one line (remembered on this device), unpinned, or opened to reply or edit. Cards are hidden while presenting, when comments are hidden, and in exports.

### Focus views and slides
- **Full-viewport focus view:** Table, Kanban and Timeline records, Mermaid, mind maps and Docs now open over the whole canvas instead of in a centred modal.
  - The header shows the title (with the object's name for records), an "Esc closes" hint and a Close button.
  - Tab stays inside the view, the canvas and toolbars behind it are hidden from screen readers, and focus returns to where it was on close.
- **Open a board in a format:** Board menu → Start view → "Open in: …" lists the board's Tables, Kanbans, Timelines, Docs and Slides. On opening, the board shows that object in its focus view. A link to another object still wins.
- **Slide images:**
  - "Export slide as PNG" saves the visible slide at 1920×1080.
  - "Export all slides as PNG (ZIP)" saves every slide, one PNG each, in a single ZIP.
- **Slide sorter:** opened from the deck's sorter button, the Edit button or Enter.
  - It shows the slides as a grid of thumbnails beside an editor for the selected slide.
  - Drag a slide, or press Alt with an arrow key, to reorder. Arrow keys move between slides. "Present" starts the deck from the selected slide.
- **New activity slide layouts**, each counted on this device only, like the poll. They work on the canvas and while presenting:
  - **Scale:** one statement rated 1–5 or 1–10, showing a bar for each rating, the number of ratings and the average.
  - **Word cloud:** each word entered appears in the cloud, sized by how often it was entered. Case and extra spaces are ignored.
  - **Open-ended:** answers are collected as a list.
  - "Reset responses" clears a slide's results.
  - The PDF export lists the results.
- While presenting, typing in an answer box no longer changes slides or toggles notes.

### Colours
- **Colour system:** every colour control (object fill, line colour, border, text highlight and background, and the inspector) opens the same colour menu. It adds a palette of ten hues in five shades from light to dark, with spoken names and arrow-key navigation, and a hex field (#rgb or #rrggbb; Enter applies; invalid input shows an inline error). New shapes, text and connectors start with the colour last applied to that kind in this session.

### Text editing, paste and sticky notes
- Pasting a single web address while words are selected in the text editor links those words instead of replacing them.
- Long pasted prose (over 600 characters with paragraph breaks, or a line too long for a note) becomes a Doc instead of sticky notes or a huge text object. Short multi-line paste and plain lists still become sticky notes.
- Pasted spreadsheet cells still become a Grid, and the notification now offers "One sticky per cell" to turn them into notes laid out like the cells (one undo step back to the Grid).
- Dragging a corner handle of a text object scales its font with the box, keeping proportions; side handles (or Shift at a corner) still reflow the text.
- Sticky notes can be rectangles (2:1) as well as squares: a shape option next to the size presets, saved with the note.

### Selection, touch and widget keyboard
- **Selection:** "Select objects the box touches" (main menu → Accessibility, off by default) makes the selection box pick objects it overlaps, not only those fully inside it. An object that encloses the whole box, such as the frame it was drawn in, is left out. Holding Alt while releasing the box inverts the setting for that drag.
- **Touch:** holding a still finger on an object for half a second selects it and opens its context menu; on empty canvas it opens the canvas menu. Moving more than 8 px, lifting, a second finger or the pen cancels it, and palm rejection is unchanged.
- **Kanban keyboard:** on a focused card, Enter adds a card below it in the same column (and lane) with its title ready to type, Ctrl+Up/Down adds one above or below, and Tab / Shift+Tab move to the next or previous card. Each addition is one undo step.
- **User story map keyboard:** in the story map editor, Tab on a story adds a sibling in the next activity (adding an activity after the last one), and Ctrl+Down/Up adds a story below or above in the same cell. The new story is selected and focused.
- **Keyboard navigation:** Ctrl+Shift+Down with nothing selected selects the first object in reading order.

### Drag-and-drop chips
- **Estimate chips:** a new palette (Planning: Story points, T-shirt sizing) shows story points (0–21 and ?) or T-shirt sizes (XS–XXL). Drag a chip onto a card to set its estimate, or onto a sticky note to give it an estimate badge. XXL is now a card size too.
- **Dot pile:** a new Collaboration widget holds a set number of voting dots in one colour. Drag dots onto any object; the pile shows how many are left. Click a placed dot to return it. "Return all dots" empties the board of that pile's dots.
- **People avatars:** drag an avatar from a People widget onto a card to assign it, or onto a sticky note to show a person chip.
- Every drop is one undo step, and locked objects refuse chips. Pressing a chip (click, Enter or Space) applies it to the selected objects. A selected sticky shows a × on its estimate and person chip to remove them.

### Facilitation widgets
- Alignment scales rate up to six statements. Clicking a step adds a response counted on this device, and each statement shows its average and a small distribution bar. Older single-marker scales still load and read as one statement.
- Polls can hide their results until revealed (selection bar or editor), and "Export to Table" puts the options and vote counts in a new Table beside the poll.
- Voting results: "Add results to board" in the Dot voting panel places a ranked Table (item, votes, rank) beside the voted objects, as one undo step.
- Action Shortcuts offer 22 actions in groups: navigate, present, facilitate (timer, dot voting, comments, private mode), panels (layers, outline, minimap, commands), view (grid, view only), create (sticky note, text, pen, comment) and export (PNG, PDF).

## 0.3.0 — 2026-11-04

### Help-center gaps, closing round
- **Text and records:**
  - Code blocks get a text size and line numbers.
  - Table, Kanban and Timeline get status chips.
  - "Clear formatting" (Ctrl+\) in the text editor and Docs.
  - With reduce motion on, animated GIFs pause on their first frame, with a play button.
- **Files and data:**
  - XLSX import asks which worksheet to use.
  - CSV dates such as 03/04/2026 take their day/month order from the rest of the column.
  - "Download original" returns the real SVG or BMP file.
  - Saved blueprints are included in library backups.
  - Pasted images go through the same checks as imported files.
- **Canvas:**
  - A locked linked Mermaid diagram keeps its code.
  - Cutting a linked diagram takes the whole diagram.
  - The shape inserted on a connector can be chosen.
  - Resize cursors follow rotation, and resizing a multi-selection no longer skews rotated objects.
  - Brand colours appear in every colour picker.
  - Enter on a focused toolbar button presses it instead of opening the editor.

### Sticky stack peel, start-up screen and focus ring
- **Peeling a note off a sticky stack** is animated frame by frame:
  - The sheet bends while still glued, tears off past a threshold, tilts while carried, and settles on drop.
  - The next sheet curls up.
  - Released early, the sheet springs back and nothing is taken.
  - The paper never stretches.
- **A new start-up screen** has the Boardroom mark, sticky notes landing on a mini board, and a progress bar. It covers slow and error states (with a Reload button), dark mode and reduced motion.
- **The whole-board focus ring** now shows only for keyboard navigation, so it no longer appears while dragging notes.

### Rich text, swimlanes and linked Mermaid diagrams
- **Rich text:**
  - Text objects get per-word bold, italic, underline, strikethrough, colour and highlight, links (Ctrl+K) and @person chips, with a floating mini-toolbar.
  - Docs get links (Ctrl+K), highlight, text colour and @person chips.
- **Swimlanes:**
  - A container with horizontal or vertical lanes and optional phases. Its contents move with it and stay in their lanes when lanes are added, reordered or resized.
  - A "Cross-functional flowchart" template.
- **Linked Mermaid diagrams:**
  - Converted shapes stay linked to their code. An edit panel shows the code next to the shapes, with two-way sync for flowcharts and a choice when both sides changed.
  - Unlink keeps the shapes.

### Help-center gaps, round 2
- **Keyboard and access:**
  - Place tools with Enter, extend the selection and resize from the keyboard, enter and leave groups.
  - Alt+I describes the selection.
  - Toolbars with arrow-key focus, spoken colour names, and a board outline by frame.
  - Links to objects and focus views.
- **Export and files:**
  - Frame titles in PDFs, export of a chosen area, SVG of the selection, and Print.
  - SVG and BMP images, spreadsheets into Grids, "Download original", pictures dropped from web pages, and Google Docs, Sheets, Slides and Loom embeds.
  - Image flip and brightness.
- **Library:** template previews, export and a picker; six templates; last-opened sort and list view; comment search; space emoji, descriptions and blueprints; a cross-board overview; object created and modified times; a brand kit.
- **Presenting and records:**
  - Timer, reactions and voting while presenting, and slide presenter notes.
  - Hidden Kanban columns, record colours, number formats and colour rules.
  - Doc list shortcuts and :emoji.
  - Frame copies, comment pin colours, unread markers and drafts.
- **Diagrams and canvas:**
  - Mermaid sequence, class, state and ER diagrams, and shapes back to Mermaid; entity tables; saved custom shapes.
  - Mind-map topic shapes and links; clusters in frames.
  - A colour menu with recent colours and an eyedropper; typed lists; hidden frame titles.
  - A smarter pen, and pen versus touch with palm rejection.

### Help-center gaps closed
- **Paste and drop:** spreadsheet cells become a grid, a link becomes an embed or bookmark, Mermaid code becomes a diagram, and several lines become sticky notes. PDF, video and MOV files can be dropped on the board, and images over 4 MB are scaled down instead of refused.
- **Exports:** copy as image (Ctrl+Shift+C), image size choice, PDF of selected frames, text and grid CSV, a read-only web page with pan and zoom, mind map outlines in Markdown, and passphrase-protected backups.
- **Boards:** trash with restore, backup and restore of all boards, import as a new board, descriptions, status filter, spaces, bulk actions, content search, saved versions, "since my last visit", a view-only mode and a thumbnail chosen from a frame.
- **Editing:**
  - Rotation, snap to grid and dot grid, named layers, switch type, find and replace.
  - Select by type, create frame around, clear contents, copy and paste style.
  - Corner radius, centre resize, image border and circle crop, more fonts.
  - Links show a "Go back" button after you follow them.
- **Diagrams:** crow's-foot heads, several connector labels, 45° drawing, "+" quick-connect handles, insert a shape on a line, mind map collapse, colours and layouts, and org chart fields with CSV import and export.
- **Keyboard and access:**
  - Tab and Ctrl+Arrow between objects with announcements, a skip link and a board summary (Alt+S).
  - Keyboard zoom and pan, z-order keys, more single-key shortcuts and keyboard connecting.
  - Pinch zoom on touch screens, and tools you can pin and drag from the toolbar.
  - The accessibility checker now checks non-text contrast and untitled frames, and its false contrast warnings on dark objects are fixed.
- **Presenting and facilitation:** presenter notes, hidden slides, a slide grid, timer tweaks, voting time limits, sticky clustering, notes to doc, frame styles, comment edit/pin/react, @mentions, estimate chips, slides from frames with PDF export, a recordings list with video trim, emoji reactions on sticky notes and sticker counters.
- **Records:** swimlanes, footer calculations, progress bars, formulas, links, sub-records, saved views, and column colours and capacity.
- **Docs and formats:** a chart widget, CSV/XLSX import into tables, .docx import, Doc PDF export, Doc shortcuts, status chips, eight new templates and template search.

### Cards
- **Card panel:** an expand icon on every card, or Ctrl/Cmd+Shift+Enter, opens one panel with a rich-text description (bold, italic, underline, lists, link on paste), start and due dates, status (now optional), an assignee picked from the board's people, coloured tags, story points and T-shirt size. Title and description each hold up to 20,000 characters.
- **Card face:** the description is no longer drawn on the card; a marker shows that one exists. Dates show as a range, and tags use their colour and can be removed with a click.
- **Card bar:** select one or many cards to set status (or remove it), assignee, dates and tags, or to export them to a spreadsheet (CSV).
- **Switch type:** turn sticky notes, text boxes and shapes into cards, one at a time or many at once.
- Export → Export to spreadsheet (CSV) exports the selected cards, otherwise a record view, otherwise every card.

### Look and behaviour matched to the reference board
- **Main menu** (⋮ beside the board name) now has Board, Edit, View, Preferences, Accessibility and Assign status submenus, with keyboard navigation; menus close on Escape or a click outside.
- **Tool rail:** Comment and + (tools) buttons; only one rail popup at a time; undo/redo sit below the rail at the same size, and the rail moves aside when History, Catch up or Details is open.
- **Shapes and lines** is a compact list (Line, Arrow, Elbow arrow, Block arrow, Rectangle, Oval, Rhombus, Triangle, Divider, More shapes, Diagram). The **sticky note** popup is a two-column palette with a Stack button.
- **Sticky stack:** a card holding a pad of notes with a curled corner; drag from the pad to take any number of notes (the note lifts while dragged and the curl settles back); drag the title to move the stack.
- **Selection:** outline with a small gap, round corner handles, and four connection dots; drag a dot to draw a curved connector that previews its attachment, highlights the target and attaches to the nearest side, leaving a small gap. **Swap line ends** reverses a connector.
- **Sticky authors:** a Show author button per note shows, bottom-left, the person who last edited its text.
- **Header and top bar:** Export is an icon beside the main menu; the top-right buttons form one bar ending in a ▶ Present button.
- **Bottom bar:** Frames, zoom out, zoom %, zoom in and a Help menu (keyboard shortcuts, commands). The zoom menu offers full screen, Show minimap, Grid, Object dimensions, Fit to screen, presets and exact view; the minimap starts hidden.
- **Sticky toolbar:** one compact row (font, size, bold) with More text options for the rest. Corner handles are grey-outlined; connection dots are solid blue.

### Parity with the live inventory: view menu, people, capture, templates
- **View menu:** the zoom percentage now also offers 50–2000% presets, Fit to screen, and toggles for Grid, Object dimensions (W × H under the selection), Minimap, Spell check and full screen. Zoom goes up to 2000%.
- **People** and **User card** objects show who works on a board, using the local profile name (no server accounts).
- **Talktrack** records your screen and voice, and **Photobooth** takes a camera photo; both add the result to the board and stay on this device (needs localhost or HTTPS).
- **Save board as template** (Export menu) keeps a board's layout in this browser; insert or delete it from Templates → My templates.
- **Sticky notes** have 16 colours, including four dark ones whose text turns white automatically.
- **Action Shortcut** buttons open a link, jump to a frame, start presenting or open the timer. **Spellchecker** turns spelling marks on or off. A **Frames** button in the bottom bar opens the frames list, which can add a frame.
- **Validation report** lists loose connectors, unlabelled, unconnected and overlapping shapes. **Stickies capture** turns a photo of paper sticky notes into digital notes in the same colours and layout.
- **Pen panel:** Smart pen turns hand-drawn boxes, circles, triangles and straight strokes into real shapes and lines; Lasso selects objects inside a drawn loop; three pen presets remember colour and width.
- **Board menu** (⋮ beside the board name): status, 11 background colours, a start view the board opens at, and Duplicate board.
- **Preferences:** mouse or trackpad navigation, single-character shortcuts, reduce motion, and showing comments and the undo/redo controls.
- **Command palette:** Ctrl+K or Ctrl+/ finds and runs any tool or common action.
- **History** and **Catch up** in the board menu: see what was added, edited or deleted, restore deleted objects, and get a summary for the last day, week or month.
- **Board details**, **Star this board** and **Move to** a named space; All boards lists starred boards first and filters by space. Mouse or trackpad adds **Auto-detect**.
- **Do Not Disturb** (view menu) mutes the timer sound and reaction animations.

### Select and Pan toggle
- The Select button in the tool rail now switches directly between Select and the hand (Pan) tool on each click instead of opening a menu. Its icon and name follow the active tool; from any other tool it returns to Select.
- The top-right action buttons now share one height: Collaborate and review was smaller than the others because it sits in a menu wrapper.

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
