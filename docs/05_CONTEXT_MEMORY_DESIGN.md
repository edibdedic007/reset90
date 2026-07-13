# 05 - Context Memory Design

## Purpose

Define how Reset90 stores curated user-visible context without raw hidden
reasoning logs.

## Phase 15 scope

Phase 15 stores explicitly imported or manually created summaries, decisions,
preferences, snapshots, and reports. It provides active-cycle relational
storage, tags, safe provenance, search, exact filters, bounded results, and
pinning.

The app stores summaries and decisions, not private chain-of-thought. Semantic
retrieval and automatic context construction remain deferred.

## Stored context

Reset90 may store:

1. User-visible conversation summaries.
2. Task summaries.
3. Decisions, with an optional concise visible rationale inside the summary.
4. Preferences scoped to the current reset cycle.
5. Daily summaries.
6. Weekly snapshots.
7. Cycle reports.
8. Context snapshots.

Reset90 does not store through this model:

- raw internal chain-of-thought or hidden reasoning traces;
- private scratchpad logs;
- unrestricted full prompts;
- raw conversations or complete journal dumps;
- tool traces, authentication data, or processing errors.

## Context item fields

```text
id
cycle_id
kind
domain
title
summary
source_type
imported_payload_id nullable
source_ref nullable
pinned_at nullable
created_at
updated_at
```

Every item belongs to exactly one reset cycle. The server derives ownership,
active cycle, provenance, timestamps, and initial pin state. Imported items link
to one raw payload; manual items never do.

Tags live only in relational `context_tags` rows. Each row stores one bounded
display name and a case-insensitive normalized name. Whitespace is trimmed,
blank tags are rejected, and one item may contain only one row per normalized
tag.

## Context kinds

| Kind | Meaning |
|---|---|
| `CONVERSATION_SUMMARY` | User-visible conversation summary. |
| `TASK_SUMMARY` | Summary of a completed implementation or life task. |
| `DECISION` | Explicit decision; summary may include a concise visible rationale. |
| `PREFERENCE` | Active-cycle preference recorded explicitly by the user. |
| `DAILY_SUMMARY` | Explicit daily summary. |
| `WEEKLY_SNAPSHOT` | Explicit weekly snapshot. |
| `CYCLE_REPORT` | Explicit cycle report. |
| `CONTEXT_SNAPSHOT` | Condensed active-cycle state. |

Every item also has exactly one existing `FocusDomain` value.

## Retrieval strategy

Phase 15 retrieval provides:

- literal case-insensitive substring search over title and summary;
- exact domain, kind, normalized tag, and pin-state filters;
- inclusive UTC creation-date filters;
- AND semantics across supplied filters;
- pinned items first, then creation time and stable ID descending;
- fixed bounded keyset pages.

The library reads the authenticated user's one active cycle only. No active
cycle returns a neutral state and disables creation. Raw imports are never a
fallback when normalized context is absent.

## Provenance and privacy

Every item is either `MANUAL` or `IMPORT`. Imported items reference the raw
payload that created them. Manual items cannot reference a raw import. Browser
data may show only the safe provenance type, optional safe source reference,
and creation date.

- Do not show summaries or raw imports in operational logs or safe errors.
- Browser data exposes only normalized bounded fields and safe provenance.
- Raw JSON, prompts, authentication, processing state/errors, and ownership IDs
  stay behind trusted server boundaries.
- Backups containing context must be treated as sensitive.

## Phase 16 export scope

Phase 16 can generate one compact `gpt_context_packet` version `1.0` JSON file
on demand from the authenticated user's one active Reset Cycle. The packet is
read-only, deterministic apart from its generation timestamp, runtime-validated,
and bounded to current/recent cycle days, seven-day metrics, the newest stored
weekly patterns, pinned context, canonical recovery state, and explicitly tagged
open decisions.

Packet assembly uses explicit normalized-field allowlists. It never persists a
packet, reads raw imports as fallback, exports internal or ownership IDs, sends
data to a GPT, or includes hidden reasoning, private notes, detailed narratives,
prompts, or transcripts. Missing normalized concepts remain null or empty.

## Deferred after Phase 16

- embeddings, vector storage, semantic/fuzzy/hybrid search, and RAG;
- automatic retrieval, prompt assembly, or generated context packs;
- Markdown export, direct GPT submission, packet history, caching, or schedules;
- automatic summary, snapshot, or report generation and historical backfill;
- review/reflection conversion, cross-cycle memory, or preference application;
- edit, delete, archive, bulk, version, detail-route, analytics, or tag-admin
  flows.
