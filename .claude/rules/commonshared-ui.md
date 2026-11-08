---
paths:
  - "**/*.{css,scss,html,tsx,jsx,vue,svelte,astro}"
  - "DESIGN.md"
  - "PRODUCT.md"
---
<!-- managed by __CommonShared/rules/ui.md; sha256:80d4a7c41022ab53; edit it there, put project rules in project-*.md -->
# UI rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Design system files
- Read PRODUCT.md and DESIGN.md before UI work; a UI project without them writes them first. (docs/03 §4)
- DESIGN.md holds YAML tokens plus short Named Rules; token files derived from it are regenerated, never hand-edited. (docs/03 §2)
- Critique primary surfaces before release, fix P0/P1, and log accepted deviations with their reasons. (docs/03 §4)
- If the project has `.impeccable/`: `detect` ignores linked stylesheets, so confirm its colour and type findings in the browser. (docs/03 §4)

## Tokens, colour, theme
- No shared palette: colours, accent, status hues and dark values are the project's, set in DESIGN.md; until then use system colours. (docs/01 §2)
- Components use role tokens only (`--bg --surface --ink --muted --border --accent --on-accent`); no literal colours. (docs/01 §2)
- With a palette, keep two layers: raw palette tokens, and role tokens that point at them; mark derived shades. (docs/01 §2)
- Hover and selected are tints of existing tokens (`color-mix()`), not new solid colours. (docs/01 §2)
- Flat by default; shadows only on things that float (menu, popover, dialog, toast). (docs/01 §1)
- Status = soft fill + strong text + an icon or word; never colour alone. (docs/01 §1, §2)
- Data/domain colours sit in their own token group, never on chrome; user content colours stay literal. (docs/01 §2, docs/10 §2)
- Text, muted text and placeholders ≥ 4.5:1; field and button edges ≥ 3:1; measured in both themes. (docs/17 §7)
- Light + dark via `[data-theme]` (or `.dark`) on `<html>`, first value from `prefers-color-scheme`, choice persisted. (docs/01 §2)
- Each theme sets `color-scheme` and styles `option`, so native selects, pickers and scrollbars follow. (docs/17 §7)
- Dark: no panel darker than the page; every selected and hover state has a dark variant. (docs/17 §7)
- Text on accent fills uses `--on-accent`; a hover that changes the background sets the text colour too. (docs/17 §7)
- Add a global `[hidden]{display:none !important}`: an author `display:flex|grid` otherwise beats `hidden`. (docs/17 §7, L-UI)

## Type, spacing, sizes
- Font sizes 10/11/12/13/14/16/18/20px, no `clamp()` in app UI, rule-tested; mark exceptions `/* type-scale: glyph */`. (docs/01 §3, docs/10 §3)
- Body 13px/1.4 dense or 14px/1.5; labels 11–12px; titles 14–16px/600; dialog titles 18–20px; code ≥ 13px. (docs/01 §3, docs/17 §2)
- One UI family + one mono; hierarchy from weight, not extra sizes; bundle webfonts, no runtime CDN. (docs/01 §3)
- `tabular-nums` on every changing number; numeric columns and their headers right-aligned. (docs/01 §3, docs/17 §1)
- Spacing on 4px steps (2 4 8 12 16 24 32); radius 4–8 controls, 6–12 menus, 10–12 cards; pills for one-line text only. (docs/01 §4, docs/17 §3)
- Control heights 24/28/32/36px (32 default); inputs match buttons; icon buttons square, ≥ 28px clickable. (docs/01 §5, §6, docs/17 §2)
- One height per bar and per control kind, checked by a test over rendered heights at desktop and phone width. (docs/17 §2)
- Coarse pointer: reach 44px via padding or an invisible `::after` in `:where()`, never a bigger visible box. (docs/10 §4, docs/17 §2)
- Coarse-pointer inputs use `font-size: max(16px, 1em)`; never block zoom with `maximum-scale=1`. (docs/10 §4, docs/17 §2)
- Wrap every `:hover` in `@media (hover: hover)`; hover never overrides active/selected (`:hover:not(.active)`). (docs/01 §7, docs/17 §7)

## Focus and accessibility
- One global `:focus-visible`: 2px solid `--ring`, offset 2px, full opacity; never `outline:none` without a replacement. (docs/17 §8)
- Composite inputs ring the wrapper with `:focus-within`; canvases use an inset ring, keyboard modality only. (docs/01 §7, docs/17 §8)
- Clickable things are `button`s (`aria-pressed` for toggles); icon-only buttons get `aria-label`, not just `title`. (docs/17 §8)
- Generated controls get names with row context; status lines `role="status"`, error boxes `role="alert"`. (docs/01 §6)
- Disabled = opacity .4–.5 + `cursor:not-allowed`, out of the focus walk; disable unavailable controls, don't hide them. (docs/01 §5, docs/17 §4)
- One primary button per view, on the forward path; Save-style actions stay secondary and disabled until a change. (docs/01 §5, §6)

## States and overlays
- Every list, table and chart has empty, loading and error states; errors are specific and offer a recovery action. (docs/01 §6, L-UI)
- Loading = 14–16px spinner (`role="status"`) or skeleton; busy buttons keep width; empty charts keep a min height. (docs/01 §5, docs/17 §10a)
- Never show optimistic or old data as confirmed; announce state changes that are otherwise silent. (docs/03 §3)
- Tooltips: short, on hover and focus, `aria-describedby`, `kbd` badge for shortcuts, `pointer-events:none`. (docs/01 §6)
- One shared menu component: rows 32–36px, keyboard navigable, closes on outside pointerdown, Esc, Tab, scroll and wheel. (docs/01 §6)
- Clamp popovers and menus to the viewport with 4px margin and flip; max height = measured space left, with a floor. (docs/17 §5, §6)
- Popovers inside a scroll container portal to `body` with fixed coordinates, re-anchored on resize and scroll. (docs/17 §5)
- Dialogs: native `<dialog>` (overlay on Electron); Esc closes, Tab trapped, focus returns, `aria-modal` + label. (docs/01 §6, docs/17 §6)
- One scroll area per dialog, height stable across tabs, close in a header; queue a second dialog asking the same thing. (docs/17 §6)

## Layout, overflow, stacking
- z-index from named band tokens listed once in DESIGN.md; two layers never share a value by accident. (docs/17 §5)
- Layers that move with a canvas sit below fixed chrome; full-width transparent wrappers are `pointer-events:none`. (docs/17 §5)
- Flex children holding text get `min-width:0`; user names truncate with `title` or use `overflow-wrap:anywhere`. (docs/17 §3)
- Long lists and menus scroll inside themselves; table headers sticky; prose measure 60–75ch. (docs/17 §3)
- `scrollbar-gutter: stable` on panels that can scroll; toggles and close buttons keep their place in every state. (docs/17 §4)
- Images carry `width`/`height`; never save a layout measured before fonts and images settle. (docs/17 §4)
- Shell `100dvh`, width `100%` not `100vw`; floating panels cap at `calc(100vw - 24px)`; bars wrap when narrow. (docs/17 §9)
- Centre icon + label with `inline-flex; align-items:center`; arrows are SVG, not glyphs; one `ml-auto` per row. (docs/17 §1)
- Content in a bordered box = outer − 2×border − 2×padding; neighbours take their size from one shared class. (docs/17 §1)

## Motion, scrollbars, icons
- 120–150ms ease-out for state changes, ≤ 200ms `cubic-bezier(.22,1,.36,1)` for popover/dialog entry; no bounce. (docs/01 §9)
- Animate only transform, opacity and colour; collapse with `grid-template-rows: 0fr↔1fr`, never `max-height`. (docs/17 §3, §4)
- One global `prefers-reduced-motion` rule with a `.motion-alt` opt-out; gate JS smooth scrolling on it too. (docs/01 §9, docs/10 §5)
- Thin 8px scrollbars, transparent track, pill thumb at ink 18%; icons from one SVG set, 14–16px in controls, 20px in rails. (docs/01 §8, §10)
- Review against the UI review checklist in light and dark, keyboard only and with touch emulation. (docs/17 §12)
