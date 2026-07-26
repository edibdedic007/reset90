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

## Implemented and accepted through Phase 22

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
limit. Authentik sign-in provisions or updates the application user by the
stable OIDC provider account subject inside the Auth.js lifecycle; subsequent
application reads resolve that existing user without writes. A real local
Authentik browser smoke verified redirect, callback, stable-subject
provisioning and repeat login, authenticated navigation and mutations,
same-origin validation, foreign-origin rejection, empty Today state, headers,
private-safe errors, logout, and protected-route denial. GPT imports require
header-only machine authentication before body access, a trusted existing owner
with one active cycle, a streamed 128 KiB body limit, and process-local
endpoint/principal rate limits. Application GET/HEAD handlers remain read-only,
logs are allowlist-only, compatible security headers are centralized, and
Git-backed repository hygiene checks fail closed.

Phase 21 adds the production deployment artefacts without performing live
cutover: a frozen-lockfile multi-stage image, non-root runtime, explicit
production environment contract, private PostgreSQL plus Traefik-only Compose
topology, immutable commit tags, persistent data/export/backup volumes, ordered
backup/build/migrate/promote gates, internal readiness and public HTTPS checks,
and attempted/previous/successful revision records. Deployment requires a clean
checked-out `main` whose `HEAD`, local `main` ref, and configured full commit SHA
all match. One non-blocking host lock covers every deployment-state write,
Docker mutation, health gate, and revision record. HSTS remains disabled until
the real canonical HTTPS route, redirects, Authentik callback, and
controlled-proxy behavior pass cutover verification. Live infrastructure, DNS,
secrets, migrations, rollback drills, distributed/IP rate limiting, monitoring,
registry promotion, and high availability remain deferred.

Phase 22 hardens the canonical operator-only database backup/restore boundary.
Backups are compressed plain SQL bundles with explicit environment selection,
temporary-first atomic publication, gzip validation, SHA-256, versioned
non-private metadata, restrictive permissions, and safe 30-day/newest-seven
retention. Production deployment reuses that canonical backup path.
Disposable restore rejects unsafe or populated targets and validates complete
artifacts before a single-transaction restore. Production restore shares the
deployment lock, requires stopped writes and exact interactive confirmation,
creates a verified pre-restore backup, restores and verifies a staging database,
replaces production contents without merging, and leaves the application
stopped for explicit immutable-revision selection. Selected production restore
bundles remain retention-protected under that lock, must record a full Git SHA,
and are revalidated immediately before staging. Cleanup reconciles actual
database names and preserves ambiguous recoverable states. A real isolated
PostgreSQL drill verifies current migration history, ownership-sensitive
representative data, relationships, uniqueness, explicit foreign-key rejection,
serialization fidelity, and Prisma access. The production backup volume remains
PostgreSQL/operator-only local recovery storage; the app does not mount it.
Encrypted off-host copy is an operator requirement, while provider integration
and scheduling remain deferred.

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
- Browser auth and GPT machine ingest auth remain separate boundaries. Authentik
  sign-in provisions or updates the application user by stable
  `providerAccountId` inside the Auth.js lifecycle; browser reads resolve
  existing users without application provisioning. Mutations also require the
  exact canonical application origin and a 16 KiB streamed JSON body limit.
- GPT imports authenticate before body access, use a fixed 128 KiB streamed JSON
  body limit, resolve exactly one trusted-owner active cycle, and use rolling
  process-local limits of 120 endpoint requests and 30 principal requests per
  60 seconds.
- Security headers include CSP, framing denial, no-sniff, no-referrer, and a
  restrictive permissions policy. HSTS remains deferred until Phase 21 verifies
  HTTPS and proxy behavior.
- The quality gate checks Git-tracked paths for forbidden sensitive files;
  approved placeholder environment examples remain trackable.
- One normalized plan exists per day; the newest same-day raw import by
  `createdAt` then ID owns it, replacement is transactional, and reprocessing
  the same raw import is a no-op.
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
- Production Compose receives one explicit ignored `.env.production`; ambient
  values cannot override its interpolation. The app joins private and external
  Traefik networks, PostgreSQL joins only the private network, and neither
  service publishes a host port. The application requires writable export
  storage; it does not mount the database-backup volume. Persistent backups are
  available only through the PostgreSQL/operator path.
- Production images use immutable full Git SHA tags, run non-root, and start
  with the production server. Under one deployment lock, deployment creates and
  verifies a persistent revision-stamped backup through the canonical backup
  script before one explicit `prisma migrate deploy`, never seeds, never selects
  `latest`, and never deletes named volumes.
- Only verified final `.sql.gz` bundles with matching SHA-256 and versioned
  metadata are eligible for restore, retention, off-host copy, or rollback
  evidence. Production deployment and restore share one host lock; restore also
  requires stopped writes, a full backup Git SHA, locked and pre-staging
  revalidation, a retention-protected selected artifact, a verified pre-restore
  backup, and exact interactive confirmation. Restore cleanup reconciles actual
  PostgreSQL names and preserves ambiguous recoverable databases. Restore never
  migrates, seeds, restarts services, or deletes volumes automatically.
- Container readiness uses `/api/ready` and therefore includes PostgreSQL.
  Public readiness separately verifies the canonical HTTPS route and certificate.

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
