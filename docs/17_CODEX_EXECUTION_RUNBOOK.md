# 17 - Codex Execution Runbook

## Purpose

Define a repeatable, bounded Codex CLI loop that produces one reviewable change
without reloading the entire Reset90 documentation pack.

## 1. Start from the right branch

Normal work starts from `local`:

```bash
git switch local
git pull origin local
git switch -c feature/<slug>
```

Use `fix/`, `refactor/`, `chore/`, `cleanup/`, `docs/`, or `test/` when more
accurate.

## 2. Load compact context

```bash
make session
```

Codex then reads only:

```text
AGENTS.md
.codex/generated/session_context.md
```

Do not also read the source files embedded in the packet. Do not read the
all-in-one docs export, transcripts, full lockfiles, generated schemas, or
examples unless the task directly requires them.

## 3. Retrieve one phase

```bash
make phase PHASE=<number>
```

Never open all of `docs/16_BEST_IMPLEMENTATION_ORDER.md` for normal phase work.
Use `docs/00_PACK_INDEX.md` only to select the smallest relevant reference docs.
Use `docs/state/DECISIONS_INDEX.md` to locate specific ADRs.

### Pre-phase ChatGPT planning archive

Before Codex edits the repository, create compact planning context from clean
`local`:

```bash
cd ~/Code/reset90

git switch local
git pull origin local
git status --short --branch

make phase-bundle PHASE=N

tar -tzf ~/Downloads/reset90-phaseN-plan.tar.gz
```

Upload the single generated planning archive to the Reset90 ChatGPT Project.
Add phase-specific documents or ADRs explicitly when needed:

```bash
make phase-bundle PHASE=N \
  EXTRA_FILES="docs/file-one.md docs/adr/0011-example.md"
```

`phase-bundle` provides compact planning context before Codex edits the
repository. `review-bundle` provides the implementation diff, changed files,
tests, and Codex session after the phase.

## 4. Bound the task before edits

Codex must state:

- exact scope and non-goals;
- expected changed files;
- relevant ADRs;
- focused checks;
- final quality gate.

Subagents may be used for clearly independent, bounded work or parallel
verification. Scope each one to specific questions/files and avoid duplicate
repo-wide scans. Do not load graphify, install optional tools, or run browser
automation unless the task requires them or the user explicitly asks.

## 5. Implement and validate

Use targeted file reads. If output is truncated, narrow the query instead of
rereading a large file in chunks. Run focused tests while editing.

After the last meaningful implementation edit:

```bash
make check
```

Run the full gate once. A second run is justified only if later edits can affect
it.

## 6. Update compact state

Keep `docs/state/TASK_STATE.md` current-only. Append history through:

```bash
make update-task-state MSG="summary; checks run; next step"
```

This replaces the latest handoff in `TASK_STATE.md` and appends to
`SESSION_LOG.md`.

## 7. Review, bundle, and commit

```bash
git status --short --branch
make review-bundle PHASE=N
git add <intended-files>
git commit -m "type(scope): short summary"
```

`make review-bundle` writes one ZIP outside the repository. It includes Git
patches, current changed/untracked source snapshots, compact phase/state context,
and the newest Codex session whose metadata identifies this repository. Default
comparison base is `local`; override only when needed:

```bash
make review-bundle PHASE=N BASE_REF=origin/local
```

Inspect generated ZIP before uploading it to Reset90 ChatGPT Project for
completed-phase review. Codex transcripts can contain prompts, commands,
terminal output, or sensitive values. Sensitive, credential, environment,
database, dependency, and generated-build paths are excluded and reported in
bundle manifest; this is defense in depth, not substitute for human review.

Reject unrelated changes, generated exports, transcripts, secrets, and private
data from commit staging.

## 8. Merge and stop

After approval:

```bash
git switch local
git merge --no-ff <work-branch>
```

Stop after the requested phase. Do not begin the next phase without explicit
approval.

## Re-alignment prompt

```text
Stop and re-align. Run make session, read only AGENTS.md and the generated
session context, then run make phase PHASE=<N>. Restate scope, changed files,
ADRs, checks, and non-goals. Do not load broad skills or start optional QA.
```
