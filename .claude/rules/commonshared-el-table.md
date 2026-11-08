---
paths:
  - "**/*{Table,DataGrid,DataTable,data-table,data-grid}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
  - "**/{table,tables}.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
---
<!-- managed by __CommonShared/rules/elements/el-table.md; sha256:0524cc24fa03ef68; edit it there, put project rules in project-*.md -->
# Table rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- Horizontal rules in `--border` only; no outer border, no vertical lines. (docs/19 §6)
- Headers 11–12px `--muted` 600, sentence case, never wrap, sticky at `--z-sticky`. (docs/19 §5, docs/17 §3)
- Rows 34px default (28 dense, 44 coarse); cells 13–14px; first and last cell ≥ 12px from the edge. (docs/01 §4, docs/19 §6)
- Numbers right-aligned with `tabular-nums`, headers too; a number and its unit never break. (docs/17 §1, docs/19 §5)
- The sort arrow is SVG, after the header title. (docs/17 §1)
- Hover `--hover`, selected `--accent-soft`; status as a soft badge with a word. (docs/22 Table, docs/01 §1)

## Behaviour
- Sort by raw value (`data-sort`) with a numeric `Intl.Collator`; `tfoot` totals never sort. (docs/22 Table)
- Above about 1000 rows page, virtualise or sort on the server; announce the pager politely. (docs/22 Table)
- Format numbers and dates with one `Intl` helper from `<html lang>`; show "Data as of" when stale. (docs/22 Table, docs/17 §3)
- Loading keeps row height and column widths (skeleton rows); paging keeps them too. (docs/17 §4)
- Empty = one spanning row with the cause and an action; errors are specific, with Retry. (docs/01 §6)
- Selection shows an "N selected" bulk bar in reserved space; the header checkbox goes mixed. (docs/22 Table)
- On phones the wrapper scrolls; name and action columns stay in view. (docs/19 §6)
- Native table, `th scope`, a caption, `aria-sort`; row controls named with row context. (docs/01 §6)

## Uses
- Checkbox, Button, Menu — selection and fixed-width row actions. (docs/22 Table)
- Pagination, Skeleton, Empty state — large data and its states. (docs/22 Table)
- Badge, Tooltip, Chart — status, truncated cells and inline sparklines. (docs/22 Table)
