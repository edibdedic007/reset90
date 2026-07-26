# 08 - Automation and Scripts

    ## Purpose
    Define which repeated or risky processes should be automated and which should be documented with scripts.

    ## Scope
    - Setup, linting, formatting, testing, branch creation, commit checks, build, deployment, backup/export, documentation generation.
- Makefile as the main command surface.
- Shell scripts for operational tasks.

    ## Assumptions
    - The user is comfortable with terminal workflows.
- Scripts should be simple Bash unless the app stack provides better native commands.
- Dangerous scripts require confirmation and safety backups.
- CI should enforce the same checks as local `make check` where possible.

    ## Success Criteria
    - Common tasks are repeatable with one command.
- Risky tasks have guardrails.
- Codex can discover commands from `make help`.
- Scripts reduce manual mistakes.

    ## Deliverables
    - Automation matrix.
- Suggested Makefile commands.
- Script responsibilities.
- CI guidance.

    ## Automation matrix

| Process | Automation decision | Command/script | Notes |
|---|---|---|---|
| Setup | Fully automated | `make setup-local`, `scripts/setup-local.sh` | Check tools, copy env, start db, install deps, migrate, seed. |
| Linting | Fully automated | `make lint` | Run locally and in CI. |
| Formatting | Fully automated | `make format` | Also support check-only format in CI if available. |
| Testing | Fully automated | `make test` | Unit/integration tests. |
| Type checking | Fully automated | `make typecheck` | Required before merge. |
| Branch creation | Documented with script | `scripts/create-branch.sh` | Helps enforce branch naming; user still chooses intent/slug. |
| Commit checks | Fully automated | `make check`, `scripts/precommit-check.sh` | Run lint/typecheck/test/build/payload validation. |
| Build | Fully automated | `make build` | Required locally and in CI. |
| Deployment | Documented with script | `scripts/deploy-production.sh` | Script handles steps; human confirms production. |
| Backup | Fully automated | `scripts/backup-db.sh` | Explicit environment; verified bundle before publication. |
| Retention | Fully automated | `scripts/backup-retention.sh` | Dry-run or bounded apply; verified bundles only. |
| Restore | Documented with script | `scripts/restore-db.sh` | Disposable by default; production requires interactive confirmation. |
| Restore drill | Fully automated | `scripts/restore-drill.sh` | Real disposable PostgreSQL source/target drill. |
| Export | Fully automated | `scripts/export-data.sh` or app endpoint | User-owned data export. |
| Documentation generation | Fully automated | `scripts/generate-docs-bundle.sh` | Creates all-in-one docs/context bundle. |
| Healthcheck | Fully automated | `scripts/healthcheck.sh` | Used after deploy. |
| Release tagging | Documented with commands | `git tag vX.Y.Z` | Human decides release version. |
| Incident response | Documented runbook | `09_ENGINEERING_BEST_PRACTICES.md` | Not fully automatable. |

## Makefile interface

Recommended commands:

```bash
make help
make setup-local
make install
make dev
make check
make lint
make format
make typecheck
make test
make build
make db-migrate
make db-seed
make db-reset
make db-backup
make db-backup-retention
make db-restore FILE=backup.sql.gz
make db-restore-drill
make validate-payloads
make prod-check
make prod-config
make prod-build
make prod-up
make prod-down
make prod-logs
make prod-health
make deploy-production
make export-full
make docs-bundle
```

## Script rules

- Use `set -euo pipefail` in Bash scripts.
- Print what the script is doing.
- Fail loudly.
- Invoke production Compose through `scripts/production-compose.sh` with the
  selected environment file explicitly.
- Require explicit local, test, or production selection for backup/restore
  scripts. Never inherit an ambient development or production database URL for
  a disposable restore.
- Keep production diagnostics bounded and never print environment contents,
  database URLs, secrets, tokens, cookies, authorization headers, or private
  application data.
- Do not hide destructive actions.
- Publish backup filenames only after dump, compression, gzip validation,
  checksum, versioned metadata, and restrictive permissions succeed.
- Treat the compressed SQL file, checksum, and metadata as one backup bundle.
- Retain verified bundles for 30 days while always keeping the newest seven;
  ignore unknown, malformed, symlinked, and temporary files.
- Require exact interactive typed confirmation for production restore.
- Create backups before migrations/restore/deploy.
- Use the shared non-blocking host lock for production deployment and restore.
- Keep application writes stopped throughout production restore. Restore into
  a verified staging database before replacing production contents.
- Run `prisma migrate deploy` as one explicit deployment step with the exact
  immutable image being promoted; never seed or migrate in normal app startup.
- Never migrate, seed, reset, delete volumes, select an image, or restart the
  application automatically after restore.
- Never use `docker compose down -v` for production deployment or rollback.
- Scripts must be committed and executable.

`make db-restore-drill` is the monthly recovery command. It must pass before
production recovery is considered ready. Automatic monthly scheduling and
off-host provider integration are deferred; operators must still preserve at
least one verified bundle in encrypted off-host storage.

## CI requirements

CI should run on:

- pull requests;
- pushes to `main`;
- optionally pushes to `local`.

CI checks:

- install dependencies;
- run migrations against test DB;
- lint;
- format check;
- typecheck;
- unit/integration tests;
- payload example validation;
- build.
