# Task State

Last updated: 2026-07-12

## Current phase

Phase 14 complete. Phase 15 has not started.

## Active task

Phase 14 adds normalized weekly-review persistence, canonical cycle-relative
week validation, trusted-owner transactional import/replacement, and an
authenticated read-only Reviews page for the owned active cycle.

## Next phase

Phase 15 remains deferred until explicit approval. Context-library pages,
context retrieval/search, embeddings, snapshots, and review-to-context behavior
were not started by Phase 14.

## Next actions

1. Complete the manual authenticated `/reviews` and raw-sentinel privacy smoke.
2. Review the Phase 14 diff and commit with
   `feat(reviews): add weekly review imports` after approval.
3. Merge through the normal branch workflow; do not start Phase 15 without
   explicit approval.

## Required completion checks

- Focused weekly validation, canonical range, ownership, idempotency,
  replacement, concurrency, rollback, route, privacy, read, and UI tests.
- Formatting, lint, typecheck, full tests, payload/schema drift, production
  build, Prisma validation, shell syntax, and one final `make check`.
- `git diff --check` and `git status --short --branch`.

## Latest handoff

- 2026-07-12T21:47:00Z — feature/weekly-reviews — Phase 14 added additive weekly-review persistence, canonical owned-cycle week validation, deterministic transactional normalization/replacement, raw privacy, and read-only Reviews UI; focused Phase 14 suite passed with 79 tests, additive migration applied locally, and host-side make check passed; manual authenticated/mobile privacy smoke remains; next step: complete manual smoke, review, and commit without starting Phase 15

## Historical detail

Use `docs/state/SESSION_LOG.md` for chronological summaries and
`docs/state/COMPLETED_PHASES.md` for the detailed Phase 0-10 completion archive.
Do not copy completed-phase history back into this file.
