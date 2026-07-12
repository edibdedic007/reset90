# Task State

Last updated: 2026-07-13

## Current phase

Phase 14 implementation complete; manual release verification pending. Phase 15
has not started.

## Active task

Phase 14 implementation is complete. Correction coverage now proves required
raw-import and owned-cycle row locks occur before dependent normalized review
reads/writes, and proves terminal retry behavior after same-week replacement.
Manual release verification remains pending.

## Next phase

Phase 15 remains deferred until explicit approval. Context-library pages,
context retrieval/search, embeddings, snapshots, and review-to-context behavior
were not started by Phase 14.

## Next actions

1. Complete the manual release verification checklist below.
2. Review the Phase 14 correction diff and commit with
   `test(reviews): strengthen weekly review verification` after approval.
3. Merge through the normal branch workflow; do not start Phase 15 without
   explicit approval.

## Required completion checks

- Focused weekly validation, canonical range, ownership, idempotency,
  replacement, concurrency, rollback, route, privacy, read, and UI tests.
- Focused lock-order and terminal retry-after-replacement normalization tests.
- Formatting, lint, typecheck, full tests, payload/schema drift, production
  build, Prisma validation, shell syntax, and one final `make check`.
- `git diff --check` and `git status --short --branch`.

## Automated verification evidence

- Phase 14 focused suite passed with 79 tests.
- Additive weekly-review migration was applied locally.
- Payload/schema drift validation and typecheck passed.
- Host-side Phase 14 `make check` passed.
- Correction Vitest run passed with 201 tests, including new lock-order and
  terminal retry-after-replacement coverage.

## Pending manual release verification

No manual item below was executed during this correction session. Repository
has no checked-in browser-smoke command, and no authenticated browser session or
credentials were available. Pending checklist:

- Unauthenticated `/reviews` follows established redirect or rejection
  behavior.
- Authenticated `/reviews` loads active-cycle reviews.
- Active cycle with no normalized reviews shows neutral empty state.
- Multiple reviews render newest week first.
- Week 13 displays canonical cycle days 85 through 90.
- Omitted and empty optional sections render no broken headings or blank
  bullets.
- Long narrative content wraps without horizontal overflow.
- Page remains usable near a `402 × 874` viewport.
- Sentinel value stored only in raw JSON is absent from:
  - visible page content;
  - rendered page source or browser response data;
  - application logs produced by smoke path.

## Latest handoff

- 2026-07-12T22:10:51Z — feature/weekly-reviews — Phase 14 correction added focused lock-order and terminal retry-after-replacement coverage without production changes; Vitest passed with 201 tests; manual authenticated `/reviews`, 402 × 874, and raw-sentinel privacy verification remains pending because no checked-in browser smoke or authenticated session was available; next step: run manual checklist, review, and commit without starting Phase 15

## Historical detail

Use `docs/state/SESSION_LOG.md` for chronological summaries and
`docs/state/COMPLETED_PHASES.md` for the detailed Phase 0-10 completion archive.
Do not copy completed-phase history back into this file.
