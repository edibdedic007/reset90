# Project Context Short

## Product

Reset90 is a private, self-hosted, single-user 90-day reset command center. A
Custom GPT creates structured plans/reflections; the webapp validates and stores
them, presents daily execution, tracks progress, and supports recovery without
shame-based streaks.

## Current stack

- Next.js App Router + TypeScript + Tailwind CSS
- PostgreSQL + Prisma
- Zod runtime contracts + generated Draft 2020-12 JSON Schemas
- Auth.js with Authentik OIDC for browser auth
- Dedicated bearer-token boundary for Custom GPT imports
- Docker Compose locally and in production, with Traefik expected in production
- GitHub Actions CI

## Implemented through Phase 10

- Repository, local environment, Prisma schema/migrations, seed data, readiness,
  quality gates, CI, backups/export/deployment helpers.
- Strict versioned GPT import contracts, raw payload persistence, idempotency,
  machine-authenticated ingest, and normalized daily plans/tasks.
- Browser authentication with dev mode and Authentik OIDC production mode.
- Authenticated Today Command Center with task completion and energy updates.
- Morning, midday, evening, and manual check-ins with eight required 1-10 scores,
  optional notes, transactional energy sync, and latest-state dashboard reads.

## Current boundary

Phase 10 is complete and merged to `local`. Phase 11 has not started. Recovery
mode and calculated day status remain deferred to Phase 11.

## Durable implementation rules

- `main` is production; `local` is the persistent development integration branch.
- Fixed 90-day cycle with minimum, standard, and ideal task tiers.
- Store raw GPT payloads before normalized data.
- Runtime import schemas live in `src/server/imports/schemas/`; generated schemas
  live in root `schemas/`.
- Browser auth and GPT machine ingest auth remain separate boundaries.
- One normalized plan exists per day; a new same-day import replaces it
  transactionally, while reprocessing the same raw import is a no-op.
- Imported plan energy does not overwrite later user-selected/check-in energy.
- Current-day browser APIs derive ownership and active UTC day server-side.
- Store summaries, decisions, and context snapshots; never hidden chain-of-thought.
- Recovery-aware statuses replace harsh streaks.
- Production reverse proxy default is Traefik; change only through an explicit
  decision.

## Source-of-truth map

- Current work: `docs/state/TASK_STATE.md`
- Historical handoffs: `docs/state/SESSION_LOG.md`
- Detailed completed-phase archive: `docs/state/COMPLETED_PHASES.md`
- Phase roadmap: `docs/16_BEST_IMPLEMENTATION_ORDER.md` via
  `make phase PHASE=<number>`
- Accepted decisions: `docs/state/DECISIONS_INDEX.md` and relevant `docs/adr/`
- Task-to-document lookup: `docs/00_PACK_INDEX.md`

Keep this file current and compact. Historical phase-by-phase details belong in
state history, Git history, and the implementation roadmap—not here.
