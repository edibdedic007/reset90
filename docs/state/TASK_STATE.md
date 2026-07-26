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
ignores unknown, malformed, symlinked, and `.partial` files.

`scripts/restore-db.sh` defaults to guarded test mode. It rejects inherited
`DATABASE_URL`, non-loopback or non-test targets, populated or source-equal
targets, unsafe paths/symlinks, unsupported filenames/metadata/PostgreSQL
majors, malformed gzip/SQL markers, missing or mismatched checksums, and
failed/inconsistent Prisma migration state. Test restore uses one transaction.

Production restore requires explicit production mode/environment, a selected
verified backup inside `/backups`, an interactive terminal, and exact
confirmation naming both target database and backup. It uses the same
non-blocking host lock as deployment, proves application writes are stopped,
creates a verified `prerestore` backup, restores into a new staging database,
verifies it, replaces production contents through guarded database renames, and
leaves the application stopped for explicit immutable-revision selection. It
does not migrate, seed, reset schema, delete volumes, select an image, or restart
the app.

`scripts/restore-drill.sh` creates one unique disposable Compose project with
separate source and target databases, applies all migrations, inserts
representative ownership-sensitive data, uses canonical backup/restore, verifies
migration history/data/relationships/constraints/serialization fidelity and a
Prisma query, then removes only disposable resources. Documentation classifies
the named production volume as local recovery storage and gives a checksum-
preserving three-file copy procedure for encrypted off-host storage.

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
  69 tests. It covers explicit selection, atomic verified publication,
  collisions and failure cleanup, secret-safe output, retention dry-run/apply
  selection, invalid artifact/path/metadata/checksum/gzip/SQL rejection,
  disposable target guards, PostgreSQL major compatibility, non-interactive
  production failure, canonical deployment reuse, deployment ordering, and
  shared deployment lock regression behavior.
- The real disposable PostgreSQL drill passed. It applied all 9 checked-in
  migrations to a unique source, inserted two users/two owned cycles plus
  imported/normalized/task/check-in data, created and checksummed a canonical
  backup, restored a distinct initially empty target, verified migration state,
  ownership relationships, foreign keys, uniqueness, Unicode, multiline text,
  timestamps, JSON, and a Prisma ownership query, then removed its container,
  network, tmpfs databases, and successful backup directory.
- The first drill invocation was blocked by sandbox Docker-socket permissions.
  The first host-side drill reached the final application query and exposed a
  harness-only top-level-await incompatibility; wrapping the query in an async
  function corrected it. The next complete drill passed. Both known failed
  disposable temp directories were removed after diagnosis.
- Bash syntax, focused Prettier, the final focused 2-file/69-test rerun, Make
  target/alias inspection, executable modes, and Git diff whitespace pass.
- The single final `make check` passed with tracked-sensitive-path validation,
  frozen dependencies, formatting, lint, TypeScript, 27 unit/component files
  with 519 tests, payload/schema drift, Prisma validation, all 9 migrations, 2
  PostgreSQL files with 12 tests, production Next.js build, shell syntax, and
  Git diff whitespace.

## Migration, deployment, rollback, and risk

- No `prisma/schema.prisma`, checked-in migration, seed, or normalized data
  behavior changed. The drill used only disposable PostgreSQL resources.
- No live deployment or production data operation occurred.
- Deployment still stops before migration when canonical pre-deploy backup or
  retention fails. Restore is never triggered by deployment failure.
- Script rollback is reverting this Phase 22 diff. Any future real production
  restore is intentionally manual, destructive, lock-protected, and requires
  independent off-host backup readiness plus explicit immutable image choice.
- Production backup/restore mutation paths are covered with command stubs, not
  live production data. Real production readiness remains unconfirmed until an
  authorised operator makes and transfers a verified production backup and
  completes the documented recovery process.

## Latest handoff

- 2026-07-26T21:34:54Z — `feature/backup-restore` — Phase 22 canonical
  backup/restore/retention workflow, production deployment reuse/shared-lock
  restore guards, real disposable recovery drill, off-host copy procedure, and
  2-file/69-test focused coverage implemented; real drill passed all 9
  migrations plus ownership/data/constraint/Prisma verification and cleaned its
  resources; final Bash/focused/diff gates and single full `make check` pass
  with 27 files/519 tests plus 2 PostgreSQL files/12 tests and production build;
  no live production, schema/migration/seed, product/auth/ownership, or Phase 23
  change
