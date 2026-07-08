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

- production: Authentik OIDC session;
- local: `AUTH_MODE=dev` can create a local development user.

GPT ingest:

- `Authorization: Bearer <GPT_INGEST_TOKEN>` for MVP;
- `Idempotency-Key` header matching the envelope `idempotency_key`;
- optional HMAC signature later;
- no export/delete/admin permissions.

## Endpoint overview

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/health` | none | Health check. |
| GET | `/api/dashboard/today` | user | Current day dashboard data. |
| POST | `/api/gpt/import` | GPT token | Import daily plan/reflection/weekly review/context payload. |
| POST | `/api/checkins` | user | Create manual check-in. |
| PATCH | `/api/tasks/:id` | user | Complete/skip/update task. |
| POST | `/api/recovery/start` | user | Start recovery mode for a day. |
| GET | `/api/analytics/90-day` | user | Grid and trends. |
| GET | `/api/context` | user | List/search context items. |
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
  "day_status_recommendation": "yellow",
  "summary": "User-visible summary.",
  "scores": {
    "mood": 5,
    "fog": 7,
    "loneliness": 6,
    "self_criticism": 5,
    "digital_control": 4,
    "learning_resistance": 7,
    "body_relationship": 5,
    "work_confidence": 5
  },
  "what_happened": "Text.",
  "what_worked": ["Text"],
  "what_blocked_me": ["Text"],
  "tomorrow_adjustment": "Text.",
  "self_criticism_note": "Text.",
  "context_items": []
}
```

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

## Context item rules

Context payloads may include:

- `conversation` history summary;
- `task_summary`;
- `decision_log`;
- `daily_summary`;
- `weekly_summary`;
- `context_snapshot`;
- `reasoning_summary` as a user-visible rationale only.

Do not request or store raw hidden internal reasoning logs.

Canonical standalone context imports use `kind: "context_item"` and this
payload shape:

```json
{
  "kind": "reasoning_summary",
  "title": "Why the minimum plan counts",
  "summary": "User-visible rationale only.",
  "importance": 4,
  "tags": ["minimum", "continuity"],
  "source_ref": "optional-visible-source-reference",
  "is_sensitive": false
}
```

## Response examples

Created:

```json
{
  "ok": true,
  "status": "created",
  "imported_payload_id": "uuid"
}
```

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

HTTP status behavior:

| Status | Meaning |
|---|---|
| `201` | Raw import created. |
| `200` | Duplicate key; existing import returned. |
| `400` | Invalid JSON or missing/mismatched idempotency header. |
| `401` | Missing or invalid GPT bearer token. |
| `413` | Body exceeds `GPT_INGEST_MAX_BODY_BYTES`. |
| `415` | Content type is not JSON. |
| `422` | Canonical envelope or payload validation failed. |
| `429` | Process-local authenticated request cap exceeded. |
| `503` | Token/DB service configuration is unavailable. |
