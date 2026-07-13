# 04 - API and AI Payload Contracts

    ## Purpose
    Define API endpoints and Custom GPT payload contracts so Codex can implement imports consistently.

    ## Scope
    - MVP REST-style API contract.
- Custom GPT daily plan, reflection, weekly review, and context payloads.
- Validation, idempotency, and auth rules.

    ## Assumptions
    - Custom GPT Actions can POST JSON to a public HTTPS endpoint.
- GPT endpoint uses machine auth separate from user/browser auth.
- Zod or equivalent validates payloads.
- All raw payloads are stored before normalization.

    ## Success Criteria
    - GPT can safely import data without duplicate records.
- Malformed payloads are rejected and saved as failed imports if useful.
- Browser API cannot be accessed with GPT ingest token.
- Payload examples validate in CI.

    ## Deliverables
    - Endpoint list.
- Auth rules.
- Payload schemas.
- Example responses.
- OpenAPI guidance.

    ## Auth model

Browser UI:

- production: Auth.js session backed by Authentik OIDC;
- local: `AUTH_MODE=dev` creates or updates a local development user;
- OIDC mode requires `AUTH_SECRET`, `AUTH_AUTHENTIK_ID`,
  `AUTH_AUTHENTIK_SECRET`, `AUTH_AUTHENTIK_ISSUER`, and
  `AUTH_TRUST_HOST=true` in production.

GPT ingest:

- `Authorization: Bearer <GPT_INGEST_TOKEN>` for MVP;
- `GPT_INGEST_OWNER_SUBJECT` associates that machine principal with one trusted
  application owner for daily-reflection and weekly-review normalization;
- `Idempotency-Key` header matching the envelope `idempotency_key`;
- optional HMAC signature later;
- no export/delete/admin permissions.

## Endpoint overview

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/health` | none | Health check. |
| GET | `/api/dashboard/today` | user | Current day dashboard data. |
| POST | `/api/gpt/import` | GPT token | Import daily plan/reflection/weekly review/context payload. |
| POST | `/api/checkins` | user | Create current-day state check-in. |
| PATCH | `/api/tasks/:id` | user | Complete or uncomplete a task. |
| PATCH | `/api/dashboard/today/energy` | user | Update current day energy level. |
| POST | `/api/recovery/start` | user | Start recovery mode for a day. |
| PATCH | `/api/recovery/actions` | user | Persist incomplete recovery actions. |
| POST | `/api/recovery/complete` | user | Complete current-day recovery actions. |
| GET | `/api/analytics/90-day` | user | Grid and trends. |
| GET | `/api/context` | user | List/search context items. |
| POST | `/api/context` | user | Manually create an active-cycle context item. |
| PATCH | `/api/context/:id/pin` | user | Idempotently pin or unpin owned context. |
| GET | `/api/export/full` | user | Full JSON export. |
| POST | `/api/import/full` | user | Full JSON import/restore helper, optional. |

## Shared GPT envelope

All GPT imports use:

```json
{
  "kind": "daily_plan",
  "schema_version": "1.0",
  "idempotency_key": "2026-07-01-day-1-morning-plan-v1",
  "source": "custom_gpt",
  "external_conversation_id": "chatgpt-project-reset90-main",
  "payload": {}
}
```

Rules:

- `kind` determines payload schema.
- Supported import kinds are `daily_plan`, `daily_reflection`, `weekly_review`,
  and `context_item`.
- Current `schema_version` is exactly `1.0`; unsupported versions are rejected.
- `idempotency_key` is required and unique within its `source`.
- Unknown envelope and payload fields are rejected.
- Store full raw JSON in `imported_payloads.raw_json`.
- If the same source and idempotency key arrive again, return `200` with the existing import reference, not a hard error.
- Reject bodies over `GPT_INGEST_MAX_BODY_BYTES`.
- Require `Content-Type: application/json`.
- Reject missing or mismatched `Idempotency-Key` headers before storage.

Canonical runtime schemas live in `src/server/imports/schemas/`. Committed Draft
2020-12 JSON Schemas live in `schemas/` and are generated from those Zod
definitions with `pnpm run generate:schemas`; do not hand-edit generated files.
`make validate-payloads` validates all canonical examples and checks generated
schema drift. Files under `examples/schemas/` remain pack-era references; use
root `schemas/` for implementation and Custom GPT Action contracts.

Phase 5 provides the service-layer `storeRawImport` boundary. It stores valid
raw envelopes before normalization, stores identifiable invalid envelopes with
safe validation metadata, and returns an existing import for duplicate
`(source, idempotency_key)` values. Invalid inputs without trustworthy envelope
metadata are rejected without a database write. No API endpoint or normalized
domain mutation is part of this phase.

Phase 6 exposes `POST /api/gpt/import` with dedicated bearer-token auth; it does
not use or require a browser Authentik session. The route streams and caps the
body before JSON parsing, validates the canonical envelope, then delegates raw
storage to `storeRawImport`. It applies a basic process-local cap of 60
authenticated requests per minute and returns `429` with `Retry-After` when the
cap is exceeded. This limiter is a single-instance safety guard; production
hardening may replace it with a shared limiter if deployment becomes
multi-instance.

Phase 7 normalizes valid `daily_plan` imports after raw storage. The plan must
match one active `day_log` by date, day number, and phase. Successful daily plan
responses include `normalized_records`; a safe normalization mismatch returns
`422 normalization_error` with the retained raw import reference. Repeating an
already processed import does not recreate tasks. A pending duplicate is safe
to retry through normalization.

Phase 9 exposes browser-session APIs for the Today Command Center.
`GET /api/dashboard/today` returns the signed-in user's active cycle, current
UTC day, imported daily plan, grouped tasks, energy, status, and recovery credit
summary. `PATCH /api/tasks/:id` accepts `{ "completed": boolean }` and only
updates tasks belonging to the signed-in user's active cycle. Completing a task
sets `completed_at` and clears `skipped_at`; uncompleting clears
`completed_at`. `PATCH /api/dashboard/today/energy` accepts
`{ "energyLevel": EnergyLevel | null }` and updates today's `day_logs` row.
These browser APIs do not accept `GPT_INGEST_TOKEN`.

Phase 10 adds browser-session `POST /api/checkins`. The server links each entry
to the signed-in user's active-cycle current UTC day; callers cannot choose a
user, day, or timestamp. Creation also updates `day_logs.energy_level` in the
same database transaction. `GET /api/dashboard/today` now includes the latest
check-in or `null`, even when no daily plan exists.

Phase 11 adds browser-session `POST /api/recovery/start` and
`POST /api/recovery/complete`, plus `PATCH /api/recovery/actions`. All derive signed-in user, active cycle, and
current UTC day server-side. Start is idempotent and returns the existing event
for that day. Actions persists partial valid selections while an event is
incomplete; completed events reject edits. Complete accepts only configured action IDs and requires at least
three actions including physical/basic and forward-facing coverage. Completion,
derived credit consumption, and day-status persistence share one transaction;
repeating completion returns the immutable completed event without consuming
another credit. Completion returns authoritative used/remaining credit values.
Browser recovery APIs never accept `GPT_INGEST_TOKEN`.

Check-in request:

```json
{
  "kind": "MANUAL",
  "energyLevel": "LOW",
  "mood": 6,
  "fog": 4,
  "loneliness": 3,
  "selfCriticism": 4,
  "digitalControl": 7,
  "learningResistance": 5,
  "bodyRelationship": 6,
  "workConfidence": 6,
  "note": "One short optional note."
}
```

`kind` is `MORNING`, `MIDDAY`, `EVENING`, or `MANUAL`. All eight scores are
required integers from 1 through 10. `energyLevel` uses the canonical
`EnergyLevel` enum. `note` is optional, nullable, and limited to 500
characters. Unknown fields are rejected. Successful creation returns `201`
with the created check-in; invalid input returns `400` with
`invalid_checkin_payload`; a missing current active day returns `404` with
`today_not_found`. This endpoint requires browser auth and does not accept the
GPT ingest token.

Phase 8 protects browser UI routes with Auth.js and Authentik OIDC in
`AUTH_MODE=oidc`. `AUTH_MODE=dev` keeps local browser access available by
persisting a single `local-dev-user`. `/api/gpt/import` remains outside browser
session auth and still requires only the dedicated GPT bearer token plus the
idempotency header.

## Daily plan payload

Fields inside `payload`:

```json
{
  "date": "2026-07-01",
  "day_number": 1,
  "phase": "Clear the Fog",
  "energy_level": "normal",
  "mission": "Interrupt drift with one body action, one focus action, and one reflection.",
  "supportive_message": "Today does not need to repay yesterday.",
  "warnings": ["If energy falls, use the minimum plan."],
  "downshift_rule": "If energy drops, switch to minimum plan.",
  "non_negotiables": [],
  "minimum_plan": [],
  "standard_plan": [],
  "ideal_plan": [],
  "context_summary": "Short user-visible context summary."
}
```

Each task object:

```json
{
  "title": "Stretch or walk for 10 minutes",
  "domain": "body",
  "tier": "minimum",
  "estimate_minutes": 10,
  "trigger": "After breakfast",
  "why": "Rebuild body activation without pressure."
}
```

## Daily reflection payload

Fields inside `payload`:

```json
{
  "date": "2026-07-01",
  "day_number": 1,
  "phase": "Clear the Fog",
  "day_status_recommendation": "yellow",
  "summary": "User-visible summary.",
  "what_happened": "Text.",
  "what_worked": "Text.",
  "what_blocked_me": "Text.",
  "tomorrow_adjustment": "Text.",
  "self_criticism_note": "Text."
}
```

`date`, `day_number`, and `summary` are required. `phase`, the four narrative
fields, `self_criticism_note`, and `day_status_recommendation` are optional.
Summary and narrative fields are trimmed and limited to 1,500 characters;
`self_criticism_note` is limited to 1,000. Blank optional text normalizes to
`null`. Unknown fields, ownership identifiers, nested metadata, transcripts,
and arrays are rejected. Unicode and multiline plain text remain valid.

The server resolves the configured owner, that owner's active cycle, and the
matching non-future UTC day. Date, day number, and optional phase must agree.
Normalization and the raw import's successful processing state share one
transaction. Processing locks the raw import and target day in PostgreSQL. Exact
retries converge on one normalized write without changing its timestamps. For
different same-day imports, the newer stored raw import (`createdAt`, then ID)
deterministically owns the one current normalized reflection while preserving
its creation time.

A raw import marked `PROCESSED` is terminally successful. Reprocessing it is a
no-op even when a newer import replaced its normalized reflection or accepted
cascade behavior removed that reflection. Historical raw imports remain
`PROCESSED`; they are neither failed nor replayed automatically.

Only normalized summary/narrative fields and timestamps may enter authenticated
day-detail data. Raw JSON, processing metadata, owner identifiers, and
`day_status_recommendation` never enter the browser DTO. The recommendation is
stored advisory data only and cannot alter canonical status or recovery state.
Analytics remain deferred after Phase 15. `GPT_INGEST_OWNER_SUBJECT` is required
when a `DAILY_REFLECTION`, `WEEKLY_REVIEW`, or `CONTEXT_ITEM` reaches
normalization. Daily-plan dispatch is unchanged. Phase 15 context imports
normalize only their explicit bounded context payload; weekly review snapshots
are not automatically promoted.

## Weekly review payload

Fields inside `payload`:

```json
{
  "week_number": 1,
  "date_from": "2026-07-01",
  "date_to": "2026-07-07",
  "summary": "Week summary.",
  "wins": [],
  "blockers": [],
  "patterns": [],
  "recommended_changes": [],
  "next_week_commitments": [],
  "metrics": {},
  "context_snapshot": {}
}
```

Phase 14 rules:

- the server resolves exactly one active cycle from the trusted owner;
- `week_number` is cycle-relative, from 1 through 13;
- supplied dates must equal the canonical cycle week, with week 13 ending on
  cycle day 90;
- a review is accepted only after its canonical week has completed in UTC;
- one normalized review exists per cycle/week, linked to one immutable raw
  import;
- exact processed retries are terminal no-ops;
- newer same-week imports replace normalized approved content transactionally,
  using stored import creation time then ID as the deterministic ordering;
- lists and `metrics` remain bounded structured JSON in source order;
- `metrics.recovery_credits_used` is an imported review snapshot, never the
  canonical recovery-credit balance;
- the accepted `context_snapshot` remains in the immutable raw contract but is
  not normalized, displayed, or promoted into context behavior during Phase 14;
- normalization never changes plans, tasks, check-ins, reflections, energy,
  recovery records, credits, or day statuses.

Successful new weekly-review normalization returns
`normalized_records: ["weekly_review"]`. Ownership and normalization failures use
sanitized codes and never expose raw payload contents or configured identifiers.

## Context item rules

Canonical standalone context imports use `kind: "context_item"` and this
payload shape:

```json
{
  "kind": "DECISION",
  "domain": "WORK",
  "title": "Why the minimum plan counts",
  "summary": "User-visible rationale only.",
  "tags": ["minimum", "continuity"],
  "source_ref": "optional-visible-source-reference"
}
```

Accepted `kind` values are `CONVERSATION_SUMMARY`, `TASK_SUMMARY`, `DECISION`,
`PREFERENCE`, `DAILY_SUMMARY`, `WEEKLY_SNAPSHOT`, `CYCLE_REPORT`, and
`CONTEXT_SNAPSHOT`. `domain` uses the closed `FocusDomain` enum. Title is 1-160
trimmed characters, summary is 1-4,000, source reference is at most 500, and up
to 10 tags may each contain 1-40 trimmed characters. Unknown fields and enum
values are rejected. Tags are trimmed and deduplicated case-insensitively while
preserving one display value.

Machine imports require the GPT bearer boundary. Raw storage precedes trusted
owner/active-cycle resolution. Normalized item, relational tags, and successful
processing state are one transaction protected by raw-import and cycle locks.
An exact retry returns the existing terminal result; a different idempotency
identity may create a separate similar item. Imported provenance links to the
raw payload, but raw JSON and processing metadata never enter browser data.

Authenticated `GET /api/context` supports case-insensitive literal substring
search over title and summary plus exact domain, kind, normalized tag, pinned
state, and inclusive UTC creation-date filters. Filters combine with AND
semantics. Results use bounded keyset pagination ordered by pinned state,
creation time descending, then ID descending. Invalid filters return bounded
validation details.

Authenticated `POST /api/context` accepts only the payload fields shown above;
the server assigns user, active cycle, manual provenance, timestamps, and
initial unpinned state. `PATCH /api/context/:id/pin` accepts only a boolean
`pinned` field. Missing and unowned valid UUIDs return the same safe idempotent
success and never disclose existence.

Browser DTOs contain only ID, title, summary, kind, domain, display tags, safe
provenance/source reference, pin timestamp, and created/updated timestamps. No
raw JSON, owner/cycle identifiers, prompts, tool traces, processing metadata,
internal errors, or hidden reasoning are included.

## Response examples

Created:

```json
{
  "ok": true,
  "status": "created",
  "imported_payload_id": "uuid",
  "normalized_records": ["daily_plan", "tasks"]
}
```

For a normalized daily reflection, `normalized_records` is
`["daily_reflection"]`.

For a normalized context item, `normalized_records` is `["context_item"]`.

Duplicate:

```json
{
  "ok": true,
  "status": "duplicate",
  "imported_payload_id": "uuid"
}
```

Validation error:

```json
{
  "ok": false,
  "error": "validation_error",
  "details": []
}
```

Normalization error:

```json
{
  "ok": false,
  "error": "normalization_error",
  "code": "day_log_not_found",
  "imported_payload_id": "uuid"
}
```

HTTP status behavior:

| Status | Meaning |
|---|---|
| `201` | Raw import created. |
| `200` | Duplicate key; existing import returned. |
| `400` | Invalid JSON or missing/mismatched idempotency header. |
| `401` | Missing or invalid GPT bearer token. |
| `413` | Body exceeds `GPT_INGEST_MAX_BODY_BYTES`. |
| `415` | Content type is not JSON. |
| `422` | Canonical validation failed, or normalization could not resolve its trusted active-cycle target. |
| `429` | Process-local authenticated request cap exceeded. |
| `503` | Token/DB service configuration is unavailable. |
