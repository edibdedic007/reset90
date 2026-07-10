# Codex Start Here

## Purpose

Human-readable entry point for using Codex CLI on Reset90 without loading the
full documentation pack.

## Normal start

```bash
make session
```

Then have Codex read only:

1. `AGENTS.md`
2. `.codex/generated/session_context.md`

`make session` refreshes the generated packet first. Do not separately load
`PROJECT_CONTEXT_SHORT.md`, `docs/state/TASK_STATE.md`, or
`docs/state/SESSION_LOG.md` because their relevant content is already included
in that packet.

## Phase work

Read one phase without opening the 2,700-line roadmap:

```bash
make phase PHASE=11
```

Then read only the task-relevant docs named by that phase or selected through
`docs/00_PACK_INDEX.md`.

## Before editing

Codex should state:

- the exact requested scope;
- expected files to create or modify;
- relevant ADRs;
- focused checks and final quality gate;
- explicit non-goals for the session.

## Before completion

```bash
make check
make update-task-state MSG="summary; checks run; next step"
git status --short --branch
```

Run `make check` once after the final implementation edits. If it passes, do not
run it again unless more code or configuration changes are made.

## Large and generated files

Do not read or commit:

- `ALL_FILES_READY_TO_SAVE.md` (generate on demand with `make docs-bundle`);
- `codex-*.jsonl` or other session transcripts;
- `.next/`, `node_modules/`, coverage, exports, backups, or logs;
- full lockfiles or generated schemas unless the task specifically requires them.

## ADR rule

For changes to architecture, auth, data/storage, deployment, GPT integration,
context memory, Git workflow, or core product behavior, use
`docs/state/DECISIONS_INDEX.md` to locate only the relevant accepted ADR. If the
planned change conflicts with it, stop and ask the user.
