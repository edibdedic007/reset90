# 05 - Context Memory Design

    ## Purpose
    Define how Reset90 stores conversational and thinking context without requiring raw hidden reasoning logs.

    ## Scope
    - Conversation history, task summaries, decision logs, daily/weekly summaries, context snapshots, optional embeddings-based retrieval.
- Rules for what may and may not be stored.
- Context export and context pack generation for Custom GPT/Codex handoff.

    ## Assumptions
    - The app should become the durable source of truth across many Custom GPT chats.
- The user will often speak or type messy reflections into GPT, which then sends structured summaries.
- The app stores summaries and decisions, not private chain-of-thought.
- Embeddings are optional and should not block MVP.

    ## Success Criteria
    - Future GPT/Codex sessions can retrieve key decisions and patterns.
- Context is searchable, taggable, and exportable.
- Sensitive logs are not exposed unnecessarily.
- No raw internal reasoning is required.

    ## Deliverables
    - Context item taxonomy.
- Storage rules.
- Retrieval rules.
- Context pack generation strategy.
- Embeddings optional plan.

    ## Concrete definition of stored context

Reset90 should store:

1. Conversation history provided by the user or imported as visible transcript/summary.
2. Task summaries.
3. Decision logs.
4. Daily summaries.
5. Weekly summaries.
6. Context snapshots.
7. User-visible reasoning summaries/rationales.
8. Optional embeddings for retrieval over the above.

Reset90 must not require:

- raw internal chain-of-thought;
- hidden model reasoning traces;
- private scratchpad logs;
- unrestricted full prompt logs if summaries are sufficient.

## Context item fields

Recommended fields:

```text
id
cycle_id
day_log_id nullable
weekly_review_id nullable
kind
title
summary
source_ref
importance 1-5
tags_json
created_at
updated_at
```

Optional:

```text
embedding_id
expires_at
is_sensitive
```

## Context kinds

| Kind | Meaning |
|---|---|
| conversation | User-visible conversation or a summary of it. |
| task_summary | Summary of a completed implementation/life task. |
| decision_log | Explicit decision and why it was made, in user-visible form. |
| daily_summary | Daily reflection summary. |
| weekly_summary | Weekly review summary. |
| context_snapshot | Condensed state for future planning. |
| reasoning_summary | Short visible rationale, not hidden chain-of-thought. |

## Retrieval strategy

MVP retrieval:

- filter by date range;
- filter by kind;
- filter by tags;
- sort by importance and recency;
- full-text search over title/summary.

Optional later retrieval:

- embeddings over `title + summary + tags`;
- semantic search for patterns;
- hybrid full-text + vector retrieval.

## Context pack generation

Add a function/script/API that can generate a compact context pack for GPT/Codex:

```text
Current cycle summary
Active phase
Last 7 days summaries
Open decisions
Important recurring patterns
Recovery usage
Current blockers
Next recommended actions
```

Output formats:

- Markdown for humans/ChatGPT;
- JSON for programmatic import;
- optional clipped version under a token/character budget.

## Privacy rules

- Mark sensitive context items.
- Do not show sensitive full text in logs.
- Export must include sensitive items because the user owns the data.
- UI should let user delete individual context items.
- Backups should be treated as sensitive.
