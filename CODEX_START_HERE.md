# Codex Start Here

    ## Purpose
    Provide the shortest practical entry point for Codex CLI so it can begin work without loading the whole documentation pack.

    ## Scope
    - Use this file at the start of a Codex session.
- Explains reading order, branch workflow, and first build task.
- Does not contain full product details; those live in `docs/`.

    ## Assumptions
    - Repository may be empty or partially implemented.
- Codex should inspect files before assuming the stack is already present.
- The user wants careful Git usage and meaningful commits.

    ## Success Criteria
    - Codex reads minimal context first.
- Codex starts with repository foundation, not advanced features.
- Codex creates or uses the correct branch before editing.

    ## Deliverables
    - Codex startup checklist.
- Minimal build instructions.
- Token-saving reading plan.

    ## Minimal reading order

Read in this order:

1. `AGENTS.md`
2. `PROJECT_CONTEXT_SHORT.md`
3. `docs/00_PACK_INDEX.md`
4. `docs/adr/README.md` when the task touches architecture, auth, database, deployment, AI integration, Git workflow, or core product behavior
5. The one or two task-relevant docs only

Do not read `ALL_FILES_READY_TO_SAVE.md` during normal development.

## First implementation task

Use `docs/16_BEST_IMPLEMENTATION_ORDER.md`, Phase 0.

Create the repository/docs foundation first. Do not scaffold app code until Phase 1 of `docs/16_BEST_IMPLEMENTATION_ORDER.md`. Phase 0 is only repo initialization, docs import, ADR verification, and documentation baseline commit.

## Branch rule before editing

If starting from `main`:

```bash
git switch main
git pull origin main
git switch -c local || git switch local
git switch -c feature/repo-foundation
```

If already on `local`:

```bash
git switch -c feature/<short-slug>
```

Merge short-lived branches into `local`. Merge `local` into `main` only for production-ready releases.

## Finish rule

Before completion:

```bash
make check
```

If `make check` does not exist yet, run the closest available commands and create the Makefile as part of repository foundation.


## ADR rule before editing

Before changing architecture, auth, database/storage, deployment, AI/GPT integration, context memory, branch workflow, or core product behavior, read:

```text
docs/15_ADR_PROCESS_AND_REASONING.md
docs/adr/README.md
```

Then read the specific ADR that applies.

If the planned change contradicts an `Accepted` ADR, stop and ask the user before editing.

If the task creates a new durable architecture/product/process decision, add a new ADR using `docs/adr/TEMPLATE.md`.


## Implementation Order
Use `docs/16_BEST_IMPLEMENTATION_ORDER.md` as the primary phase-by-phase build order for Codex CLI. It supersedes generic implementation-order notes.
