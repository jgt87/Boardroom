---
paths:
  - "src/**"
  - "lib/**"
  - "app/**"
  - "packages/**"
  - "scripts/**"
  - "tools/**"
---
<!-- managed by __CommonShared/rules/code.md; sha256:4a42743f9eb3698c; edit it there, put project rules in project-*.md -->
# Code rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Size and complexity
- Keep functions ≤ 80 lines and cyclomatic complexity ≤ 10; a component past that is several components. (docs/08 §1)
- Enforce size with a ratchet against a committed baseline: no file gains a violation, a new file has none. (docs/08 §1)
- Lower the size baseline only after a split; raising a number is the operator's decision. Tests are exempt. (docs/08 §1)
- Chain the size check into the project's lint script so the release gate runs it. (docs/08 §1, L-TEST)

## Module shape
- Put labels, wording, geometry, validation and key handling in a pure module named by role (`*Model`, `*Wording`, `*Geometry`). (docs/08 §2)
- Give every new pure module its own test file next to it. (docs/08 §9)
- Components read state, call pure functions and render; their tests check wiring, not every branch. (docs/08 §2)
- A component that outgrows one file gets a folder of its name; the top file stays a thin composition with the same exports. (docs/08 §2)
- Before refactoring code its tests don't pin, write characterization tests and run them green against the original. (docs/08 §9, L-TEST)

## State
- If the app has a central store: assemble it from slices; importers use only the store module, never a slice. (docs/08 §3)
- Write store actions as pure helpers: state in, patch out, `null` for nothing to do, so a no-op pushes no undo entry. (docs/08 §3)
- Keep side effects (commit, persist) in the slice, in order, not in the pure helper. (docs/08 §3)
- No module beneath the store imports the store instance; pass a getter bound at creation. (docs/08 §3)
- Classify every new field as document, session/UI or user preference, and record it in the project doc. (docs/08 §3)
- Model a cross-tree request (open a dialog, focus a field) as a field set by the asker and cleared by the doer. (docs/08 §3)

## Persistence
- One storage key per concern behind a `getStoredX`/`persistX` pair in `try/catch`, degrading to memory. (docs/08 §4)
- Treat everything read back as untrusted: sanitize on read and whitelist fields and types. (docs/08 §4)
- Decode by sniffing a format marker (`codec: 1`); old shapes load forever, unknown fields survive a round trip. (docs/08 §4)
- Keep app version, schema version and codec marker independent; never tie one to another. (docs/08 §4)
- Never put a sensitive column on a table that other roles may read; give it its own table. (docs/08 §4)
- Key data on ids, never on names, amounts or positions; assert the id set, not the count. (L-DATA)
- Write files via temp file, re-read, then atomic replace. (L-DATA)
- With autosave: track dirty state and flush pending saves on switch, hide (`visibilitychange`) and close. (L-DATA)

## Constants and tables
- Shared literals live once, in a dependency-free constants module, and are imported, never re-copied. (docs/08 §5)
- Add a column to a shared per-kind table instead of a constant in one consumer. (docs/08 §5)
- Hold key literals to their home with a rule test; when it fails, fix the code, not the allow-list. (docs/08 §5)
- Write per-kind behaviour as a table keyed by the kind (`Record` in TypeScript), not an `if` ladder. (docs/08 §6)
- In typed code, make such tables total over the kind type, so a new kind fails to compile until it names its entry. (docs/08 §6)
- Mark files that change together by design in the project doc; the coupling to hunt is a copied constant. (docs/08 §5)
- One definition per concept, derived, never duplicated in a second implementation. (L-METHOD)

## Imports and bundles
- Write import arrows down and lint them per folder (e.g. `no-restricted-imports`); data and domain code never import UI. (docs/08 §7)
- An allowed exception to an import arrow states its reason in a comment at the import. (docs/08 §7)
- Mark server-only code and fail the build if a marker reaches the client bundle. (docs/08 §7)
- Never build raw query filters by string interpolation; forbid it with a lint rule (e.g. `no-restricted-syntax`). (docs/08 §7)
- Bundled apps keep a gzip budget per chunk that fails the build; raise it to measured + 2 KiB with a dated comment. (docs/08 §8)
- In a lazy chunk near its budget, move code rather than add module boundaries; measure before and after. (docs/08 §8)
- A lazy-loaded panel shows a loading state, never a blank wait. (docs/08 §8)
- Exclude foreign code (captures, bundles, `.worktrees/`) from typecheck and lint in the same change. (L-BUILD)

## Reasons and retrofits
- Keep the reason for a code rule in a comment in the file it governs; the agent doc holds the short form. (docs/08 §10)
- Retrofit with a ratchet, never a big-bang cleanup: measure first, then lower the budget as code improves. (docs/10 §1, §2)
- Sort retrofit findings into should / could / doesn't apply; ask only about could. (docs/10 §1)
- Don't swap a working framework or test runner in a retrofit pass. (docs/10 §8)
- Run one-off migration scripts from outside the repo with a real parser; commit only the result. (docs/10 §2)
