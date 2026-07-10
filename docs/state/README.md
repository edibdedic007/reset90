# Operational State Files

## Purpose

Keep current Codex handoff state small while preserving history outside the
normal session context.

## Files

- `TASK_STATE.md`: current phase, active task, next actions, required checks, and
  one latest handoff only.
- `SESSION_LOG.md`: append-only chronological session summaries.
- `COMPLETED_PHASES.md`: detailed completed-phase archive; do not load during
  normal implementation.
- `DECISIONS_INDEX.md`: lookup table for accepted ADRs.
- `INCIDENTS.md`: operational incidents when they exist.

## Rules

- Keep `TASK_STATE.md` under roughly 60 lines.
- Never append historical completion details to `TASK_STATE.md`.
- `make update-task-state MSG="..."` replaces the latest handoff in
  `TASK_STATE.md` and appends the same entry to `SESSION_LOG.md`.
- Use `PROJECT_CONTEXT_SHORT.md` for compact durable project facts, not a
  changelog.
- Do not store secrets, private data, generated transcripts, or hidden
  chain-of-thought.
- Promote durable decisions to an ADR instead of repeating them in state files.
