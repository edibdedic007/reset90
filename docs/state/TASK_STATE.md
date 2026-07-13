# Task State

Last updated: 2026-07-13

## Current phase

Phase 16 compact GPT context packet export and its bounded correction pass are
implemented with direct read-only session regression coverage and automated
verification complete. Manual phone-width export smoke remains pending. Phase
17 has not started.

## Active task

Phase 16 adds authenticated `GET /api/context/export` and one Context Library
download action. Export authentication now resolves only an existing
application user with a non-mutating lookup. One repeatable-read transaction
resolves that user's singular active cycle and assembles `gpt_context_packet`
version `1.0` from explicit normalized-field allowlists.

Normal packet assembly is schema-validated, measured as serialized UTF-8, and
bounded to 32 KiB by removing complete optional items from the ends of
`active_patterns`, then `open_decisions`, then `pinned_context`. Required
sections remain unchanged, and the final packet is validated again. Required
data that cannot fit returns a bounded safe server error. Browser Blob URL
cleanup is deferred until after the synthetic download click can be consumed.

Export never writes, reconciles, consumes credits, creates imports, persists
packets, reads raw payload fallback, or exposes ownership/authentication/internal
IDs, private notes, detailed narratives, prompts, or traces. JSON is the only
Phase 16 format.

This bounded correction directly executes `getReadOnlyBrowserSession` for an
existing application user, a missing application user, and an unauthenticated
identity. Existing and missing authenticated identities use the lookup path
without user upsert; unauthenticated behavior remains `null` without database
access. No production behavior changed.

## Next phase

Phase 17 remains deferred. No Markdown export, direct GPT submission,
embeddings, semantic retrieval, packet history/caching/scheduling, generated
recommendations, decision lifecycle, cross-cycle context, analytics expansion,
or other Phase 17 preparation was added.

## Next actions

1. Run the documented manual phone-width `/context` export smoke when an
   authenticated local browser is available.
2. Review and commit the Phase 16 correction with
   `test(auth): cover read-only browser session resolution` after approval.
3. Do not start Phase 17 without explicit approval.

## Required completion checks

- Direct real-helper coverage for existing-user lookup, missing-user lookup,
  no user upsert, and unchanged unauthenticated behavior, plus packet
  runtime/generated-schema parity, singular active-cycle handling,
  ownership/privacy, UTC windows, missing data, canonical statuses, metrics,
  deterministic 32-KiB pruning, required-only oversize failure, download
  headers, and deferred Blob URL cleanup tests.
- Generated-schema drift, lint, typecheck, full tests, production build, Prisma
  validation, shell syntax, and whitespace checks through the single final
  quality gate.
- Manual authenticated download/privacy/phone-width smoke remains pending and
  uses the checklist below because no checked-in browser harness exists.

## Automated verification evidence

- Focused authentication regression passed: `tests/auth.test.ts`; 1 file, 13
  tests.
- Final host-side `make check` passed: 21 test files, 328 tests, generated-schema
  and example drift, formatting, lint, typecheck, production build, Prisma
  validation, shell syntax, and whitespace checks.
- The added tests directly execute the real `getReadOnlyBrowserSession`, prove
  existing and missing authenticated identities use `findUnique` without
  `upsert`, prove the stored existing user is returned, and preserve
  unauthenticated `null` behavior without database access.
- This correction changes tests and state evidence only; no migration or
  production behavior change was introduced.

## Manual Phase 16 browser verification

No checked-in browser-smoke command exists, so no browser framework was
installed and interactive smoke was not run. Manual scope:

1. Sign in and open the Context Library page.
2. Confirm the GPT context export action is enabled with an active cycle.
3. Trigger the export and confirm only one request can run at a time.
4. Confirm the JSON file downloads successfully.
5. Confirm the filename follows `reset90-gpt-context-YYYY-MM-DD.json`.
6. Confirm the downloaded file parses as JSON.
7. Confirm the packet is at most 32 KiB.
8. Confirm required sections remain present after any deterministic pruning.
9. Confirm no raw payloads, private notes, authentication data, ownership
   identifiers, or internal IDs are present.
10. Confirm the control and error text are usable at phone width.
11. Confirm the no-active-cycle state disables or hides the export action and
    presents calm explanatory text.

## Migration and rollback

- Phase 16 and this test-only correction add no migration, backfill, data
  correction, worker, or background job.
- Rollback reverts the export route, packet schema/assembler and generated
  schema registration, Context Library control, focused tests, and Phase 16
  documentation.
- Rolling back this correction removes only the direct auth regression tests
  and verification evidence; no database restoration or user-data cleanup is
  required.

## Latest handoff

- 2026-07-13T20:54:57Z — feature/gpt-context-export — bounded Phase 16 auth correction added direct real-helper coverage for existing, missing, and unauthenticated read-only browser sessions; focused `tests/auth.test.ts` passed with 13 tests; final host-side `make check` passed with 21 test files and 328 tests plus production build; no migration or production behavior change; manual phone-width export smoke remains; next step: run that smoke, review, and commit with `test(auth): cover read-only browser session resolution` without starting Phase 17

## Historical detail

Use `docs/state/SESSION_LOG.md` for chronological summaries and
`docs/state/COMPLETED_PHASES.md` for the detailed Phase 0-10 completion archive.
Do not copy completed-phase history back into this file.
