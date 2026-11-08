---
paths:
  - "**/*{Spinner,spinner,Loading,loading,Loader,loader,Skeleton,skeleton}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
---
<!-- managed by __CommonShared/rules/elements/el-spinner.md; sha256:78c9067857d7e31e; edit it there, put project rules in project-*.md -->
# Spinner and skeleton rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- SVG ring 14–16px in controls and inline, 20–24px for a region, stroked in `currentColor`. (docs/01 §6, docs/21 §10)
- Label ("Saving…") 12px app, 14px brand, in `--muted`; no joke loading copy. (docs/03 §3, docs/19 §5)
- Skeleton blocks in a `--hover` or `--active` tint, the real content's size and radius; static or a gentle pulse, no shimmer. (docs/03 §3, docs/21 §10)
## Behaviour
- Spinner for a control or an unknown short wait; skeleton for a region with a known shape; progress for a known amount. (docs/21 §10, §11)
- Already turning when it appears. (docs/19 §7)
- Reduced motion slows the spin instead of stopping it, via the `.motion-alt` opt-out. (docs/01 §9, docs/21 §10)
- A busy button is disabled, keeps its width, changes its label inside, and locks against double submission. (docs/01 §5, docs/02 §7)
- Regions and charts keep their min height while loading; never flash "empty" before data arrives. (docs/17 §10a, docs/21 §12)
- Never show optimistic or old data as confirmed while loading; mark stale data with its time. (docs/03 §3)
- Use a spinner on the control, never `cursor: wait`. (docs/02 §1)
## Accessibility
- `role="status"` with a text label, visually hidden if not shown; the spinner SVG is `aria-hidden`. (docs/01 §6)
- The loading container carries `aria-busy="true"`, which also serves as the style hook. (docs/21 §10)
## Uses
- Icon and `.motion-alt` — the SVG ring and its reduced-motion variant. (docs/01 §9)
- Empty state and error state — what replaces it when loading ends. (docs/21 §12, §13)
