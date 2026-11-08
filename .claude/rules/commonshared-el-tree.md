---
paths:
  - "**/*{Tree,TreeView,TreeItem,tree,tree-view}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
---
<!-- managed by __CommonShared/rules/elements/el-tree.md; sha256:12004008ddde806f; edit it there, put project rules in project-*.md -->
# Tree rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- Rows 28–32px (44px coarse) on one shared grid: disclosure, icon, label, meta. (docs/22 Tree, docs/19 §6)
- Indent 12–16px per level; leaves keep an empty disclosure box so labels align. (docs/22 Tree)
- Chevrons are SVG in a fixed 16px box and rotate by `transform`. (docs/17 §1)
- Labels 13–14px, truncate with `min-width:0` and the full name in `title`. (docs/19 §5, docs/17 §3)
- Hover `--hover`, selection `--accent-soft`, inset and rounded `--radius-sm`; the focus ring is inset. (docs/22 Tree, docs/17 §8)

## Behaviour
- Roving tabindex: one row in the tab order. (docs/22 Tree)
- Up/Down move, Right expands or enters, Left collapses or goes to the parent, Home/End, Enter opens, F2 renames. (docs/22 Tree, docs/02 §5)
- Type-ahead jumps to the next row starting with the typed letters. (docs/22 Tree)
- Expand without motion in all-day trees; otherwise `grid-template-rows` ≤ 150ms, never `max-height`. (docs/19 §7, docs/17 §3)
- Lazy children show a spinner in the chevron slot with `aria-busy`; failures show Retry inline. (docs/22 Tree)
- Drag to move uses Pointer Events with a 4px threshold and Esc cancel, plus a "Move to…" menu. (docs/02 §2)
- `role="tree"`/`treeitem`/`group`; `aria-expanded` on parents only; level, setsize, posinset when virtualised. (docs/22 Tree)

## Uses
- Icon, Spinner — node icons and the lazy-load state. (docs/22 Tree)
- Context menu with a visible `⋯` mirror — row actions are never hover-only or right-click-only. (docs/02 §4, §7)
- Tooltip — full names of truncated rows. (docs/22 Tree)
