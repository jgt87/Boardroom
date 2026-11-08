---
paths:
  - "**/*{Calendar,MonthView,WeekView,calendar}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
---
<!-- managed by __CommonShared/rules/elements/el-calendar.md; sha256:64aad3a37506ac1c; edit it there, put project rules in project-*.md -->
# Calendar rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- Header: month and year 14–16px / 600, previous/next icon buttons and a Today button. (docs/22 Calendar)
- Weekday names come from `Intl.DateTimeFormat`, 11–12px `--muted`, sentence case. (docs/22 Calendar, docs/19 §5)
- Day cells 32px (44px coarse), numbers 13–14px `tabular-nums`, radius `--radius-sm`. (docs/22 Calendar)
- Selected day `--accent` with `--on-accent`; range middle `--accent-soft`. (docs/22 Calendar)
- Today has a ring or weight plus "Today" in its name, never colour alone. (docs/22 Calendar, docs/01 §1)
- Event chips 11px, with a "+n more" chip listing the rest. (docs/17 §3)
- Phones show an agenda list rather than a dense month grid. (docs/22 Calendar)

## Behaviour
- The first day of the week comes from the locale or a setting. (docs/22 Calendar)
- Roving tabindex: arrows, PageUp/PageDown month, Shift+PageUp/PageDown year, Home/End week. (docs/22 Calendar)
- Esc closes a popover calendar and returns focus to its field. (docs/22 Calendar)
- Ranges are inclusive `yyyy-mm-dd`; a reversed range is swapped, not rejected. (docs/22 Calendar)
- Build date-only values as local dates; never parse them through UTC. (docs/22 Calendar)
- Month changes are instant or a 120–150ms opacity change, never a slide. (docs/19 §7)
- `role="grid"`, day buttons named with the full date, `aria-current="date"`, the month heading in a live region. (docs/22 Calendar)

## Uses
- Button — icon navigation and the day cells. (docs/22 Calendar)
- Popover — the date-picker form of the calendar. (docs/22 Calendar)
- Badge, Tooltip, List — event chips, their overflow and the agenda view. (docs/22 Calendar)
