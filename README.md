# BoardCraft

BoardCraft holds **Boardroom**, an independent local whiteboard prototype built with React and TypeScript. Its features are informed by static and runtime analysis of an existing whiteboard's web client, but it contains none of its code, accounts or services. Boards are stored only in your browser.

## Quick start

```bash
cd prototype
npm install
npm run dev
```

Open http://localhost:5173/. The dev server listens on all interfaces, so other devices on the same network can use `http://<this-machine's-IP>:5173/`. Each browser keeps its own boards; use Export → Save board to move one between devices.

Before committing, run `npm run check` in `prototype/`. It runs the Prettier check, the test suite and the production build.

## What's where

| Path | Contents |
|---|---|
| [`prototype/`](prototype/) | The app, its tests (`tests/`) and QA screenshots (`qa/`). The [prototype README](prototype/README.md) gives the full feature tour. |
| [`NEXT-20-ITEMS-PLAN.md`](NEXT-20-ITEMS-PLAN.md) | Feature plan and status for items 1–55, each linked to its implementation files and tests |
| [`CHANGELOG.md`](CHANGELOG.md) | Changes since the last release |
| [`DESIGN.md`](DESIGN.md), [`PRODUCT.md`](PRODUCT.md) | Visual and interaction design system; product scope and principles |
| [`analysis/`](analysis/) | Reports and scripts from the static audit of the captured client code |
| [`RECONSTRUCTION.md`](RECONSTRUCTION.md), [`FEATURE-MAP.md`](FEATURE-MAP.md), [`TOOL-INVENTORY.json`](the recorded tool inventory) | Observed behaviour, feature map and tool catalogue used as the reference |
| [`AGENTS.md`](AGENTS.md) | Guidance for coding agents: commands, architecture and conventions |

## Private material

Raw captures (`*.private.json`), extracted client sources (`evidence-private/`) and the analysis browser profile (`.chrome-rea/`) are private evidence. They are gitignored and must never be committed or imported into the app.
