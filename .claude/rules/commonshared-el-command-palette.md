---
paths:
  - "**/*{CommandPalette,commandPalette,command-palette,CommandMenu,commandMenu,command-menu}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
---
<!-- managed by __CommonShared/rules/elements/el-command-palette.md; sha256:f359b6740624cab4; edit it there, put project rules in project-*.md -->
# Command palette rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- A dialog `min(640px, 100vw - 32px)` wide, top-anchored ~12vh, `--raised`, `--shadow-dialog`, `--radius-lg`. (docs/21 §8)
- Input full width, 14px (16px on coarse pointers), search icon and placeholder in `--muted`. (docs/19 §5, docs/21 §8)
- Rows 32–36px, 13–14px: icon, label, `--muted` context, shortcut `kbd` at the right. (docs/19 §5, docs/21 §8)
- Active row `--accent-soft`, inset and rounded; group headings 11–12px `--muted`, sentence case. (docs/19 §6, docs/21 §8)
## Behaviour
- Ctrl/Cmd+K (also Ctrl+/) opens it; it appears without animation because it is keyboard-opened. (docs/02 §5, docs/19 §7)
- Up/Down move the active row with wrap, Enter runs and closes, Esc clears the query then closes; focus returns. (docs/17 §6, docs/21 §8)
- Rows use `mousedown` `preventDefault` so the input keeps focus. (docs/21 §8)
- Ignore Enter during IME composition. (docs/02 §5)
- Every palette command also exists in a visible control or menu; rows teach their shortcut. (docs/02 §5)
- Empty query shows recent and suggested commands; no match shows "No commands match" with the query. (docs/21 §8, §12)
- Async sources show a small spinner at the input; fast results appear first; a failed source is one error row. (docs/21 §8)
## Accessibility
- Modal dialog with a label; the input is `role="combobox"` with `aria-expanded`, `aria-controls` and `aria-activedescendant`. (docs/21 §8)
- The list is `role="listbox"` with `option` rows and labelled groups; the result count is announced politely. (docs/21 §8)
## Uses
- Dialog — trap, focus return, layer. (docs/21 §5)
- Input, Kbd, Icon — the field and row parts. (docs/21 §8)
- Empty state and Spinner — no results and async loading. (docs/21 §10, §12)
