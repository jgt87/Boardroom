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

The implemented inventory does not establish complete parity with the reference whiteboard. Table, Kanban, Timeline, Grid, org charts, story maps, Docs, Planner, Journey and Ranking now expose direct canvas editing; explicit toolbar editors remain available for advanced settings. Mind maps open inline, stickies support select-and-type, and Alt-drag duplicates. Formats use click-to-place creation. See [TOOL-WORKFLOW-AUDIT.md](TOOL-WORKFLOW-AUDIT.md) for the original findings and implementation follow-up.
Implemented scope: sticky notes, bulk notes, text, shapes, connectors, pen strokes, frames, mind maps, Mermaid diagrams, shared record views (Table, Kanban with card movement, Timeline with milestones and dependencies), ten shape geometries with border styling, images with crop/replace, code blocks, groups, locking, alignment/distribution, board search, minimap, frame presets, presentation mode, cards and flip cards, grids, media (video, PDF, embeds, bookmarks), docs, org charts, story maps, wireframes and prototype screens, auto-layout, facilitation widgets (matrix, poll, spinner, scale, dot voting, timer), comments, layers, line jumps, raster/PDF/CSV export, templates, accessibility check, selection and transforms, history, browser persistence, and local file export/import. Tool discovery follows the observed Formats/Essentials gallery structure. Collaboration, account permissions, AI, external integrations, and hosted server persistence require separate work.

Sticky notes include Auto font sizing, horizontal/vertical alignment, size presets, website links, tags, and connected quick-add. These features are independently implemented and locally persisted.

Connectors include straight/elbow/curved paths, stroke and arrowhead styling, labels, endpoint handles and keyboard connection selectors. Their optional metadata persists in local documents and JSON backups.

Draw.io diagrams use a dedicated hosted editor and remain single board objects with local XML source and PNG previews. `.drawio`/XML import/export and source-only recovery work locally; the hosted authoring UI requires network access. See [DRAWIO-INTEGRATION.md](DRAWIO-INTEGRATION.md) for the implementation and the live-service verification limit in this environment.

Table, Kanban and Timeline accept pointer-copy drops from notes/cards while retaining their source objects, and create synced standalone cards through record handles. Timeline supports direct scheduling and completing partial date ranges. These local workflows preserve shared record identity and history. Shared schemas now support configurable statuses, five typed custom fields, single-select Kanban grouping and synced-card inputs. Grid adds supported-object containment, automatic cell growth and row/column geometry. See [SCHEMA-GRID-INTEGRATION.md](SCHEMA-GRID-INTEGRATION.md) for scope and limits. See [RECORD-WORKFLOW-INTEGRATION.md](RECORD-WORKFLOW-INTEGRATION.md).

Mind maps also support manual branch positioning with descendant movement, attachment feedback and Auto layout controls. The map remains one fixed-size object and inline edits commit together when the session exits. See [MINDMAP-WORKFLOW-INTEGRATION.md](MINDMAP-WORKFLOW-INTEGRATION.md) for evidence and limits.

## Brand Commitments
Use the observed whiteboard layout and familiar controls as the reconstruction reference. Name the independent prototype Boardroom; do not imply it is any existing commercial service.

## Evidence on Hand
RECONSTRUCTION.md records evidence IDs, observed controls, behavioral results, and limits. Private raw captures and source exports are excluded from Git.

## Product Principles
- Make each visible tool functional.
- Preserve explicit distinctions between verified behavior, inference, and unimplemented services.
- Keep the user's work local and recoverable.

Planner supports local teams/iterations, card movement and points/dependencies. Journey supports direct stage/lane/text editing, text movement and emotions. Ranking supports a single local order with editing and reset. Jira/Azure synchronization and Engage participant response aggregation are outside scope. The static tool catalog establishes names and menu placement, not live reference behavior. See [ADVANCED-CANVAS-INTEGRATION.md](ADVANCED-CANVAS-INTEGRATION.md).

Record workflow refinement now includes view-level filters/sorting/grouping and visible-selection bulk actions; Timeline calendar controls and dependency connection dragging; Grid cell sizing modes and merged-block reorder; stable manual mind-map bounds on edit commit. Draw.io supports a deployment-owned endpoint (not board-supplied), while actual hosted/local editor runtime verification remains blocked by this session's network/Docker access. See PARITY-NEXT-SIX.md.
