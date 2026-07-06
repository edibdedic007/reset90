# ADR 0013: Use Docs-as-Code and Codex Handoff Docs as Project Memory

## Status
Accepted

## Context
Reset90 is being built through many Codex CLI sessions. Without stable docs, Codex may forget scope, duplicate decisions, or overbuild features.

## Decision
Keep product requirements, architecture, data model, API contracts, ADRs, implementation order, prompts, and operational guidance as Markdown docs in the repo. `AGENTS.md`, `PROJECT_CONTEXT_SHORT.md`, and `CODEX_START_HERE.md` are the high-frequency Codex context files. `ALL_FILES_READY_TO_SAVE.md` is archival and should not be read during normal implementation.

## Consequences
Codex can work with concise reusable context and update project state as implementation progresses. Documentation becomes part of the engineering workflow, not a separate afterthought. The user must keep `PROJECT_CONTEXT_SHORT.md` current after meaningful work.

## Alternatives considered
Relying on chat history only, storing all context in a single giant document, or keeping no project memory. Rejected because they waste tokens and make Codex less reliable across sessions.
