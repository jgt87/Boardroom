# Export a board from another whiteboard (REST API)

`export-whiteboard.mjs` downloads one board through the public REST API (v2) of a hosted whiteboard service
and writes it to a single JSON file. In Boardroom, choose **Upload > Whiteboard JSON (REST export)** (or drop
the file on the board, or use the regular board import) to open it as a new board.

The script needs Node 18 or later and has no dependencies. It only reads: nothing on the original board changes.

## 1. Create an access token

1. Sign in to the service's developer portal and create an app (a "developer team" may be needed first).
2. Give the app the **boards:read** permission (scope). No other scope is needed.
3. Install the app on the team that owns the board and copy the **access token** it shows.
   Treat the token like a password: it can read every board the installing user can open.
4. Find the board id: it is the part of the board's address after `/board/`, for example
   `uXjVO123abc=` in `https://<service>/app/board/uXjVO123abc=/`.

## 2. Run the export

From `prototype/`:

```sh
WHITEBOARD_TOKEN=<token> node scripts/export-whiteboard.mjs <boardId> [out.json] [--images] [--no-item-tags]
```

PowerShell:

```powershell
$env:WHITEBOARD_TOKEN = '<token>'; node scripts/export-whiteboard.mjs <boardId> board.json
```

- `--images` also downloads image files and embeds them in the JSON (PNG, JPEG, GIF or WebP, up to 4 MB
  each), so they import as images. Without it, images import as links (their addresses need the token).
- `--no-item-tags` skips the one-request-per-note tag lookup (faster on large boards; notes and cards then
  import without tags).

Environment variables:

| Variable           | Meaning                                                        |
| ------------------ | -------------------------------------------------------------- |
| `WHITEBOARD_TOKEN` | Access token (required). Read from the environment only.       |
| `WHITEBOARD_API`   | API host. Default: the public API, `https://api.miro.com`.     |

The token is never accepted as an argument, never printed, and only sent to `WHITEBOARD_API` (pagination links
on other hosts are refused; pre-signed image downloads are fetched without it).

Rate limits (HTTP 429) are retried after the `Retry-After` delay; 401, 403 and 404 stop with a message that
says what to check.

## What the file holds

`{ format: 'whiteboard-rest-v2', board, items, connectors, tags, itemTags, exportedAt }`: the board's name
and description, every item (all pages, 50 per request), every connector, the board's tags and the tag ids per
sticky note and card. Boardroom maps sticky notes, shapes, text, frames, cards, app cards, images, embeds,
documents and connectors; other item types (for example mind map nodes) are skipped and counted in the import
message.
