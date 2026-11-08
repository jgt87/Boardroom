---
paths:
  - "**/*print*.{css,scss}"
---
<!-- managed by __CommonShared/rules/elements/el-print.md; sha256:f7013b17d9fe9400; edit it there, put project rules in project-*.md -->
# Print rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- Hide chrome with `.no-print` (nav, toolbars, buttons, toasts, tooltips); show a `.print-only` title and date. (docs/22 Print)
- Print in the light role values, whatever the screen theme. (docs/22 Print)
- `break-inside: avoid` on rows, cards and figures; repeat table headers on every page. (docs/22 Print)
- `print-color-adjust: exact` only where colour carries data. (docs/22 Print)
- External links print their URL after the text. (docs/22 Print)
- Type stays on the scale; nothing functional under 11px. (docs/19 §5)
- No fixed or sticky positioning in print; set `@page` margins. (docs/22 Print)

## Behaviour
- Expand `details` and collapsed sections; print all table rows or say how many were left out. (docs/22 Print)
- On `beforeprint` expand content and redraw charts at print width; restore on `afterprint`. (docs/22 Print)
- Remove editing chrome before printing and restore it after. (docs/17 §10)
- Status keeps its word on paper, never colour alone. (docs/01 §1)

## Uses
- Table, Chart, Card — the parts that need print rules. (docs/22 Print)
