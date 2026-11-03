# Boardroom

**Boardroom** is an independent, local whiteboard built with React 19, TypeScript and Vite. It runs entirely in your browser: no accounts, no server sync, and boards are stored only on the device you use.

## Features

- **Canvas basics:** sticky notes (emoji, tags, authors, stacks, bulk entry), text, freehand pen, frames with presets, and 53 shapes in Basic, Flowchart, Callouts, UML, BPMN and ERD packs.
- **Connectors:** straight, elbow and curved lines with obstacle avoidance, editable bends, self-loops, line jumps and captions.
- **Structured formats:** Table, Kanban and Timeline views over shared records with custom fields, filters and synced cards; Grids that hold objects; mind maps; org charts; user story maps; Docs with callouts, a `/` menu, templates and Markdown import/export.
- **Slides:** decks with layouts, templates and poll slides, presented full screen; PowerPoint (`.pptx`) text import.
- **Diagrams:** Mermaid code with conversion to editable shapes, and an embeddable Draw.io editor (see [`DRAWIO-LOCAL-HOSTING.md`](DRAWIO-LOCAL-HOSTING.md)).
- **Facilitation (single device):** dot voting, timer, polls, scales, quizzes, word clouds, open-ended responses, rankings, planners, journey maps, private mode and emoji reactions.
- **Media and prototyping:** images with cropping, video, PDF viewer, embeds, QR codes, a wireframe library with button styles, and click-through prototype screens.
- **Export:** JSON or `.boardroom` backups (with media), SVG, PNG, JPG, PDF and CSV.

## Quick start

```bash
cd prototype
npm install
npm run serve
```

Open http://localhost:4173/. `npm run serve` builds the optimized app and serves it on all interfaces, so other devices on the same network can use `http://<this-machine's-IP>:4173/`. Run it again after changing the code.

For development, use `npm run dev` instead (http://localhost:5173/). It serves the source directly and reloads on every change, but loads much more slowly on other devices.

Each browser keeps its own boards; use Export → Save board to move one between devices or addresses.

Before committing, run `npm run check` in `prototype/`. It runs the Prettier check, lint, the unit tests and the production build. `npm run test:e2e` runs the browser suite in Chrome.

## What's where

| Path | Contents |
|---|---|
| [`prototype/`](prototype/) | The app, its unit tests (`tests/`), browser tests (`e2e/`) and QA screenshots (`qa/`). The [prototype README](prototype/README.md) gives the full feature tour. |
| [`CHANGELOG.md`](CHANGELOG.md) | Changes since the last release |
| [`DESIGN.md`](DESIGN.md), [`PRODUCT.md`](PRODUCT.md) | Visual and interaction design system; product scope and principles |
| [`DRAWIO-LOCAL-HOSTING.md`](DRAWIO-LOCAL-HOSTING.md) | Optional self-hosted Draw.io editor |
| [`AGENTS.md`](AGENTS.md) | Guidance for coding agents: commands, architecture and conventions |

## Privacy

Boards, images and media stay in the browser's local storage and IndexedDB. The app makes no network requests except for embeds you add and the Draw.io editor when you open it.
