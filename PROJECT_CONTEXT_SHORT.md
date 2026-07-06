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

Documentation-only foundation is present. Every path listed in `PACK_TREE.txt` exists, including root handoff docs, `docs/00` through `docs/17`, examples, schemas, scripts, CI examples, and the indexed ADR baseline `0001` through `0013`.

No application source or app scaffold exists.

Documentation reconciliation is pending: ten additional accepted ADR files reuse IDs `0001` through `0010` outside the indexed baseline. Treat ADR numbering as ambiguous until those legacy files are reviewed and reconciled; do not create more ADRs with reused IDs.

Phase 0 guidance also conflicts: `CODEX_START_HERE.md` defines it as documentation-only, while `USER_RUNBOOK_CODEX_CLI.md` tells Codex to scaffold the app, database, ORM, health endpoint, and CI during Phase 0. Follow `docs/16_BEST_IMPLEMENTATION_ORDER.md` until the runbook is corrected.

## Current branch/task

Documentation foundation review completed on 2026-07-06. Git has no commits yet, `HEAD` is unborn `main`, and the current documentation pack is untracked. The documented `main`/`local` branch model is not initialized yet.

No application scaffolding was performed. After the initial documentation baseline is reconciled and committed, establish `local` and create short-lived task branches from it.

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

1. Reconcile duplicate ADR IDs and align the ADR index, pack inventories, root README, and Phase 0 runbooks.
2. Complete Phase 0 with the initial documentation baseline commit and establish `local`.
3. Phase 1: stack scaffold.
4. Phase 2: local development environment.
5. Phase 3: database/Prisma migrations and seed data.
6. Phase 4: canonical GPT import schemas and validators.
7. Phase 5: raw import storage and idempotency.

Use `docs/16_BEST_IMPLEMENTATION_ORDER.md` as the source of truth.

## Update rule

After meaningful work, append a short entry:

```text
YYYY-MM-DD - branch-name - summary of what changed - checks run - next step
```

2026-07-06 - main (unborn) - reviewed documentation foundation; all expected pack files exist; duplicate accepted ADR IDs and stale inventory references remain - checked Git state, pack file existence, full file inventory, and ADR IDs/statuses - reconcile documentation before initial baseline commit


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
