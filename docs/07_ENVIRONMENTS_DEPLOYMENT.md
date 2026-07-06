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

- Use `AUTH_MODE=dev` initially.
- Add Authentik OIDC after core MVP works.

## Production setup

Expected files:

- `.env.production`
- `docker-compose.production.yml`
- persistent Postgres volume
- persistent exports/backups volume
- reverse proxy HTTPS route
- Authentik OIDC provider/app

Production requirements:

- HTTPS only;
- Authentik OIDC for UI;
- separate GPT ingest token;
- no dev auth;
- logs retained but scrubbed;
- daily DB backup;
- tested restore path.

## Deployment flow

```text
local branch -> feature branch -> local -> main -> production deploy
```

Deploy steps:

1. Ensure `main` is clean and up to date.
2. Run CI/checks.
3. SSH to server or run deploy on server.
4. Create pre-deploy backup.
5. Pull latest `main`.
6. Build image.
7. Run migrations.
8. Start services.
9. Healthcheck.
10. Check logs.

## Rollback flow

If deploy fails before migrations:

- checkout previous commit/tag;
- rebuild/restart;
- check health.

If deploy fails after migrations:

- stop app;
- restore pre-deploy backup if needed;
- checkout previous commit/tag;
- restart;
- document incident.

## Environment variable rules

- Commit only `.env.example` files.
- Never commit `.env.local` or `.env.production`.
- Use long random secrets.
- Rotate GPT ingest token if exposed.
- Keep production passwords out of chat/logs.
