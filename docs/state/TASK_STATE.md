# Task State

Last updated: 2026-07-22

## Current phase

Phase 20 pre-production security hardening is implemented and accepted locally on
`fix/security-hardening`. Phase 19 was merged through PR `#22` after the stable
GitHub Actions `quality` job passed, and this branch started from the updated
`local`/`origin/local` merge commit with a clean pre-edit tree.

The bounded Phase 20 corrections restore Authentik lifecycle provisioning, make
daily-plan replacement deterministically newest-wins, preserve intentionally
stale processed daily-plan imports as idempotent no-ops, prevent Gold across
missing day logs, align the raw-import contract, normalize the Authentik issuer,
and map application identity to the stable OIDC provider account subject. The
required real Authentik browser login/logout and security smoke passed.

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
stable `account.providerAccountId` through the existing subject-keyed upsert
before the JWT/session is used; subsequent session-backed reads remain
lookup-only. Missing provider account identity fails closed, and later JWT
callbacks preserve the subject set during initial authentication.

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

1. Review and commit the Phase 20 diff with the suggested Conventional Commit
   message, then push and open a pull request through the user's normal workflow.
2. Confirm the pull request `quality` job passes before merging into `local`.
3. Start Phase 21 only after explicit approval; no Phase 21 work has started.

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
- Focused Authentik lifecycle coverage passed `tests/auth.test.ts` with 17 tests.
  It proves transient Auth.js user IDs do not become application identity, two
  sign-ins sharing one provider subject upsert one Reset90 user, JWT/session
  propagation and lookup use that subject, later JWT calls preserve it, and
  missing provider identity fails closed.
- The real Authentik browser smoke used the external `Reset90 Local`
  authorization-code provider with the strict localhost Auth.js callback. Fresh
  provisioning stored the stable subject
  `586c822423846d03bf93c31b1b95e11777236249c6198f3877b1f42fd8336180`;
  repeat login retained the same Reset90 user with no duplicate. Authenticated
  Today rendered Day 1 with no imported plan; Energy `HIGH` survived hard refresh
  and was present on the owned current-day row. The same-origin invalid energy
  mutation returned bounded `400 invalid_energy_payload`; the credentialed
  foreign-origin check reached Reset90 and returned application `403`.
  Representative CSP, no-sniff, no-referrer, frame-denial, and permissions
  headers passed; visible errors stayed private-safe; logout returned to sign-in;
  and `/settings` redirected to sign-in after logout. Task-started processes were
  stopped.

## Migration, deployment, and rollback

- No change to `prisma/schema.prisma`; no migration, backfill, dependency, or
  production transformation. Existing migrations are validation inputs only.
- Local verification removed two disposable transient-subject smoke fixtures,
  then created one disposable stable-subject Reset90 user with one smoke cycle,
  three phases, 90 empty days, and one `HIGH` energy value. Rollback needs no
  migration reversal or import replay; remove that local fixture and the external
  local Authentik application/provider if the smoke environment is no longer
  needed, then revert the application/configuration/test/documentation diff.

## Latest handoff

- 2026-07-22T00:32:33Z — fix/security-hardening — real Authentik verification
  exposed and corrected transient Auth.js user-ID persistence by using stable
  `providerAccountId` for lifecycle provisioning and JWT/session identity;
  focused auth coverage passed 1 file/17 tests; guarded local cleanup removed only
  disposable transient-subject fixtures; fresh and repeat OIDC login stored one
  stable Reset90 user; Today empty-state, persisted owned Energy `HIGH`, bounded
  same-origin `400`, application foreign-origin `403`, representative headers,
  private-safe errors, logout, and protected-route denial passed; no schema,
  migration, dependency, production deployment, HSTS, browser tooling, or Phase
  21 work

## Historical detail

Use `docs/state/SESSION_LOG.md` for chronological summaries and
`docs/state/COMPLETED_PHASES.md` for the detailed Phase 0-10 completion archive.
Do not copy completed-phase history back into this file.
