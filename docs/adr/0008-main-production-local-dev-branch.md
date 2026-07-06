# ADR 0008: Use main as Production and local as Persistent Developer Branch

## Status
Accepted

## Context
The user wants a simple but explicit Git workflow where `main` represents production and `local` is a persistent developer-only integration branch. Codex may otherwise default to generic trunk-based or GitHub Flow assumptions.

## Decision
Use `main` as the production branch. Use `local` as the persistent developer-only branch for integrating completed work before production release. Use short-lived branches from `local` for normal work: `feature/<slug>`, `cleanup/<slug>`, `fix/<slug>`, `refactor/<slug>`, `chore/<slug>`, and `docs/<slug>`. Emergency production fixes may branch from `main`, then merge back into both `main` and `local`.

## Consequences
The workflow matches the user's preference and gives Codex a stable place for development work without treating every local experiment as production-ready. It is slightly less standard than pure trunk-based development, so documentation and branch hygiene matter.

## Alternatives considered
Pure trunk-based development directly on `main`, Git Flow with `develop` and release branches, and only local unpushed branches. Rejected because they either conflict with the user's requested model or add unnecessary complexity.
