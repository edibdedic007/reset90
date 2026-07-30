# Task State

Last updated: 2026-07-30

## Current phase

Phase 22 backup, restore, retention, and disaster-recovery workflow is
implemented on `feature/backup-restore`. This phase changes operator-only
scripts, tests, Compose test-port configuration, Make targets, and directly
relevant documentation. It performs no live production backup, restore,
migration, service start, cutover, rollback, host configuration, or off-host
provider integration.

Phase 22 adds no product UI/API/server action, Auth.js/Authentik/OIDC behavior,
ownership bypass, Prisma model, migration, seed, backfill, dependency, or
product-domain status.

## Active task

`scripts/backup-db.sh` remains the canonical backup entry point and `make
db-backup` remains the canonical Make target. Metadata version 2 separates
backup-compatible application revision, incoming deployment target revision,
and purpose; captures source database, final byte size/SHA-256, and exact
completed-migration count/name digest; and removes ambiguous `git_sha`.
Production derives database/user from validated environment and compatible
revision from verified `database-compatible.sha` plus immutable image. Every
production backup now owns or validates inherited ownership of the exact shared
non-blocking lock before reading compatibility, migration, database, or backup
state; retention reuses same descriptor. Local/disposable backups remain
lock-independent and use checkout `HEAD` only when checkout/database migration
contracts match exactly, otherwise explicit valid revision or
`unknown-revision`. Bundle components remain cleanup-owned through final
validation, with metadata published last, so signals/failures leave no accepted
final bundle.

`scripts/backup-retention.sh` selects only verified final bundles under a marked
absolute Reset90 backup root. It keeps 30 days and at least the newest seven,
supports exact-path dry-run/apply output, removes bundle files as one unit, and
ignores unknown, malformed, symlinked, and `.partial` files. Production
retention shares the deployment/restore lock and supports one exact protected
bundle so automatic pre-restore backup retention cannot prune its restore
source. Production subprocess and host handlers clean once and terminate
non-zero on `HUP`, `INT`, or `TERM`. Declared `postgres:16-alpine` retention
uses BusyBox-compatible explicit UTC timestamp parsing plus normalization and
reports malformed calendar timestamps as invalid.

`scripts/restore-db.sh` defaults to guarded test mode. It rejects inherited
`DATABASE_URL`, non-loopback or non-test targets, populated or source-equal
targets, unsafe paths/symlinks, unsupported filenames/metadata/PostgreSQL
majors, malformed gzip/SQL markers, size/digest disagreement, and migration
state inconsistent with backup metadata. Exact captured migration contract
allows a complete older N−1 backup when checkout contains N while still
rejecting missing, unfinished, unresolved failed, duplicate, unexpected, or
contract-mismatched records. Disposable empty-target proof now covers
relations, routines/procedures, schemas, domains/enums, and operators while
excluding system/extension-owned objects. Test restore uses one transaction and
reports backup-compatible revision.

Production restore requires explicit production mode/environment, a selected
verified backup inside `/backups` with full compatible SHA, interactive
terminal, and exact confirmation. Normal recovery keeps verified pre-restore
backup mandatory. Explicit `--degraded-recovery` uses distinct typed
confirmation and permits only selected bundle's verified full compatible SHA
and migration contract when current compatibility is unavailable. It attempts
current backup, records completed/missing/unavailable result, and skips only a
proven missing or unbackupable target. Gzip fully stages to a private temporary
file before transactional `psql`, so partial/truncated decompression cannot
promote. After staging, promotion, and final target verification, restore
atomically updates `database-compatible.sha` to selected revision while leaving
`successful.sha` unchanged and application stopped. State-persistence failure
preserves restored database, returns non-zero, and requires operator repair.

Deployment pre-migration backup records verified previous database-compatible
revision and separate incoming target. Deployment marks compatible state
`unknown` immediately before migration and records target only after migration
succeeds. Missing, malformed, or unverified compatible state stops safely.

`scripts/restore-drill.sh` creates one unique disposable Compose project with
separate source and target databases, applies all migrations, inserts
representative ownership-sensitive data, uses canonical backup/restore, verifies
current migration history/data/relationships/uniqueness/explicit foreign-key
rejection/serialization fidelity and a Prisma query, then removes only
disposable resources. Cleanup ownership starts before Compose startup, uses a
bounded down, and signal handlers clean once then terminate. Failed drills retain
diagnostic work directory. Verification and cleanup report separately; cleanup
failure after passed verification now returns non-zero and retains diagnostics.
The application service does not mount database backup volume; only
PostgreSQL/operator paths do.

## Next phase

Phase 23 has not started. No live server, directories, Docker networks,
Traefik/DNS/certificates, Authentik clients, production secrets, first live
backup/migration/start/restore, HSTS, observability, scheduling, or provider
integration was changed.

## Next actions

1. Review the corrected Phase 22 diff.
2. Commit with the suggested Conventional Commit message, push, open the pull
   request, and require the external `quality` job before merge.
3. Do not begin Phase 23 without separate explicit approval.

## Verification evidence

- Focused backup/restore/retention/drill plus production-deployment coverage
  passes 2 files with 155 tests. It covers degraded/missing/malformed state,
  missing/fresh/unbackupable production targets, mandatory normal pre-backup,
  state publication/failure timing, decompression/psql failure, shared-lock
  ownership/signals/concurrency, BusyBox parser contract, object-only disposable
  targets, local migration-contract labeling, and drill cleanup failure.
- Declared `postgres:16-alpine` runtime accepted valid explicit BusyBox UTC
  timestamp parsing/round-trip and rejected or de-normalized invalid calendar
  timestamp.
- Real disposable restore drill passed after final script edits with all 9
  migrations, representative ownership/data/constraints, explicit invalid
  foreign key, serialization, Prisma access, and bounded project cleanup;
  verification and cleanup both reported passed.
- Canonical PostgreSQL integration suite passed 2 files/12 tests after applying
  all 9 migrations to fresh disposable database.
- Final `make check` passed with 27 unit/component files and 605 tests, 2
  PostgreSQL files and 12 tests after all 9 migrations, production build,
  shell syntax, format/lint/type/schema/payload/environment checks, sensitive
  tracked-file hygiene, and repository whitespace/inventory checks.

## Migration, deployment, rollback, and risk

- No `prisma/schema.prisma`, checked-in migration, seed, or normalized data
  behavior changed. The drill used only disposable PostgreSQL resources.
- No live deployment or production data operation occurred.
- Deployment stops before migration when compatible revision, canonical backup,
  or retention is unverified. Migration failure leaves compatibility unknown and
  requires explicit degraded operator recovery from fully verified pre-deploy
  bundle; restore is never automatic.
- Script rollback is reverting this correction diff, but metadata v2 bundles and
  `database-compatible.sha` must remain paired with corrected scripts. Future
  production restore remains manual, destructive, lock-protected, writes
  compatible state only after final database verification, and requires
  independent off-host bundle plus explicit compatible immutable image choice.
- Production backup/restore mutation paths are covered with command stubs, not
  live production data. Real production readiness remains unconfirmed until an
  authorised operator makes and transfers a verified production backup and
  completes the documented recovery process.

## Latest handoff

- 2026-07-30T22:16:40Z — `feature/backup-restore` — bounded Phase 22 correction
  adds guarded degraded recovery, post-restore compatible-state publication,
  standalone backup locking, non-pipelined production restore, Alpine retention
  parsing, cleanup-failure propagation, complete disposable emptiness checks,
  contract-safe local revision labeling, and fresh-host runbook; focused 2
  files/155 tests, declared Alpine parser, real 9-migration drill, PostgreSQL 2
  files/12 tests, and final 27-file/605-test quality gate pass; no live
  production, schema/migration/seed, dependency, UI, or Phase 23 change
- 2026-07-30T21:23:00Z — `feature/backup-restore` — bounded Phase 22 correction
  implements metadata v2, verified compatible-revision state, captured migration
  contracts, production database identity, interruption-safe publication,
  terminating retention/drill signals, and partial-start drill cleanup; focused
  2-file/117-test coverage and real 9-migration disposable restore drill pass;
  no live production, schema/migration/seed, dependency, UI, or Phase 23 change
- 2026-07-26T22:19:54Z — `feature/backup-restore` — bounded Phase 22 correction
  protects selected restore bundles from automatic/concurrent retention,
  revalidates under the shared lock, reconciles cleanup from actual PostgreSQL
  names, requires full production backup SHAs, validates current checked-in
  migration state, removes app backup-volume access, and proves one invalid
  foreign-key write fails; focused 2-file/92-test coverage, Bash/format/diff
  gates, real 9-migration restore drill, and single full `make check` pass with
  27 files/542 tests plus 2 PostgreSQL files/12 tests and production build; no
  live production, schema/migration/seed, product/auth/ownership, UI, or Phase 23
  change
