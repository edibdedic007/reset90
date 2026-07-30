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
   verified pre-migration backup bundle on the persistent backup volume. Its
   compatible application revision and migration contract must match the live
   database compatibility record, while its separate deployment target is the
   incoming revision.
9. Build `reset90:<full-commit-sha>`.
10. Atomically invalidate database compatibility, run `prisma migrate deploy`
    once in that exact image, capture the resulting live migration contract,
    then atomically publish the incoming revision, completed-migration count,
    and migration-name digest together.
11. Start/update services without building or deleting volumes.
12. Wait separately for database and application readiness.
13. Verify the canonical public HTTPS readiness URL with certificate validation
    and no unexpected redirect origin;
14. Show bounded service status and allowlisted recent application logs.
15. Record the successful revision while retaining the previous known-good SHA.

The same non-blocking host lock protects deployment, every production backup,
production retention, and production restore. A standalone production backup
acquires it before reading compatibility state, migration history, database
contents, or backup-volume state. Deployment and restore pass their already
owned descriptor into backup, and backup passes the same descriptor into
retention. Each inherited descriptor is accepted only when it names and owns
the exact shared lock. Exit and signal cleanup unlock only ownership acquired
by the current process; the shared lock file remains present.

`.runtime/production-deploy/database-compatible.sha` is distinct from
`attempted.sha` and `successful.sha`. Despite retained path name, it is a
versioned key/value compatibility record containing format version, immutable
application revision, effective completed-migration count, and sorted
migration-name digest. Revision-only legacy content is rejected safely.
Normal production backup, deployment, and restore require a valid record,
corresponding local immutable image, and exact record/live-database migration
contract match. Image existence alone never proves compatibility. Missing,
malformed, invalidated, unverified, contract-mismatched, or migration-failure
state stops normal operation safely. Explicit degraded restore trusts only the
selected verified backup's full compatible revision and migration contract,
labels any pre-restore forensic backup `unknown-revision`, and never guesses
current database compatibility. Restore never updates `successful.sha`. An
initial live cutover must establish the record from verified deployment and
database evidence; scripts never infer it from checkout or incoming
`GIT_COMMIT`.

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
reset90_<UTC>_<purpose>_<compatible-app-revision-or-unknown-revision>.sql.gz
reset90_<UTC>_<purpose>_<compatible-app-revision-or-unknown-revision>.sql.gz.sha256
reset90_<UTC>_<purpose>_<compatible-app-revision-or-unknown-revision>.sql.gz.meta
```

The matching PostgreSQL 16 container supplies `pg_dump`. Creation uses
uniquely named `.partial` files. Artifact and checksum publication remain owned
by cleanup until final validation passes; metadata is the last bundle component
published. Any failure or signal before completed verification removes final
names, so restore and retention never accept an interrupted bundle.

Metadata version 2 records exactly one value for:

- filename, creation time, and backup purpose;
- backup-compatible application revision;
- incoming deployment target revision, or `none` when not applicable;
- PostgreSQL major and source database;
- final artifact size in bytes and SHA-256 digest;
- completed migration count and SHA-256 of sorted completed migration names.

The checksum sidecar, metadata digest, and actual artifact digest must agree;
metadata size must match actual size. Missing, duplicate, malformed, or
conflicting size/digest values reject the bundle. Production backup derives
`POSTGRES_DB` and `POSTGRES_USER` from validated `.env.production`, rejects
different explicit overrides, and requires the compatibility record's revision,
migration count, and migration-name digest to match the live database before
publication. A `predeploy` backup separately records incoming target revision.
Local and disposable backups use repository `HEAD` only when captured database
migration count/name digest exactly matches current checkout contract. A
mismatched database uses `unknown-revision` unless operator supplies a valid
explicit full compatible SHA; malformed explicit revisions fail. Degraded
forensic backup always records `unknown-revision`, never a verified compatible
application. Only complete bundles with valid gzip, checksum, metadata,
PostgreSQL major, safe source database, migration contract, filename, root
marker, and `0600` permissions are eligible for restore or retention.

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
the pre-restore backup, so that backup cannot prune the restore source. `HUP`,
`INT`, and `TERM` handlers clean bounded temporary state, release owned locks,
exit non-zero, and never continue to later candidate deletion. Production
timestamp parsing uses BusyBox-supported explicit
`%Y%m%dT%H%M%SZ` parsing inside declared `postgres:16-alpine`, normalizes back
to the same UTC timestamp, and reports calendar-invalid timestamps as invalid
bundles. Policy remains deterministic: 30 days inclusive plus newest seven.

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
target, or migration history inconsistent with backup metadata. Empty-target
validation first rejects every installed extension except PostgreSQL's required
`plpgsql`; Reset90 migrations currently allowlist no additional extension. It
then rejects user-created relations, sequences, domains, enums, routines
(including standalone functions and procedures), schemas, and operators while
excluding objects owned by an already approved extension. Extension rejection
occurs before restore input and leaves target unchanged. Ambiguous targets are
rejected; canonical drill creates a new uniquely named database instead of
merging. Validation
compares exact completed migration count and sorted-name digest captured by
backup. Therefore a complete N−1 history remains restorable when current
checkout contains migration N. Validation still rejects a missing migration
table, missing required names, unfinished or unresolved failed migrations,
duplicate completed records, unexpected names, and contract mismatches. A
historical failed attempt is resolved only when it has an explicit rollback
timestamp and a distinct later attempt started and completed successfully.
Completion before a later rollback, equal/indeterminate ordering, unfinished
later attempts, duplicate unresolved attempts, or rollback without later
completion is rejected. Effective contract contains each successfully resolved
migration name once. Restore never applies newer migrations.

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

Production mode requires selected filename and compatible-revision metadata to
record one full 40-character Git SHA; `unknown-revision` and abbreviated or
malformed revisions are rejected. After exact typed confirmation, it acquires
shared deployment lock and validates selected bundle. Before pre-restore backup,
staging creation, or target mutation, it requires backup `source_database` to
equal validated production `POSTGRES_DB`. It proves application writes remain
stopped and creates a verified `prerestore` backup using compatible revision
from verified database deployment state, not checkout `GIT_COMMIT`, while
protecting selected bundle from retention. It revalidates complete bundle and
fingerprint immediately before restore. Decompression first completes into a
private staging file inside the PostgreSQL container; `psql` never receives
partial output from a failed gzip stream. The staging restore then uses
`ON_ERROR_STOP` and one transaction. Decompression failure, truncated input,
or `psql` failure cannot promote staging and never modifies production.
Only a verified and unchanged staging database can reach guarded production
database renames.

When current compatibility cannot be established, normal restore remains
closed. Select degraded recovery explicitly:

```bash
./scripts/restore-db.sh \
  --environment production \
  --env-file "$PWD/.env.production" \
  --compose-file "$PWD/docker-compose.production.yml" \
  --backup-root /backups \
  --file /backups/<verified-full-sha-backup>.sql.gz \
  --degraded-recovery
```

This requires distinct exact typed confirmation. Selected bundle still needs
one valid full compatible Git SHA and valid captured migration contract.
Degraded mode never derives selected compatibility from current state. If
production database exists, restore first attempts canonical pre-restore
backup. Explicit degraded mode always records `unknown-revision` while still
requiring a valid current migration contract when database is readable. Such a
bundle is forensic evidence, not eligible production restore source.
Pre-restore backup uses explicit result codes rather than log parsing. It may be
skipped only when target is positively missing or target-specific reads fail
while PostgreSQL control database remains readable. Unknown connection or dump
failure defaults to stop. Output records exact outcome:

```text
restore:pre-restore-backup=completed-and-verified
restore:pre-restore-backup=completed-and-verified retention=failed bundle=preserved
restore:pre-restore-backup=skipped reason=target-database-missing
restore:pre-restore-backup=skipped reason=target-database-positively-unreadable
restore:pre-restore-backup=blocked reason=backup-infrastructure-or-publication-failure
```

Backup-root permission/trust, storage, collision, temporary creation,
compression, checksum, metadata, publication, validation, lock, environment,
configuration, and unsupported-tooling failures are infrastructure failures
and never waive pre-restore backup. If bundle publication and independent
verification completed but retention later fails, restore preserves bundle,
reports retention failure, and continues under same production lock.
Missing target promotes verified staging directly; existing target uses guarded
rename replacement.

Before promotion, restore atomically invalidates old compatibility record.
After promotion command returns—success or failure—it queries actual database
names and OIDs. Target is accepted as promoted only when target OID equals
verified staging OID, staging name is gone, connectivity succeeds, and effective
migration contract matches selected backup. Restore then atomically publishes
selected revision and migration contract before any old-database deletion.
`successful.sha` remains unchanged because application health has not passed.
Old cleanup success reported as client failure is reconciled from actual state;
an old database still present is retained for operator cleanup.

Unknown target state, unexpected OID/name combination, or promoted contract
mismatch invalidates compatibility, preserves every recoverable old/staging
database, emits exact names/states/OIDs and expected backup contract, leaves
application stopped, and returns non-zero. Post-promotion reconciliation and
record publication are repeat-safe. Clearly disposable staging may be removed
only before any rename attempt. Exit cleanup releases lock but retains shared
lock file. Restore output identifies exact backup-compatible immutable
application revision, regardless of checkout revision. Operator must select and
verify that revision before starting it. Forward migration remains separate
explicit action.

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
resources. Cleanup responsibility begins before Compose startup, so resources
created before readiness failure are removed from only unique drill project.
Signal handlers clean once and exit non-zero. Verification and cleanup are
reported separately. Cleanup failure after successful verification also exits
non-zero and retains known temporary diagnostics; only successful verification
plus successful cleanup removes them. Cleanup targets only exact unique
disposable Compose project. Automatic scheduling remains deferred.

Copy a verified production bundle out of the named Docker volume only as a
three-file unit. Use an operator-owned encrypted destination:

```bash
backup_name='reset90_<UTC>_<purpose>_<compatible-app-revision>.sql.gz'
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

### Fresh replacement-host recovery

Use this bounded path when trusted backup bundle exists but host may have no
backup marker, production database, compatible/successful state, application
image, or prior Compose state:

1. Provision repository and checked-in scripts/Compose files. Supply ignored
   `.env.production`, run `./scripts/production-check.sh
   "$PWD/.env.production"`, and do not copy runtime state from an untrusted host.
2. Check out source containing current approved recovery tooling. Create
   PostgreSQL container and named backup volume through approved Compose path:

   ```bash
   RESET90_ENV_FILE="$PWD/.env.production" \
     ./scripts/production-compose.sh up -d --no-build db
   ```

3. Initialize trusted backup-root marker inside volume. Existing wrong marker
   fails instead of being overwritten:

   ```bash
   RESET90_ENV_FILE="$PWD/.env.production" \
     ./scripts/production-compose.sh exec -T db sh -eu -c '
       umask 077
       root=/backups
       marker="$root/.reset90-backup-root"
       mkdir -p "$root"
       chmod 700 "$root"
       if [ -e "$marker" ]; then
         [ -f "$marker" ] && [ ! -L "$marker" ]
         [ "$(cat "$marker")" = "reset90-backup-root-v1" ]
       else
         printf "%s\n" "reset90-backup-root-v1" > "$marker"
       fi
       chmod 600 "$marker"
     '
   ```

4. Copy selected `.sql.gz`, `.sha256`, and `.meta` together from encrypted
   operator-owned source, then restrict permissions:

   ```bash
   RESET90_ENV_FILE="$PWD/.env.production" \
     ./scripts/production-compose.sh cp \
     "$off_host_dir/$backup_name" "db:/backups/$backup_name"
   RESET90_ENV_FILE="$PWD/.env.production" \
     ./scripts/production-compose.sh cp \
     "$off_host_dir/$backup_name.sha256" "db:/backups/$backup_name.sha256"
   RESET90_ENV_FILE="$PWD/.env.production" \
     ./scripts/production-compose.sh cp \
     "$off_host_dir/$backup_name.meta" "db:/backups/$backup_name.meta"
   RESET90_ENV_FILE="$PWD/.env.production" \
     ./scripts/production-compose.sh exec -T db \
     chmod 600 \
     "/backups/$backup_name" \
     "/backups/$backup_name.sha256" \
     "/backups/$backup_name.meta"
   ```

5. With only selected bundle in fresh backup root, verify all three components
   through production validator. Require `verified=1`, `candidates=0`, and no
   `retention:invalid` output:

   ```bash
   ./scripts/backup-retention.sh \
     --environment production \
     --env-file "$PWD/.env.production" \
     --compose-file "$PWD/docker-compose.production.yml" \
     --backup-root /backups \
     --dry-run
   ```

6. Read full compatible SHA from transferred metadata, verify exactly one valid
   value, and prove matching source/image is available:

   ```bash
   compatible_revision="$(
     awk -F= '
       $1 == "compatible_app_revision" { count += 1; value = $2 }
       END { if (count != 1) exit 1; print value }
     ' "$off_host_dir/$backup_name.meta"
   )"
   printf '%s\n' "$compatible_revision" |
     grep -Eq '^[0-9a-f]{40}$'
   git cat-file -e "$compatible_revision^{commit}"
   docker image inspect "reset90:$compatible_revision" >/dev/null 2>&1 ||
     printf '%s\n' \
       "Image absent: build only from matching checked-out source before start."
   ```

7. Stop application writes even if app is expected absent, then use explicit
   degraded recovery because current database/state is not trusted:

   ```bash
   RESET90_ENV_FILE="$PWD/.env.production" \
     ./scripts/production-compose.sh stop app

   ./scripts/restore-db.sh \
     --environment production \
     --env-file "$PWD/.env.production" \
     --compose-file "$PWD/docker-compose.production.yml" \
     --backup-root /backups \
     --file "/backups/$backup_name" \
     --degraded-recovery
   ```

8. Require successful restore, selected SHA plus backup migration count/digest
   in versioned `.runtime/production-deploy/database-compatible.sha` record,
   and application still stopped. `successful.sha` must remain absent or
   unchanged.
9. Check out exact compatible source. Set ignored `.env.production`
   `GIT_COMMIT` to same full SHA. Reuse existing immutable image or build only
   `reset90:<compatible_revision>` from matching source; do not select
   `latest`. Start database and that exact app image without migration, seed,
   reset, or volume deletion:

   ```bash
   git switch --detach "$compatible_revision"
   RESET90_ENV_FILE="$PWD/.env.production" \
     ./scripts/production-compose.sh build app
   RESET90_ENV_FILE="$PWD/.env.production" \
     ./scripts/production-compose.sh up -d --no-build db app
   ```

10. Verify database/application readiness, canonical HTTPS readiness,
    authentication/login/logout, owner-only access, and representative restored
    records before declaring recovery successful:

    ```bash
    RESET90_ENV_FILE="$PWD/.env.production" \
      ./scripts/production-compose.sh ps
    ./scripts/healthcheck.sh "$PWD/.env.production"
    ```

11. Only after all checks pass, atomically record successful application
    revision. Preserve prior valid successful SHA when present:

    ```bash
    state_dir="$PWD/.runtime/production-deploy"
    successful_file="$state_dir/successful.sha"
    previous_file="$state_dir/previous-successful.sha"
    mkdir -p "$state_dir"
    current=""
    if [ -s "$successful_file" ]; then
      IFS= read -r current < "$successful_file"
    fi
    if printf '%s\n' "$current" | grep -Eq '^[0-9a-f]{40}$' &&
      [ "$current" != "$compatible_revision" ]; then
      previous_temp="$(mktemp "$state_dir/.previous-successful.sha.XXXXXX")"
      printf '%s\n' "$current" > "$previous_temp"
      chmod 600 "$previous_temp"
      mv "$previous_temp" "$previous_file"
    fi
    successful_temp="$(mktemp "$state_dir/.successful.sha.XXXXXX")"
    printf '%s\n' "$compatible_revision" > "$successful_temp"
    chmod 600 "$successful_temp"
    mv "$successful_temp" "$successful_file"
    ```

Stop on any failed step. Do not run migration, seed, schema reset, automatic
rollback, volume deletion, scheduler/provider setup, or Phase 23 deployment
work in this recovery path.

## Environment variable rules

- Commit only `.env.example` files.
- Never commit `.env.local` or `.env.production`.
- Use long random secrets.
- Keep browser, OIDC, and GPT secrets distinct.
- Rotate GPT ingest token if exposed.
- Keep production passwords out of chat/logs.
- Do not use `set -x` around production operations.
