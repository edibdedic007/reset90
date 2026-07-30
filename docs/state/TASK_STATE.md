# Task State

Last updated: 2026-07-31

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
Production derives database/user from validated environment. Versioned
`database-compatible.sha` content binds immutable application revision to
effective migration count/name digest; legacy revision-only content is
rejected. Normal production backup requires record revision, live migration
contract, and immutable image to agree before publication. Explicit degraded
backup remains forensic `unknown-revision`. Every production backup owns or
validates inherited ownership of exact shared non-blocking lock before reading
compatibility, migration, database, or backup state; retention reuses same
descriptor. Local/disposable backups remain lock-independent and use checkout
`HEAD` only when checkout/database migration contracts match exactly, otherwise
explicit valid revision or `unknown-revision`. Bundle components remain
cleanup-owned through final validation, with metadata published last, so
signals/failures leave no accepted final bundle.

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
state inconsistent with backup metadata. Migration validation preserves Prisma
start/finish/rollback timestamps and IDs. A rolled-back failed attempt is
resolved only by a distinct later completed attempt; later rollback,
indeterminate order, duplicate unresolved attempt, unfinished attempt, and
unresolved failure are rejected. Effective completed names still determine
count/digest, so a complete older N−1 backup remains restorable. Disposable
empty-target proof first permits only base `plpgsql` extension, then covers
relations, routines/procedures, schemas, domains/enums, and operators while
excluding objects owned by that approved extension. Test restore uses one
transaction and reports backup-compatible revision.

Production restore requires explicit production mode/environment, a selected
verified backup inside `/backups` with full compatible SHA, interactive
terminal, and exact confirmation. Normal recovery keeps verified pre-restore
backup mandatory. Explicit `--degraded-recovery` uses distinct typed
confirmation and permits only selected bundle's verified full compatible SHA
and migration contract when current compatibility is unavailable. It attempts
current backup through explicit result codes. It skips only a proven missing
target or target-specific unreadability with PostgreSQL control access still
working. Unknown/database-connection, backup-root/trust, storage, collision,
temporary-file, compression, checksum, metadata/publication/validation, lock,
configuration, and tooling failures stop restore. Verified bundle plus later
retention failure preserves bundle and continues. Gzip fully stages to a
private temporary file before transactional `psql`, so partial/truncated
decompression cannot promote.

Promotion reconciliation queries actual database names and OIDs after command
success or failure. Only target with verified staging OID and selected backup
migration contract is accepted. Selected revision/count/digest publish
atomically before old cleanup; `successful.sha` remains unchanged and
application stopped. Old cleanup ambiguity is reconciled from actual state.
Unknown target state or contract mismatch invalidates compatibility, preserves
recoverable old/staging databases, emits exact operator recovery data, and
returns non-zero. Reconciliation/publication are idempotent; lock releases while
shared lock file remains.

Deployment pre-migration backup records verified previous
database-compatible revision/contract and separate incoming target. Deployment
atomically invalidates compatibility immediately before migration, captures
live contract after migration succeeds, then publishes target
revision/count/digest together. Missing, malformed, unverified, or
contract-mismatched state stops safely.

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

- Focused backup/restore/retention/migration-contract plus
  production-deployment coverage passes 2 files with 177 tests. It covers
  chronological rollback resolution, versioned compatibility records and
  live-contract mismatch, narrow degraded backup result classes, extension-only
  disposable targets, OID-based promotion reconciliation,
  compatibility-before-cleanup ordering, ambiguous-state
  preservation/invalidation, `successful.sha` isolation, and shared-lock
  release/file retention.
- Declared `postgres:16-alpine` runtime accepted valid explicit BusyBox UTC
  timestamp parsing/round-trip and rejected or de-normalized invalid calendar
  timestamp.
- Real disposable restore drill passed after final script edits with all 9
  migrations, representative ownership/data/constraints, explicit invalid
  foreign key, serialization, Prisma access, and bounded project cleanup;
  verification and cleanup both reported passed.
- Canonical PostgreSQL integration suite passed 2 files/12 tests after applying
  all 9 migrations to fresh disposable database.
- Final `make check` passed after all edits, including unit/component tests,
  PostgreSQL integration after all 9 migrations, production build, shell
  syntax, format/lint/type/schema/payload/environment checks, sensitive tracked
  file hygiene, and repository whitespace/inventory checks.

## Migration, deployment, rollback, and risk

- No `prisma/schema.prisma`, checked-in migration, seed, or normalized data
  behavior changed. The drill used only disposable PostgreSQL resources.
- No live deployment or production data operation occurred.
- Deployment stops before migration when compatibility record/live contract,
  canonical backup, or retention is unverified. Migration failure leaves
  compatibility explicitly invalid and requires degraded operator recovery from
  fully verified pre-deploy bundle; restore is never automatic.
- Script rollback is reverting this correction diff, but metadata v2 bundles and
  versioned `database-compatible.sha` records must remain paired with corrected
  scripts. Revision-only legacy state is intentionally rejected. Reverting
  scripts requires explicit operator reconstruction of previous state format;
  never copy one record format into the other. Future production restore remains
  manual, destructive, lock-protected, writes compatibility only after promoted
  OID/contract verification, and requires independent off-host bundle plus
  explicit compatible immutable image choice.
- Production backup/restore mutation paths are covered with command stubs, not
  live production data. Real production readiness remains unconfirmed until an
  authorised operator makes and transfers a verified production backup and
  completes the documented recovery process.

## Latest handoff

- 2026-07-30T23:03:32Z — `feature/backup-restore` — bounded Phase 22 correction
  binds compatible revision to migration contract, validates rolled-back
  migrations chronologically, rejects unapproved extension-only disposable
  targets, classifies degraded pre-restore backup failures explicitly, and
  reconciles ambiguous promotion/deletion results from PostgreSQL names/OIDs;
  focused 2 files/177 tests, real 9-migration restore drill, and PostgreSQL 2
  files/12 tests and final `make check` passed; no live production,
  schema/migration/seed, dependency, UI, or Phase 23 change
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
