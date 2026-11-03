# AGENTS.md

Guidance for coding agents working in this repository.

## What this is

BoardCraft contains **Boardroom**, an independent local whiteboard prototype (React 19 + TypeScript + Vite) informed by static and runtime analysis of an existing whiteboard's web client. The app is in `prototype/`; the root holds plans, design notes and analysis. Never import, copy or ship captured third-party code: `*.private.json` and `evidence-private/` are private evidence and gitignored. Name the product Boardroom; do not imply it is any existing commercial service.

Work is planned in `NEXT-20-ITEMS-PLAN.md` (items 1–55, each with linked implementation files and tests). Record new work there and in `CHANGELOG.md` (Unreleased). Visual and interaction rules are in `DESIGN.md`; product scope is in `PRODUCT.md`.

## Commands (run from `prototype/`)

- `npm run dev`: Vite dev server on port 5173, bound to all interfaces (reachable on the LAN, e.g. http://192.168.1.52:5173/). It serves source directly, so it needs no rebuild.
- `npm test`: Node's built-in test runner with `--experimental-strip-types` over `tests/*.test.ts`. Run one file with `node --experimental-strip-types --test tests/routing.test.ts`, and one test with `--test-name-pattern "self-loops"`.
- `npm run build`: `tsc --noEmit`, then a Vite production build to `dist/`.
- `npm run format` / `npm run format:check`: Prettier (`.prettierrc.json`, width 120, single quotes).
- `npm run lint`: ESLint (`eslint.config.js`: recommended JS/TS rules plus React hooks rules). Keep it at zero errors and zero warnings.
- `npm run test:e2e`: Playwright browser suite (`e2e/`). It uses the installed Chrome (`channel: 'chrome'`) and its own Vite server on port 5199; it never touches 5173.
- `npm run check`: format check, tests and build together. Run it before committing.

Tests import source files directly, so pure modules must use `.ts` extensions in their imports (for example `from './model.ts'`) and must not import React or CSS. UI files (`.tsx`) import without extensions.

## Architecture

**Document model** (`src/model.ts`): a `Board` is immutable JSON. It holds `items: Item[]` (paint order = array order), plus optional `datasets` (records shared by the Table, Kanban and Timeline views), `groups`, `presentation`, `comments`, `voting`, `privateMode` and, in backups only, `assets`. Every new field is optional so older boards load unchanged. `parseBoard` validates everything on load and import. Extension fields are validated in `model-ext.ts`, and widget payloads through the registry. History (`commit`/`undo`/`redo`) stores whole board snapshots, so one `update(board)` call is one undo step.

**App state** (`src/board-app.tsx`): `useBoardCore()` holds the state and actions; `useBoardApp()` composes it with `useCanvasGestures(core)` (`use-canvas-gestures.tsx`, pointer gestures) and `useKeyboardShortcuts(core, gestures)` (`use-keyboard-shortcuts.tsx`), and the result is provided through `AppContext`. UI components (`canvas-surface`, `top-bar`, `tool-rail`, `selection-bars`, `floating-panels`, `board-chrome`) read it with `useApp()`. `use-render-item.tsx` renders one object and caches the element per item identity plus a dependency signature, so it must stay pure with respect to its inputs. `use-exporters.tsx` holds the export code. `update()` runs `normalize` (auto-layout containers and auto-height text) on every change.

**Widget registry**: object kinds added after the core shapes are plugins.
- `widget-types.ts` defines the contract.
- `specs-*.ts` (pure) give size, `init` defaults, `validate` and `searchText`, aggregated in `widget-specs.ts` (used by `createItem`, `parseBoard` and search).
- `widgets-*.tsx` give the renderer (`mode` 'html' inside a foreignObject, or 'svg'), the editor dialog, selection-bar actions and `fromFile` loaders, aggregated in `widgets.tsx`.
- Adding a kind takes four steps: add it to `WidgetKind`/`widgetKinds` in `model.ts`, add a spec, add a view, and register both. The tool gallery is generated from the specs.
- Widget data lives in `item.data`. Editors apply through `ctx.update` (one undo step). Interactive renders must stop `pointerdown` only on real controls, so the widget body stays draggable.

**Geometry**: connector routing (obstacle avoidance by orthogonal A*, endpoint-relative manual bends, self-loops, sampled curves for line jumps) is in `routing.ts` and `connector-geometry.ts`. Shape outlines and edge intersection are in `shapes.ts`. Selection, transforms and frame containment are in `interactions.ts`. Groups, locking, alignment and distribution are in `arrange.ts`. Board-level tools (stack, pen, voting, comments, layers, line jumps, CSV, accessibility checks, templates) are in `board-tools.ts`.

**Persistence**: boards live in a local library (`board-library.ts`): each board under `boardroom.board.<id>`, an index in `boardroom.boards.v1`, and the active board mirrored to the legacy `boardroom.document.v1` key (a newer copy written there is adopted on load). Switching boards saves first and resets undo history. Image, video and PDF bytes live in IndexedDB (`assets-store.ts`), keyed by `item.assetId`, and are pruned at startup. Backups are JSON with base64 `assets`, or a `.boardroom` ZIP with media as files (`media-bundle.ts`, loaded on demand).

## Conventions and gotchas

- Copy/paste uses the native `copy`/`cut`/`paste` events with an HTML payload (`clipboard.ts`); keep ids remapped on paste.
- Board-level overlays (dashboard, context menu, inspector) live in `board-overlays.tsx` and read the app through `useApp()`.
- Lock state is enforced through `editableIds`/`moveIds` (`arrange.ts`). New editing actions must respect it.
- Long-lived effects (key listeners, mount/unmount cleanups) read callback props through `useLatest` (`use-latest.ts`) instead of listing them as dependencies.
- Widget views share helpers and the editor dialog shell from `widget-kit.tsx`; the basic widgets are split by family (`widgets-cards`, `widgets-grid`, `widgets-graphics`, `widgets-facilitation`), and `widgets-basic.tsx` holds only their registry entries.
- Security: `vite.config.ts` injects a Content Security Policy (scripts from self only; frames limited to the embed allow-list in `specs-media.ts`). Keep scripts out of `index.html` (the startup message lives in `public/startup.js`) and add new embed providers in both places.
- The app is opened over plain HTTP from other devices on the LAN, which is not a secure context: `crypto.randomUUID` (polyfilled in `polyfills.ts`), `navigator.clipboard` and other secure-only APIs are missing there. Guard any new secure-only API with a fallback.
- Native HTML5 drag-and-drop: always `preventDefault()` in `dragover` based on `dataTransfer.types`, not React state; that state is not updated yet during a real drag.
- Performance checks in an automated browser tab: background tabs are throttled to 1 frame per second, so time with forced layout (`offsetHeight`), not `requestAnimationFrame`.
- Exports draw SVG (with `foreignObject`) to a canvas via a `data:` URL; a `blob:` URL taints the canvas in Chrome.
- Keep UI text free of assistant or vendor names; the project's own naming is Boardroom/BoardCraft.
