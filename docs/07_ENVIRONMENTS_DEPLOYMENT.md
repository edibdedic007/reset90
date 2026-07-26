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
Compose topology also mounts the persistent backup volume at `/app/backups`, but
database backups are created through the deployment workflow inside the
PostgreSQL service. The application process is not the backup writer and does
not require backup-volume write access for normal runtime behavior.

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
8. Start/wait for PostgreSQL and create a non-empty timestamped pre-migration
   backup containing the revision on the persistent backup volume;
9. Build `reset90:<full-commit-sha>`.
10. Run `prisma migrate deploy` once in that exact image.
11. Start/update services without building or deleting volumes.
12. Wait separately for database and application readiness.
13. Verify the canonical public HTTPS readiness URL with certificate validation
    and no unexpected redirect origin;
14. Show bounded service status and allowlisted recent application logs.
15. Record the successful revision while retaining the previous known-good SHA.

The lock remains held through backup, build, migration, promotion, internal and
public health verification, and revision recording. Exit cleanup unlocks only
the owning file descriptor after success or failure; it does not delete the
shared lock file or override another owner.

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

## Environment variable rules

- Commit only `.env.example` files.
- Never commit `.env.local` or `.env.production`.
- Use long random secrets.
- Keep browser, OIDC, and GPT secrets distinct.
- Rotate GPT ingest token if exposed.
- Keep production passwords out of chat/logs.
- Do not use `set -x` around production operations.
