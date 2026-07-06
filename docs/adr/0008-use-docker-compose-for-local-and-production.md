# ADR-0008: Use Docker Compose for local and production deployment

## Purpose
Record the environment/deployment decision for repeatable self-hosted development and production.

## Scope
Covers local developer-only environment, production live environment, Compose files, env files, backups, and health checks.

## Assumptions
The user wants self-hosting, local and production environment separation, and automation scripts.

## Success Criteria
Local and production environments are defined separately and runnable through Docker Compose-based workflows.

## Deliverables
Accepted deployment approach and reasoning.

## Status
Accepted

## Date
2026-07-06

## Context

Reset90 should run on the user's server and be easy to develop locally. The stack includes a webapp and PostgreSQL, with possible reverse proxy/Auth/OIDC in production.

## Decision

Use Docker Compose for both local and production deployment definitions.

Local environment:

- developer-only;
- uses local env file;
- may use dev auth mode;
- optimized for iteration.

Production environment:

- live environment;
- uses production env file/secrets;
- requires Authentik/OIDC;
- must support backup/restore and health checks.

## ADR Reasoning

Docker Compose is enough for a private single-user self-hosted app. It avoids Kubernetes overhead while still giving reproducible deployment and service definitions.

## Consequences

Benefits:

- simple self-hosting;
- consistent local/prod service layout;
- easy backups;
- easy Codex script generation.

Tradeoffs:

- less scalable than Kubernetes;
- production host security and backup discipline matter;
- Compose files must avoid leaking secrets.

## Alternatives Considered

- Kubernetes: rejected as unnecessary overhead.
- Manual Node/Postgres install: rejected as less reproducible.
- Hosted PaaS: rejected because self-hosting/privacy are core constraints.

## Implementation Notes

- Keep separate `docker-compose.local.yml` and `docker-compose.production.yml`.
- Keep `.env.local.example` and `.env.production.example`.
- Add scripts for setup, deploy, backup, restore, export, and healthcheck.

## Review Trigger

Review if the user migrates to a homelab platform requiring different orchestration.
