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

Documentation handoff pack created. App source code may not yet be implemented. Codex must inspect the repository before making assumptions.

## Current branch/task

Not started. Use `local` as the persistent developer-only branch and short-lived task branches from `local`.

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

## Next recommended tasks

1. Phase 0: repo foundation and docs import.
2. Phase 1: stack scaffold.
3. Phase 2: local development environment.
4. Phase 3: database/Prisma migrations and seed data.
5. Phase 4: canonical GPT import schemas and validators.
6. Phase 5: raw import storage and idempotency.

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
