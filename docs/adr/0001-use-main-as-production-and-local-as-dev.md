# ADR-0001: Use main as production and local as persistent developer branch

## Purpose
Record the Git branch model so Codex does not replace it with a generic trunk-only or dev-branch workflow.

## Scope
Covers branch roles, merge direction, lifecycle, and exceptions for hotfixes.

## Assumptions
The user explicitly wants `main` to represent production and `local` to remain a persistent developer-only branch unless stated otherwise.

## Success Criteria
Codex creates feature/fix/refactor/cleanup/chore/docs branches from `local`, merges them back to `local`, and only promotes `local` to `main` for production-ready releases.

## Deliverables
Accepted branch architecture and reasoning.

## Status
Accepted

## Date
2026-07-06

## Context

Many modern projects use trunk-based development with short-lived branches merging directly into `main`. That is a good default for teams, but it conflicts with the requested Reset90 workflow.

The user wants:

- `main` as production;
- `local` as persistent developer-only branch;
- short-lived branches for feature, cleanup, fix, refactor, chore, and docs work.

## Decision

Use this branch model:

```text
main   = production branch
local  = persistent developer-only integration/WIP branch
feature/<slug>  -> branch from local, merge to local
fix/<slug>      -> branch from local, merge to local
refactor/<slug> -> branch from local, merge to local
cleanup/<slug>  -> branch from local, merge to local
chore/<slug>    -> branch from local, merge to local
docs/<slug>     -> branch from local, merge to local
```

Production releases merge from `local` into `main` only after checks pass.

Hotfix exception:

```text
main -> fix/<slug> -> main -> local
```

## ADR Reasoning

This preserves a clean production branch while allowing the user to keep a stable local integration line for Codex-driven development. It is slightly less standard than pure GitHub Flow, but it matches the user's mental model and reduces accidental production changes.

## Consequences

Benefits:

- production state is easy to identify;
- Codex has a clear branch creation rule;
- WIP can collect safely on `local`;
- release promotion is explicit.

Tradeoffs:

- `local` can drift if not regularly synced;
- extra merge discipline is required;
- docs must remind Codex not to branch from `main` for ordinary work.

## Alternatives Considered

- Direct GitHub Flow into `main`: rejected because user asked for persistent `local`.
- Git Flow with `develop`, `release`, and `hotfix` branches: rejected as too heavy for solo private app.

## Implementation Notes

- Keep branch helper script in `examples/scripts/create-branch.sh`.
- Add branch rules to README, AGENTS.md, and Git workflow docs.
- Mention relevant ADR in release/merge PRs.

## Review Trigger

Review if more developers join the project or if deployment automation makes `local` unnecessary.
