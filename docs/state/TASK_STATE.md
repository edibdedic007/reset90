# Task State

Last updated: 2026-07-21

## Current phase

Phase 20 pre-production security hardening is implemented locally on
`fix/security-hardening`. Phase 19 was merged through PR `#22` after the stable
GitHub Actions `quality` job passed, and this branch started from the updated
`local`/`origin/local` merge commit with a clean pre-edit tree.

The bounded Phase 20 corrections restore Authentik lifecycle provisioning, make
daily-plan replacement deterministically newest-wins, preserve intentionally
stale processed daily-plan imports as idempotent no-ops, prevent Gold across
missing day logs, and align the raw-import contract. Phase 20 is not marked
complete because required Authentik browser login/logout smoke remains pending.

Phase 20 changes application security boundaries, request handling, logging,
repository hygiene, tests, and security documentation only. It adds no product
feature, dependency, Prisma schema change, migration, deployment topology, HSTS,
or Phase 21 implementation.

## Active task

Custom browser mutations now require an Auth.js session mapped to an existing
application user, exact `APP_URL` origin, non-cross-site fetch context, JSON,
identity encoding, a streamed 16 KiB body limit, and route validation. Browser
and cycle ownership are server-derived. Central method policy rejects unsafe
GET/HEAD and unsupported methods with bounded `405` responses and `Allow`.
Application reads no longer provision users or reconcile status through writes.
Successful Authentik sign-in now provisions or updates the application user by
subject through the existing subject-keyed upsert before the JWT/session is used;
subsequent session-backed reads remain lookup-only.

GPT imports accept only `Authorization: Bearer`, authenticate before body
access, compare token digests in constant time, require canonical JSON within a
streamed 128 KiB limit, and resolve one configured existing owner with exactly
one owned active cycle. Every normalizer shares that owner boundary; daily-plan
targeting is cycle-scoped. Rolling process-local limits enforce 120 endpoint
requests and 30 per token fingerprint per 60 seconds without retaining raw
tokens.
Daily-plan normalization now compares immutable raw import `createdAt` then ID
under the existing owned-cycle lock. Older pending imports become processed
no-ops for normalized state; newer imports still replace approved plan fields
and tasks transactionally without overwriting later browser/check-in energy.

Read-only status derivation supplies comeback status only from the immediately
preceding cycle day. Missing day-log rows remain gaps and break Gold eligibility.

Production-safe logging exposes allowlisted metadata only. Central response
headers provide CSP, frame denial, no-sniff, no-referrer, and a restrictive
permissions policy without HSTS. Production Auth.js cookies remain secure,
HTTP-only, and SameSite Lax; local HTTP development retains non-Secure cookies.
Git and Docker ignore sensitive artifacts, and the quality gate now fails when
Git tracks forbidden sensitive paths while permitting placeholder examples.

## Next phase

Phase 21 production Docker Compose and reverse-proxy deployment has not started.
Production containers, Traefik/TLS routing, trusted proxy handling, HSTS,
distributed/IP-based rate limiting, deployment automation, and cutover remain
explicitly deferred.

## Next actions

1. After explicit approval for the external Authentik write, create the missing
   Reset90 OAuth2/OIDC application/provider with the localhost Auth.js callback,
   configure Reset90 with its real values, and complete OIDC login, authenticated
   navigation, same-origin mutation, foreign-origin rejection, Today no-plan
   state, representative headers, visible-error privacy, and logout in a real
   browser. Local dev/curl evidence does not replace this verification.
2. Review and commit the Phase 20 diff with the suggested Conventional Commit
   message, then push and open a pull request through the user's normal workflow.
3. Confirm the pull request `quality` job passes before merging into `local`.
4. Start Phase 21 only after explicit approval.

## Verification evidence

- Final stale-import correction coverage passed 1 unit/service file with 7 tests
  and 2 PostgreSQL files with 12 tests after applying all 9 migrations to a
  disposable database. The regression proves newer-plan preservation, stale
  `PROCESSED` monotonicity, and a second stale retry with no raw or normalized
  mutation while replacement, concurrency, rollback, and ownership coverage
  remains green.
- Final focused auth/daily-plan/progress suite passed 3 files with 47 tests;
  targeted typecheck passed.
- PostgreSQL integration coverage applied all 9 migrations and passed 2 files
  with 11 tests, including concurrent distinct daily plans converging on the
  newest immutable raw import while existing idempotency, replacement,
  transaction, and cross-user isolation coverage remained green.
- First and only final correction `make check` passed: tracked-sensitive paths, frozen
  install, formatting, lint, typecheck, 25 unit/component files with 449 tests,
  payload/schema drift, Prisma validation, all 9 migrations, 2 PostgreSQL files
  with 12 tests, production build, shell syntax, and whitespace.
- One bounded local smoke attempt used the existing dev workflow on normal port
  3000. Dev-auth root navigation and Today API returned `200`; Today had no
  normalized plan; CSP, frame denial, no-sniff, no-referrer, and permissions
  headers were present; an idempotent same-origin energy mutation returned `200`;
  the same foreign-origin mutation returned bounded `403 invalid_origin` without
  private fields. The task-started server was stopped; the pre-existing local DB
  stayed running.
- The bounded real-OIDC smoke attempt confirmed healthy existing Authentik
  server/worker containers, a `302` public root, and a `200` live-health
  endpoint. Read-only Authentik inspection found no Reset90 application/provider
  or localhost callback among the existing applications, while Reset90 remains
  `AUTH_MODE=dev` with no local Authentik ID, secret, or issuer configured. No
  browser executable is visible in this environment. Login, sign-in lifecycle
  provisioning, authenticated navigation/mutations, browser error/privacy
  inspection, logout, and post-logout route protection therefore remain
  unverified; no external configuration was changed.

## Migration, deployment, and rollback

- No change to `prisma/schema.prisma`; no migration, backfill, data repair,
  dependency, or production transformation. Existing migrations are validation
  inputs only.
- Rollback is application code, configuration, tests, repository checks, and
  documentation. It needs no database restore, migration reversal, import
  replay, data cleanup, export cleanup, or user-data correction.

## Latest handoff

- 2026-07-21T22:07:40Z — fix/security-hardening — bounded Phase 20 correction
  preserved stale processed daily-plan imports as monotonic idempotent no-ops
  without changing newest-wins ordering or normalized data; final focused unit
  coverage passed 1 file/7 tests and PostgreSQL coverage passed 2 files/12 tests
  after all 9 migrations; first/final correction `make check` passed with 25
  unit/component files/449 tests, 2 PostgreSQL files/12 tests, and production
  build; live Authentik health passed, but read-only inspection found no Reset90
  OIDC application/provider or localhost callback, Reset90 has only dev-auth
  local config, and no browser executable is visible, so real login/provisioning/
  navigation/mutation/logout verification remains blocked and Phase 20 remains
  incomplete; no schema, migration, dependency, external auth write, deployment,
  HSTS, browser tooling, or Phase 21 work

## Historical detail

Use `docs/state/SESSION_LOG.md` for chronological summaries and
`docs/state/COMPLETED_PHASES.md` for the detailed Phase 0-10 completion archive.
Do not copy completed-phase history back into this file.
