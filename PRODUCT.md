# Product
<!-- impeccable:product-schema 1 -->

## Platform
web

## Stack
React with TypeScript, explicitly selected by the user. Vite supplies the local development server.

## Product Purpose
Reconstruct the core experience of the user's reference board using runtime evidence collected with REA 6.8.0. The first implementation is a local, independently authored whiteboard prototype.

## Operating Context
The user authorized testing in My First Board. Captured artifacts are private investigation material. The local prototype uses its own sample data and never calls the reference product's services.

## Capabilities and Constraints
Implemented scope: sticky notes, bulk notes, text, shapes, connectors, pen strokes, frames, mind maps, Mermaid diagrams, shared record views (Table, Kanban with card movement, Timeline with milestones and dependencies), ten shape geometries with border styling, images with crop/replace, code blocks, groups, locking, alignment/distribution, board search, minimap, frame presets, presentation mode, cards and flip cards, grids, media (video, PDF, embeds, bookmarks), docs, org charts, story maps, wireframes and prototype screens, auto-layout, facilitation widgets (matrix, poll, spinner, scale, dot voting, timer), comments, layers, line jumps, raster/PDF/CSV export, templates, accessibility check, selection and transforms, history, browser persistence, and local file export/import. Tool discovery follows the observed Formats/Essentials gallery structure. Collaboration, account permissions, AI, external integrations, and hosted server persistence require separate work.

Sticky notes include Auto font sizing, horizontal/vertical alignment, size presets, website links, tags, and connected quick-add. These features are independently implemented and locally persisted.

Connectors include straight/elbow/curved paths, stroke and arrowhead styling, labels, endpoint handles and keyboard connection selectors. Their optional metadata persists in local documents and JSON backups.

## Brand Commitments
Use the observed whiteboard layout and familiar controls as the reconstruction reference. Name the independent prototype Boardroom; do not imply it is any existing commercial service.

## Evidence on Hand
RECONSTRUCTION.md records evidence IDs, observed controls, behavioral results, and limits. Private raw captures and source exports are excluded from Git.

## Product Principles
- Make each visible tool functional.
- Preserve explicit distinctions between verified behavior, inference, and unimplemented services.
- Keep the user's work local and recoverable.
