SHELL := /usr/bin/env bash

.PHONY: help session context phase phase-bundle review-bundle new-work update-task-state setup-local bootstrap install dev dev-up dev-down logs check quality-check lint format format-check typecheck test test-integration build db-validate db-migrate db-seed db-reset db-backup db-restore validate-payloads env-check prod-check prod-build prod-up prod-down prod-logs prod-health deploy-production export-full docs-bundle healthcheck

LOCAL_COMPOSE := docker compose --env-file .env.local -f docker-compose.local.yml

help:
	@echo "Reset90 commands"
	@echo "  make session                 Refresh context and print short session status"
	@echo "  make context                 Generate compact .codex context packet"
	@echo "  make phase PHASE=11          Print one implementation phase only"
	@echo "  make phase-bundle PHASE=12   Create compact pre-phase ChatGPT planning archive"
	@echo "  make review-bundle PHASE=11  Create external phase review ZIP (BASE_REF=local)"
	@echo "  make new-work TYPE=feature SLUG=repo-foundation"
	@echo "  make setup-local             Setup local developer environment"
	@echo "  make dev                     Start PostgreSQL and Next.js"
	@echo "  make dev-up                  Start local PostgreSQL"
	@echo "  make dev-down                Stop local PostgreSQL"
	@echo "  make logs                    Follow local PostgreSQL logs"
	@echo "  make check                   Run complete local quality gate"
	@echo "  make test-integration        Run migrations and serial PostgreSQL tests"
	@echo "  make validate-payloads       Validate canonical GPT payload examples"
	@echo "  make env-check               Validate .env.local baseline keys"
	@echo "  make prod-check              Validate .env.production baseline keys/placeholders"
	@echo "  make db-backup               Create database backup"
	@echo "  make db-restore FILE=x       Restore database backup"
	@echo "  make deploy-production       Deploy production with backup and healthcheck"
	@echo "  make docs-bundle             Generate all-in-one docs bundle"

session:
	./scripts/codex-session-start.sh

context:
	./scripts/codex-context.sh

phase:
	@if [ -z "$(PHASE)" ]; then echo "Usage: make phase PHASE=11"; exit 1; fi
	./scripts/codex-phase.sh "$(PHASE)"

phase-bundle:
	@if [ -z "$${PHASE:-}" ]; then echo "Usage: make phase-bundle PHASE=12 [EXTRA_FILES='docs/file.md docs/adr/0011-example.md']"; exit 1; fi
	bash ./scripts/create-phase-plan-bundle.sh "$$PHASE" "$${EXTRA_FILES:-}"

review-bundle:
	@if [ -z "$(PHASE)" ]; then echo "Usage: make review-bundle PHASE=11 [BASE_REF=local]"; exit 1; fi
	bash ./scripts/create-phase-review-bundle.sh "$(PHASE)" "$(if $(BASE_REF),$(BASE_REF),local)"

new-work:
	@if [ -z "$(TYPE)" ] || [ -z "$(SLUG)" ]; then echo "Usage: make new-work TYPE=feature SLUG=repo-foundation"; exit 1; fi
	./scripts/create-branch.sh $(TYPE) $(SLUG)

update-task-state:
	@if [ -z "$(MSG)" ]; then echo "Usage: make update-task-state MSG='summary'"; exit 1; fi
	./scripts/update-task-state.sh "$(MSG)"

setup-local bootstrap:
	./scripts/setup-local.sh

install:
	@test -f pnpm-lock.yaml || { echo "pnpm-lock.yaml is required"; exit 1; }
	pnpm install --frozen-lockfile

dev:
	@$(MAKE) dev-up
	pnpm dev

dev-up:
	@test -f .env.local || { echo ".env.local missing. Run: make setup-local"; exit 1; }
	$(LOCAL_COMPOSE) up -d db

dev-down:
	@test -f .env.local || { echo ".env.local missing. Run: make setup-local"; exit 1; }
	$(LOCAL_COMPOSE) down

logs:
	@test -f .env.local || { echo ".env.local missing. Run: make setup-local"; exit 1; }
	$(LOCAL_COMPOSE) logs -f --tail=200 db

check quality-check:
	./scripts/quality-check.sh

lint:
	pnpm run lint

format:
	pnpm run format

format-check:
	pnpm run format:check

typecheck:
	pnpm run typecheck

test:
	pnpm run test

test-integration:
	./scripts/run-integration-tests.sh

build:
	pnpm run build

validate-payloads:
	pnpm run validate:payloads

db-validate:
	pnpm run db:validate

db-migrate:
	pnpm run db:migrate

db-seed:
	@if [ -f package.json ]; then pnpm run db:seed --if-present; else echo "No package.json yet."; fi

db-reset:
	@if [ -f package.json ]; then pnpm run db:reset --if-present; else echo "No package.json yet."; fi

env-check:
	./scripts/env-check.sh .env.local

prod-check:
	./scripts/production-check.sh

db-backup:
	./scripts/backup-db.sh

db-restore:
	@if [ -z "$(FILE)" ]; then echo "Usage: make db-restore FILE=backup.sql.gz"; exit 1; fi
	./scripts/restore-db.sh "$(FILE)"

prod-build:
	docker compose -f docker-compose.production.yml build

prod-up:
	docker compose -f docker-compose.production.yml up -d

prod-down:
	docker compose -f docker-compose.production.yml down

prod-logs:
	docker compose -f docker-compose.production.yml logs -f --tail=200 app

prod-health healthcheck:
	./scripts/healthcheck.sh

deploy-production:
	./scripts/deploy-production.sh

export-full:
	./scripts/export-data.sh

docs-bundle:
	./scripts/generate-docs-bundle.sh
