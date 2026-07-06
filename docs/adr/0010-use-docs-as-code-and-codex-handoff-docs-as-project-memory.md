# ADR-0010: Use docs-as-code and Codex handoff docs as project memory

## Purpose
Record the documentation strategy that lets Codex use concise reusable files instead of long chat context.

## Scope
Covers docs-as-code, AGENTS.md, PROJECT_CONTEXT_SHORT.md, implementation docs, ADRs, and generated bundles.

## Assumptions
The user wants Codex CLI to work efficiently with structured reusable documentation and reduced token usage.

## Success Criteria
Project documentation lives in the repo, stays concise, and is updated with meaningful implementation changes.

## Deliverables
Accepted documentation architecture and reasoning.

## Status
Accepted

## Date
2026-07-06

## Context

Codex CLI works better when it can read concise, stable files instead of repeated long chat transcripts. Reset90 needs durable instructions for product scope, architecture, implementation phases, branch rules, and ADRs.

## Decision

Use docs-as-code as Codex's project memory.

Core files:

- `AGENTS.md`: standing agent instructions;
- `PROJECT_CONTEXT_SHORT.md`: compact current state;
- `CODEX_START_HERE.md`: startup reading order;
- `docs/`: product, architecture, API, UX, environment, automation, Git, implementation, ADRs;
- `ALL_FILES_READY_TO_SAVE.md`: human backup/export, not normal Codex input.

## ADR Reasoning

This creates stable, versioned context that Codex can reference across sessions. It reduces token usage and prevents the app direction from depending on one long chat.

## Consequences

Benefits:

- token-efficient Codex workflow;
- decisions are versioned with code;
- onboarding is easier;
- documentation can be reviewed in PRs.

Tradeoffs:

- docs must be maintained;
- stale docs can mislead Codex;
- generated all-in-one bundles should not be used for routine Codex work.

## Alternatives Considered

- Chat-only context: rejected as fragile and inefficient.
- One giant spec file: rejected as high-token and hard to target.
- No docs until after implementation: rejected because Codex needs clear constraints.

## Implementation Notes

- Update `PROJECT_CONTEXT_SHORT.md` after meaningful changes.
- Keep ADRs short and current.
- Regenerate `ALL_FILES_READY_TO_SAVE.md` after doc changes.
- Do not ask Codex to load every doc unless performing a full audit.

## Review Trigger

Review if Codex workflow changes or if the repo grows enough to need a docs site.
