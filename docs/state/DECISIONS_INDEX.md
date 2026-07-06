# Decisions Index

## Purpose

Provide a short index of durable decisions so Codex can quickly find the relevant ADR without rereading all ADR files.

## Rule

This file is not the source of truth for architecture decisions. The source of truth is `docs/adr/`.

## Accepted ADRs

- `0001-modular-monolith.md` — Build a modular monolith first.
- `0002-postgresql-source-of-truth.md` — PostgreSQL is the source of truth.
- `0003-json-schema-import-contracts.md` — GPT imports must use explicit schemas.
- `0004-separate-auth-boundaries.md` — Browser auth and GPT ingest auth are separate.
- `0005-observability-ladder.md` — Observability should grow in layers.
- `0006-context-summaries-not-chain-of-thought.md` — Store summaries, not hidden chain-of-thought.
- `0007-prisma-orm.md` — Use Prisma ORM.
- `0008-main-production-local-dev-branch.md` — `main` is production, `local` is developer integration.
- `0009-custom-gpt-as-coach-webapp-as-dashboard.md` — Custom GPT coaches; webapp stores/displays/tracks.
- `0010-minimum-standard-ideal-task-model.md` — Tasks use minimum/standard/ideal tiers.
- `0011-recovery-days-instead-of-harsh-streaks.md` — Recovery days replace harsh streak mechanics.
- `0012-docker-compose-and-traefik-deployment.md` — Docker Compose + Traefik production deployment.
- `0013-docs-as-code-codex-memory.md` — Docs-as-code is Codex project memory.

## When to update

- Add a new ADR for durable decisions.
- Update this index only after the ADR is accepted.
- Supersede old ADRs instead of silently rewriting history.
