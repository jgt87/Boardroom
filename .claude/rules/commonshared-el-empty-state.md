---
paths:
  - "**/*{EmptyState,emptyState,empty-state,Empty}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
---
<!-- managed by __CommonShared/rules/elements/el-empty-state.md; sha256:ef411f596e6d3cb8; edit it there, put project rules in project-*.md -->
# Empty state rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- Sits in the region's own space and min height, no card of its own. (docs/17 §10a, docs/19 §4)
- Title 14–16px/600, one sentence of body at 13px `--muted`, one action button. (docs/19 §5, docs/21 §12)
- Optional single icon from the project's set in `--muted`; no reflex illustration, no emoji. (docs/19 §4)
## Behaviour
- Every list, table, chart and search has an empty state, separate from loading and error. (docs/01 §6)
- First use explains and offers to create; no results names the query and offers "Clear filters". (docs/21 §12)
- An empty chart keeps a min height and its message; data of the wrong shape shows the expected shape. (docs/17 §10a, docs/21 §12)
- Show it only after loading ends; never flash it before data arrives. (docs/21 §12)
- A missing fact is a visible dashed placeholder, never an invented number or demo row. (docs/19 §4)
- The action is the forward path; primary only if it is the view's one primary. (docs/01 §6)
## Accessibility
- Plain text with a heading level that fits the page; a filter that empties the list announces "No results" politely. (docs/21 §12)
## Uses
- Icon and Button — the optional glyph and the next step. (docs/21 §12)
- Command palette and Menu — use the one-line inline variant. (docs/21 §4, §8)
