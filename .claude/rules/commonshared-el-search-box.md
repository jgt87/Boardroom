---
paths:
  - "**/*{SearchBox,searchBox,search-box,SearchInput,searchInput,search-input,Combobox,combobox,ComboBox,Autocomplete,autocomplete,AutoComplete}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
---
<!-- managed by __CommonShared/rules/elements/el-search-box.md; sha256:a49bc36ebed910d4; edit it there, put project rules in project-*.md -->
# Search box rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- A text field with a leading search icon (`aria-hidden`) and a clear button once there is text. (docs/20 Search box)
- Suggestions: `--raised`, 1px `--border`, `--shadow-menu`, rows 32–36px, 13–14px. (docs/01 §6, docs/19 §5)
- Matched text in heavier weight, not colour; the active row `--hover`. (docs/01 §1)
- No results shows a row saying nothing matched; loading shows a spinner row. (docs/01 §6)

## Behaviour
- Debounce remote queries; keep the last results visible while the next load. (docs/20 Search box)
- Down opens and moves, Enter picks, Esc closes, a second Esc clears. (docs/20 Search box)
- Option rows `mousedown` `preventDefault`; close on blur after a short delay. (docs/20 Search box)
- Never auto-select the first suggestion unless completing inline. (docs/20 Search box)
- ARIA: input `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`; options `role="option"`. (docs/20 Search box)
- Announce result counts in a polite live region. (docs/02 §5)
- The popup clamps, flips and portals like every dropdown. (docs/17 §5, §6)
- A global command palette is a separate element on Ctrl/Cmd+K. (docs/02 §5)

## Uses
- Text field — label, focus ring and coarse-pointer 16px text. (docs/20 Text field)
- Popover — floating list and dismissal. (docs/17 §6)
- Icon button — the clear control. (docs/17 §8)
