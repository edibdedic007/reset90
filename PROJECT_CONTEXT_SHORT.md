# Project Context Short

    ## Purpose
    Give Codex a compact state file that should be read and updated frequently without wasting tokens.

    ## Scope
    - Contains app summary, current stack, branch/task status, important decisions, next tasks, and recent changes.
- Should stay short; deep explanations belong in `docs/`.
- Must be updated after significant implementation changes.

    ## Assumptions
    - The implementation has not started unless the actual repo shows otherwise.
- The stack recommendation is default guidance and should be adapted only with explicit reason.
- The user wants the app to remain private and self-hosted.

    ## Success Criteria
    - Codex can understand current project state in under one minute.
- Context remains reusable across Codex sessions.
- The file does not become a full changelog or duplicate every document.

    ## Deliverables
    - Compact current context.
- Current implementation state placeholder.
- Next action list.

    ## App summary

Reset90 is a private self-hosted 90-day reset command center. It receives structured daily plans and reflections from a Custom GPT, stores them, displays them cleanly, tracks daily execution across body, mood, digital detox, learning resistance, and work improvement, and visualizes progress without shame-based streaks.

## Recommended stack

- Next.js with TypeScript
- PostgreSQL
- Prisma
- JSON Schema plus Zod
- Tailwind CSS
- Authentik OIDC for browser auth
- Bearer token or HMAC-protected ingest endpoint for Custom GPT actions
- Docker Compose for local and production deployment behind Traefik in production
- GitHub Actions for CI

## Current implementation status

Phase 6 GPT ingest endpoint complete. `POST /api/gpt/import` uses dedicated
bearer-token auth, streamed body limits, canonical validation, raw storage,
source-scoped idempotency, and a basic process-local rate guard. No normalized
domain mutation exists yet.

## Current branch/task

`feature/gpt-ingest-endpoint` — Phase 6 machine-authenticated GPT ingest endpoint
complete. Await explicit approval before Phase 7 daily-plan normalization.

## Important decisions

- Single-user private app, not SaaS.
- `main` = production branch.
- `local` = persistent developer-only branch.
- Fixed 90-day skeleton with adaptive daily execution.
- Custom GPT is the coach, planner, interpreter, and analyst.
- Webapp is the storage, dashboard, tracker, analytics, and export layer.
- Store raw GPT payloads first, then normalized data.
- Canonical runtime import contracts live in `src/server/imports/schemas/`;
  generated Draft 2020-12 contracts live in root `schemas/`.
- Import schemas reject unknown fields and unsupported schema versions before
  any future database mutation.
- Raw import uniqueness is `(source, idempotency_key)`; duplicate requests return
  the existing import reference, including concurrent unique-constraint races.
- Valid raw imports remain `VALID/PENDING` until later normalization; identifiable
  invalid imports are stored `INVALID/REJECTED` with safe issue metadata.
- GPT imports use a dedicated `GPT_INGEST_TOKEN`; browser/AuthentiK sessions are
  neither required nor accepted as the endpoint auth boundary.
- `POST /api/gpt/import` requires JSON plus a matching `Idempotency-Key` header,
  enforces `GPT_INGEST_MAX_BODY_BYTES`, and returns created/duplicate/validation
  results without exposing raw payloads or secrets.
- A 60-request/minute process-local guard protects the single-instance endpoint;
  shared/distributed limiting remains a later production-hardening concern.
- Store conversation history, summaries, decisions, and context snapshots; do not store hidden chain-of-thought.
- Recovery-aware statuses replace harsh streaks.
- Export/backup must be available early.
- Health endpoint: `GET /api/health` returns `200` with minimal JSON.
- Readiness endpoint: `GET /api/ready` returns `200` only when a safe database
  query succeeds; database failure returns `503` without internal details.

## Next recommended tasks

1. Review and commit Phase 6.
2. Merge `feature/gpt-ingest-endpoint` into `local` when approved.
3. Await explicit approval before Phase 7.
4. Phase 7: daily-plan normalization into plans and tasks.

Use `docs/16_BEST_IMPLEMENTATION_ORDER.md` as the source of truth.

## Update rule

After meaningful work, append a short entry:

```text
YYYY-MM-DD - branch-name - summary of what changed - checks run - next step
```


## ADR context

This repo uses lightweight Architecture Decision Records in `docs/adr/`.
Accepted ADRs are implementation constraints. Codex must read relevant ADRs before changing architecture, auth, database/storage, GPT integration, context memory, deployment, Git workflow, or core product behavior.
ADR reasoning is user-visible rationale, not hidden chain-of-thought.


## Implementation Order
Use `docs/16_BEST_IMPLEMENTATION_ORDER.md` as the primary phase-by-phase build order for Codex CLI. It supersedes generic implementation-order notes.


Accepted ADR baseline:

```text
0001 modular monolith
0002 PostgreSQL source of truth
0003 JSON Schema import contracts
0004 separate browser auth and GPT ingest auth
0005 observability ladder
0006 context summaries, not chain-of-thought
0007 Prisma ORM
0008 main/local branch model
0009 Custom GPT coach, webapp dashboard/storage
0010 minimum/standard/ideal tasks
0011 recovery days instead of harsh streaks
0012 Docker Compose + Traefik deployment
0013 docs-as-code Codex memory
```

## Recent changes

2026-07-06 - feature/repo-foundation - verified Phase 0 repository/docs baseline and removed conflicting legacy ADR duplicates - `make check`, whitespace, inventory, ADR uniqueness, and JSON syntax checks passed - next step: await Phase 1 approval

2026-07-07 - feature/app-scaffold - added Phase 1 Next.js/TypeScript/Tailwind app shell, pnpm tooling, tests, and `/api/health` plus placeholder `/api/ready` routes - format, lint, typecheck, tests, build, and live endpoint smoke checks passed - next step: review/commit and await Phase 2 approval

2026-07-07 - chore/local-development-env - completed Phase 2 local PostgreSQL Compose workflow, pnpm setup, Make lifecycle targets, and clean-start docs - Compose validation, local setup/readiness, lifecycle targets, and `make check` passed - next step: review/commit and await Phase 3 approval

2026-07-07 - feature/database-foundation - added Prisma/PostgreSQL schema, first migration, idempotent 90-day seed, cycle logic tests, and database readiness - migration, repeated seed, row-count checks, route smoke test, and app quality gates passed - next step: review/commit and await Phase 4 approval

2026-07-07 - feature/gpt-payload-validation - added strict Zod import envelopes and payload schemas, generated Draft 2020-12 contracts, example validation, and invalid fixture tests - `make check` passed with 22 tests and production build - next step: review/commit and await Phase 5 approval

2026-07-07 - feature/raw-import-storage - added raw valid/invalid import persistence, safe validation metadata, processing states, and source-scoped idempotency with race handling - migration, live DB smoke, and `make check` passed with 27 tests and production build - next step: review/commit and await Phase 6 approval

2026-07-07 - feature/gpt-ingest-endpoint - added machine-authenticated GPT import HTTP boundary with byte limits, matching idempotency headers, raw storage, duplicate-safe responses, and process-local rate limiting - `make check` passed with 37 tests and production build - next step: review/commit and await Phase 7 approval
