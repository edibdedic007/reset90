# Task State

Last updated: 2026-07-06

## Current phase

Handoff pack prepared. App implementation has not started unless the actual repo shows otherwise.

## Active task

Start with Phase 0 from `docs/16_BEST_IMPLEMENTATION_ORDER.md`: repository foundation, docs import, ADR verification, and initial baseline commit.

## Suggested first branch

```bash
make new-work TYPE=feature SLUG=repo-foundation
```

## Next actions

1. Import this pack into the empty repo.
2. Run `make session` and `make context`.
3. Create/use `local` as developer-only integration branch.
4. Create `feature/repo-foundation` from `local`.
5. Commit documentation baseline and operational scripts.
6. Scaffold Next.js + TypeScript only after Phase 0 is clean.
7. Update this file after each meaningful session.

## Completed

- Product requirements documented.
- Architecture/system design documented.
- Data model and API/GPT payload contracts documented.
- Context memory design documented.
- Environments and deployment rules documented.
- Automation examples promoted to root operational scripts.
- ADR process and accepted ADR baseline included.
- Git workflow and engineering practices documented.

## Open questions for Codex to resolve only when needed

- Package manager: prefer `pnpm` unless repo constraints indicate otherwise.
- OIDC library: choose after checking current Next.js compatibility during auth phase.
- UI component library: use Tailwind and shadcn/ui-compatible components unless a documented decision changes this.
- Production reverse proxy: Traefik is the documented default; adapt only if the user's server uses something else.

## Session notes

Append short entries with:

```bash
./scripts/update-task-state.sh "what changed; checks run; next step"
```
