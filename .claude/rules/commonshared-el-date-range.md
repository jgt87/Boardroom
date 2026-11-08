---
paths:
  - "**/*{DateRange,dateRange,date-range,DatePicker,datePicker,date-picker,PeriodFilter,periodFilter,period-filter}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
---
<!-- managed by __CommonShared/rules/elements/el-date-range.md; sha256:d90f25271329bf89; edit it there, put project rules in project-*.md -->
# Date range rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- The trigger shows the preset name or the range formatted with `Intl` from `<html lang>`. (docs/20 Date range)
- Popover: a preset list plus a custom section with two native date fields and Apply. (docs/20 Date range)
- Fields 13–14px (16px coarse), preset rows 13–14px, helper text 12px. (docs/19 §5)

## Behaviour
- Dates are inclusive and stored as `yyyy-mm-dd`. (docs/20 Date range)
- A reversed range is swapped, not refused; outside min/max shows an error under the field. (docs/20 Date range)
- The week start is a parameter, from the locale by default. (docs/20 Date range)
- Native date inputs before a hand-built calendar. (docs/20 Date range, docs/19 §3)
- Presets apply on pick; custom applies on Apply or Enter; Esc closes to the trigger. (docs/20 Date range)
- State the time zone when it can differ from the viewer's. (docs/20 Date range)
- The trigger name includes field and value ("Period, last 7 days"). (docs/20 Date range)

## Uses
- Popover — floating panel and dismissal. (docs/17 §6)
- Text field — the date inputs and their errors. (docs/20 Text field)
- Segmented control — optional day/week/month granularity. (docs/20 Segmented control)
