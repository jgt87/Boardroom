---
paths:
  - "**/*{ErrorState,errorState,error-state,ErrorBoundary,errorBoundary,error-boundary,Banner,banner}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
---
<!-- managed by __CommonShared/rules/elements/el-error-state.md; sha256:348f218285681068; edit it there, put project rules in project-*.md -->
# Error state rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- Status icon plus a word ("Error", "Offline") plus a soft status fill (`--danger-soft`, `--warn-soft`); never red text alone. (docs/01 §1, docs/21 §13)
- Message 13px app, 14px brand: what happened, what it affects, and the fix. (docs/19 §4, §5)
- A recovery button (Retry, Reload, Open settings); technical detail behind a disclosure, mono, copyable. (docs/01 §6, docs/21 §13)
- Banners have no shadow; a region error sits in the region's own space and min height. (docs/21 §13)
## Behaviour
- Errors are specific and offer a recovery action; never "Oops, something went wrong". (docs/01 §6, docs/19 §4)
- One boundary per region (panel, chart, widget) so one failure leaves the rest usable. (docs/21 §13)
- After a failed submit keep what was typed and focus the first failing field. (docs/19 §7)
- Form failures show inline at the form, not in a toast. (docs/19 §7)
- Banners push content down above what they concern; no entrance animation on routine loads. (docs/19 §7, docs/21 §13)
- Stale views say so with a time; never present old data as current. (docs/03 §3)
- Retrying shows a spinner on the action while the message stays. (docs/21 §13)
## Accessibility
- An error that appears after an action is `role="alert"`; a banner present on load is `role="status"` or plain text. (docs/01 §6, docs/21 §13)
- Field errors use `aria-invalid` plus `aria-describedby` pointing at the message. (docs/19 §7)
- Retry buttons carry context in their name ("Retry loading layers"). (docs/01 §6)
## Uses
- Icon, Button, Spinner — status, recovery, retrying. (docs/21 §13)
- Toast — a background failure is a toast and, if it persists, a banner. (docs/21 §9)
