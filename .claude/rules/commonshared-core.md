<!-- managed by __CommonShared/rules/core.md; sha256:00fc31068a3387ee; edit it there, put project rules in project-*.md -->
# Core rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## House rules
- Never edit, move or delete user-provided source data in a session; work on copies, write derived files beside it. (docs/14 §10, L-DATA)
- No assistant or AI-vendor names in code, UI, docs, metadata, commits or PRs; no AI co-author trailers. (docs/14 §10, L-GIT)
- Write "the target machine"; never name or describe the operator's own machines, in repos or replies. (docs/14 §10, L-SEC)
- Stay read-only first toward any integration or source system that can write. (docs/14 §10, L-SEC)
- A change that lowers a limit users feel (retention, history, quotas) is asked as its own question. (docs/07 §2)
- Pricing, tier and other settled decisions are the operator's; record them as "operator, <date>" and don't reopen. (docs/09 §1)

## Docs in step
- Every user-relevant change adds a CHANGELOG `## [Unreleased]` line (Added/Changed/Fixed, user language) in the same change. (docs/05 §3, L-GIT)
- Update the README, AGENTS.md and any roadmap or status file in the same turn the code or state changes. (docs/14 §10, L-AGENT)
- AGENTS.md is canonical; a tool-specific agent file only imports it (`@AGENTS.md`); own notes go outside tool-managed blocks. (docs/05 §3, docs/13 §6, L-AGENT)
- AGENTS.md holds only what code can't show (check commands, misleading places, decisions); keep it < 200 lines. (docs/14 §2)
- Each gotcha line reads: rule — reason (incident, YYYY-MM-DD); append, don't rewrite. (docs/05 §3)
- Docs never state counts that drift (tools, tests) unless a test checks them. (L-GIT)
- "Document the change" means edit existing docs; don't create new doc files for it. (L-AGENT)
- After a bulk change (line endings, renames), grep agent and project docs for notes on that property. (docs/07 §5)

## Change and release
- The operator commits and pushes: never `git commit` or `git push` unasked; each release needs its own request. (docs/09 §1)
- Plan work of 3+ steps or with a design decision as a checklist (default `tasks/todo.md`); agree it before building. (docs/09 §2)
- Hand off as "ready": what to look at, port, account, build; never "deployed" or "pushed" before a release. (docs/09 §2)
- Keep one version source; a test fails when carriers (package, manifest, tag) differ; bump all together. (docs/05 §6, L-GIT)
- Release: bump → `Unreleased` becomes `## [vX.Y.Z] - YYYY-MM-DD` → typecheck, test, build, smoke → commit, tag, push. (docs/05 §6)
- "Commit and push" means version bump + annotated tag + release package, as one step. (docs/14 §10, L-GIT)
- Release assets carry `SHA256SUMS`; zip entries use `/` (`git archive`, `tar`); binaries never go in git. (docs/05 §6, L-GIT)

## Git
- Stage by explicit path; never `git add -A` or `git add -u`; run `git status --short` first, another session may share it. (docs/07 §5, docs/09 §6)
- Commit messages describe the change. On Windows: pass a message with quotes via `git commit -F <file>`, never `-m`. (L-GIT, L-WIN)
- Never `git stash`, `git checkout -- .` or `git reset` in a shared tree; compare with `git show HEAD:<path>`. (docs/07 §7)
- Comment each `.gitignore` block with its kind: regenerable, machine-local, secret, not ours, or reference-only. (docs/11 §1)
- Anchor output and runtime dirs (`/dist/`, `/data/`); a `!` negation needs `parent/*` first; use `*.py[co]`. (docs/11 §3)
- Ignoring doesn't untrack: `git rm --cached <path>`; prove every pattern with `git check-ignore -v <path>`. (docs/11 §3)
- Ignore `.claude/settings.local.json`; ignore all of `.claude/` only when every file there is machine-local. (docs/11 §3)
- LF everywhere via `.gitattributes` `* text=auto eol=lf`; CRLF only for `*.cmd`, `*.bat`, `*.sln`; binaries `binary`. (docs/12 §2)
- Leave the machine's `core.autocrlf` alone; changing it is the operator's choice. (docs/12 §2)
- Before pushing, check every referenced asset is tracked (`git ls-files <path>`). (L-GIT)
- Before any public push, run the privacy checks in the security rules. (docs/14 §10, L-SEC)

## Working and verifying
- State assumptions and name competing readings instead of picking silently; ask when unclear. (docs/14 §3)
- Build the minimum asked; every changed line traces to the request; mention unrelated dead code, don't delete it. (docs/14 §3)
- Turn tasks into checks: a failing test then green; a refactor passes the same tests before and after. (docs/14 §3)
- "Done" means the project's own check scripts pass; report each command with its output. (docs/14 §5, L-TEST)
- Verify the live thing (served bundle, deployed function, device) with numbers; restart servers after backend edits. (docs/07 §5, L-AGENT)
- Check the outcome, not the status: a 200, "succeeded" or zero result is a claim to probe. (docs/15 §0, L-DEPLOY)
- Confirm "the code lacks X" only by reading the whole path; an empty grep proves nothing. (docs/07 §5, L-AGENT)
- After a runtime or CLI upgrade, run the full suite and build before any other work. (docs/07 §4, L-BUILD)
- Stop and re-plan when something goes sideways; after two failed corrections, restart with one better prompt. (docs/09 §7, docs/14 §8)
- A guideline missed twice gets a machine check (test, lint, hook) proven to fail on a broken example. (docs/07 §1, docs/14 §1)
- An operator correction becomes a `tasks/lessons.md` entry in the same turn: rule, Why with date, check. (docs/07 §1)

## Reporting
- Answer code questions from the code; counts come from a command, never mental arithmetic. (docs/07 §2, L-AGENT)
- Number every option; letters under a number are alternatives of one decision. (docs/07 §2)
- Commands to paste use absolute paths, never environment variables. (docs/07 §2)

## Edits and shell
- Edit with the edit tools after reading the file with the read tool; never `sed -i`, `node -e` or a heredoc. (docs/07 §3, docs/12 §4)
- An edit script keeps the file's line ending, matches on `\n`, throws on a miss; check the file isn't mixed after. (docs/12 §4)
- List the folder case-insensitively before creating a file; in a shared folder re-list right before writing. (docs/07 §3)
- Shell state and `/tmp` don't survive calls: use absolute paths, the session's scratch directory or gitignored `temp/`. (docs/07 §4)
- Probe downloads and captures go to the session's scratch directory, never into the repo. (docs/07 §4, docs/11 §3)
- Quote every path variable in a shell loop (`"$p"`) and check the first iteration's output. (docs/07 §4)

## Subagents
- Brief like a peer: goal, files, constraints, done, and the irreversible actions it must not take. (docs/14 §7, docs/07 §5)
- Parallel agents get disjoint files and no git, build or coverage; the orchestrator runs combined checks after. (docs/07 §7)
- Trust the measured diff over an agent's report; read its patch for duplicated blocks. (docs/07 §7, L-MCP)
- A stopped subagent: check `git status --short`, try resuming once, else restart with the same brief. (docs/07 §7)
- Never run two builds in one checkout; use worktrees under gitignored `.worktrees/<track>`. (docs/14 §7)
