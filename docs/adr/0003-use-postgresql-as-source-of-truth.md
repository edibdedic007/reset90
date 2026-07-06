# ADR-0003: Use PostgreSQL as source of truth

## Purpose
Record the database decision for durable app data, imports, analytics, and future retrieval.

## Scope
Covers primary storage, migrations, backups, and optional embedding support.

## Assumptions
The user wants self-hosting, export/import, structured analytics, and durable context memory.

## Success Criteria
Reset90 stores core data in PostgreSQL with migrations and backup/restore scripts.

## Deliverables
Accepted data storage architecture and reasoning.

## Status
Accepted

## Date
2026-07-06

## Context

Reset90 needs durable storage for 90-day cycles, daily plans, task completions, reflections, imported GPT payloads, decision logs, analytics, and optional retrieval memory.

## Decision

Use PostgreSQL as the source of truth.

Use an ORM/migration layer such as Prisma or Drizzle. The implementation may choose the ORM during repository foundation, but PostgreSQL remains the primary database.

## ADR Reasoning

PostgreSQL is reliable, self-hosting friendly, works well with Docker Compose, supports structured relational data, supports JSON fields for raw GPT payloads, and can later support embeddings through extensions if needed.

## Consequences

Benefits:

- durable app state;
- strong relational model for analytics;
- easy backup/restore;
- future path for vector retrieval;
- production-ready from the start.

Tradeoffs:

- slightly heavier than SQLite;
- migrations must be maintained;
- production backup discipline is required.

## Alternatives Considered

- SQLite: good for local-only apps, but less aligned with production self-hosting and future analytics.
- Files/Markdown only: simple but weak for dashboards, filtering, and analytics.
- External SaaS database: rejected because the app should stay private/self-hosted.

## Implementation Notes

- Add local and production Postgres services in Docker Compose examples.
- Create backup/restore scripts.
- Store raw imported payloads as JSON before normalization.
- Use migrations for every schema change.

## Review Trigger

Review only if the project becomes strictly local-only or if operational constraints make PostgreSQL impractical.
