# ADR 0007: Use Prisma ORM

## Status

Accepted

## Context

Reset90 needs typed PostgreSQL access and a migration workflow inside its Next.js modular monolith. Existing architecture docs allow Prisma or Drizzle but do not select one.

## Decision

Use Prisma ORM for schema management, migrations, and typed database access. Keep PostgreSQL as the source of truth. Database models and runtime connection wiring are deferred to the database scaffold task.

## Consequences

The app gets one documented schema and migration workflow with generated TypeScript types. Database access will depend on Prisma tooling and its PostgreSQL adapter.

## Alternatives considered

Drizzle ORM. It offers a lighter SQL-oriented API, but Prisma's schema and migration workflow is a better fit for this small single-service app and its planned Codex-driven implementation.
