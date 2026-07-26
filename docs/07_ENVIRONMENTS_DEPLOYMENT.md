# 07 - Environments and Deployment

    ## Purpose
    Define local and production environments clearly and document how the app should be deployed and operated.

    ## Scope
    - Local developer-only environment.
- Production live environment.
- Environment variables, Docker Compose, Authentik, backups, deployment, rollback.
- Optional staging is explicitly not required for MVP.

    ## Assumptions
    - Local machine has Node and Docker available.
- Production server already has or can run reverse proxy and Authentik.
- Production is live user data and must be treated carefully.
- The `main` branch represents production-ready code.

    ## Success Criteria
    - Local environment can be started quickly by a developer.
- Production is repeatable, backup-aware, and HTTPS-only.
- Deployment runs checks, backup, migration, build, start, healthcheck.
- Rollback path is documented.

    ## Deliverables
    - Environment definitions.
- Variable guidance.
- Local setup flow.
- Production deployment flow.
- Backup/restore and rollback notes.

    ## Environment definitions

### Local

Local is a developer-only environment.

Purpose:

- build features;
- test migrations;
- run sample payload imports;
- validate UI changes;
- experiment safely.

Local must not be treated as live data.

### Production

Production is the live environment.

Purpose:

- actual user access;
- actual reset data;
- actual GPT ingest;
- real backups and restores.

Production is represented by the `main` branch.

## Local development setup

Expected files:

- `.env.local`
- `docker-compose.local.yml`
- local Postgres volume

Recommended commands:

```bash
cp .env.local.example .env.local
make setup-local
make dev
```

Local dependency lifecycle:

```bash
make dev-up
make logs
make dev-down
```

Local URLs:

```text
App: http://localhost:3000
Database: 127.0.0.1:5432
```

PostgreSQL binds to loopback only. `make setup-local` installs dependencies
from the committed pnpm lockfile, starts PostgreSQL, and waits for readiness.
Database migrations and seed data begin in Phase 3.

Local auth:

- Use `AUTH_MODE=dev` for local browser development. It resolves the seeded
  local development user without write-on-read provisioning.
- To test OIDC locally, set `AUTH_MODE=oidc` and fill the Auth.js/AuthentiK
  variables from `.env.local.example`.

## Production setup

Expected files:

- `.env.production`
- `Dockerfile`
- `docker-compose.production.yml`
- persistent PostgreSQL, exports, and backups named volumes
- an existing external Traefik Docker network and HTTPS route
- Authentik OIDC provider/app

Production requirements:

- HTTPS only;
- one application container on internal port `3000`;
- one PostgreSQL container with no published host port;
- `APP_URL` set to the exact canonical HTTPS origin;
- `RESET90_HOST` set to the hostname from `APP_URL`;
- Authentik OIDC for UI;
- Auth.js session secret in `AUTH_SECRET`;
- `AUTH_AUTHENTIK_ID`, `AUTH_AUTHENTIK_SECRET`, and
  `AUTH_AUTHENTIK_ISSUER` from the Authentik provider;
- `AUTH_TRUST_HOST=true` behind the trusted Traefik route;
- separate GPT ingest token and existing trusted-owner subject;
- `DATABASE_URL` using Compose service hostname `db`, with username matching
  `POSTGRES_USER` and database name matching `POSTGRES_DB`;
- writable persistent application export storage at `/app/exports`;
- persistent database backup storage;
- immutable full Git commit SHA image tags;
- no dev auth;
- logs retained but scrubbed;
- a verified pre-migration database backup;
- tested restore path.

The production backup volume is local recovery storage. It does not protect
against loss of the production host, disk, or site. Production readiness also
requires at least one verified backup bundle in encrypted off-host storage.

Copy `.env.production.example` to the ignored `.env.production`, replace every
placeholder, and set `GIT_COMMIT` to the full commit intended for deployment.
Production Compose is always invoked with that file explicitly:

```bash
make prod-check
make prod-config
```

`scripts/production-compose.sh` prevents ambient shell values from overriding
the explicitly selected file. The app joins the private Reset90 network and the
configured existing Traefik network. PostgreSQL joins only the private network.
Traefik remains the only public listener and forwards the canonical HTTPS host
to application port `3000`.

Normal application runtime requires writable export storage. The current
Compose topology does not mount the database-backup volume into the application
service. Only PostgreSQL mounts `reset90_backups`, at `/backups`, for canonical
operator-controlled backup, retention, and restore commands. An application
compromise therefore cannot read, replace, or delete database dump bundles
through a mounted backup path.

HSTS remains disabled in Phase 21. It may be activated only after the real
canonical HTTPS route, redirects, Authentik callback, and proxy behavior pass
cutover verification. `includeSubDomains`, preload, and preload-list submission
remain out of scope.

## Deployment flow

```text
local branch -> feature branch -> local -> main -> production deploy
```

Deploy steps:

Phase 21 prepares and validates this flow but does not run it against the live
server. Deployment accepts only a clean, checked-out `main` branch where `HEAD`
equals the local `refs/heads/main` revision and `.env.production` `GIT_COMMIT`.
Detached HEADs, feature branches, and `local` are rejected even when clean. From
that accepted production revision:

```bash
./scripts/deploy-production.sh
```

The script stops at the first failed gate:

1. Acquire one non-blocking host deployment lock before any deployment-state
   write or Docker mutation; fail if another deployment owns it.
2. Verify required commands, files, and the ignored production env file.
3. Validate production values, database identity consistency, and placeholders.
4. Verify the clean checked-out `main` revision boundary described above.
5. Record the attempted immutable revision.
6. Validate fully interpolated Compose without printing it.
7. Require the configured external Traefik network.
8. Start/wait for PostgreSQL and invoke the canonical backup script to create a
   verified pre-migration backup bundle on the persistent backup volume;
9. Build `reset90:<full-commit-sha>`.
10. Run `prisma migrate deploy` once in that exact image.
11. Start/update services without building or deleting volumes.
12. Wait separately for database and application readiness.
13. Verify the canonical public HTTPS readiness URL with certificate validation
    and no unexpected redirect origin;
14. Show bounded service status and allowlisted recent application logs.
15. Record the successful revision while retaining the previous known-good SHA.

The same non-blocking host lock protects deployment and production restore. It
remains held through backup, build, migration, promotion, internal and public
health verification, and revision recording. Exit cleanup unlocks only the
owning file descriptor after success or failure; it does not delete the shared
lock file or override another owner.

Repeated deployment of the same clean revision repeats safety gates and the
backup, but migrations remain idempotent and no seed, secret rotation, volume
deletion, or domain-data creation occurs.

## Rollback flow

If deploy fails before migrations:

- the existing application revision remains running;
- select the immutable SHA in
  `.runtime/production-deploy/successful.sha` or
  `previous-successful.sha`;
- check out that clean revision and set the ignored environment's `GIT_COMMIT`
  to the same SHA;
- start the already-built image without deleting volumes;
- verify PostgreSQL, internal application, and public HTTPS health;
- do not restore the database when no schema/data change occurred.

If deploy fails after migrations:

- the failed application is not recorded as successful and is stopped when
  internal or public health fails;
- inspect the checked-in migration and previous application contract;
- if compatible, run the previous known-good immutable image against the
  migrated database and verify all health boundaries;
- if incompatible or destructive, stop writes and perform an explicit operator
  restore from the verified revision-stamped backup before starting the previous
  image;
- verify database, authentication, internal application, and public HTTPS health;
- document the incident.

Rollback never selects `latest`, edits `.env.production` automatically, runs
seeds, resets the schema, or deletes named volumes. A destructive restore is
always an explicit operator action and is reserved for live operations, not
Phase 21 validation. No live restore or production cutover was performed.

## Backup, retention, and restore

`scripts/backup-db.sh` and `make db-backup` are the canonical manual backup
entry points. The Make target explicitly selects local Compose, `.env.local`,
the repository `backups/` root, and the `manual` purpose. Direct script
invocation requires an explicit environment, environment file, Compose file,
absolute backup root, and purpose. Ambient database values do not select or
override those settings.

Each verified backup is a restrictive-permission bundle:

```text
reset90_<UTC>_<purpose>_<full-git-sha-or-unknown-revision>.sql.gz
reset90_<UTC>_<purpose>_<full-git-sha-or-unknown-revision>.sql.gz.sha256
reset90_<UTC>_<purpose>_<full-git-sha-or-unknown-revision>.sql.gz.meta
```

The matching PostgreSQL 16 container supplies `pg_dump`. Creation uses
uniquely named `.partial` files and publishes the final compressed SQL filename
only after non-empty output, `gzip -t`, SHA-256 generation, and versioned
metadata succeed. Production backups require a full Git SHA. Only final bundles
with valid gzip, checksum, metadata version, PostgreSQL major, safe source
database identifier, filename, root marker, and `0600` permissions are eligible
for restore or retention.

Retention runs only after a verified backup. It keeps backups for 30 days and
always preserves the newest seven verified bundles. Unknown, malformed,
symlinked, or temporary files are ignored. Preview exact candidate paths
without deletion:

```bash
make db-backup-retention
```

Apply the same bounded selector:

```bash
make db-backup-retention RETENTION_MODE=--apply
```

Production retention shares the deployment/restore lock. Restore also passes
its selected bundle as an exact protected path to automatic retention during
the pre-restore backup, so that backup cannot prune the restore source.

The canonical restore defaults to an explicitly test-only, loopback PostgreSQL
URL. The target name must contain `test`, must differ from the backup source
database, and must be empty before restore:

```bash
TEST_DATABASE_PORT=55432 \
  docker compose -p reset90_phase22_restore \
  -f docker-compose.test.yml up -d --wait db

TEST_DATABASE_URL='postgresql://reset90_test:reset90_test_password@127.0.0.1:55432/reset90_test' \
  make db-restore FILE="$PWD/backups/<verified-backup>.sql.gz"

docker compose -p reset90_phase22_restore \
  -f docker-compose.test.yml down --volumes
```

`restore-db.sh` validates the complete bundle and SQL dump marker before target
mutation, requires the supported PostgreSQL major, restores in one transaction,
and rejects missing or unsafe input, inherited `DATABASE_URL`, a populated
target, or invalid current Prisma migration history. Validation requires every
checked-in migration to have exactly one completed current record, rejects a
missing migration table, unfinished or unresolved failed migrations, and
unexpected current migration names, and permits a historical rolled-back record
only when the same checked-in migration has a completed current record.

Production restore is an exceptional operator action. First stop application
writes explicitly; the script never stops or restarts the application for the
operator. Then invoke it from an interactive terminal:

```bash
./scripts/production-compose.sh stop app

./scripts/restore-db.sh \
  --environment production \
  --env-file "$PWD/.env.production" \
  --compose-file "$PWD/docker-compose.production.yml" \
  --backup-root /backups \
  --file /backups/<verified-backup>.sql.gz
```

Production mode requires the selected filename and metadata to record one full
40-character Git SHA; `unknown-revision` and abbreviated or malformed revisions
are rejected. After exact typed confirmation, it acquires the shared deployment
lock before validating the selected bundle, proves application writes remain
stopped, and creates a verified `prerestore` backup while protecting the
selected bundle from retention. It revalidates the bundle and its digest again
immediately before streaming it into a new staging database. Only a verified
and unchanged staging database can reach guarded production database renames.
Failure and signal cleanup inspects actual PostgreSQL database names instead of
in-memory command flags, restores the original name when that state is
unambiguous, removes only a clearly disposable staging database, and preserves
old/promoted databases when both remain recoverable. Cleanup is repeat-safe,
releases the lock, and retains the shared lock file. The application remains
stopped. The operator must select and verify the exact immutable Git revision
recorded by the restored backup before starting it. Forward migration to a newer
revision is a separate explicit action.

Production restore never runs Prisma migrations, seeds, schema reset, `db
push`, volume deletion, `docker compose down -v`, image selection, or
application restart. Deployment failure never triggers restore.

## Restore drill and off-host recovery

Run the complete disposable PostgreSQL drill monthly and before declaring
production recovery ready:

```bash
make db-restore-drill
```

The drill uses a unique Compose project and two distinct test databases. It
applies every checked-in migration, inserts representative ownership-sensitive
data, creates a canonical backup, restores a separate empty target, verifies
gzip/checksum/current migration history/data/relationships/uniqueness, rejects
one explicit invalid foreign-key write, verifies Unicode, multiline
text/timestamps/JSON, performs a Prisma query, and removes only its disposable
resources. Failed drills retain their known temporary diagnostic directory;
successful drills remove it. Automatic scheduling remains deferred.

Copy a verified production bundle out of the named Docker volume only as a
three-file unit. Use an operator-owned encrypted destination:

```bash
backup_name='reset90_<UTC>_<purpose>_<full-git-sha>.sql.gz'
off_host_dir='/path/on/encrypted-off-host-storage/reset90'

install -d -m 700 "$off_host_dir"
./scripts/production-compose.sh cp "db:/backups/$backup_name" "$off_host_dir/$backup_name"
./scripts/production-compose.sh cp "db:/backups/$backup_name.sha256" "$off_host_dir/$backup_name.sha256"
./scripts/production-compose.sh cp "db:/backups/$backup_name.meta" "$off_host_dir/$backup_name.meta"
chmod 600 \
  "$off_host_dir/$backup_name" \
  "$off_host_dir/$backup_name.sha256" \
  "$off_host_dir/$backup_name.meta"
(cd "$off_host_dir" && sha256sum -c "$backup_name.sha256")
```

The checksum must pass again after transfer. Phase 22 does not choose a storage
provider or install scheduling, replication, WAL archiving, point-in-time
recovery, or cloud integration.

## Environment variable rules

- Commit only `.env.example` files.
- Never commit `.env.local` or `.env.production`.
- Use long random secrets.
- Keep browser, OIDC, and GPT secrets distinct.
- Rotate GPT ingest token if exposed.
- Keep production passwords out of chat/logs.
- Do not use `set -x` around production operations.
