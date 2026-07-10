# 18 - Operational Overlay

## Purpose

Describe the repository helpers that keep repeated Codex CLI sessions focused,
reproducible, and token-efficient.

## Normal Codex loop

```bash
make session
# Codex reads AGENTS.md and .codex/generated/session_context.md
make phase PHASE=<number>
# implement one scoped task
make check
make update-task-state MSG="summary; checks run; next step"
```

`make session` refreshes the generated context packet automatically. Running
`make context` separately is only necessary after state changes when a full
session restart is not desired.

## Context design

High-frequency context is intentionally split by responsibility:

- `AGENTS.md`: stable standing rules, including token and skill controls.
- `PROJECT_CONTEXT_SHORT.md`: compact durable project facts and current boundary.
- `docs/state/TASK_STATE.md`: current task only.
- `docs/state/SESSION_LOG.md`: history, of which only the latest three entries
  enter the generated packet.
- `.codex/generated/session_context.md`: generated working tree + compact project
  context + current task; it does not duplicate `AGENTS.md`.

The generated packet excludes full ADR indexes, full file inventories, the full
phase roadmap, examples, lockfiles, generated schemas, archives, and exports.

## Phase retrieval

`docs/16_BEST_IMPLEMENTATION_ORDER.md` remains the source of truth but should not
be loaded in full. Retrieve one section with:

```bash
make phase PHASE=11
```

## Generated artifacts

`ALL_FILES_READY_TO_SAVE.md` is generated only when explicitly needed:

```bash
make docs-bundle
```

It is ignored by Git. Codex session transcripts such as `codex-*.jsonl` are also
ignored and must not be committed.

## Skill and validation controls

- Graphify is loaded only for an explicitly requested visual deliverable.
- Subagents remain available for bounded parallel work; scope them narrowly
  and avoid redundant whole-repository audits.
- Browser automation and optional tool installation require task relevance or
  explicit user approval.
- Use focused checks during implementation and one final `make check` after the
  last meaningful edit.
