---
paths:
  - "**/*{Radio,radio}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
---
<!-- managed by __CommonShared/rules/elements/el-radio.md; sha256:6f97bcc3ec78fc00; edit it there, put project rules in project-*.md -->
# Radio rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- Native radio with `accent-color`, 14–16px; label right, 8px gap, centred. (docs/01 §6, docs/17 §1)
- Group in `<fieldset>` + `<legend>`; optional 12px `--muted` description per option. (docs/20 Radio, docs/19 §5)
- Card variant: `--accent-soft` fill when selected; border or shadow, never both. (docs/19 §4)

## Behaviour
- For 2–6 options read side by side; 2–4 in chrome use a segmented control, many use a select. (docs/01 §6)
- One tab stop per group; arrows move and select. (docs/20 Radio)
- Preselect a safe default when one exists. (docs/20 Radio)
- Group-level error under the fieldset via `aria-describedby`. (docs/19 §7)

## Uses
- Label — every option has a visible one. (docs/19 §7)
- Segmented control — the compact alternative in toolbars. (docs/20 Segmented control)
