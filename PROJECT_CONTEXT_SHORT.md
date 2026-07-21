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

## Implemented through Phase 20

- Repository, local environment, Prisma schema/migrations, seed data, readiness,
  quality gates, CI, backups/export/deployment helpers.
- Strict versioned GPT import contracts, raw payload persistence, idempotency,
  machine-authenticated ingest, and normalized daily plans/tasks.
- Browser authentication with dev mode and Authentik OIDC production mode.
- Authenticated Today Command Center with task completion and energy updates.
- Morning, midday, evening, and manual check-ins with eight required 1-10 scores,
  optional notes, transactional energy sync, and latest-state dashboard reads.
- Recovery events, derived recovery credits, deterministic UTC day statuses, and
  a current-day Reset Me Now flow.
- Authenticated 90-day progress grid with canonical status totals, recovery
  credit summary, missing-day safeguards, and read-only day detail.
- Strict daily-reflection imports with trusted owner resolution, transactional
  normalization/replacement, raw-payload privacy, and read-only day-detail
  display.
- Strict weekly-review imports with canonical cycle-relative week dates,
  deterministic transactional replacement, retained raw history, and an
  authenticated read-only Reviews page for the owned active cycle.
- Strict machine context imports plus authenticated manual creation, active-cycle
  relational search/exact filters, safe DTOs, and owner-only pinning in the
  responsive Context Library.
- Authenticated, read-only `gpt_context_packet` 1.0 JSON download for the owned
  active cycle, with schema validation, deterministic bounded windows, normalized
  patterns/pinned context/open decisions, canonical recovery/status summaries,
  and explicit privacy allowlists.
- Authenticated, read-only Analytics for the singular owned active cycle, with
  canonical finalized-status counts, normalized recovery/task totals, six
  latest-daily check-in trends, and equal-window cycle-week comparison.
- Authenticated, read-only user-data export from Settings: one versioned full
  JSON archive across all owned cycles, day-log/task/check-in CSVs, and stored
  weekly/cycle-report Markdown summaries with linked-owned raw-import scope.
- Stable CI quality workflow plus guarded disposable-PostgreSQL integration
  coverage for migrations, import persistence, and cross-user isolation.
- Central browser mutation guards, read-only application GET/HEAD behavior,
  trusted-owner machine imports, bounded request bodies, process-local import
  rate limits, safe logging, security headers, and tracked-file hygiene checks.

## Current boundary

Phase 20 hardens the pre-production application boundary without changing
product semantics or the database schema. Browser mutations require an existing
authenticated user, exact configured origin, JSON, and a streamed 16 KiB body
limit. GPT imports require header-only machine authentication before body access,
a trusted existing owner with one active cycle, a streamed 128 KiB body limit,
and process-local endpoint/principal rate limits. Application GET/HEAD handlers
remain read-only, logs are allowlist-only, compatible security headers are
centralized, and Git-backed repository hygiene checks fail closed.

Phase 21 remains separate production deployment work. Production containers,
Traefik/TLS configuration, trusted proxy behavior, HSTS, distributed or
IP-based rate limiting, and cutover are not implemented here.

## Durable implementation rules

- `main` is production; `local` is the persistent development integration branch.
- `make check` is the complete local quality gate and is the only command run by
  the canonical CI `quality` job after CI infrastructure setup.
- Database integration tests require an empty, loopback, clearly test-named
  disposable PostgreSQL database and never load the persistent local development
  URL or clear an inherited database to make it acceptable.
- Fixed 90-day cycle with minimum, standard, and ideal task tiers.
- Store raw GPT payloads before normalized data.
- Runtime import schemas live in `src/server/imports/schemas/`; generated schemas
  live in root `schemas/`.
- The outbound GPT context packet runtime schema and assembler live in
  `src/server/context-export/`; packet generation is allowlist-only and
  read-only.
- Browser auth and GPT machine ingest auth remain separate boundaries. Browser
  reads resolve existing users without application provisioning; mutations also
  require the exact canonical application origin and a 16 KiB streamed JSON
  body limit.
- GPT imports authenticate before body access, use a fixed 128 KiB streamed JSON
  body limit, resolve exactly one trusted-owner active cycle, and use rolling
  process-local limits of 120 endpoint requests and 30 principal requests per
  60 seconds.
- Security headers include CSP, framing denial, no-sniff, no-referrer, and a
  restrictive permissions policy. HSTS remains deferred until Phase 21 verifies
  HTTPS and proxy behavior.
- The quality gate checks Git-tracked paths for forbidden sensitive files;
  approved placeholder environment examples remain trackable.
- One normalized plan exists per day; a new same-day import replaces it
  transactionally, while reprocessing the same raw import is a no-op.
- One normalized reflection exists per day; a newer valid import replaces its
  approved fields and source reference while retaining immutable raw imports.
- One normalized weekly review exists per cycle/week; canonical dates are
  server-derived, and deterministic newer imports replace approved content
  while retaining immutable raw imports.
- Reflection status recommendations remain stored advisory data only. Raw
  imports and processing metadata never enter the browser day-detail DTO.
- Imported plan energy does not overwrite later user-selected/check-in energy.
- Current-day browser APIs derive ownership and active UTC day server-side.
- Progress reads derive ownership from the authenticated user's active cycle,
  calculate response statuses without persistence, and never infer status for
  missing logs.
- Analytics resolves an existing browser user without upsert, requires exactly
  one owned active cycle, reuses canonical UTC/status behavior, and never reads
  raw imports, private narratives, or weekly-review metric snapshots.
- Full user-data export resolves an existing browser user without persistence,
  reads all owned cycles through explicit allowlists, and includes raw imports
  only when linked from an exported owned normalized record. CSV and Markdown
  serializers derive from that deterministic read-only snapshot.
- Store summaries, decisions, and context snapshots; never hidden chain-of-thought.
- Context belongs to exactly one active reset cycle, uses relational normalized
  tags, and exposes no raw-import or ownership metadata through browser DTOs.
- `context_item` version `1.0` remains the legacy raw-only contract; Phase 15
  Context Library imports use version `2.0`, with deterministic declared-version
  validation and no legacy field/domain inference.
- Context imports, manual creation, pinning, and unpinning lock and revalidate
  the same singular owned active cycle before mutation.
- PostgreSQL enforces at most one `ACTIVE` Reset Cycle per user; its additive
  migration refuses pre-existing duplicates without changing cycle data.
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
