# Task State

Last updated: 2026-07-07

## Current phase

Phase 3 complete: Prisma/PostgreSQL database foundation, migration, seed data,
cycle logic, and readiness check implemented and verified.

## Active task

No active implementation phase. Await explicit user approval before Phase 4.

## Current branch

```bash
feature/database-foundation
```

## Next actions

1. Review and commit Phase 3 changes.
2. Merge the completed branch into `local` when approved.
3. Await explicit approval before Phase 4.
4. After approval, create `feature/gpt-payload-validation` from `local`.

## Completed

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

- OIDC library: choose after checking current Next.js compatibility during auth phase.
- UI component library: use Tailwind and shadcn/ui-compatible components unless a documented decision changes this.
- Production reverse proxy: Traefik is the documented default; adapt only if the user's server uses something else.

## Session notes

Append short entries with:

```bash
./scripts/update-task-state.sh "what changed; checks run; next step"
```
