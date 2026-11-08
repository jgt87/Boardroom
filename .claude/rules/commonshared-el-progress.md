---
paths:
  - "**/*{Progress,progress}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
---
<!-- managed by __CommonShared/rules/elements/el-progress.md; sha256:dab1c4e3a7f7db46; edit it there, put project rules in project-*.md -->
# Progress rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- Track 4–6px (8px brand), `--hover` or `--active` tint, `--radius-pill`; fill `--accent`, a status role only when the value is a status. (docs/21 §11)
- A label saying what is happening and a value ("21 of 50 files"), 12px app, 14px brand, `tabular-nums`. (docs/01 §3, docs/19 §5)
- Number and unit never break apart. (docs/19 §5)
## Behaviour
- Progress for a known amount; an unknown wait uses a spinner. (docs/21 §10, §11)
- The fill is the share of its own track, never scaled to the largest row. (docs/17 §10)
- Animate `transform: scaleX()` with `transform-origin: left`, never `width`; 120–150ms between updates. (docs/01 §9, docs/19 §7)
- Never show 100% before the work is confirmed done. (docs/03 §3)
- On failure: danger fill plus error text and Retry; offer Cancel for long jobs. (docs/21 §11, §13)
- Step indicators count only real sequences ("Step 2 of 4"). (docs/19 §4)
## Accessibility
- `role="progressbar"` or `<progress>` with `aria-valuemin`, `aria-valuemax`, `aria-valuenow`, `aria-valuetext` and a label. (docs/21 §11)
- Indeterminate omits `aria-valuenow`; announce start, failure and completion, not every percent. (docs/21 §11)
- Never colour alone for "almost full": the value and a word or icon. (docs/01 §1, docs/03 §3)
## Uses
- Button — cancel and retry. (docs/21 §11)
- Error state and Toast — failure and background completion. (docs/21 §9, §13)
