# Task State

Last updated: 2026-07-20

## Current phase

Phase 19 testing foundation and CI completion is implemented locally on
`chore/ci-and-testing-foundation`. Phase 18 prerequisites are satisfied: PR
`#21` records the authenticated desktop, approximately 390 px, download, and
privacy smoke; the PR is merged; and this branch starts from the synchronized
`local`/`origin/local` merge commit with a clean pre-edit tree.

Phase 19 has no product behavior, Prisma schema, migration, dependency, browser
framework, deployment automation, branch-protection automation, or Phase 20
security change. Final phase completion remains gated on a real pull request
starting the stable `quality` job and that job passing.

## Active task

One canonical GitHub Actions workflow runs the `quality` job for pull requests
targeting `local` or `main`, pushes to either branch, and manual dispatch. It
uses read-only contents permission, per-branch/PR cancellation, locked pnpm,
synthetic CI credentials, and an ephemeral PostgreSQL service. CI delegates all
repository validation to `make check`.

`make check` now fails when required scripts, lockfile, schema, or test
infrastructure is missing. It runs frozen installation, formatting, lint,
typecheck, unit/component tests, payload/example and runtime/generated-schema
drift validation, Prisma validation, all migrations against an empty database,
serial PostgreSQL integration tests, production build, shell syntax, and staged
and unstaged whitespace checks.

Local integration tests either use an explicitly supplied safe test URL or
create and remove a disposable PostgreSQL Compose service on port 55432. The
URL guard requires loopback, a clearly test-specific database name, and
`DATABASE_URL` equality; integration tests never load `.env.local` and cannot
silently skip.

The database suite uses daily-plan import as the primary slice and one
daily-reflection ownership case for its materially different trusted-owner
behavior. Coverage proves raw-first persistence, idempotency, deterministic
replacement, immutable raw history, transactional rollback on a real database
constraint, bounded safe errors, trusted-owner cycle mismatch rejection,
cross-user isolation, fixed UTC status behavior, empty optional normalized
records, and no raw-only browser fallback.

## Next phase

Phase 20 security hardening has not started. Security headers, CSRF changes,
state-changing GET review, body-limit changes, log-redaction infrastructure,
rate limiting, secret scanning, cookie changes, and security middleware remain
outside this branch.

## Next actions

1. Review this Phase 19 diff and commit it with the suggested Conventional
   Commit message.
2. Push the branch and open a pull request through the user's normal GitHub
   workflow; this Codex session must not push or open it.
3. Confirm the pull request starts the stable `quality` job and that it passes.
4. Configure the documented `main` and `local` branch-protection settings
   manually after `quality` exists as a status check.
5. Merge to `local` only after the real pull-request gate passes. Do not start
   Phase 20 without separate approval.

## Verification evidence

- Final focused unit command passed with 2 files and 10 tests.
- Final focused PostgreSQL target applied all 9 checked-in migrations to an
  empty disposable database and passed 2 files with 7 serial tests; cleanup
  removed the container and network.
- First and only final `make check` passed: formatting, lint, typecheck, 23
  unit/component files with 400 tests, all payload examples, all generated
  schema drift checks, Prisma validation, all 9 migrations, 2 PostgreSQL files
  with 7 tests, production build, shell syntax, and whitespace.
- No browser smoke was run because Phase 19 adds no product UI behavior and no
  checked-in browser harness exists.
- Real pull-request `quality` execution remains pending because this session is
  explicitly forbidden from committing, pushing, or opening a pull request.

## Migration, deployment, and rollback

- No change to `prisma/schema.prisma`; no application migration, backfill,
  constraint, index, seed, data repair, or production transformation.
- Existing migrations are validation inputs only and applied to disposable
  test databases with `prisma migrate deploy`.
- Deployment has no data step. GitHub branch protection is documented only.
- Rollback is code, workflow, test harness, Compose test service, tests, PR
  template, README, and state documentation. No database restoration,
  migration reversal, import replay, export cleanup, or user-data correction is
  required. If `quality` becomes required, update branch protection before
  renaming or removing it.

## Latest handoff

- 2026-07-20T21:26:28Z — chore/ci-and-testing-foundation — Phase 19 local
  implementation complete with canonical `quality` CI, fail-closed equivalent
  `make check`, guarded disposable PostgreSQL migrations/integration coverage,
  canonical PR template, and branch-protection docs; final focused tests and
  first/final `make check` passed; no schema, migration, product behavior,
  dependency, browser framework, branch-protection automation, or Phase 20
  change; next step is review/commit/push/open PR and verify real `quality`
  success without starting Phase 20

## Historical detail

Use `docs/state/SESSION_LOG.md` for chronological summaries and
`docs/state/COMPLETED_PHASES.md` for the detailed Phase 0-10 completion archive.
Do not copy completed-phase history back into this file.
