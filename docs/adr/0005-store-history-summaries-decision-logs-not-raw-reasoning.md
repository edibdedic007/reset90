# ADR-0005: Store history, summaries, and decision logs; do not require raw internal reasoning

## Purpose
Define concrete context storage while avoiding hidden chain-of-thought requirements.

## Scope
Covers conversation history, task summaries, decision logs, context snapshots, optional embeddings, and prohibited raw internal reasoning storage.

## Assumptions
The user wants conversational and thinking context to be easy to reference later, but the app must not require raw internal reasoning logs.

## Success Criteria
Reset90 stores user-visible context records and optional retrieval indexes, not private hidden reasoning.

## Deliverables
Accepted context storage boundary and reasoning.

## Status
Accepted

## Date
2026-07-06

## Context

The app should remember useful context over time: conversations, task summaries, decisions, plans, reflections, weekly reviews, and reasoning summaries. However, hidden internal reasoning logs are not required and should not be requested or stored.

## Decision

Store:

- conversation history entered/imported by the user;
- GPT payloads;
- task summaries;
- decision logs;
- user-visible reasoning summaries or rationale summaries;
- daily/weekly context snapshots;
- optional embeddings-based retrieval records.

Do not require or design for raw hidden internal chain-of-thought storage.

## ADR Reasoning

The app needs durable reference memory, not private model scratchpads. User-visible summaries are more useful, safer, easier to export, and less sensitive than raw reasoning traces.

## Consequences

Benefits:

- concrete long-term memory for the app;
- less privacy risk;
- easier export/import;
- compatibility with GPT-generated summaries;
- avoids misleading “AI thinking log” semantics.

Tradeoffs:

- summaries may omit detail;
- retrieval quality depends on summary quality and tagging;
- embeddings add later complexity if implemented.

## Alternatives Considered

- Store full raw chain-of-thought: rejected.
- Store only daily checkboxes: rejected because the app needs richer context.
- Store only Markdown files: rejected for analytics and querying.

## Implementation Notes

- Tables may include `conversation_entries`, `context_items`, `decision_logs`, `summary_snapshots`, and `embedding_records`.
- Field names such as `reasoning_summary` must mean user-visible rationale only.
- Exports must include summaries and decisions in readable format.

## Review Trigger

Review if built-in model API usage is added and new privacy boundaries are needed.
