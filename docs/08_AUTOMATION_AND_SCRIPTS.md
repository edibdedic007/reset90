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
| Backup | Fully automated | `scripts/backup-db.sh` | Can run from cron/systemd timer. |
| Restore | Documented with script | `scripts/restore-db.sh` | Destructive; requires confirmation. |
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
make db-restore FILE=backup.sql.gz
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
- Keep production diagnostics bounded and never print environment contents,
  database URLs, secrets, tokens, cookies, authorization headers, or private
  application data.
- Do not hide destructive actions.
- Require typed confirmation for restore/production destructive tasks.
- Create backups before migrations/restore/deploy.
- Run `prisma migrate deploy` as one explicit deployment step with the exact
  immutable image being promoted; never seed or migrate in normal app startup.
- Never use `docker compose down -v` for production deployment or rollback.
- Scripts must be committed and executable.

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
