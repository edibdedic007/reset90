# 18 - Operational Overlay

## Purpose

Document the operational additions that turn the v5 planning pack into an empty-repo starter pack without duplicating the full product/architecture docs.

## Scope

- Root-level scripts, Makefile, environment examples, GitHub templates, and Codex context helpers.
- Mutable state files under `docs/state/`.
- Token-efficient generated context under `.codex/generated/`.

## Assumptions

- `docs/` remains the source of truth for product, architecture, ADRs, and implementation order.
- Root operational files exist to make Codex faster and safer during repeated sessions.
- The app implementation may not exist yet.

## Success Criteria

- Codex can run `make session` and `make context` before editing.
- Codex can create proper branches with `make new-work TYPE=feature SLUG=<slug>`.
- Codex can run `make check` even before all app scripts exist.
- Codex has a place to store task state without bloating ADRs or product docs.

## Deliverables

- Root `Makefile` with session/context/check/environment/deployment helpers.
- Root `scripts/` with repeatable operations.
- Root `.github/` with CI and PR/issue templates.
- Root env and compose examples.
- `docs/state/` operational memory.

## How this improves the v5 pack

The original v5 pack was strong as documentation and ADR guidance. This overlay adds repo-operational behavior from the previous pack:

- runnable root scripts instead of scripts only under `examples/`;
- compact generated context to reduce token usage;
- mutable task/session state files for cross-session continuity;
- root CI, PR template, env examples, and Makefile for immediate empty-repo setup;
- stricter branch helper that respects `main` as production and `local` as developer integration;
- quality and production checks that degrade safely before the app is scaffolded.

## Normal Codex loop

```bash
make session
make context
make new-work TYPE=feature SLUG=<task-slug>
# implement small task
make check
make update-task-state MSG="summary; checks run; next step"
git add -A
git commit -m "feat(scope): short summary"
```

## Token rule

Use `.codex/generated/session_context.md` as the short session packet. Do not read `ALL_FILES_READY_TO_SAVE.md` unless the user specifically asks for a full backup/export review.
