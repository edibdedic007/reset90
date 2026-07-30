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
revision from verified `database-compatible.sha` plus immutable image. Bundle
components remain cleanup-owned through final validation, with metadata
published last, so signals/failures leave no accepted final bundle.

`scripts/backup-retention.sh` selects only verified final bundles under a marked
absolute Reset90 backup root. It keeps 30 days and at least the newest seven,
supports exact-path dry-run/apply output, removes bundle files as one unit, and
ignores unknown, malformed, symlinked, and `.partial` files. Production
retention shares the deployment/restore lock and supports one exact protected
bundle so automatic pre-restore backup retention cannot prune its restore
source. Production subprocess and host handlers clean once and terminate
non-zero on `HUP`, `INT`, or `TERM`.

`scripts/restore-db.sh` defaults to guarded test mode. It rejects inherited
`DATABASE_URL`, non-loopback or non-test targets, populated or source-equal
targets, unsafe paths/symlinks, unsupported filenames/metadata/PostgreSQL
majors, malformed gzip/SQL markers, size/digest disagreement, and migration
state inconsistent with backup metadata. Exact captured migration contract
allows a complete older N−1 backup when checkout contains N while still
rejecting missing, unfinished, unresolved failed, duplicate, unexpected, or
contract-mismatched records. Test restore uses one transaction and reports
backup-compatible revision.

Production restore requires explicit production mode/environment, a selected
verified backup inside `/backups` with full compatible SHA, interactive
terminal, and exact confirmation. Under shared lock it requires backup source
database to equal validated production target before pre-restore backup,
staging, or mutation. Pre-restore backup derives current compatible revision
from verified deployment state, not checkout `GIT_COMMIT`; selected backup
fingerprint includes identity, compatible/target revisions, size/digest, and
migration contract. Restore reports selected backup-compatible revision, leaves
application stopped, and never migrates forward automatically.

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
diagnostic work directory; successful drills remove it. The application service
does not mount database backup volume; only PostgreSQL/operator paths do.

## Next phase

Phase 23 has not started. No live server, directories, Docker networks,
Traefik/DNS/certificates, Authentik clients, production secrets, first live
backup/migration/start/restore, HSTS, observability, scheduling, or provider
integration was changed.

## Next actions

1. Review the commit-ready Phase 22 diff.
2. Commit with the suggested Conventional Commit message, push, open the pull
   request, and require the external `quality` job before merge.
3. Do not begin Phase 23 without separate explicit approval.

## Verification evidence

- Focused backup/restore plus production-deployment coverage passes 2 files with
  117 tests. Added correction coverage proves previous compatible revision on
  migration-bearing deploy, N−1 restore with checkout at N, compatible revision
  output independent of checkout, production database/user/source identity,
  metadata size/digest agreement and malformed cases, all publication
  interruption windows, retention termination, and partial/signal drill cleanup.
- The real disposable PostgreSQL drill passed. It applied all 9 checked-in
  migrations to a unique source, inserted two users/two owned cycles plus
  imported/normalized/task/check-in data, created and checksummed a canonical
  backup, restored a distinct initially empty target, verified migration state,
  ownership relationships, uniqueness, explicit invalid foreign-key rejection,
  Unicode, multiline text, timestamps, JSON, and a Prisma ownership query, then
  removed its container, network, tmpfs databases, and successful backup
  directory.
- The corrected real drill passed after final script edits with metadata v2,
  compatible-revision output, all 9 migrations, representative data/constraints,
  Prisma access, and bounded disposable project cleanup.
- Bash syntax, focused Prettier, focused 2-file/117-test rerun, and Git diff
  whitespace pass.

## Migration, deployment, rollback, and risk

- No `prisma/schema.prisma`, checked-in migration, seed, or normalized data
  behavior changed. The drill used only disposable PostgreSQL resources.
- No live deployment or production data operation occurred.
- Deployment stops before migration when compatible revision, canonical backup,
  or retention is unverified. Migration failure leaves compatibility unknown and
  requires operator recovery from pre-deploy bundle; restore is never automatic.
- Script rollback is reverting this correction diff, but metadata v2 bundles and
  `database-compatible.sha` must remain paired with corrected scripts. Future
  production restore remains manual, destructive, lock-protected, and requires
  independent off-host bundle plus explicit compatible immutable image choice.
- Production backup/restore mutation paths are covered with command stubs, not
  live production data. Real production readiness remains unconfirmed until an
  authorised operator makes and transfers a verified production backup and
  completes the documented recovery process.

## Latest handoff

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
