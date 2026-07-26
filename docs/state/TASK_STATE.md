# Task State

Last updated: 2026-07-26

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
db-backup` remains the canonical Make target. Backup requires explicit
environment, environment file, Compose file, absolute approved backup root, and
purpose. The matching PostgreSQL 16 container supplies `pg_dump`. Local/test
backups use restrictive uniquely named temporary files; production performs the
same guarded algorithm inside the named backup volume. Final `.sql.gz`,
`.sha256`, and `.meta` files are published only after non-empty dump,
compression, gzip validation, checksum, metadata, and permission checks pass.
Production deployment now calls this canonical path before migration.

`scripts/backup-retention.sh` selects only verified final bundles under a marked
absolute Reset90 backup root. It keeps 30 days and at least the newest seven,
supports exact-path dry-run/apply output, removes bundle files as one unit, and
ignores unknown, malformed, symlinked, and `.partial` files. Production
retention shares the deployment/restore lock and supports one exact protected
bundle so automatic pre-restore backup retention cannot prune its restore
source.

`scripts/restore-db.sh` defaults to guarded test mode. It rejects inherited
`DATABASE_URL`, non-loopback or non-test targets, populated or source-equal
targets, unsafe paths/symlinks, unsupported filenames/metadata/PostgreSQL
majors, malformed gzip/SQL markers, missing or mismatched checksums, and
failed/inconsistent Prisma migration state. Test restore uses one transaction.

Production restore requires explicit production mode/environment, a selected
verified backup inside `/backups` with a full 40-character Git SHA, an
interactive terminal, and exact confirmation naming both target database and
backup. It acquires the same non-blocking host lock as deployment before
artifact validation, protects the selection during its verified `prerestore`
backup, and revalidates the selected digest immediately before staging. It
proves application writes are stopped, verifies staging against current
checked-in migration history, and replaces production contents through guarded
database renames. Failure/signal cleanup reconciles actual PostgreSQL names,
restores only unambiguous prior state, preserves ambiguous recoverable
databases, releases the lock, and retains the shared lock file. It leaves the
application stopped and does not migrate, seed, reset schema, delete volumes,
select an image, or restart the app.

`scripts/restore-drill.sh` creates one unique disposable Compose project with
separate source and target databases, applies all migrations, inserts
representative ownership-sensitive data, uses canonical backup/restore, verifies
current migration history/data/relationships/uniqueness/explicit foreign-key
rejection/serialization fidelity and a Prisma query, then removes only
disposable resources. The application service no longer mounts the database
backup volume; only PostgreSQL/operator paths mount it at `/backups`.
Documentation classifies that named volume as local recovery storage and gives
a checksum-preserving three-file copy procedure for encrypted off-host storage.

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
  92 tests. Correction coverage includes exact 30-day retention, concurrent
  backup/retention, backup and production-restore signals, selected-artifact
  retention protection and locked revalidation, concurrent production
  retention exclusion, full-SHA production restore rules, current Prisma
  migration-state fixtures, actual-name rename recovery/failure states, lock
  release/file retention, and app backup-volume isolation.
- The real disposable PostgreSQL drill passed. It applied all 9 checked-in
  migrations to a unique source, inserted two users/two owned cycles plus
  imported/normalized/task/check-in data, created and checksummed a canonical
  backup, restored a distinct initially empty target, verified migration state,
  ownership relationships, uniqueness, explicit invalid foreign-key rejection,
  Unicode, multiline text, timestamps, JSON, and a Prisma ownership query, then
  removed its container, network, tmpfs databases, and successful backup
  directory.
- The first drill invocation was blocked by sandbox Docker-socket permissions.
  The first host-side drill reached the final application query and exposed a
  harness-only top-level-await incompatibility; wrapping the query in an async
  function corrected it. The next complete drill passed. Both known failed
  disposable temp directories were removed after diagnosis.
- Bash syntax, focused Prettier, the final focused 2-file/92-test rerun, Make
  target/alias inspection, executable modes, and Git diff whitespace pass.
- The single final `make check` passed with tracked-sensitive-path validation,
  frozen dependencies, formatting, lint, TypeScript, 27 unit/component files
  with 542 tests, payload/schema drift, Prisma validation, all 9 migrations, 2
  PostgreSQL files with 12 tests, production Next.js build, shell syntax, and
  Git diff whitespace.

## Migration, deployment, rollback, and risk

- No `prisma/schema.prisma`, checked-in migration, seed, or normalized data
  behavior changed. The drill used only disposable PostgreSQL resources.
- No live deployment or production data operation occurred.
- Deployment still stops before migration when canonical pre-deploy backup or
  retention fails. Restore is never triggered by deployment failure.
- Script rollback is reverting this correction diff. Reintroducing the app
  backup mount would weaken the operator-only boundary. Any future real
  production restore is intentionally manual, destructive, lock-protected, and
  requires independent off-host backup readiness plus explicit immutable image
  choice. Ambiguous post-promotion failure intentionally retains both
  recoverable database names for operator resolution.
- Production backup/restore mutation paths are covered with command stubs, not
  live production data. Real production readiness remains unconfirmed until an
  authorised operator makes and transfers a verified production backup and
  completes the documented recovery process.

## Latest handoff

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
