SHELL := /usr/bin/env bash

.PHONY: help setup-local install dev check lint format typecheck test build db-migrate db-seed db-reset db-backup db-restore validate-payloads prod-build prod-up prod-down prod-logs prod-health deploy-production export-full docs-bundle

help:
	@echo "Reset90 commands"
	@echo "  make setup-local             Setup local developer environment"
	@echo "  make dev                     Start local development"
	@echo "  make check                   Run lint, typecheck, tests, build, payload validation"
	@echo "  make db-backup               Create database backup"
	@echo "  make db-restore FILE=x       Restore database backup"
	@echo "  make deploy-production       Deploy production with backup and healthcheck"
	@echo "  make docs-bundle             Generate all-in-one docs bundle"

setup-local:
	./scripts/setup-local.sh

install:
	npm install

dev:
	docker compose -f docker-compose.local.yml up -d db
	npm run dev

check: lint typecheck test validate-payloads build

lint:
	npm run lint

format:
	npm run format

typecheck:
	npm run typecheck

test:
	npm test

build:
	npm run build

validate-payloads:
	npm run validate:payloads

db-migrate:
	npm run db:migrate

db-seed:
	npm run db:seed

db-reset:
	npm run db:reset

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

prod-health:
	./scripts/healthcheck.sh

deploy-production:
	./scripts/deploy-production.sh

export-full:
	./scripts/export-data.sh

docs-bundle:
	./scripts/generate-docs-bundle.sh
