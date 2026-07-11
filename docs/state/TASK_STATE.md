# Task State

Last updated: 2026-07-10

## Current phase

Phase 11 complete. Phase 12 has not started.

## Active task

Recovery mode and deterministic day-status calculation complete. Phase 12 is
out of scope.

## Next phase

12 — 90-day grid, analytics, and review workflow.

Read it with:

```bash
make phase PHASE=12
```

## Next actions

1. Review and commit Phase 11 changes.
2. Merge `feature/recovery-mode` into `local` after approval.
3. Start Phase 12 only after explicit approval.

## Required completion checks

- Focused recovery, status, dashboard, and check-in tests.
- Formatting, lint, typecheck, and `make check` once.
- `git diff --check` and `git status --short --branch`.

## Latest handoff

- 2026-07-10T22:19:37Z — feature/recovery-mode — Phase review bundle tooling and runbook completed; shell syntax, archive inspection, exclusion checks, git diff --check, and make check passed; next step: review/commit tooling and use make review-bundle PHASE=11 before completed-phase review

## Historical detail

Use `docs/state/SESSION_LOG.md` for chronological summaries and
`docs/state/COMPLETED_PHASES.md` for the detailed Phase 0-10 completion archive.
Do not copy completed-phase history back into this file.
