# Task State

Last updated: 2026-07-20

## Current phase

Phase 18 browser-authenticated user-data export MVP is implemented on
`feature/data-export-import`. It provides one canonical full JSON archive,
day-log/task/check-in CSVs, stored weekly/cycle-report Markdown summaries, and
five private Settings downloads. Accepted correction findings are implemented
and covered by focused automated tests. Authenticated browser/download smoke has
not been performed and remains required before merge, so Phase 18 is not yet
release-ready. Data import remains deferred. Phase 19 has not started.

## Active task

One repeatable-read snapshot starts from the existing authenticated application
user and reads every owned active, archived, incomplete, or otherwise stored
cycle. Explicit allowlists produce deterministic flat collections with stable
IDs, parent IDs, UTC timestamps, date-only values, stored statuses, nullable
values, normalized records, relational context tags, and linked-owned raw
imports only. No active cycle and no cycles are successful export states.

CSV serializers use fixed headers/order, correct UTF-8 quoting, preserved empty
values, parent identifiers, and spreadsheet-formula neutralization. Markdown
renders only stored weekly reviews and `CYCLE_REPORT` context items with neutral
missing-summary text and controlled quoted/indented structure. The endpoint
assembles owned data once, serializes only the requested format, and returns one
direct attachment response with a fixed UTC filename. Successful and bounded
error responses use private `no-store` caching. Generated export files are never
persisted by the application.

Export uses detailed read-only browser-session resolution, distinguishes no
browser session from an authenticated missing application user, rejects GPT
bearer-only requests and caller-supplied selection parameters, and performs no
user/domain/import writes. Settings exposes exactly five responsive actions,
blocks concurrent duplicates, preserves page state, bounds errors, and defers
Blob URL cleanup until after download consumption.

## Next phase

Phase 19 remains separate and unstarted. Import/restore semantics, generated
reports, broader test infrastructure, CI completion, coverage policy, export
history/jobs, filters, public links, ZIP/PDF/encryption, and database dump
download remain deferred.

## Next actions

1. Complete the required authenticated manual Settings/download/privacy smoke.
2. Review and commit only after the manual release blocker passes.
3. Do not start Phase 19 without separate planning and approval.

## Required completion checks

- Focused Phase 18 export, read-only auth, and existing context-export tests.
- Formatting, lint, typecheck, full tests, payload/schema drift, production
  build, Prisma validation, shell syntax, and whitespace through one final
  `make check`.
- Required manual authenticated download/privacy/desktop/~390px smoke before
  merge because no checked-in browser harness is available.

## Automated verification evidence

- Diagnostic typecheck passed after removing one malformed ignored `.next/dev`
  cache from the active type include path; no source workaround was added.
- Initial implementation focused tests passed with 3 files and 69 tests; its
  host-side `make check` passed with 23 files and 380 tests before this
  correction.
- Final correction-focused command passed: `pnpm exec vitest run
  tests/user-data-export.test.tsx tests/auth.test.ts
  tests/gpt-context-packet.test.ts`; 3 files, 86 tests.
- Focused coverage now includes all-cycle ownership, linked-owned raw-import
  scope, deterministic and empty serializers, leading-whitespace/control CSV
  formula protection, one selected serializer per request, private `no-store`
  success/400/401/404/500 responses, detailed Settings auth states, filenames,
  MIME and attachment headers, responsive controls, concurrency protection, and
  deferred Blob cleanup.

## Manual Phase 18 browser verification

No checked-in browser-smoke command exists, and Phase 18 does not authorize a
temporary Playwright/Cypress setup. Authenticated browser/download smoke was not
performed. Manual desktop and approximately 390 px verification remains a
release blocker before merge; use the exact checklist in the correction
handoff.

## Migration, deployment, and rollback

- No Prisma schema change, migration, backfill, data correction, index,
  dependency, worker, cache, export table, job, or persisted archive was added.
- Deployment requires application-code deployment plus authenticated Settings
  download/privacy smoke only.
- Rollback is application-code-and-documentation-only: revert export
  assembler/serializers/route, Settings controls, auth result extension, tests,
  ignore rules, and directly relevant docs. No data restoration, migration
  reversal, import replay, or export cleanup is required.

## Latest handoff

- 2026-07-20T14:25:45Z — feature/data-export-import — bounded Phase 18
  correction now serializes only the requested format, applies private
  `no-store` to every success/error response, root-anchors export ignores,
  hardens CSV formula protection, and distinguishes Settings unauthenticated
  from missing-user states; 3 focused files/86 tests passed; no migration,
  dependency, persisted export, import, or Phase 19 work; no checked-in browser
  harness exists, so exact authenticated download/privacy/~390 px manual smoke
  remains required before merge and Phase 18 is not release-ready

## Historical detail

Use `docs/state/SESSION_LOG.md` for chronological summaries and
`docs/state/COMPLETED_PHASES.md` for the detailed Phase 0-10 completion archive.
Do not copy completed-phase history back into this file.
