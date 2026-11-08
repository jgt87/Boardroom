---
paths:
  - "**/*{Switch,switch,Toggle,toggle}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
---
<!-- managed by __CommonShared/rules/elements/el-switch.md; sha256:edfa71d6e8e2c7e9; edit it there, put project rules in project-*.md -->
# Switch rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- `<button role="switch" aria-checked>`; track 36×20 (46×28 coarse), pill radius, knob 12–22px. (docs/01 §6)
- Off track `--border-strong`, on track `--accent`, knob `--surface` or `--on-accent`; knob position carries state too. (docs/01 §1, docs/20 Switch)
- The label names the setting ("Email alerts"), not an action; 13–14px app. (docs/19 §4, §5)

## Behaviour
- For settings that apply immediately; form values use a checkbox. (docs/01 §6)
- Two named states that both matter use a segmented control. (docs/20 Switch)
- The whole row is clickable; Space toggles; the knob moves by `transform` at 150ms. (docs/01 §6, docs/19 §7)
- Remote saves: show loading until confirmed, or revert and announce on failure. (docs/03 §3)
- Never present an optimistic state as confirmed. (docs/03 §3)

## Uses
- Spinner — an async setting in progress. (docs/01 §5)
- Toast — reports a failed save after reverting. (docs/01 §6)
