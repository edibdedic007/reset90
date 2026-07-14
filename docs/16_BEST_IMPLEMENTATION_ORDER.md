# Reset90 Best Implementation Order

## Purpose
Define the best practical implementation order for building Reset90 with Codex CLI from documentation pack to production deployment.

## Scope
This file is the main execution roadmap for Codex CLI. It replaces older or generic implementation-order files. It assumes the current Reset90 pack contains `AGENTS.md`, `PROJECT_CONTEXT_SHORT.md`, `CODEX_START_HERE.md`, `docs/`, `docs/adr/`, and `examples/`.

## Assumptions
- App purpose: Reset90 is a private, self-hosted, single-user 90-day reset dashboard.
- Target user: one primary user operating the app from phone and PC.
- Core features: Custom GPT payload import, Today Command Center, task/check-in tracking, recovery mode, 90-day grid, reviews, context memory, exports, backups, and production deployment.
- Tech stack: Next.js + TypeScript, pnpm, Tailwind CSS, PostgreSQL, Prisma ORM, Zod plus JSON Schema validation, Authentik OIDC, Docker Compose, GitHub Actions.
- Constraints: no SaaS, no payments, no public signup, no social features, no leaderboards, no Kubernetes, no microservices, no raw hidden reasoning logs.
- Branch model: `main` is production; `local` is persistent developer-only integration; short-lived branches use `feature/<slug>`, `cleanup/<slug>`, `fix/<slug>`, `refactor/<slug>`, `chore/<slug>`, or `docs/<slug>`.
- Reverse proxy: production must use Docker Compose behind Traefik. Do not introduce Caddy, Nginx, Kubernetes, or microservices unless a future ADR explicitly changes this.

## Success Criteria
- Codex can build the app phase by phase without repeatedly re-reading the whole documentation pack.
- Each phase has a small scope, source docs, done criteria, branch suggestion, commit suggestion, and a ready-to-paste Codex prompt.
- Architecture decisions are respected through ADRs.
- `main` stays production-ready.
- The MVP is not considered complete until GPT import, dashboard use, context export, backup/restore, and production deployment all work.

## Deliverables
- Non-negotiable implementation rules.
- Phase-by-phase implementation plan.
- Ready-to-paste Codex prompts.
- Branch/commit guidance per phase.
- MVP finish line.
- Production-readiness checklist.
- Scope-creep stop list.

---

# 0. Read order for Codex

For every Codex session, start with the smallest useful context.

Always read first:

```text
AGENTS.md
PROJECT_CONTEXT_SHORT.md
CODEX_START_HERE.md
```

Then read only the phase-specific docs listed in that phase.

Do not ask Codex to read `ALL_FILES_READY_TO_SAVE.md` during normal implementation. Generate it only on demand with `make docs-bundle`; it is ignored by Git and is too large for token-efficient work.

---

# 1. Non-negotiable rules

Repeat these rules to Codex often.

```text
Build Reset90 as a private self-hosted single-user modular monolith.
Do not add SaaS, payments, public signup, social features, leaderboards, marketing pages, Kubernetes, microservices, or multi-tenant complexity.
Use PostgreSQL as the source of truth.
Store raw GPT imports before normalization.
Validate GPT imports with Zod and/or JSON Schema at the boundary.
Keep browser Authentik OIDC auth separate from GPT machine ingest auth.
Store conversation history, task summaries, decision logs, reflections, and context snapshots.
Do not store raw hidden chain-of-thought or internal model reasoning logs.
Every architecture-affecting change must respect existing ADRs.
If a decision conflicts with an accepted ADR, stop and ask the user.
Update PROJECT_CONTEXT_SHORT.md after every task.
Keep main production-ready.
Use local as persistent developer-only integration branch.
Use short-lived branches from local unless doing an emergency hotfix from main.
```

---

# 2. Existing key docs in the current pack

Use these exact current-pack paths.

```text
README.md
AGENTS.md
CODEX_START_HERE.md
PROJECT_CONTEXT_SHORT.md

docs/00_PACK_INDEX.md
docs/01_PRODUCT_REQUIREMENTS.md
docs/02_SYSTEM_ARCHITECTURE.md
docs/03_SYSTEM_DESIGN_DATA_MODEL.md
docs/04_API_AND_AI_PAYLOAD_CONTRACTS.md
docs/05_CONTEXT_MEMORY_DESIGN.md
docs/06_UX_FLOWS.md
docs/07_ENVIRONMENTS_DEPLOYMENT.md
docs/08_AUTOMATION_AND_SCRIPTS.md
docs/09_ENGINEERING_BEST_PRACTICES.md
docs/10_GIT_WORKFLOW.md
docs/11_IMPLEMENTATION_PLAN.md
docs/12_CODEX_PROMPTS.md
docs/13_INSPIRATIONS.md
docs/14_SOURCE_RESEARCH_NOTES.md
docs/15_ADR_PROCESS_AND_REASONING.md

docs/adr/README.md
docs/adr/TEMPLATE.md
docs/adr/0001-modular-monolith.md
docs/adr/0002-postgresql-source-of-truth.md
docs/adr/0003-json-schema-import-contracts.md
docs/adr/0004-separate-auth-boundaries.md
docs/adr/0005-observability-ladder.md
docs/adr/0006-context-summaries-not-chain-of-thought.md
docs/adr/0007-prisma-orm.md
docs/adr/0008-main-production-local-dev-branch.md
docs/adr/0009-custom-gpt-as-coach-webapp-as-dashboard.md
docs/adr/0010-minimum-standard-ideal-task-model.md
docs/adr/0011-recovery-days-instead-of-harsh-streaks.md
docs/adr/0012-docker-compose-and-traefik-deployment.md
docs/adr/0013-docs-as-code-codex-memory.md

examples/.env.local.example
examples/.env.production.example
examples/docker-compose.local.yml
examples/docker-compose.production.yml
examples/Makefile
examples/daily_plan_payload.json
examples/daily_reflection_payload.json
examples/weekly_review_payload.json
examples/scripts/*
examples/.github/*
```

---

# 3. Branch workflow during implementation

Normal work:

```bash
git switch local
git pull origin local
git switch -c feature/<slug>
# work
make check
git add .
git commit -m "feat(scope): short imperative summary"
git switch local
git merge --no-ff feature/<slug>
```

Production release:

```bash
git switch local
make check
git switch main
git pull origin main
git merge --no-ff local
git push origin main
```

Emergency production hotfix:

```bash
git switch main
git pull origin main
git switch -c fix/<slug>
# fix
make check
git commit -m "fix(scope): short imperative summary"
git switch main
git merge --no-ff fix/<slug>
git push origin main
git switch local
git merge --no-ff main
```

Commit examples:

```bash
git commit -m "docs: add Reset90 Codex handoff pack"
git commit -m "chore(app): scaffold Next.js application"
git commit -m "chore(env): add local Docker Compose setup"
git commit -m "feat(db): add reset cycle schema and seed data"
git commit -m "feat(import): validate GPT payload envelopes"
git commit -m "feat(api): add GPT ingest endpoint"
git commit -m "feat(dashboard): show today command center"
git commit -m "feat(recovery): add recovery mode and day statuses"
git commit -m "chore(deploy): add production compose workflow"
```

---

# Phase 0 — Repository foundation and docs baseline

## Goal
Create the real repo, add the documentation pack, and establish `main`/`local` before app code exists.

## Branch
`docs/codex-handoff-baseline`

## Source docs

```text
README.md
AGENTS.md
CODEX_START_HERE.md
PROJECT_CONTEXT_SHORT.md
docs/00_PACK_INDEX.md
docs/10_GIT_WORKFLOW.md
docs/15_ADR_PROCESS_AND_REASONING.md
```

## Human steps

1. Create or open the repo.
2. Extract the current Reset90 Codex pack into the repo root.
3. Confirm `AGENTS.md`, `PROJECT_CONTEXT_SHORT.md`, `CODEX_START_HERE.md`, `docs/`, and `examples/` exist.
4. Initialize Git if needed.
5. Commit documentation baseline.
6. Create/push `main` and `local`.

## Done when

- Repo contains the full docs pack.
- `docs/adr/` exists.
- No app code exists unless already scaffolded.
- `main` and `local` exist.
- `PROJECT_CONTEXT_SHORT.md` says the repo is at documentation baseline.

## Suggested commit

```bash
git commit -m "docs: add Reset90 Codex handoff pack"
```

## Codex prompt

```text
Read first:
- AGENTS.md
- PROJECT_CONTEXT_SHORT.md
- CODEX_START_HERE.md

Relevant docs:
- docs/00_PACK_INDEX.md
- docs/10_GIT_WORKFLOW.md
- docs/15_ADR_PROCESS_AND_REASONING.md

Task:
Review the repository documentation foundation only.

Requirements:
- Confirm expected root docs, docs folder, examples folder, and ADRs exist.
- Do not scaffold the application.
- Do not create duplicate ADRs.
- List missing or inconsistent documentation if any.
- Update PROJECT_CONTEXT_SHORT.md with the current repo state.

After implementation:
- summarize findings
- summarize changed files, if any
```

---

# Phase 1 — Stack scaffold

## Goal
Create the initial app shell only.

## Branch
`feature/app-scaffold`

## Source docs

```text
docs/02_SYSTEM_ARCHITECTURE.md
docs/07_ENVIRONMENTS_DEPLOYMENT.md
docs/09_ENGINEERING_BEST_PRACTICES.md
docs/10_GIT_WORKFLOW.md
docs/adr/0002-postgresql-source-of-truth.md
docs/adr/0012-docker-compose-and-traefik-deployment.md
```

## Tasks

1. Scaffold Next.js + TypeScript.
2. Use pnpm.
3. Add Tailwind CSS.
4. Add ESLint + Prettier.
5. Add basic folder structure.
6. Add placeholder home page.
7. Add health endpoint. Prefer `/api/health` if following current API doc; optionally alias `/healthz` later for container checks.
8. Add placeholder readiness endpoint. Prefer `/api/ready` or `/readyz`, but document the chosen path in `PROJECT_CONTEXT_SHORT.md`.
9. Add `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` scripts.
10. Do not add business features.

## Done when

- `pnpm install` works.
- `pnpm dev` works.
- `pnpm lint` works or has documented scaffold-only blockers.
- `pnpm typecheck` works.
- `pnpm build` works.
- Placeholder page renders.
- Health endpoint returns safe minimal JSON.

## Suggested commit

```bash
git commit -m "chore(app): scaffold Next.js application"
```

## Codex prompt

```text
Read first:
- AGENTS.md
- PROJECT_CONTEXT_SHORT.md

Relevant docs:
- docs/02_SYSTEM_ARCHITECTURE.md
- docs/07_ENVIRONMENTS_DEPLOYMENT.md
- docs/09_ENGINEERING_BEST_PRACTICES.md
- docs/10_GIT_WORKFLOW.md
- docs/adr/0002-postgresql-source-of-truth.md
- docs/adr/0012-docker-compose-and-traefik-deployment.md

Task:
Scaffold the application stack only.

Requirements:
- Next.js + TypeScript.
- pnpm.
- Tailwind CSS.
- ESLint + Prettier.
- Simple placeholder page.
- Safe health endpoint.
- Placeholder readiness endpoint if DB is not wired yet.
- No business features.
- No Authentik implementation yet.
- No GPT import endpoint yet.
- Do not create duplicate ADRs.

After implementation:
- run pnpm lint if available
- run pnpm typecheck if available
- run pnpm build if available
- summarize changed files
- summarize assumptions
- update PROJECT_CONTEXT_SHORT.md
```

---

# Phase 2 — Local development environment

## Goal
Make the project reproducible from a clean clone.

## Branch
`chore/local-development-env`

## Source docs/examples

```text
docs/07_ENVIRONMENTS_DEPLOYMENT.md
docs/08_AUTOMATION_AND_SCRIPTS.md
docs/10_GIT_WORKFLOW.md
examples/.env.local.example
examples/docker-compose.local.yml
examples/Makefile
examples/scripts/setup-local.sh
```

## Tasks

1. Add/adapt root `docker-compose.local.yml`.
2. Add local PostgreSQL service.
3. Keep Postgres internal to Docker networks or only bound locally.
4. Add `.env.local.example` or root `.env.example` with safe placeholders.
5. Add `.gitignore` entries for `.env*`, backups, exports, logs, generated docs, and local volumes.
6. Add `Makefile` targets:
   - `make setup-local`
   - `make dev`
   - `make dev-up`
   - `make dev-down`
   - `make logs`
   - `make lint`
   - `make typecheck`
   - `make test`
   - `make build`
   - `make check`
7. Document clean-start setup in `README.md`.

## Done when

- A fresh clone can start local dependencies.
- `.env.local` is not committed.
- `make check` exists.
- README has local setup instructions.

## Suggested commit

```bash
git commit -m "chore(env): add local development environment"
```

## Codex prompt

```text
Read first:
- AGENTS.md
- PROJECT_CONTEXT_SHORT.md

Relevant docs/examples:
- docs/07_ENVIRONMENTS_DEPLOYMENT.md
- docs/08_AUTOMATION_AND_SCRIPTS.md
- docs/10_GIT_WORKFLOW.md
- examples/.env.local.example
- examples/docker-compose.local.yml
- examples/Makefile
- examples/scripts/setup-local.sh

Task:
Create the reproducible local development environment.

Requirements:
- Add root local Docker Compose file based on the example.
- Add local PostgreSQL.
- Add safe env example placeholders only.
- Add .gitignore entries for env files, backups, exports, logs, generated docs, and local volumes.
- Add Makefile targets for setup, dev, logs, lint, typecheck, test, build, and check.
- Document clean-start setup.
- Do not add production deployment yet.
- Do not expose Postgres publicly.

After implementation:
- run documented commands where possible
- summarize changed files
- update PROJECT_CONTEXT_SHORT.md
```

---

# Phase 3 — Database/ORM, migrations, and seed data

## Goal
Build durable data foundation before product UI.

## Branch
`feature/database-foundation`

## Source docs

```text
docs/03_SYSTEM_DESIGN_DATA_MODEL.md
docs/09_ENGINEERING_BEST_PRACTICES.md
docs/adr/0002-postgresql-source-of-truth.md
```

## Tasks

1. Choose Prisma once.
2. If the choice is not already documented, add a lightweight ADR for ORM choice.
3. Add database connection module.
4. Implement migrations for core tables.
5. Seed one active 90-day cycle.
6. Create phases:
   - Days 1-30: Clear the Fog
   - Days 31-60: Rebuild Momentum
   - Days 61-90: Prove Continuation
7. Seed 90 day logs.
8. Add tests for:
   - day number calculation
   - phase calculation
   - active cycle lookup
   - no duplicate day logs
9. Wire readiness endpoint to DB safely.

## Minimum tables

```text
users
reset_cycles
reset_phases
day_logs
imported_payloads
```

## Done when

- Migrations run locally.
- Seed creates one active cycle and 90 days.
- Readiness endpoint checks DB safely.
- Unit tests cover day/phase logic.

## Suggested commit

```bash
git commit -m "feat(db): add reset cycle data model"
```

## Codex prompt

```text
Read first:
- AGENTS.md
- PROJECT_CONTEXT_SHORT.md

Relevant docs:
- docs/03_SYSTEM_DESIGN_DATA_MODEL.md
- docs/09_ENGINEERING_BEST_PRACTICES.md
- docs/adr/0002-postgresql-source-of-truth.md

Task:
Implement the database foundation, migrations, and seed data.

Requirements:
- Choose Prisma once if not already chosen.
- Add a lightweight ADR only if the ORM choice is not already documented.
- Implement users, reset_cycles, reset_phases, day_logs, and imported_payloads first.
- Seed one active 90-day cycle with 3 phases and 90 day logs.
- Add tests for day number and phase calculation.
- Connect readiness endpoint to a safe DB readiness check.
- Do not build product UI yet.

After implementation:
- run migrations locally if possible
- run tests/typecheck
- summarize changed files
- update PROJECT_CONTEXT_SHORT.md
```

---

# Phase 4 — Canonical GPT import schemas and validators

## Goal
Make GPT imports safe before creating the ingest endpoint.

## Branch
`feature/gpt-payload-validation`

## Source docs/examples

```text
docs/04_API_AND_AI_PAYLOAD_CONTRACTS.md
docs/05_CONTEXT_MEMORY_DESIGN.md
docs/adr/0009-custom-gpt-as-coach-webapp-as-dashboard.md
docs/adr/0006-context-summaries-not-chain-of-thought.md
docs/adr/0003-json-schema-import-contracts.md
examples/daily_plan_payload.json
examples/daily_reflection_payload.json
examples/weekly_review_payload.json
```

## Tasks

1. Create canonical schemas in the app, for example:
   - `src/server/imports/schemas/import-envelope.ts`
   - `src/server/imports/schemas/daily-plan.ts`
   - `src/server/imports/schemas/daily-reflection.ts`
   - `src/server/imports/schemas/weekly-review.ts`
   - `src/server/imports/schemas/context-item.ts`
2. Use Zod as runtime boundary validation.
3. Optionally generate or export JSON Schema from Zod if useful for Custom GPT Actions.
4. Add validation script for all example payloads.
5. Add valid and invalid fixture tests.
6. Wire payload validation into `make check`.
7. Do not mutate DB from validators.

## Done when

- All valid example payloads pass.
- Invalid payloads fail clearly.
- `make validate-payloads` or equivalent works.
- `make check` includes payload validation.

## Suggested commit

```bash
git commit -m "feat(import): validate GPT payload contracts"
```

## Codex prompt

```text
Read first:
- AGENTS.md
- PROJECT_CONTEXT_SHORT.md

Relevant docs/examples:
- docs/04_API_AND_AI_PAYLOAD_CONTRACTS.md
- docs/05_CONTEXT_MEMORY_DESIGN.md
- docs/adr/0009-custom-gpt-as-coach-webapp-as-dashboard.md
- docs/adr/0006-context-summaries-not-chain-of-thought.md
- docs/adr/0003-json-schema-import-contracts.md
- examples/daily_plan_payload.json
- examples/daily_reflection_payload.json
- examples/weekly_review_payload.json

Task:
Implement canonical GPT payload validation.

Requirements:
- Use Zod as runtime validation at import boundaries.
- Support daily_plan, daily_reflection, weekly_review, and context summary/item payloads from the API contract.
- Add a script to validate all example payloads.
- Add invalid payload tests.
- Wire validation into make check.
- Do not create the ingest endpoint yet unless needed for tests.
- Do not mutate database state from validators.

After implementation:
- run payload validation
- run tests/typecheck
- summarize changed files
- update PROJECT_CONTEXT_SHORT.md
```

---

# Phase 5 — Raw import storage and idempotency

## Goal
Prepare service-layer import storage before exposing a public machine endpoint.

## Branch
`feature/raw-import-storage`

## Source docs

```text
docs/03_SYSTEM_DESIGN_DATA_MODEL.md
docs/04_API_AND_AI_PAYLOAD_CONTRACTS.md
docs/05_CONTEXT_MEMORY_DESIGN.md
docs/09_ENGINEERING_BEST_PRACTICES.md
docs/adr/0006-context-summaries-not-chain-of-thought.md
docs/adr/0003-json-schema-import-contracts.md
```

## Tasks

1. Complete `imported_payloads` table.
2. Include fields for:
   - source
   - kind
   - schema version
   - idempotency key
   - raw JSON
   - validation status
   - processing status
   - safe error metadata
   - normalized record references if useful
3. Add unique constraint for source + idempotency key.
4. Add service method:
   - validate envelope
   - store raw payload
   - reject or return duplicate idempotently
   - avoid domain mutation for now
5. Add tests for valid raw import, invalid raw import, and duplicate key.

## Done when

- Raw valid import can be stored through service tests.
- Duplicate imports do not duplicate rows.
- Invalid imports do not mutate domain tables.

## Suggested commit

```bash
git commit -m "feat(import): store raw GPT imports idempotently"
```

## Codex prompt

```text
Read first:
- AGENTS.md
- PROJECT_CONTEXT_SHORT.md

Relevant docs:
- docs/03_SYSTEM_DESIGN_DATA_MODEL.md
- docs/04_API_AND_AI_PAYLOAD_CONTRACTS.md
- docs/05_CONTEXT_MEMORY_DESIGN.md
- docs/09_ENGINEERING_BEST_PRACTICES.md
- docs/adr/0006-context-summaries-not-chain-of-thought.md
- docs/adr/0003-json-schema-import-contracts.md

Task:
Implement raw GPT import storage and idempotency service.

Requirements:
- Store raw payloads before normalization.
- Enforce source + idempotency key uniqueness.
- Store validation/processing status and safe error metadata.
- Add tests for valid raw import, duplicate import, and invalid import behavior.
- Do not implement all normalization yet.
- Do not log raw private reflection text.

After implementation:
- run tests/typecheck
- summarize changed files
- update PROJECT_CONTEXT_SHORT.md
```

---

# Phase 6 — GPT ingest endpoint with machine auth

## Goal
Expose the Custom GPT import endpoint safely.

## Branch
`feature/gpt-ingest-endpoint`

## Source docs

```text
docs/02_SYSTEM_ARCHITECTURE.md
docs/04_API_AND_AI_PAYLOAD_CONTRACTS.md
docs/07_ENVIRONMENTS_DEPLOYMENT.md
docs/adr/0004-separate-auth-boundaries.md
docs/adr/0003-json-schema-import-contracts.md
```

## Endpoint

```text
POST /api/gpt/import
```

Headers:

```http
Authorization: Bearer <GPT_INGEST_TOKEN>
Content-Type: application/json
Idempotency-Key: <stable-key>
```

## Tasks

1. Add `GPT_INGEST_TOKEN` to env examples as placeholder only.
2. Implement token validation.
3. Enforce max body size.
4. Validate envelope and payload.
5. Store raw payload.
6. Return clear result.
7. Add basic rate-limit placeholder or simple safe limiter if practical.
8. Add integration tests:
   - missing token
   - bad token
   - valid token
   - invalid payload
   - duplicate idempotency key

## Done when

- Valid example payloads are accepted.
- Bad token is rejected.
- Invalid payload is rejected before domain mutation.
- Duplicate idempotency key is safe.
- Browser Authentik session is not required for this endpoint.

## Suggested commit

```bash
git commit -m "feat(api): add GPT ingest endpoint"
```

## Codex prompt

```text
Read first:
- AGENTS.md
- PROJECT_CONTEXT_SHORT.md

Relevant docs:
- docs/02_SYSTEM_ARCHITECTURE.md
- docs/04_API_AND_AI_PAYLOAD_CONTRACTS.md
- docs/07_ENVIRONMENTS_DEPLOYMENT.md
- docs/adr/0004-separate-auth-boundaries.md
- docs/adr/0003-json-schema-import-contracts.md

Task:
Implement the GPT machine-authenticated ingest endpoint.

Requirements:
- Implement POST /api/gpt/import.
- Use GPT_INGEST_TOKEN bearer auth.
- Enforce max body size.
- Validate envelope and payload.
- Store raw import before normalization.
- Preserve idempotency behavior.
- Do not rely on browser/AuthentiK session for this endpoint.
- Do not log raw private reflection text, cookies, tokens, or DB URLs.

After implementation:
- run integration tests/typecheck
- summarize changed files
- update PROJECT_CONTEXT_SHORT.md
```

---

# Phase 7 — Daily plan normalization

## Goal
Turn valid `daily_plan` imports into day plans and tasks.

## Branch
`feature/daily-plan-normalization`

## Source docs/examples

```text
docs/01_PRODUCT_REQUIREMENTS.md
docs/03_SYSTEM_DESIGN_DATA_MODEL.md
docs/04_API_AND_AI_PAYLOAD_CONTRACTS.md
docs/06_UX_FLOWS.md
docs/adr/0010-minimum-standard-ideal-task-model.md
examples/daily_plan_payload.json
```

## Tasks

1. Add/complete `daily_plans` table.
2. Add/complete `tasks` table.
3. Normalize `daily_plan` imports.
4. Link plan to `day_log` by date/day number.
5. Store mission, supportive message, warnings, downshift rule, and context summary.
6. Store tasks by tier:
   - non-negotiable
   - minimum
   - standard
   - ideal
7. Make re-import deterministic.
8. Add normalization tests.

## Done when

- Example daily plan imports into database.
- Dashboard query can load today’s plan.
- Duplicate import does not duplicate tasks.

## Suggested commit

```bash
git commit -m "feat(import): normalize daily plans into tasks"
```

## Codex prompt

```text
Read first:
- AGENTS.md
- PROJECT_CONTEXT_SHORT.md

Relevant docs/examples:
- docs/01_PRODUCT_REQUIREMENTS.md
- docs/03_SYSTEM_DESIGN_DATA_MODEL.md
- docs/04_API_AND_AI_PAYLOAD_CONTRACTS.md
- docs/06_UX_FLOWS.md
- docs/adr/0010-minimum-standard-ideal-task-model.md
- examples/daily_plan_payload.json

Task:
Normalize daily_plan imports into day plans and tasks.

Requirements:
- Link imported plan to the correct day_log.
- Store mission, supportive message, warnings, downshift rule, and context summary.
- Store tasks grouped by tier and domain.
- Keep raw import linked to normalized records.
- Make repeated imports idempotent.
- Add tests for daily plan normalization.

After implementation:
- run tests/typecheck
- summarize changed files
- update PROJECT_CONTEXT_SHORT.md
```

---

# Phase 8 — Browser authentication with Authentik OIDC

## Goal
Protect the UI while keeping GPT machine ingest auth separate.

## Branch
`feature/authentik-oidc`

## Source docs

```text
docs/02_SYSTEM_ARCHITECTURE.md
docs/04_API_AND_AI_PAYLOAD_CONTRACTS.md
docs/07_ENVIRONMENTS_DEPLOYMENT.md
docs/adr/0004-separate-auth-boundaries.md
```

## Tasks

1. Choose and configure an OIDC/session library for Next.js.
2. Add Authentik OIDC env vars to examples with placeholders.
3. Protect browser UI routes.
4. Keep `/api/gpt/import` protected only by machine token.
5. Add local dev bypass only if safe and clearly documented.
6. Store user identity from Authentik subject.
7. Add logout route if straightforward.
8. Add tests or manual test plan.

## Done when

- UI requires Authentik login in production mode.
- GPT ingest does not require browser session.
- Missing/invalid GPT token still fails.
- Session cookies are secure in production config.

## Suggested commit

```bash
git commit -m "feat(auth): protect UI with Authentik OIDC"
```

## Codex prompt

```text
Read first:
- AGENTS.md
- PROJECT_CONTEXT_SHORT.md

Relevant docs:
- docs/02_SYSTEM_ARCHITECTURE.md
- docs/04_API_AND_AI_PAYLOAD_CONTRACTS.md
- docs/07_ENVIRONMENTS_DEPLOYMENT.md
- docs/adr/0004-separate-auth-boundaries.md

Task:
Implement Authentik OIDC browser authentication.

Requirements:
- Protect browser UI routes.
- Keep GPT ingest machine auth separate.
- Add safe env example placeholders for OIDC settings.
- Use secure cookie/session settings in production.
- Do not add public signup or multi-user account management.
- Document Authentik setup assumptions.

After implementation:
- run lint/typecheck/tests if available
- summarize changed files
- update PROJECT_CONTEXT_SHORT.md
```

---

# Phase 9 — Today Command Center UI

## Goal
Make the app useful: show today’s imported plan and allow action.

## Branch
`feature/today-command-center`

## Source docs

```text
docs/01_PRODUCT_REQUIREMENTS.md
docs/03_SYSTEM_DESIGN_DATA_MODEL.md
docs/06_UX_FLOWS.md
docs/13_INSPIRATIONS.md
docs/adr/0009-custom-gpt-as-coach-webapp-as-dashboard.md
docs/adr/0010-minimum-standard-ideal-task-model.md
```

## Tasks

1. Build app shell/navigation.
2. Build Today Command Center.
3. Show:
   - Day X/90
   - phase
   - day status
   - recovery credits
   - energy level
   - mission
   - supportive message
   - downshift rule
   - non-negotiables
   - minimum/standard/ideal task groups
4. Add task completion API.
5. Add task completion UI.
6. Add energy selector.
7. Keep copy calm and non-shaming.
8. Make mobile layout good enough.

## Done when

- Imported daily plan displays.
- Tasks can be completed/uncompleted.
- Energy can be updated.
- Page works on phone width.
- No harsh failure wording appears.

## Suggested commit

```bash
git commit -m "feat(dashboard): show today command center"
```

## Codex prompt

```text
Read first:
- AGENTS.md
- PROJECT_CONTEXT_SHORT.md

Relevant docs:
- docs/01_PRODUCT_REQUIREMENTS.md
- docs/03_SYSTEM_DESIGN_DATA_MODEL.md
- docs/06_UX_FLOWS.md
- docs/13_INSPIRATIONS.md
- docs/adr/0009-custom-gpt-as-coach-webapp-as-dashboard.md
- docs/adr/0010-minimum-standard-ideal-task-model.md

Task:
Build the Today Command Center UI.

Requirements:
- Display active cycle, Day X/90, phase, current status, and recovery credits.
- Display mission, supportive message, downshift rule, non-negotiables, and tasks grouped by tier.
- Add task completion API and UI.
- Add energy selector.
- Make the UI mobile-friendly.
- Use inspiration patterns without cloning any app.
- Do not add advanced analytics yet.

After implementation:
- run lint/typecheck/tests if available
- summarize changed files
- update PROJECT_CONTEXT_SHORT.md
```

---

# Phase 10 — Check-ins and day state basics

## Goal
Track how the day is going without becoming a full journaling app.

## Branch
`feature/checkins`

## Source docs

```text
docs/01_PRODUCT_REQUIREMENTS.md
docs/03_SYSTEM_DESIGN_DATA_MODEL.md
docs/06_UX_FLOWS.md
```

## Tasks

1. Add/complete `checkins` table.
2. Implement morning/midday/evening/manual check-in API.
3. Track:
   - energy
   - mood
   - fog/clarity
   - self-criticism
   - loneliness
   - digital control/risk
   - learning resistance
   - body relationship
   - work confidence
4. Build simple check-in form.
5. Show latest check-in on dashboard.
6. Add tests for check-in validation.

## Done when

- User can submit a check-in.
- Check-ins link to correct day.
- Check-in data appears on dashboard/day detail.

## Suggested commit

```bash
git commit -m "feat(checkins): add day state tracking"
```

## Codex prompt

```text
Read first:
- AGENTS.md
- PROJECT_CONTEXT_SHORT.md

Relevant docs:
- docs/01_PRODUCT_REQUIREMENTS.md
- docs/03_SYSTEM_DESIGN_DATA_MODEL.md
- docs/06_UX_FLOWS.md

Task:
Implement check-ins and basic day-state tracking.

Requirements:
- Support morning, midday, evening, and manual check-ins.
- Track energy, mood, fog/clarity, loneliness, self-criticism, digital control/risk, learning resistance, body relationship, and work confidence.
- Keep the UI quick and low-friction.
- Do not build a full journaling app.

After implementation:
- run tests/typecheck
- summarize changed files
- update PROJECT_CONTEXT_SHORT.md
```

---

# Phase 11 — Recovery mode and day status calculation

## Goal
Implement the core anti-shame mechanic.

## Branch
`feature/recovery-mode`

## Source docs

```text
docs/01_PRODUCT_REQUIREMENTS.md
docs/03_SYSTEM_DESIGN_DATA_MODEL.md
docs/06_UX_FLOWS.md
docs/adr/0011-recovery-days-instead-of-harsh-streaks.md
```

## Day statuses

```text
GREEN = standard/ideal day
YELLOW = minimum day
BLUE = intentional recovery day
RED = abandoned/no useful reset
GOLD = comeback day
UNSET = not calculated yet
```

## Tasks

1. Add/complete `recovery_events` table.
2. Add `Reset Me Now` flow.
3. Add recovery credit usage.
4. Implement day status calculation rules.
5. Add manual override only if useful.
6. Add no-shame UI copy.
7. Add tests for:
   - minimum day
   - recovery day
   - comeback day
   - recovery credits
   - no restart-from-zero behavior

## Done when

- User can start recovery mode.
- Recovery credit can be consumed.
- Day can become blue.
- Comeback day can become gold.
- Status calculation is tested.
- No UI copy says “failed,” “wasted day,” or “ruined streak.”

## Suggested commit

```bash
git commit -m "feat(recovery): add recovery mode and day statuses"
```

## Codex prompt

```text
Read first:
- AGENTS.md
- PROJECT_CONTEXT_SHORT.md

Relevant docs:
- docs/01_PRODUCT_REQUIREMENTS.md
- docs/03_SYSTEM_DESIGN_DATA_MODEL.md
- docs/06_UX_FLOWS.md
- docs/adr/0011-recovery-days-instead-of-harsh-streaks.md

Task:
Implement recovery mode and day status calculation.

Requirements:
- Add Reset Me Now flow.
- Track recovery credits.
- Implement GREEN/YELLOW/BLUE/RED/GOLD/UNSET statuses.
- Add tests for status calculation and recovery credits.
- Do not implement harsh streaks or restart-from-day-one logic.
- Use calm, non-shaming UI copy.

After implementation:
- run tests/typecheck
- summarize changed files
- update PROJECT_CONTEXT_SHORT.md
```

---

# Phase 12 — 90-day grid and day detail

## Goal
Give visible progress without harsh streak pressure.

## Branch
`feature/ninety-day-grid`

## Source docs

```text
docs/01_PRODUCT_REQUIREMENTS.md
docs/03_SYSTEM_DESIGN_DATA_MODEL.md
docs/06_UX_FLOWS.md
docs/13_INSPIRATIONS.md
docs/adr/0011-recovery-days-instead-of-harsh-streaks.md
```

## Tasks

1. Build 90-day grid.
2. Show each day status.
3. Add click/open day detail.
4. Show day plan, tasks, check-ins, and reflection if present.
5. Show status counts.
6. Show recovery credits remaining.
7. Avoid streak-centered UI.

## Done when

- User sees all 90 days.
- Current day is obvious.
- Past day details are viewable.
- Recovery days look intentional, not like failure.

## Suggested commit

```bash
git commit -m "feat(progress): add 90-day grid"
```

## Codex prompt

```text
Read first:
- AGENTS.md
- PROJECT_CONTEXT_SHORT.md

Relevant docs:
- docs/01_PRODUCT_REQUIREMENTS.md
- docs/03_SYSTEM_DESIGN_DATA_MODEL.md
- docs/06_UX_FLOWS.md
- docs/13_INSPIRATIONS.md
- docs/adr/0011-recovery-days-instead-of-harsh-streaks.md

Task:
Build the 90-day grid and day detail view.

Requirements:
- Show all 90 days with recovery-aware statuses.
- Allow opening a day detail view.
- Show plan, tasks, check-ins, and reflection when available.
- Show status counts and recovery credits.
- Do not center harsh streaks.

After implementation:
- run lint/typecheck/tests if available
- summarize changed files
- update PROJECT_CONTEXT_SHORT.md
```

---

# Phase 13 — Daily reflection import normalization

## Goal
Store daily reflection summaries from GPT without turning the app into a raw thought dump.

## Branch
`feature/daily-reflection-import`

## Source docs/examples

```text
docs/03_SYSTEM_DESIGN_DATA_MODEL.md
docs/04_API_AND_AI_PAYLOAD_CONTRACTS.md
docs/05_CONTEXT_MEMORY_DESIGN.md
docs/adr/0006-context-summaries-not-chain-of-thought.md
examples/daily_reflection_payload.json
```

## Tasks

1. Add/complete `daily_reflections` table.
2. Normalize `daily_reflection` imports.
3. Link reflection to day log and raw import.
4. Store cleaned summaries and structured fields.
5. Keep raw payload in `imported_payloads` but never log it.
6. Show reflection in day detail.
7. Add tests.

## Done when

- Example reflection imports.
- Day detail shows reflection summary.
- Invalid reflections are rejected safely.

## Suggested commit

```bash
git commit -m "feat(import): normalize daily reflections"
```

## Codex prompt

```text
Read first:
- AGENTS.md
- PROJECT_CONTEXT_SHORT.md

Relevant docs/examples:
- docs/03_SYSTEM_DESIGN_DATA_MODEL.md
- docs/04_API_AND_AI_PAYLOAD_CONTRACTS.md
- docs/05_CONTEXT_MEMORY_DESIGN.md
- docs/adr/0006-context-summaries-not-chain-of-thought.md
- examples/daily_reflection_payload.json

Task:
Normalize daily_reflection imports and display them in day detail.

Requirements:
- Store cleaned reflection summaries and structured fields.
- Link reflection to day_log and imported_payload.
- Do not log raw private reflection text.
- Add tests for valid, invalid, and duplicate reflection imports.

After implementation:
- run tests/typecheck
- summarize changed files
- update PROJECT_CONTEXT_SHORT.md
```

---

# Phase 14 — Weekly review import and Reviews page

## Goal
Support GPT-generated weekly reviews and progress summaries.

## Branch
`feature/weekly-reviews`

## Source docs/examples

```text
docs/01_PRODUCT_REQUIREMENTS.md
docs/03_SYSTEM_DESIGN_DATA_MODEL.md
docs/04_API_AND_AI_PAYLOAD_CONTRACTS.md
docs/05_CONTEXT_MEMORY_DESIGN.md
examples/weekly_review_payload.json
```

## Tasks

1. Add/complete `weekly_reviews` table.
2. Normalize weekly review imports.
3. Link to cycle and week number/date range.
4. Build Reviews page.
5. Show summary, wins, blockers, patterns, recommendations, and recovery usage.
6. Add tests.

## Done when

- Example weekly review imports.
- Reviews page displays useful weekly summary.
- Weekly review links back to raw import.

## Suggested commit

```bash
git commit -m "feat(reviews): add weekly review imports"
```

## Codex prompt

```text
Read first:
- AGENTS.md
- PROJECT_CONTEXT_SHORT.md

Relevant docs/examples:
- docs/01_PRODUCT_REQUIREMENTS.md
- docs/03_SYSTEM_DESIGN_DATA_MODEL.md
- docs/04_API_AND_AI_PAYLOAD_CONTRACTS.md
- docs/05_CONTEXT_MEMORY_DESIGN.md
- examples/weekly_review_payload.json

Task:
Normalize weekly_review imports and build the Reviews page.

Requirements:
- Store weekly review linked to cycle and week.
- Display summary, wins, blockers, patterns, recommendations, and recovery usage.
- Link normalized records to imported_payload.
- Add tests.

After implementation:
- run tests/typecheck
- summarize changed files
- update PROJECT_CONTEXT_SHORT.md
```

---

# Phase 15 — Context Memory Library

## Goal
Give the app durable reference memory for future GPT sessions.

## Branch
`feature/context-memory-library`

## Source docs/examples

```text
docs/05_CONTEXT_MEMORY_DESIGN.md
docs/04_API_AND_AI_PAYLOAD_CONTRACTS.md
docs/adr/0006-context-summaries-not-chain-of-thought.md
docs/adr/0013-docs-as-code-codex-memory.md
```

## Tasks

1. Add/complete `context_items` and `context_tags` tables.
2. Support context item creation from imports.
3. Support manual context item creation.
4. Build Context Library page.
5. Add search/filter by:
   - domain
   - kind
   - tag
   - date
   - pinned status
6. Add context item pinning.
7. Add tests.

## Done when

- App stores decisions, summaries, snapshots, and preferences.
- User can search/filter context memory.
- No hidden chain-of-thought storage exists.

## Suggested commit

```bash
git commit -m "feat(context): add context memory library"
```

## Codex prompt

```text
Read first:
- AGENTS.md
- PROJECT_CONTEXT_SHORT.md

Relevant docs:
- docs/05_CONTEXT_MEMORY_DESIGN.md
- docs/04_API_AND_AI_PAYLOAD_CONTRACTS.md
- docs/adr/0006-context-summaries-not-chain-of-thought.md
- docs/adr/0013-docs-as-code-codex-memory.md

Task:
Implement the Context Memory Library MVP.

Requirements:
- Store context summaries, decisions, preferences, weekly snapshots, and cycle reports.
- Support tags and pinned context.
- Add search/filter UI.
- Do not store hidden model chain-of-thought.
- Add tests for context item creation/search.

After implementation:
- run tests/typecheck
- summarize changed files
- update PROJECT_CONTEXT_SHORT.md
```

---

# Phase 16 — Compact GPT context packet export

## Goal
Save tokens and make future GPT sessions easier by exporting compact context packets.

## Branch
`feature/context-packet-export`

## Source docs

```text
docs/05_CONTEXT_MEMORY_DESIGN.md
docs/04_API_AND_AI_PAYLOAD_CONTRACTS.md
docs/12_CODEX_PROMPTS.md
docs/adr/0006-context-summaries-not-chain-of-thought.md
```

## Tasks

1. Add export endpoint for compact GPT context packet.
2. Include:
   - active cycle summary
   - current day
   - last 3 days summary
   - last 7 days metrics
   - active patterns
   - pinned context
   - recovery credits
   - open decisions
3. Validate/export with the same schema logic if practical.
4. Add Markdown export option if quick.
5. Add UI button: “Export GPT context packet.”

## Done when

- User can export compact JSON context.
- Export does not include unnecessary raw thought dumps.
- Export is token-efficient and useful for a Custom GPT prompt.

## Suggested commit

```bash
git commit -m "feat(context): export compact GPT context packet"
```

## Codex prompt

```text
Read first:
- AGENTS.md
- PROJECT_CONTEXT_SHORT.md

Relevant docs:
- docs/05_CONTEXT_MEMORY_DESIGN.md
- docs/04_API_AND_AI_PAYLOAD_CONTRACTS.md
- docs/12_CODEX_PROMPTS.md
- docs/adr/0006-context-summaries-not-chain-of-thought.md

Task:
Implement compact GPT context packet export.

Requirements:
- Export active cycle state, recent summaries, pinned context, key metrics, and recovery state.
- Keep export compact and token-efficient.
- Do not include hidden chain-of-thought or unnecessary raw dumps.
- Validate exported JSON against app schema if practical.

After implementation:
- run tests/typecheck
- summarize changed files
- update PROJECT_CONTEXT_SHORT.md
```

---

# Phase 17 — Analytics MVP

## Goal
Add useful progress visibility without quantified-self overkill.

## Branch
`feature/analytics-dashboard`

## Source docs

```text
docs/01_PRODUCT_REQUIREMENTS.md
docs/06_UX_FLOWS.md
docs/13_INSPIRATIONS.md
docs/adr/0011-recovery-days-instead-of-harsh-streaks.md
```

## Tasks

1. Add Analytics page.
2. Show:
   - status counts
   - recovery credits used/remaining
   - body/mood/digital/learning/work check-in trends
   - week vs previous week basics
   - task completion by domain
3. Keep charts simple.
4. Avoid advanced correlation engines for MVP.

## Done when

- Analytics help user understand progress.
- Page is not overwhelming.
- No embeddings or advanced statistics exist yet.

## Suggested commit

```bash
git commit -m "feat(analytics): add progress overview"
```

## Codex prompt

```text
Read first:
- AGENTS.md
- PROJECT_CONTEXT_SHORT.md

Relevant docs:
- docs/01_PRODUCT_REQUIREMENTS.md
- docs/06_UX_FLOWS.md
- docs/13_INSPIRATIONS.md
- docs/adr/0011-recovery-days-instead-of-harsh-streaks.md

Task:
Build the Analytics MVP.

Requirements:
- Show day status counts, recovery usage, simple domain trends, week-vs-previous-week basics, and task completion by domain.
- Keep charts simple and readable.
- Do not add embeddings, heavy correlation engines, or complicated gamification.

After implementation:
- run lint/typecheck/tests if available
- summarize changed files
- update PROJECT_CONTEXT_SHORT.md
```

---

# Phase 18 — Full export/import MVP

## Goal
Make the user’s data portable before production.

## Branch
`feature/data-export-import`

## Source docs

```text
docs/03_SYSTEM_DESIGN_DATA_MODEL.md
docs/07_ENVIRONMENTS_DEPLOYMENT.md
docs/08_AUTOMATION_AND_SCRIPTS.md
docs/05_CONTEXT_MEMORY_DESIGN.md
```

## Tasks

1. Add full JSON export.
2. Add CSV export for:
   - day logs
   - tasks
   - check-ins
   - reviews if useful
3. Add Markdown export for weekly/final report summaries.
4. Add import from app export only if safe enough.
5. Ensure exports are not logged or publicly served.
6. Add `.gitignore` rules for generated exports.

## Done when

- User can download data.
- Export works locally.
- Export files are ignored by Git.
- Export endpoint requires browser auth.

## Suggested commit

```bash
git commit -m "feat(export): add user data export"
```

## Codex prompt

```text
Read first:
- AGENTS.md
- PROJECT_CONTEXT_SHORT.md

Relevant docs:
- docs/03_SYSTEM_DESIGN_DATA_MODEL.md
- docs/07_ENVIRONMENTS_DEPLOYMENT.md
- docs/08_AUTOMATION_AND_SCRIPTS.md
- docs/05_CONTEXT_MEMORY_DESIGN.md

Task:
Implement data export MVP.

Requirements:
- Add full JSON export.
- Add CSV exports for day logs, tasks, and check-ins.
- Add Markdown export for summaries if practical.
- Ensure exports are private and ignored by Git.
- Do not expose export files through static routes.
- Keep GPT machine token unable to call exports.

After implementation:
- run tests/typecheck
- summarize changed files
- update PROJECT_CONTEXT_SHORT.md
```

---

# Phase 19 — Testing foundation and CI completion

## Goal
Make `main` stay deployable.

## Branch
`chore/ci-and-testing-foundation`

## Source docs/examples

```text
docs/08_AUTOMATION_AND_SCRIPTS.md
docs/09_ENGINEERING_BEST_PRACTICES.md
docs/10_GIT_WORKFLOW.md
examples/.github/PULL_REQUEST_TEMPLATE.md
```

## Tasks

1. Finish unit test setup.
2. Add integration tests for imports and database logic.
3. Add basic UI/component tests if useful.
4. Add CI workflow:
   - install
   - lint
   - typecheck
   - tests
   - build
   - payload validation
   - migration check if practical
5. Add PR template.
6. Add branch protection instructions to README.
7. Ensure `make check` matches CI as closely as practical.

## Done when

- CI passes on pull request.
- `make check` matches CI closely.
- PR template reminds Codex/user to update docs and `PROJECT_CONTEXT_SHORT.md`.

## Suggested commit

```bash
git commit -m "ci: run checks on pull requests"
```

## Codex prompt

```text
Read first:
- AGENTS.md
- PROJECT_CONTEXT_SHORT.md

Relevant docs/examples:
- docs/08_AUTOMATION_AND_SCRIPTS.md
- docs/09_ENGINEERING_BEST_PRACTICES.md
- docs/10_GIT_WORKFLOW.md
- examples/.github/PULL_REQUEST_TEMPLATE.md

Task:
Complete testing foundation and CI.

Requirements:
- Ensure make check runs lint, typecheck, tests, build, and payload validation.
- Add GitHub Actions CI.
- Add or update PR template.
- Add branch protection instructions to README.
- Do not add heavy E2E tests yet unless the app is stable enough.

After implementation:
- run make check locally if possible
- summarize changed files
- update PROJECT_CONTEXT_SHORT.md
```

---

# Phase 20 — Security hardening before production

## Goal
Close major security/privacy gaps before deployment.

## Branch
`fix/security-hardening`

## Source docs

```text
docs/02_SYSTEM_ARCHITECTURE.md
docs/04_API_AND_AI_PAYLOAD_CONTRACTS.md
docs/07_ENVIRONMENTS_DEPLOYMENT.md
docs/09_ENGINEERING_BEST_PRACTICES.md
docs/adr/0004-separate-auth-boundaries.md
docs/adr/0006-context-summaries-not-chain-of-thought.md
```

## Tasks

1. Add security headers.
2. Confirm CSRF protection for browser mutations.
3. Confirm no state-changing GET routes.
4. Confirm GPT endpoint machine auth.
5. Confirm request body limits.
6. Confirm logs redact:
   - tokens
   - cookies
   - DB URL
   - raw reflections
   - sensitive digital-detox text
7. Confirm `.env`, backups, exports, and logs are gitignored.
8. Add basic rate limiting where practical.
9. Add security checklist to docs or README.

## Done when

- Security checklist passes.
- Logs are safe.
- No secret files are tracked.
- Browser and GPT auth boundaries are separate.

## Suggested commit

```bash
git commit -m "fix(security): harden auth and logging boundaries"
```

## Codex prompt

```text
Read first:
- AGENTS.md
- PROJECT_CONTEXT_SHORT.md

Relevant docs:
- docs/02_SYSTEM_ARCHITECTURE.md
- docs/04_API_AND_AI_PAYLOAD_CONTRACTS.md
- docs/07_ENVIRONMENTS_DEPLOYMENT.md
- docs/09_ENGINEERING_BEST_PRACTICES.md
- docs/adr/0004-separate-auth-boundaries.md
- docs/adr/0006-context-summaries-not-chain-of-thought.md

Task:
Perform pre-production security hardening.

Requirements:
- Add security headers.
- Confirm CSRF protection for browser mutations.
- Confirm no state-changing GET routes.
- Confirm GPT machine auth and request size limits.
- Redact sensitive data from logs.
- Confirm .env, backups, exports, and logs are ignored by Git.
- Add rate limiting where practical.

After implementation:
- run tests/typecheck/build
- summarize changed files
- update PROJECT_CONTEXT_SHORT.md
```

---

# Phase 21 — Production Docker Compose and reverse proxy deployment

## Goal
Prepare production deployment using Docker Compose and the user’s existing HTTPS reverse proxy.

## Branch
`chore/production-deployment`

## Source docs/examples

```text
docs/02_SYSTEM_ARCHITECTURE.md
docs/07_ENVIRONMENTS_DEPLOYMENT.md
docs/08_AUTOMATION_AND_SCRIPTS.md
docs/adr/0012-docker-compose-and-traefik-deployment.md
examples/.env.production.example
examples/docker-compose.production.yml
examples/scripts/deploy-production.sh
examples/scripts/healthcheck.sh
```

## Tasks

1. Add production Compose file based on example.
2. Add Dockerfile production build.
3. Keep Postgres internal-only.
4. Add production env example placeholders.
5. Add health checks.
6. Add deploy script.
7. Document required variables:
   - host/domain
   - DB vars
   - OIDC vars
   - GPT token
   - Traefik external network and labels
8. Traefik is already locked in by ADR-0012.

## Done when

- Production Compose config validates.
- App has a production image build.
- DB is not exposed publicly.
- Reverse proxy assumptions are documented.
- Use Traefik for production. Do not add Caddy or Nginx.

## Suggested commit

```bash
git commit -m "chore(deploy): add production Docker Compose workflow"
```

## Codex prompt

```text
Read first:
- AGENTS.md
- PROJECT_CONTEXT_SHORT.md

Relevant docs/examples:
- docs/02_SYSTEM_ARCHITECTURE.md
- docs/07_ENVIRONMENTS_DEPLOYMENT.md
- docs/08_AUTOMATION_AND_SCRIPTS.md
- docs/adr/0012-docker-compose-and-traefik-deployment.md
- examples/.env.production.example
- examples/docker-compose.production.yml
- examples/scripts/deploy-production.sh
- examples/scripts/healthcheck.sh

Task:
Prepare production Docker Compose deployment.

Requirements:
- Add production Dockerfile/build path if missing.
- Add production Compose based on the example.
- Keep Postgres internal-only.
- Add health checks.
- Document required production env vars.
- Document reverse proxy assumptions.
- If implementing Traefik-specific labels, first add a lightweight ADR explaining the decision.
- Do not add Caddy or Nginx unless the user explicitly approves with an ADR.

After implementation:
- run compose config validation if possible
- summarize changed files
- update PROJECT_CONTEXT_SHORT.md
```

---

# Phase 22 — Backup, restore, and disaster recovery

## Goal
Do not deploy without tested backup/restore.

## Branch
`feature/backup-restore`

## Source docs/examples

```text
docs/07_ENVIRONMENTS_DEPLOYMENT.md
docs/08_AUTOMATION_AND_SCRIPTS.md
examples/scripts/backup-db.sh
examples/scripts/restore-db.sh
examples/scripts/export-data.sh
```

## Tasks

1. Add backup script.
2. Add restore script.
3. Add Makefile targets:
   - `make backup`
   - `make restore FILE=...`
   - `make export-data`
4. Add backup/export directory to `.gitignore`.
5. Add backup retention handling.
6. Add restore safety confirmation.
7. Add restore drill instructions.
8. Test restore into local temp DB if practical.

## Done when

- Backup creates a non-empty dump.
- Restore works into a test DB or has a documented dry run blocker.
- Restore drill is documented.
- Production is not considered ready until this passes.

## Suggested commit

```bash
git commit -m "feat(ops): add backup and restore workflow"
```

## Codex prompt

```text
Read first:
- AGENTS.md
- PROJECT_CONTEXT_SHORT.md

Relevant docs/examples:
- docs/07_ENVIRONMENTS_DEPLOYMENT.md
- docs/08_AUTOMATION_AND_SCRIPTS.md
- examples/scripts/backup-db.sh
- examples/scripts/restore-db.sh
- examples/scripts/export-data.sh

Task:
Implement backup, restore, and restore-drill workflow.

Requirements:
- Add safe backup and restore scripts.
- Add Makefile targets.
- Ignore backup/export files in Git.
- Add restore safety confirmation.
- Document monthly restore drill.
- Test restore locally if possible.

After implementation:
- run backup if possible
- run restore into test DB if possible
- summarize changed files
- update PROJECT_CONTEXT_SHORT.md
```

---

# Phase 23 — Observability MVP and operations

## Goal
Make the app operable without overbuilding monitoring.

## Branch
`feature/observability-mvp`

## Source docs/examples

```text
docs/02_SYSTEM_ARCHITECTURE.md
docs/07_ENVIRONMENTS_DEPLOYMENT.md
docs/08_AUTOMATION_AND_SCRIPTS.md
docs/09_ENGINEERING_BEST_PRACTICES.md
examples/scripts/healthcheck.sh
```

## Tasks

1. Confirm health and readiness endpoints.
2. Add structured JSON logs.
3. Add request IDs.
4. Add safe import failure logging.
5. Add Docker health checks.
6. Add basic operations notes for checking app, DB, imports, backups, and disk usage.
7. Do not add Prometheus/Grafana/OpenTelemetry yet unless needed.

## Done when

- You can tell if app, DB, imports, and backups are healthy.
- Logs are useful but privacy-safe.
- Operations notes are current.

## Suggested commit

```bash
git commit -m "feat(ops): add observability basics"
```

## Codex prompt

```text
Read first:
- AGENTS.md
- PROJECT_CONTEXT_SHORT.md

Relevant docs/examples:
- docs/02_SYSTEM_ARCHITECTURE.md
- docs/07_ENVIRONMENTS_DEPLOYMENT.md
- docs/08_AUTOMATION_AND_SCRIPTS.md
- docs/09_ENGINEERING_BEST_PRACTICES.md
- examples/scripts/healthcheck.sh

Task:
Implement observability MVP.

Requirements:
- Ensure health and readiness endpoints work.
- Add structured JSON logs with request IDs.
- Add safe import failure logging.
- Add Docker health checks.
- Add basic operations notes.
- Do not add heavy monitoring stacks yet.

After implementation:
- run tests/typecheck/build
- summarize changed files
- update PROJECT_CONTEXT_SHORT.md
```

---

# Phase 24 — Production dry run

## Goal
Simulate production before touching the real server/domain.

## Branch
`chore/production-dry-run`

## Source docs/examples

```text
docs/07_ENVIRONMENTS_DEPLOYMENT.md
docs/08_AUTOMATION_AND_SCRIPTS.md
docs/09_ENGINEERING_BEST_PRACTICES.md
examples/docker-compose.production.yml
examples/scripts/deploy-production.sh
examples/scripts/healthcheck.sh
```

## Tasks

1. Build production image locally.
2. Run production Compose locally or in a staging folder.
3. Use production-like env values, never real secrets in Git.
4. Confirm:
   - app starts
   - DB migrates
   - Authentik flow is documented/tested
   - GPT import works with token
   - dashboard loads
   - task completion works
   - context export works
   - backup works
   - restore works
   - logs are safe
5. Fix blockers before server deploy.

## Done when

- Production-like run passes locally/staging.
- No secret is committed.
- Restore drill passes once.

## Suggested commit

```bash
git commit -m "chore(deploy): document production dry run"
```

## Codex prompt

```text
Read first:
- AGENTS.md
- PROJECT_CONTEXT_SHORT.md

Relevant docs/examples:
- docs/07_ENVIRONMENTS_DEPLOYMENT.md
- docs/08_AUTOMATION_AND_SCRIPTS.md
- docs/09_ENGINEERING_BEST_PRACTICES.md
- examples/docker-compose.production.yml
- examples/scripts/deploy-production.sh
- examples/scripts/healthcheck.sh

Task:
Perform a production-readiness dry-run review.

Requirements:
- Validate production Docker/Compose configuration.
- Confirm no secrets are committed.
- Confirm DB is internal-only.
- Confirm reverse proxy assumptions are documented.
- Confirm backup/restore has a tested path.
- Confirm logs avoid sensitive data.
- Produce a checklist of remaining blockers.

After implementation:
- run available production config checks
- summarize blockers
- update PROJECT_CONTEXT_SHORT.md
```

---

# Phase 25 — First production deploy

## Goal
Deploy the MVP to the self-hosted server.

## Branch
Release from `local` to `main`; no feature branch unless fixing blockers.

## Human steps

1. Ensure `local` passes `make check`.
2. Merge `local` into `main`.
3. Push `main`.
4. Create production `.env.production` manually on server.
5. Confirm domain/subdomain DNS points to server.
6. Confirm reverse proxy route.
7. Confirm Authentik OIDC client redirect URIs.
8. Confirm `GPT_INGEST_TOKEN` is long/random.
9. Pull repo on server.
10. Start production Compose.
11. Run migrations.
12. Run health checks.
13. Test login.
14. Test GPT import with example payload.
15. Test backup.
16. Test export.
17. Watch logs.

## Done when

- HTTPS works.
- Authentik login works.
- Today dashboard loads.
- GPT import works.
- Backup works.
- DB is not public.
- Logs are safe.

## Suggested release commit/tag

```bash
git tag -a v0.1.0 -m "Reset90 MVP production deploy"
```

## Codex prompt for deployment review

```text
Read first:
- AGENTS.md
- PROJECT_CONTEXT_SHORT.md

Relevant docs:
- docs/07_ENVIRONMENTS_DEPLOYMENT.md
- docs/08_AUTOMATION_AND_SCRIPTS.md
- docs/09_ENGINEERING_BEST_PRACTICES.md

Task:
Review production deployment readiness for the first real deploy.

Requirements:
- Do not change architecture.
- Verify reverse proxy assumptions.
- Verify required env vars are documented.
- Verify backup/restore commands exist.
- Verify security checklist is complete.
- Give exact remaining manual steps for the user.

After implementation:
- summarize deployment blockers
- update PROJECT_CONTEXT_SHORT.md
```

---

# Phase 26 — Post-deploy stabilization

## Goal
Make sure the app remains usable after first real use.

## Branch
`fix/post-deploy-stabilization` or `cleanup/post-deploy-polish`

## First 24 hours

Check:

- app container health
- DB container health
- reverse proxy route
- Authentik login
- GPT import success/failure logs
- backups
- disk usage
- UI on phone
- exports

## First week

Improve only real friction:

- import error UI/history
- missing empty states
- awkward dashboard flow
- backup retention
- context export format
- small analytics gaps
- mobile layout issues

## Do not add yet

- embeddings
- heavy charts
- notification system
- native mobile app
- public accounts
- multi-cycle comparison

## Codex prompt

```text
Read first:
- AGENTS.md
- PROJECT_CONTEXT_SHORT.md

Task:
Perform post-deploy stabilization based on observed issues.

Requirements:
- Fix only the listed production issues.
- Do not add new major features.
- Preserve privacy/security rules.
- Keep main deployable.
- Update docs if operational behavior changes.

Observed issues:
[paste issues here]

After implementation:
- run checks
- summarize changed files
- update PROJECT_CONTEXT_SHORT.md
```

---

# Phase 27 — Day 7 improvements

## Goal
Improve the app after one week of actual use.

## Branch
`cleanup/day-7-polish` or `feature/day-7-improvements`

## Build only from real friction

Ask:

- Was logging too slow?
- Did GPT imports fail?
- Was the dashboard confusing?
- Did recovery mode help?
- Did context export save tokens?
- Were analytics useful or noisy?

## Good Day 7 improvements

- better empty states
- import history page
- small UX polish
- faster check-ins
- better mobile spacing
- clearer recovery display
- one-click context export
- better “what changed this week” view

## Codex prompt

```text
Read first:
- AGENTS.md
- PROJECT_CONTEXT_SHORT.md

Relevant docs:
- docs/06_UX_FLOWS.md
- docs/13_INSPIRATIONS.md

Task:
Implement Day 7 polish based only on actual usage friction.

Observed friction:
[paste real friction]

Requirements:
- Keep changes small.
- Do not add major new modules.
- Do not turn the app into a generic habit tracker.
- Preserve recovery-aware behavior.

After implementation:
- run checks
- summarize changed files
- update PROJECT_CONTEXT_SHORT.md
```

---

# Phase 28 — Day 30 and Day 60 improvements

## Goal
Improve review, analytics, context, and final-report readiness after real use.

## Branch
`feature/phase-review-improvements`

## Day 30 possible improvements

- better Phase 1 summary
- better weekly comparison
- refined context packet
- stronger Day 30 review page
- better repeated-pattern display
- improved task carryover/downshift behavior

## Day 60 possible improvements

- better long-term context summaries
- trend comparison across first 60 days
- refined recovery credit display
- improved work/study/body domain summaries
- better final report data capture

## Do not add unless truly needed

- advanced AI inside the app
- embeddings
- complicated custom dashboards
- calendar integration
- push notifications

## Codex prompt

```text
Read first:
- AGENTS.md
- PROJECT_CONTEXT_SHORT.md

Task:
Implement phase-review improvements based on actual use.

Observed needs:
[paste needs]

Requirements:
- Improve review/analytics/context only where it helps the daily loop.
- Avoid over-engineering.
- Preserve privacy and token efficiency.
- Keep UI simple.

After implementation:
- run checks
- summarize changed files
- update PROJECT_CONTEXT_SHORT.md
```

---

# Phase 29 — Day 90 report and next-cycle planning

## Goal
Finish the 90-day reset with a useful report and a next step.

## Branch
`feature/day-90-report`

## Source docs

```text
docs/01_PRODUCT_REQUIREMENTS.md
docs/03_SYSTEM_DESIGN_DATA_MODEL.md
docs/05_CONTEXT_MEMORY_DESIGN.md
docs/06_UX_FLOWS.md
docs/04_API_AND_AI_PAYLOAD_CONTRACTS.md
```

## Tasks

1. Generate Day 90 report page/export.
2. Include:
   - cycle summary
   - phase summaries
   - status counts
   - recovery usage
   - biggest wins
   - repeated blockers
   - body/mood/digital/learning/work trends
   - context decisions
   - what to continue
   - what to stop
   - next-cycle recommendation
3. Add Markdown export.
4. Add JSON export.
5. Add archive cycle flow.
6. Add start-next-cycle flow only if needed.

## Done when

- Final report can be generated from stored app data.
- Completed cycle is not erased or overwritten.
- Export is available.
- Next-cycle path is clear but not forced.

## Suggested commit

```bash
git commit -m "feat(report): add Day 90 cycle report"
```

## Codex prompt

```text
Read first:
- AGENTS.md
- PROJECT_CONTEXT_SHORT.md

Relevant docs:
- docs/01_PRODUCT_REQUIREMENTS.md
- docs/03_SYSTEM_DESIGN_DATA_MODEL.md
- docs/05_CONTEXT_MEMORY_DESIGN.md
- docs/06_UX_FLOWS.md
- docs/04_API_AND_AI_PAYLOAD_CONTRACTS.md

Task:
Implement the Day 90 report and cycle completion flow.

Requirements:
- Generate a final report from stored app data.
- Include phase summaries, trends, wins, blockers, recovery usage, and next-cycle recommendations.
- Add Markdown/JSON export.
- Keep the tone non-shaming and realistic.
- Do not erase or overwrite the completed cycle.

After implementation:
- run checks
- summarize changed files
- update PROJECT_CONTEXT_SHORT.md
```

---

# 4. Correct MVP finish line

Do not call the MVP done until this loop works:

```text
1. User logs in through Authentik.
2. Custom GPT sends daily_plan JSON to the ingest endpoint.
3. App authenticates machine request.
4. App validates payload.
5. App stores raw import.
6. App normalizes daily plan/tasks.
7. Today Command Center displays the plan.
8. User completes tasks/check-ins.
9. Day status is calculated with recovery-aware logic.
10. 90-day grid updates.
11. GPT sends reflection/weekly review imports.
12. App stores context summaries/decisions/snapshots.
13. User exports compact GPT context packet.
14. User exports full app data.
15. Backup runs.
16. Restore is tested.
17. App runs in production behind HTTPS reverse proxy.
18. Logs are privacy-safe.
```

---

# 5. Recommended first 10 Codex sessions

Use these in order.

## Session 1 — Repository/docs sanity check

```text
Read AGENTS.md, PROJECT_CONTEXT_SHORT.md, and CODEX_START_HERE.md.
Review the docs pack structure. Do not code. Confirm the first implementation task and update PROJECT_CONTEXT_SHORT.md.
```

## Session 2 — Stack scaffold

```text
Scaffold Next.js + TypeScript + pnpm + Tailwind + ESLint/Prettier + health endpoint only. Follow existing ADRs. Do not build business features.
```

## Session 3 — Local dev environment

```text
Create local Compose, env examples, Makefile, and clean-start instructions based on examples/. Do not add production deployment yet.
```

## Session 4 — Database foundation

```text
Implement ORM, migrations, active cycle seed, 3 phases, 90 day logs, and day/phase tests.
```

## Session 5 — GPT payload validation

```text
Implement Zod/JSON Schema-style validation and make payload examples pass. Do not build the ingest endpoint yet.
```

## Session 6 — Raw import/idempotency

```text
Implement raw import storage and idempotency service. No full normalization yet.
```

## Session 7 — GPT ingest endpoint

```text
Implement POST /api/gpt/import with machine bearer token, size limits, validation, raw storage, idempotency, and tests.
```

## Session 8 — Daily plan normalization

```text
Normalize daily_plan imports into daily_plans and tasks. Link raw import to normalized records. Add tests.
```

## Session 9 — Authentik OIDC

```text
Implement Authentik OIDC browser auth. Keep GPT ingest machine auth separate. Do not add public signup.
```

## Session 10 — Today dashboard

```text
Build Today Command Center with active cycle, day/phase, mission, tasks by tier, energy selector, recovery credits, and task completion.
```

---

# 6. What to avoid during implementation

Stop Codex if it starts doing any of this:

```text
Creating a public signup page.
Adding billing/payment/subscription logic.
Adding teams, tenants, roles, organizations, or admin panels.
Adding Kubernetes.
Adding microservices.
Adding a queue before there is a real need.
Adding Caddy or Nginx files. Production reverse proxy must be Traefik unless a future ADR supersedes ADR-0012.
Parsing GPT Markdown instead of validating JSON.
Logging raw reflections or sensitive digital-detox text.
Skipping raw import storage.
Skipping idempotency.
Skipping backups.
Skipping restore testing.
Building advanced analytics before the daily loop works.
Building embeddings/vector search before context summaries work.
Refactoring unrelated files during a small task.
Working directly on main for normal feature work.
Changing accepted ADR decisions without asking.
```

---

# 7. One prompt to use when Codex gets confused

```text
Stop and re-align.

Read:
- AGENTS.md
- PROJECT_CONTEXT_SHORT.md
- CODEX_START_HERE.md
- docs/09_ENGINEERING_BEST_PRACTICES.md
- docs/10_GIT_WORKFLOW.md
- docs/15_ADR_PROCESS_AND_REASONING.md

Current task:
[paste the current small task]

Rules:
- Do not build unrelated features.
- Do not change the architecture.
- Keep the app single-user/private.
- Store raw GPT imports before normalization.
- Validate payloads.
- Keep browser Authentik auth separate from GPT machine auth.
- Do not store hidden chain-of-thought.
- Update PROJECT_CONTEXT_SHORT.md after the task.

Now summarize the correct scope before editing files.
```

---

# 8. One prompt to use before production

```text
Perform a production readiness review.

Read:
- AGENTS.md
- PROJECT_CONTEXT_SHORT.md
- docs/02_SYSTEM_ARCHITECTURE.md
- docs/07_ENVIRONMENTS_DEPLOYMENT.md
- docs/08_AUTOMATION_AND_SCRIPTS.md
- docs/09_ENGINEERING_BEST_PRACTICES.md
- docs/15_ADR_PROCESS_AND_REASONING.md

Check:
- HTTPS through reverse proxy
- Authentik OIDC browser login
- GPT machine ingest token
- DB internal-only
- no secrets in Git
- migrations safe
- backup works
- restore tested
- logs redacted
- health/readiness endpoints work
- CI/make check passes

Output:
- blockers
- warnings
- manual steps
- exact files to review
- whether production deploy is safe
```

---

# 9. ADR rule during implementation

Create a new ADR only when Codex or the user makes a decision that changes:

- architecture
- database/ORM/storage
- authentication/security boundaries
- production deployment/reverse proxy
- GPT import contract
- context memory rules
- recovery/status model
- branch/release workflow

Do not create ADRs for routine implementation details.

ADR reasoning must be user-visible rationale only: context, decision, consequences, alternatives, and review trigger. It must not contain hidden chain-of-thought.
