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

Phase 3 database foundation complete. Prisma 7.8 uses PostgreSQL through the
node-postgres driver adapter. The first migration creates users, reset cycles,
reset phases, day logs, and raw imported payload storage. Idempotent seed data
creates one active cycle, three canonical phases, and 90 unique day logs.

## Current branch/task

`feature/database-foundation` — Phase 3 database foundation complete. Await
explicit approval before Phase 4 GPT payload validation.

## Important decisions

- Single-user private app, not SaaS.
- `main` = production branch.
- `local` = persistent developer-only branch.
- Fixed 90-day skeleton with adaptive daily execution.
- Custom GPT is the coach, planner, interpreter, and analyst.
- Webapp is the storage, dashboard, tracker, analytics, and export layer.
- Store raw GPT payloads first, then normalized data.
- Store conversation history, summaries, decisions, and context snapshots; do not store hidden chain-of-thought.
- Recovery-aware statuses replace harsh streaks.
- Export/backup must be available early.
- Health endpoint: `GET /api/health` returns `200` with minimal JSON.
- Readiness endpoint: `GET /api/ready` returns `200` only when a safe database
  query succeeds; database failure returns `503` without internal details.

## Next recommended tasks

1. Review and commit Phase 3.
2. Merge `feature/database-foundation` into `local` when approved.
3. Await explicit approval before Phase 4.
4. Phase 4: canonical GPT import schemas and validators.
5. Phase 5: raw import storage and idempotency.

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
