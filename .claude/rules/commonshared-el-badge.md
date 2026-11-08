---
paths:
  - "**/*{Badge,badge,Chip,chip,Tag,tag-,-tag,Pill,pill,Status,status}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
---
<!-- managed by __CommonShared/rules/elements/el-badge.md; sha256:f9f78e4811c5a86b; edit it there, put project rules in project-*.md -->
# Badge rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- Height 18–20px for counts and status, 24px for chips and tags; pills only for one-line text. (docs/01 §4, docs/21 §14)
- Soft fill (`--accent-soft` or a status soft role) or 1px `--border` outline; no solid saturated fill. (docs/01 §1, docs/21 §14)
- Text 11px app (10px only for a marked non-essential glyph), 13px brand; weight 500–600; sentence case. (docs/19 §5, §10)
- Counts use `tabular-nums` and cap at "99+". (docs/01 §3, docs/21 §14)
- Dots and badges stay inside the content edge, 6px clear of text. (docs/19 §6)
## Behaviour
- Show status only when it needs attention; no always-on "Connected" pill. (docs/19 §4)
- A dot or colour never stands alone: add a word or icon. (docs/01 §1)
- A count badge sits on its icon's corner without changing the button's size. (docs/21 §14)
- Filter chips toggle with `aria-pressed`; selected = `--accent-soft`; hover only under `(hover: hover)`. (docs/17 §7, docs/21 §14)
- Tag input: Enter or comma adds, Backspace on empty removes the last, duplicates refused. (docs/21 §14)
- Coarse pointer: removable and toggle chips reach 44px via padding or `::after`, not a bigger chip. (docs/10 §4)
- Status changes are a 120–150ms colour change at most. (docs/19 §7)
## Accessibility
- The meaning lives in text: a count on an icon goes into the button's name, the badge is `aria-hidden`. (docs/21 §14)
- Remove controls are real buttons named "Remove <name>". (docs/21 §14)
- Announce new counts politely only when they aren't otherwise visible. (docs/02 §5)
## Uses
- Icon, IconButton — the status glyph and the remove control. (docs/21 §14)
- Tooltip — the full text of an abbreviated label. (docs/21 §2)
