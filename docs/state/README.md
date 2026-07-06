# Operational State Files

## Purpose

Give Codex CLI short, mutable project-state files that survive across sessions without forcing it to reread the full documentation pack.

## Scope

- Use these files for current implementation status, session notes, incidents, and decision indexing.
- Use `docs/adr/` for durable architecture decisions.
- Use `PROJECT_CONTEXT_SHORT.md` as the highest-level current context.

## Rules

- Keep state files short and factual.
- Update `TASK_STATE.md` after meaningful work.
- Append session notes to `SESSION_LOG.md` or use `./scripts/update-task-state.sh`.
- Do not store raw private journal dumps, production data, secrets, or hidden chain-of-thought.
- If a state note reveals a durable decision, create or update an ADR.
