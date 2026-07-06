# Codex Start Here

## Purpose

Shortest practical entry point for Codex CLI so it can begin work without loading the whole documentation pack.

## Minimal reading and command order

Run/read in this order:

```bash
make session
make context
```

Then read:

1. `AGENTS.md`
2. `PROJECT_CONTEXT_SHORT.md`
3. `.codex/generated/session_context.md`
4. `docs/state/TASK_STATE.md`
5. `docs/00_PACK_INDEX.md` only if selecting docs is unclear
6. Relevant ADRs only when the task touches architecture, auth, database/storage, deployment, AI/GPT integration, context memory, Git workflow, or core product behavior
7. The one or two task-relevant docs only

Do not read `ALL_FILES_READY_TO_SAVE.md` during normal development.

## First implementation task

Use `docs/16_BEST_IMPLEMENTATION_ORDER.md`, Phase 0.

Create the repository/docs foundation first. Do not scaffold app code until Phase 1. Phase 0 is repo initialization, docs import, ADR verification, operational script baseline, and documentation baseline commit.

## Branch rule before editing

Preferred helper:

```bash
make new-work TYPE=feature SLUG=repo-foundation
```

Manual equivalent if starting from `main`:

```bash
git switch main
git pull origin main
git switch -c local || git switch local
git switch -c feature/repo-foundation
```

Manual equivalent if already on `local`:

```bash
git switch -c feature/<short-slug>
```

Merge short-lived branches into `local`. Merge `local` into `main` only for production-ready releases.

## Finish rule

Before completion:

```bash
make check
make update-task-state MSG="summary; checks run; next step"
```

If `make check` cannot run yet, explain why and run the closest available commands.

## ADR rule before editing

Before changing architecture, auth, database/storage, deployment, AI/GPT integration, context memory, branch workflow, or core product behavior, read:

```text
docs/15_ADR_PROCESS_AND_REASONING.md
docs/adr/README.md
docs/state/DECISIONS_INDEX.md
```

Then read the specific ADR that applies.

If the planned change contradicts an `Accepted` ADR, stop and ask the user before editing.

If the task creates a new durable architecture/product/process decision, add a new ADR using `docs/adr/TEMPLATE.md`.

## Implementation order

Use `docs/16_BEST_IMPLEMENTATION_ORDER.md` as the primary phase-by-phase build order. It supersedes generic implementation-order notes.
