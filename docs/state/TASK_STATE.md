# Task State

Last updated: 2026-07-21

## Current phase

Phase 20 pre-production security hardening is implemented locally on
`fix/security-hardening`. Phase 19 was merged through PR `#22` after the stable
GitHub Actions `quality` job passed, and this branch started from the updated
`local`/`origin/local` merge commit with a clean pre-edit tree.

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

GPT imports accept only `Authorization: Bearer`, authenticate before body
access, compare token digests in constant time, require canonical JSON within a
streamed 128 KiB limit, and resolve one configured existing owner with exactly
one owned active cycle. Every normalizer shares that owner boundary; daily-plan
targeting is cycle-scoped. Rolling process-local limits enforce 120 endpoint
requests and 30 per token fingerprint per 60 seconds without retaining raw
tokens.

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

1. Complete the documented authenticated manual browser smoke because no
   checked-in browser harness exists.
2. Review and commit the Phase 20 diff with the suggested Conventional Commit
   message, then push and open a pull request through the user's normal workflow.
3. Confirm the pull request `quality` job passes before merging into `local`.
4. Start Phase 21 only after explicit approval.

## Verification evidence

- Final focused security/auth/import/read/privacy/repository suite passed 20
  files with 417 tests; targeted typecheck, shell syntax, tracked-sensitive-file
  check, and `git diff --check` passed.
- PostgreSQL integration coverage applied all 9 migrations and passed 2 files
  with 10 tests, including insertion-order-independent daily-plan owner scoping,
  no foreign target fallback, unchanged foreign normalized data, idempotency,
  replacement, and transactional rollback.
- First and only final `make check` passed: tracked-sensitive paths, frozen
  install, formatting, lint, typecheck, 25 unit/component files with 441 tests,
  payload/schema drift, Prisma validation, all 9 migrations, 2 PostgreSQL files
  with 10 tests, production build, shell syntax, and whitespace.
- Manual login/logout, authenticated navigation, same/foreign-origin mutation,
  Today no-plan, response-header, and visible-error privacy smoke remains pending
  because no checked-in browser harness exists and Phase 20 forbids installing
  one.

## Migration, deployment, and rollback

- No change to `prisma/schema.prisma`; no migration, backfill, data repair,
  dependency, or production transformation. Existing migrations are validation
  inputs only.
- Rollback is application code, configuration, tests, repository checks, and
  documentation. It needs no database restore, migration reversal, import
  replay, data cleanup, export cleanup, or user-data correction.

## Latest handoff

- 2026-07-21T14:12:50Z — fix/security-hardening — Phase 20 centralized browser
  auth/origin/body/method protections, made application reads non-persistent,
  hardened trusted-owner GPT imports and rate limits, added safe logging,
  compatible headers/cookies, tracked-sensitive-file checks, regression tests,
  and security docs; focused 20 files/417 tests and first/final `make check`
  passed with 25 unit/component files/441 tests, 2 PostgreSQL files/10 tests, and
  production build; no schema, migration, dependency, deployment, HSTS, browser
  tooling, or Phase 21 work; exact manual browser smoke remains before review and
  commit

## Historical detail

Use `docs/state/SESSION_LOG.md` for chronological summaries and
`docs/state/COMPLETED_PHASES.md` for the detailed Phase 0-10 completion archive.
Do not copy completed-phase history back into this file.
