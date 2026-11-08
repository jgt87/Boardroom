---
paths:
  - "**/*{DropZone,dropZone,drop-zone,Dropzone,dropzone,Upload,upload,FileInput,fileInput,file-input}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
---
<!-- managed by __CommonShared/rules/elements/el-drop-zone.md; sha256:eb0b719d2e8ce167; edit it there, put project rules in project-*.md -->
# Drop zone rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- A `<label>` wrapping a native file input, so click, Enter and Space open the picker. (docs/20 Drop zone)
- Zone: 2px dashed `--border-strong`, radius `--radius-lg`, one line of text, limits in 12px `--muted`. (docs/02 §7, docs/19 §5)
- Dragover: edge `--accent`, fill `--accent-soft`. (docs/02 §7)
- A hidden native input over the zone takes full width and height, with `overflow:hidden` on the parent. (docs/17 §2)
- File list: one row per file with name, size, status or progress and a remove button. (docs/20 Drop zone)

## Behaviour
- Validate type, size and count on drop as well as in the picker. (docs/20 Drop zone)
- Count dragenter/dragleave so the highlight does not flicker over children. (docs/20 Drop zone)
- Stop the browser opening a file dropped beside the zone. (docs/20 Drop zone)
- Errors per file with a retry; keep the other files. (docs/01 §6, docs/20 Drop zone)
- The native input carries an `aria-label`; progress announced politely, failures assertively. (docs/01 §6)
- Coarse pointer: browsing is the main path; the drop hint is secondary. (docs/20 Drop zone)

## Uses
- Button — the browse action in the compact variant. (docs/20 Button)
- Icon button — remove a listed file. (docs/17 §8)
- Toast — results of background uploads. (docs/01 §6)
