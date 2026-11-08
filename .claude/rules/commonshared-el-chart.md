---
paths:
  - "**/*{Chart,Graph,Sparkline,Plot,chart,graph,sparkline}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
---
<!-- managed by __CommonShared/rules/elements/el-chart.md; sha256:6b052b100b875831; edit it there, put project rules in project-*.md -->
# Chart rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- Series colours come from the project's domain token group, never chrome tokens or literals. (docs/01 §2)
- The series set is colour-blind safe, neighbours differ in hue, and dark mode has its own set. (docs/01 §2)
- Series also differ by marker, dash or direct label; never colour alone. (docs/22 Chart, docs/01 §1)
- Flat plot: no gradients, glows or 3D; gridlines `--border`; axis labels 11–12px `--muted` `tabular-nums`. (docs/19 §4, §5)
- Bars are flat at the axis and show their value; a percentage bar fills that share of its track. (docs/17 §10)
- A Y-axis label on one side gets the same padding on the other. (docs/17 §3)
- Sparklines 16–24px tall inline, no axes, last value labelled. (docs/22 Chart)

## Behaviour
- Reserve the final height; an empty chart keeps a min height and an empty message. (docs/17 §10a)
- Wrong data shape shows the expected shape; a failure stays inside this chart. (docs/22 Chart)
- Hover equals focus: every hoverable part is focusable and shows the same tooltip. (docs/22 Chart)
- Read-outs pick the nearest point on `pointermove` and clear on `pointerleave`. (docs/02 §2)
- Ctrl/Cmd+wheel zooms at the cursor (clamp 0.2–5); double-click an axis resets it. (docs/02 §3)
- Redraw on width change once per frame; restore focus to the same part afterwards. (docs/22 Chart)
- Grow-in on first draw only, none under reduced motion. (docs/19 §7)
- Re-read series tokens on the theme-change event; size canvases by `devicePixelRatio`. (docs/01 §2, docs/17 §10)
- A `figure` with a summary caption, plus a data table behind a toggle or `.sr-only`. (docs/22 Chart)

## Uses
- Tooltip — point read-outs in `tabular-nums`, the unit kept with the number. (docs/22 Chart)
- Table — the accessible data fallback. (docs/22 Chart)
- Button — legend items as toggles with `aria-pressed`. (docs/22 Chart)
- Skeleton, Empty state — loading at final size and the empty message. (docs/22 Chart)
