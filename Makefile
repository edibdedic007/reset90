SHELL := /usr/bin/env bash

.PHONY: help session context new-work update-task-state setup-local bootstrap install dev dev-up dev-down logs check quality-check lint format format-check typecheck test build db-migrate db-seed db-reset db-backup db-restore validate-payloads env-check prod-check prod-build prod-up prod-down prod-logs prod-health deploy-production export-full docs-bundle healthcheck

LOCAL_COMPOSE := docker compose --env-file .env.local -f docker-compose.local.yml

help:
	@echo "Reset90 commands"
	@echo "  make session                 Print Codex session-start status"
	@echo "  make context                 Generate compact .codex context packet"
	@echo "  make new-work TYPE=feature SLUG=repo-foundation"
	@echo "  make setup-local             Setup local developer environment"
	@echo "  make dev                     Start PostgreSQL and Next.js"
	@echo "  make dev-up                  Start local PostgreSQL"
	@echo "  make dev-down                Stop local PostgreSQL"
	@echo "  make logs                    Follow local PostgreSQL logs"
	@echo "  make check                   Run available quality gates"
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

new-work:
	@if [ -z "$(TYPE)" ] || [ -z "$(SLUG)" ]; then echo "Usage: make new-work TYPE=feature SLUG=repo-foundation"; exit 1; fi
	./scripts/create-branch.sh $(TYPE) $(SLUG)

update-task-state:
	@if [ -z "$(MSG)" ]; then echo "Usage: make update-task-state MSG='summary'"; exit 1; fi
	./scripts/update-task-state.sh "$(MSG)"

setup-local bootstrap:
	./scripts/setup-local.sh

install:
	@if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile; elif [ -f yarn.lock ]; then yarn install --frozen-lockfile; elif [ -f bun.lockb ] || [ -f bun.lock ]; then bun install --frozen-lockfile; elif [ -f package-lock.json ]; then npm ci; elif [ -f package.json ]; then npm install; else echo "No package.json yet."; fi

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
	@if [ -f package.json ]; then pnpm run lint --if-present; else echo "No package.json yet."; fi

format:
	@if [ -f package.json ]; then pnpm run format --if-present; else echo "No package.json yet."; fi

format-check:
	@if [ -f package.json ]; then pnpm run format:check --if-present; else echo "No package.json yet."; fi

typecheck:
	@if [ -f package.json ]; then pnpm run typecheck --if-present; else echo "No package.json yet."; fi

test:
	@if [ -f package.json ]; then pnpm run test --if-present; else echo "No package.json yet."; fi

build:
	@if [ -f package.json ]; then pnpm run build --if-present; else echo "No package.json yet."; fi

validate-payloads:
	@if [ -f package.json ]; then pnpm run validate:payloads --if-present; else echo "No package.json yet."; fi

db-migrate:
	@if [ -f package.json ]; then pnpm run db:migrate --if-present; else echo "No package.json yet."; fi

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
