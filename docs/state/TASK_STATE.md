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

- 2026-07-10T21:48:04Z — feature/recovery-mode — Phase 11 recovery events,
  derived credits, deterministic statuses, Today recovery UI, and direct docs
  complete; checks recorded in `SESSION_LOG.md`; next step: review/commit and
  await explicit Phase 12 approval.

## Historical detail

Use `docs/state/SESSION_LOG.md` for chronological summaries and
`docs/state/COMPLETED_PHASES.md` for the detailed Phase 0-10 completion archive.
Do not copy completed-phase history back into this file.
