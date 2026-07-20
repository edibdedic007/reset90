# Task State

Last updated: 2026-07-20

## Current phase

Phase 18 browser-authenticated user-data export MVP is implemented on
`feature/data-export-import`. It provides one canonical full JSON archive,
day-log/task/check-in CSVs, stored weekly/cycle-report Markdown summaries, and
five private Settings downloads. Data import remains deferred. Phase 19 has not
started.

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
missing-summary text and controlled quoted/indented structure. Five dynamic
download responses use fixed UTC filenames, attachment headers, private
`no-store` caching, bounded errors, and no static or persistent file output.

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

1. Complete final Phase 18 review and optional manual browser/download smoke.
2. Commit after approval with `feat(export): add user data export`.
3. Do not start Phase 19 without separate planning and approval.

## Required completion checks

- Focused Phase 18 export, read-only auth, and existing context-export tests.
- Formatting, lint, typecheck, full tests, payload/schema drift, production
  build, Prisma validation, shell syntax, and whitespace through one final
  `make check`.
- Optional manual authenticated download/privacy/desktop/~390px smoke when an
  existing checked-in browser harness is available.

## Automated verification evidence

- Diagnostic typecheck passed after removing one malformed ignored `.next/dev`
  cache from the active type include path; no source workaround was added.
- Final focused command passed: `pnpm exec vitest run
  tests/user-data-export.test.tsx tests/auth.test.ts
  tests/gpt-context-packet.test.ts`; 3 files, 69 tests.
- Focused coverage proves all-cycle ownership, archived/no-active/no-cycle
  behavior, linked-owned raw-import deduplication, allowlists, relationships,
  deterministic ordering, 90-day volume, Unicode/null/status fidelity, CSV
  safety, Markdown privacy/structure, read-only auth outcomes, GPT-token
  rejection, private headers/filenames/errors, responsive controls, concurrency
  guard, and deferred Blob cleanup.
- First and only host-side `make check` passed: formatting, lint, typecheck, 23
  test files with 380 tests, payload/schema drift, production build with dynamic
  `/api/export/[format]` and `/settings`, Prisma validation, shell syntax, and
  whitespace.

## Manual Phase 18 browser verification

No checked-in browser-smoke command exists, and Phase 18 does not authorize a
temporary Playwright/Cypress setup. Manual authenticated desktop and
approximately 390 px verification remains skipped: open Settings, trigger each
download once, confirm duplicate controls stay disabled while running, confirm
page state remains, inspect five filenames/content types/private cache headers,
open JSON/CSV/Markdown outputs, verify bounded errors, inspect DOM/network for
foreign/auth/raw-unlinked sentinels, and confirm no horizontal overflow.

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

- 2026-07-20T13:53:47Z — feature/data-export-import — Phase 18 user-data export
  MVP implemented with canonical all-cycle JSON, three safe CSVs, stored-summary
  Markdown, private dynamic downloads, read-only existing-user auth, responsive
  Settings controls, narrow ignore rules, and focused coverage; 3 focused files
  and 69 tests passed; first/final host-side `make check` passed with 23 test
  files/380 tests plus production build; no import, migration, dependency,
  persisted export, GPT call, generated analysis, or Phase 19 work; manual
  authenticated desktop/~390 px download/privacy smoke skipped because no
  checked-in browser harness exists

## Historical detail

Use `docs/state/SESSION_LOG.md` for chronological summaries and
`docs/state/COMPLETED_PHASES.md` for the detailed Phase 0-10 completion archive.
Do not copy completed-phase history back into this file.
