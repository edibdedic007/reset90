# ADR Index

## Purpose
Index Reset90 Architecture Decision Records and define the ADR reading rules for Codex CLI.

## Scope
Lists accepted ADRs, status meanings, and when Codex must read or create ADRs.

## Assumptions
Reset90 is a private single-user self-hosted app, but it still needs lightweight architectural memory because implementation will happen across multiple Codex sessions.

## Success Criteria
Codex can quickly locate the relevant decision record before changing architecture, data, auth, deployment, GPT integration, Git workflow, or core product behavior.

## Deliverables
ADR index, accepted decision list, and update rules.

## Reading rule

Read this file before architecture, deployment, database, auth, AI integration, context memory, Git workflow, or core product behavior work.

Accepted ADRs are implementation constraints. Do not contradict them without asking the user first.

## Accepted ADRs

| ADR | Decision | Status |
|---|---|---|
| ADR-0001 | Use a modular monolith | Accepted |
| ADR-0002 | PostgreSQL is the source of truth | Accepted |
| ADR-0003 | Use JSON Schema for GPT import contracts | Accepted |
| ADR-0004 | Separate browser auth and GPT ingest auth | Accepted |
| ADR-0005 | Use an observability ladder | Accepted |
| ADR-0006 | Store context summaries, not hidden chain-of-thought | Accepted |
| ADR-0007 | Use Prisma ORM | Accepted |
| ADR-0008 | Use `main` as production and `local` as persistent developer branch | Accepted |
| ADR-0009 | Custom GPT is the coach; webapp is dashboard/storage | Accepted |
| ADR-0010 | Use minimum/standard/ideal task tiers | Accepted |
| ADR-0011 | Use recovery days instead of harsh streak failure | Accepted |
| ADR-0012 | Use Docker Compose and Traefik for local/production deployment | Accepted |
| ADR-0013 | Use docs-as-code and Codex handoff docs as project memory | Accepted |

## Status definitions

- `Accepted`: current implementation rule.
- `Proposed`: discuss or confirm before implementing.
- `Superseded`: do not follow; read the replacement ADR.
- `Deprecated`: avoid for new work.
- `Rejected`: considered and intentionally not used.

## Update rule

If implementation requires contradicting an accepted ADR, stop and ask the user. Do not silently rewrite the architecture.

If a durable new architecture, product, security, deployment, data, or workflow decision is made, create a new ADR from `docs/adr/TEMPLATE.md`.
