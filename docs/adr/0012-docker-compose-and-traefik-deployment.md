# ADR 0012: Use Docker Compose and Traefik for Local and Production Deployment

## Status
Accepted

## Context
Reset90 is a private self-hosted app intended to run on the user's server. The user prefers practical self-hosting and already uses reverse-proxy style infrastructure. The implementation order assumes Traefik for production routing.

## Decision
Use Docker Compose for both local development and production deployment. Local is developer-only and may expose ports to the developer machine. Production is the live environment and should run behind Traefik with HTTPS labels, an external Traefik network, internal-only PostgreSQL, persistent volumes, health checks, and backup/restore scripts.

## Consequences
Deployment remains understandable and reproducible without Kubernetes. The app can be run locally and promoted to production with similar concepts. Production Compose must not expose PostgreSQL publicly and must not introduce Caddy or Nginx unless a future ADR supersedes this decision.

## Alternatives considered
Manual Node/PostgreSQL installation, Caddy or Nginx reverse proxy, Kubernetes, Docker Swarm, and serverless hosting. Rejected because Docker Compose plus Traefik best matches the project's current self-hosted scope.
