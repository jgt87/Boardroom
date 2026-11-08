# Move a board from another whiteboard into Boardroom

This guide takes one board from a hosted whiteboard service (for example Miro) into Boardroom:

1. **Get an access token** (once, about 5 minutes).
2. **Export the board** to a JSON file with `export-whiteboard.mjs`.
3. **Import the file** in Boardroom.
4. **Check the result** with the checklist.
5. **Optional: recreate the objects the export cannot read** (Docs, Tables, Kanban and others) with the recreate
   file.

The export only reads. It never changes the original board.

**You need:** Node 18 or later (`node --version` to check), access to the board, and permission to create an
app in the service's developer settings.

---

## Part 1: Get an access token

Do this once. The same token works for every board you can open.

1. Sign in to the whiteboard service in your browser.
2. Open your **profile settings** and go to **Your apps**. Choose **Create new app**.
   If it asks for a developer team, create one; it is free and only holds your apps.
3. Give the app a name (for example `Boardroom export`) and create it.
4. Under **Permissions**, tick **boards:read** only. Leave everything else off.
5. Choose **Install app and get OAuth token**, pick the team that owns the board, and confirm.
6. Copy the **access token** that appears and keep it somewhere safe.

> The token is like a password: anyone who has it can read every board you can open. Do not paste it into chat,
> email or a file in this repository.

## Part 2: Export the board

1. **Find the board id.** Open the board. Its address looks like
   `https://<service>/app/board/uXjVO123abc=/`. The id is the part after `/board/`, without the last slash:
   `uXjVO123abc=`.
2. **Open a terminal in the `prototype` folder** of this repository.
3. **Run the export.** In PowerShell (replace the two values):

   ```powershell
   $env:WHITEBOARD_TOKEN = '<your token>'
   node scripts/export-whiteboard.mjs uXjVO123abc= my-board.json --images
   ```

   In Git Bash, macOS or Linux:

   ```sh
   WHITEBOARD_TOKEN='<your token>' node scripts/export-whiteboard.mjs uXjVO123abc= my-board.json --images
   ```

   Keep the quotes around the token and the board id if they hold `=` or other special characters.

4. **Wait for the summary lines.** When it is done you see:

   ```
   Wrote my-board.json: 214 items, 37 connectors, 6 groups and 12 mind map nodes. Import it in Boardroom ...
   Wrote my-board.recreate.json: 3 objects came without content and import as placeholders. ...
   ```

   Note the numbers; you compare them in Part 4. The second line only appears when the board holds objects the
   export cannot read; Part 5 explains what to do with that file.

   If a line says `Could not read groups` or `Could not read mind map nodes`, the export still worked; only those
   are missing (the mind map list is an experimental part of the API and is not open to every account).

### Options

| Option           | What it does                                                                                       | When to use it                                                                |
| ---------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `my-board.json`  | Name of the file to write. Without it: `whiteboard-<boardId>.json`.                                | Always handy.                                                                 |
| `--images`       | Puts the image files in the JSON (PNG, JPEG, GIF, WebP, up to 4 MB each) so they import as images. | Recommended. Without it images arrive as links that only work with the token. |
| `--no-item-tags` | Skips looking up tags on every sticky note and card.                                               | Very large boards; notes then arrive without tags.                            |

Advanced: `WHITEBOARD_API` sets another API host (default `https://api.miro.com`). The token is read only from
`WHITEBOARD_TOKEN`, never printed, and only sent to that host.

## Part 3: Import into Boardroom

1. Start Boardroom (`npm run dev`, or `npm run serve`) and open it in the browser.
2. Use **one** of these:
   - In the left tool rail, choose **Tools, media and integrations** (the last button) → **Media** → **Upload** →
     **Whiteboard JSON (REST export)**, then pick `my-board.json`.
   - Or drag `my-board.json` from your file explorer onto the board.
3. **If the board has two or more frames at the top level,** Boardroom asks **Import layers**:
   - **One layer per frame:** each frame, with everything inside it, gets a layer named after the frame. Objects
     outside frames go on a layer called **Outside frames**, on top. You can then hide or lock each frame's layer.
   - **One layer:** everything goes on Layer 1.
   - **Cancel** imports nothing.
4. The board opens as a **new board** in your library; the board you had open is not changed. A message at the
   bottom says what came over, for example
   `Imported 251 objects as a new board (180 sticky notes, 34 shapes, 37 connectors). Built 2 mind maps. Kept 6 groups. Made 3 layers, one per frame. Placeholders mark 2 tables, 1 doc that could not be exported; fill them in with the recreate file.`

## Part 4: Check the result

Go through this list with the original board open next to Boardroom.

1. **Count.** The imported objects, placeholders and skipped objects in the message together should match the
   numbers from Part 2.
2. **Individual objects.** Click a few sticky notes, shapes and texts: each is its own object you can move, edit
   and delete, not part of a picture.
3. **Layers panel.** Open **Layers** (top right, the stacked-sheets button). Each frame is listed with the objects
   inside it; objects outside frames are listed at the end. Names match the frame titles. If you chose **One layer
   per frame**, the layer list shows one layer per frame plus **Outside frames**.
4. **Front and back.** Objects that overlap on the original overlap the same way (see Known limits).
5. **Groups.** Click an object that was grouped on the original: the whole group is selected.
6. **Frames.** Move a frame: the objects inside it move with it. Nested frames sit inside their parent frame.
7. **Positions and sizes.** Objects sit at the same place relative to each other and to their frame.
8. **Connectors.** Lines are attached to the same objects. Move an object: its lines follow.
9. **Mind maps.** Each mind map is one object with the same topics in the same tree.
10. **Placeholders.** Every object the export could not read shows as a dashed box, for example
    `Table (not exported)`, at its original place and size.
11. **Text and colours.** Sticky note colours, text formatting, fonts and sizes look the same.
12. **Tags.** Sticky notes and cards carry their tags (unless you used `--no-item-tags`).
13. **Images.** Images show as pictures (with `--images`) or as links (without it).

### Known limits

| On the original board                                  | In Boardroom                                                                                                                                                                                                                                             |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stacking order (front and back)                        | The API reports no stacking order. Frames go to the back; other objects stack in the order they were created, oldest at the back. An object brought to the front later on the original may sit lower. Fix it with **Bring to front** / **Send to back**. |
| Mind maps                                              | Topics and their tree come over; the layout is redrawn automatically, and colours and topic shapes are not exported. Without access to the experimental mind map list, mind maps import as placeholders.                                                 |
| Docs, Tables, Kanban, Timeline, story maps and similar | The API gives only their place and size: they import as placeholders. Rebuild them with the recreate file (Part 5).                                                                                                                                      |
| Freehand drawings, comments                            | Not in the export.                                                                                                                                                                                                                                       |
| Embeds from unknown sites                              | Arrive as bookmarks (links).                                                                                                                                                                                                                             |
| More than 2,000 objects                                | The rest is left out and counted in the message.                                                                                                                                                                                                         |

## Part 5 (optional): Recreate the objects the export cannot read

The export writes `my-board.recreate.json` next to `my-board.json`, with one entry per object it could not read:

```json
{
  "sourceId": "3458764517517819002",
  "type": "data_table_format",
  "position": { "x": 500, "y": 0, "origin": "center", "relativeTo": "canvas_center" },
  "geometry": { "width": 600, "height": 300 },
  "content": null
}
```

1. **Open `my-board.recreate.json`** in a text editor. Find each object by its `type` and `position` (the board
   in Boardroom shows a dashed placeholder at the same spot).
2. **Fill in `content`** for the objects you want rebuilt. Leave `null` to keep the placeholder. Pick one kind:

   | You want                    | Write in `content`                                                                                                                                                                                                                                                                   |
   | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
   | A table, Kanban or timeline | `{ "kind": "table", "title": "Backlog", "csvFile": "backlog.csv" }`: use `"kanban"` or `"timeline"` the same way. The CSV needs a header row (Title, Status, Assignee, Start, End and any other columns). You can also write the rows inline as `"csv": "Title,Status\nLogin,Done"`. |
   | A doc                       | `{ "kind": "doc", "markdown": "# Notes\n\n- First point" }`                                                                                                                                                                                                                          |
   | A mind map                  | `{ "kind": "mindmap", "nodes": [{ "id": "1", "text": "Goal" }, { "id": "2", "parent": "1", "text": "Step" }] }`: exactly one node without a parent.                                                                                                                                  |
   | A story map                 | `{ "kind": "storymap", "activities": ["Find"], "releases": ["MVP"], "cards": [{ "title": "Search", "activity": "Find", "release": "MVP" }] }`                                                                                                                                        |
   | A note or a text            | `{ "kind": "note", "text": "..." }` or `{ "kind": "text", "text": "..." }`                                                                                                                                                                                                           |
   | A picture of the object     | `{ "kind": "image", "file": "table.png" }`: a PNG, JPEG, GIF or WebP up to 4 MB, for example a cropped part of the board saved as an image from the original service.                                                                                                                |
   | Several Boardroom objects   | `{ "kind": "items", "items": [ ... ] }`: Boardroom objects as JSON, with `x`/`y` measured from the placeholder's top-left corner.                                                                                                                                                    |

   Where to get the content: most whiteboards can export a table or a selection as CSV, and a doc's text can be
   copied. An assistant can also read the board in your browser and fill in the file for you.

   Put `csvFile` and image `file` files **in the same folder as the recreate file**.

   To add an object that is not in the file at all, add an entry without `sourceId`, with its own `position`
   (centre on the board) and `geometry`.

3. **Merge** the recreate file into the export, from `prototype/`:

   ```powershell
   node scripts/merge-recreate.mjs my-board.json my-board.recreate.json
   ```

   It writes `my-board.filled.json` and says how many objects it will recreate.

4. **Import `my-board.filled.json`** as in Part 3. The message says
   `5 objects were recreated from the recreate file.` Each rebuilt object is a real Boardroom object (a Table you
   can edit, a Doc, a mind map) at the placeholder's place, inside the same frame and layer.

If an entry cannot be used (for example a CSV without data rows), the message says which one and why, and that
object stays a placeholder. Fix the entry and run steps 3 and 4 again.

## When something goes wrong

| Message                                          | What to do                                                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `Set WHITEBOARD_TOKEN to an access token ...`    | The token variable is empty. Run the `$env:WHITEBOARD_TOKEN = ...` line again in the same terminal.                |
| `The API refused the token (401 Unauthorized)`   | The token is wrong, expired or revoked. Copy it again or make a new one (Part 1, step 5).                          |
| `... (403 Forbidden)`                            | The app lacks **boards:read**, or your user cannot open this board. Check Part 1, step 4, and the board's sharing. |
| `... was not found (404)`                        | The board id is wrong. Copy it again from the address (Part 2, step 1).                                            |
| The script pauses for a while                    | The service is limiting requests; the script waits and retries by itself.                                          |
| `This file is not a whiteboard JSON export`      | You picked another file. Choose the file the script wrote.                                                         |
| `Choose a whiteboard export smaller than 120 MB` | Export again without `--images`.                                                                                   |
| `... must be in the recreate file's folder`      | Move the CSV or image file next to the recreate file and write just its name.                                      |
| `... is not a PNG, JPEG, GIF or WebP image`      | Save the picture in one of those formats.                                                                          |
| `recreate entries were not used: ...`            | The message names the object and the problem. Fix that entry, merge again and import again.                        |

## What the files hold

- The export: `{ format: 'whiteboard-rest-v2', board, items, connectors, groups, mindmapNodes, tags, itemTags,
exportedAt }`: the board's name and description, every item (all pages, 50 per request), every connector, the
  groups, the mind map nodes, the board's tags and the tag ids per sticky note and card. After merging it also holds
  `recreate`, the filled entries.
- The recreate file: `{ format: 'boardroom-recreate-v1', board, help, entries }`.

The mapping into Boardroom objects is in `src/whiteboard-import.ts` and `src/whiteboard-extras.ts`; the tests are
`tests/whiteboard-import.test.ts`, `tests/whiteboard-extras.test.ts`, `tests/export-whiteboard.test.ts` and
`e2e/whiteboard-import.spec.ts`.
