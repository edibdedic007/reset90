# ADR 0001: Use a Modular Monolith

## Status
Accepted

## Context
Reset90 is a private single-user self-hosted webapp. It does not need independent scaling, teams, billing, tenant isolation, or separate service ownership.

## Decision
Build one deployable web application service backed by PostgreSQL. Keep internal modules separated by domain, but do not split them into microservices.

## Consequences
This keeps development, deployment, debugging, backups, and Codex implementation simpler. If the app grows significantly, modules can later be extracted, but MVP should not pay that complexity cost.

## Alternatives considered
Microservices, separate API/backend/frontend repos, queues, Kubernetes. Rejected as over-engineering for MVP.
