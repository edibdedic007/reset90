# Task State

Last updated: 2026-07-08

## Current phase

Phase 8 complete: browser authentication with Authentik OIDC protects the UI
while GPT ingest remains on separate machine-token auth.

## Active task

No active implementation phase. Await explicit user approval before Phase 9.

## Current branch

```bash
feature/authentik-oidc
```

## Next actions

1. Review and commit Phase 8 changes.
2. Merge the completed branch into `local` when approved.
3. Await explicit approval before Phase 9.

## Completed

- Auth.js (`next-auth`) provides browser session handling with the Authentik
  OIDC provider in `AUTH_MODE=oidc`.
- Browser routes are protected through Next proxy/auth callbacks; `/api/gpt/import`
  remains outside browser auth and still requires the dedicated GPT bearer token.
- `AUTH_MODE=dev` creates or updates a single local development user with
  `authentik_subject=local-dev-user`.
- Production examples use `AUTH_SECRET`, `AUTH_AUTHENTIK_ID`,
  `AUTH_AUTHENTIK_SECRET`, `AUTH_AUTHENTIK_ISSUER`, and
  `AUTH_TRUST_HOST=true`; production env checks enforce the required keys.
- Auth config and user persistence tests cover auth mode defaults, OIDC env
  validation, public GPT ingest boundary, secure-cookie rules, and user upsert.
- `make check` passed outside the restricted sandbox: frozen dependency install,
  formatting, lint, typecheck, 52 tests, payload/schema drift validation,
  production build, Prisma validation, shell syntax, and whitespace checks.
- `.env.local.example` and `.env.production.example` pass `scripts/env-check.sh`
  with the Phase 8 auth variable names.
- `daily_plans` and `tasks` persist the normalized plan, raw import link,
  supportive content, warnings, task tier/domain, execution fields, and order.
- Daily plans resolve an active `day_log` by exact date, day number, and phase;
  unmatched targets mark the raw import `FAILED` with safe bounded metadata.
- Same raw imports are no-ops after processing; new same-day imports replace the
  plan and full task set transactionally instead of accumulating duplicates.
- The GPT endpoint normalizes a newly stored daily plan and returns
  `normalized_records`; pending duplicates safely retry normalization.
- Daily plan `warnings` are optional in the canonical contract and normalize to
  an empty list when omitted; generated JSON Schemas remain current.
- Phase 7 migration applied locally. Live example smoke created 10 ordered
  tasks, loaded the plan through its raw import relation, then removed all
  temporary plan/import/task rows and restored prior Day 1 text.
- `make check` passed outside the restricted sandbox: formatting, lint,
  typecheck, 44 tests, payload/schema drift validation, production build,
  Prisma validation, shell syntax, and whitespace checks.
- `POST /api/gpt/import` authenticates only with the dedicated
  `GPT_INGEST_TOKEN`; browser Authentik sessions are not required.
- Authenticated requests require JSON and a matching `Idempotency-Key` header,
  stream through `GPT_INGEST_MAX_BODY_BYTES`, and receive safe status-specific
  responses.
- Valid imports return HTTP 201, duplicates return the existing import with HTTP
  200, and invalid canonical payloads return HTTP 422 without domain mutation.
- The endpoint uses a basic 60-request/minute process-local limiter with
  `Retry-After`; shared limiting remains deferred unless deployment scales out.
- Route integration tests cover missing/bad tokens, valid storage, invalid
  payloads, duplicate keys, body limits, idempotency mismatch, and rate limiting.
- `make check` passed outside the restricted sandbox: formatting, lint,
  typecheck, 37 tests, payload/schema drift validation, production build, Prisma
  validation, shell syntax, and whitespace checks.
- `storeRawImport` validates canonical envelopes and persists raw JSON before
  any normalized domain mutation.
- Valid imports use `VALID/PENDING`; identifiable invalid imports use
  `INVALID/REJECTED` with bounded safe issue metadata.
- `(source, idempotency_key)` is unique in Prisma and PostgreSQL; duplicate and
  concurrent requests return the existing import reference.
- Context payload persistence now uses the canonical `CONTEXT_ITEM` enum value.
- Prisma migration tracking includes the Phase 3 baseline and Phase 5 schema
  migration; both migrations are applied locally.
- Live DB smoke verified valid, invalid, and duplicate storage while reset cycle
  and day log counts remained `1` and `90`; temporary rows were removed.
- `make check` passed: formatting, lint, typecheck, 27 tests, payload/schema
  drift validation, production build, Prisma validation, shell syntax, and
  whitespace checks.
- Zod 4.4 validates strict `1.0` import envelopes for daily plans, daily
  reflections, weekly reviews, and context items.
- Payload schemas enforce day ranges, task-group tiers, score ranges, supported
  context kinds, bounded text/list fields, and no unknown properties.
- User-visible `reasoning_summary` context is supported; hidden
  `chain_of_thought` fields are rejected.
- Draft 2020-12 JSON Schemas are generated from the runtime Zod source and
  committed under root `schemas/`.
- `make validate-payloads` validates all three canonical example envelopes and
  detects generated-schema drift.
- Valid/invalid import fixtures have unit coverage without database mutation or
  an ingest endpoint.
- `make check` passed: frozen dependency install, format, lint, typecheck, 22
  tests, payload/schema validation, production build, Prisma validation, shell
  syntax checks, and whitespace check.
- Prisma 7.8 and the PostgreSQL driver adapter provide typed database access.
- Initial migration creates `users`, `reset_cycles`, `reset_phases`,
  `day_logs`, and `imported_payloads` with relational/uniqueness constraints.
- Idempotent seed creates one active cycle, 3 canonical phases, and 90 unique
  day logs; two consecutive seed runs preserve those counts.
- UTC day-number, phase selection, active-cycle lookup, and unique seed logic
  have unit coverage.
- `GET /api/ready` performs a safe database query and returns HTTP 200/503.
- Local PostgreSQL starts through Docker Compose from root configuration.
- PostgreSQL host port binds only to `127.0.0.1:5432`.
- `make setup-local` installs locked pnpm dependencies and waits for database
  readiness.
- `make dev`, `make dev-up`, `make dev-down`, and `make logs` provide local
  lifecycle commands.
- Root README and environment docs describe clean-clone setup.
- Local Compose validation, setup/readiness, dependency lifecycle targets, and
  `make check` passed.
- Phase 1 Next.js 16 App Router, TypeScript, Tailwind CSS, pnpm, ESLint,
  Prettier, and Vitest scaffold created.
- Placeholder home page added without business features.
- `GET /api/health` returns safe minimal JSON with HTTP 200.
- `GET /api/ready` reports database not configured with HTTP 503.
- Format, lint, typecheck, unit tests, production build, and live route smoke
  checks passed.
- Phase 0 repository/docs baseline verified.
- `main`, `local`, and `feature/repo-foundation` branch roles confirmed.
- Canonical 13-file ADR baseline verified; conflicting legacy duplicate-number ADRs removed.
- Root docs, full docs pack, examples, operational scripts, and state files verified.
- `make check`, whitespace, inventory, ADR uniqueness, and example JSON syntax checks passed.
- Product requirements documented.
- Architecture/system design documented.
- Data model and API/GPT payload contracts documented.
- Context memory design documented.
- Environments and deployment rules documented.
- Automation examples promoted to root operational scripts.
- ADR process and accepted ADR baseline included.
- Git workflow and engineering practices documented.

## Open questions for Codex to resolve only when needed

- UI component library: use Tailwind and shadcn/ui-compatible components unless a documented decision changes this.
- Production reverse proxy: Traefik is the documented default; adapt only if the user's server uses something else.

## Session notes

Append short entries with:

```bash
./scripts/update-task-state.sh "what changed; checks run; next step"
```
