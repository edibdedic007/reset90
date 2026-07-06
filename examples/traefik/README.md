# Traefik Production Notes

## Purpose
Document the expected Traefik assumptions for Reset90 production deployment.

## Scope
Covers labels, network assumptions, and environment variables for Docker Compose production deployment.

## Assumptions
A Traefik instance already exists on the host and listens on an external Docker network.

## Success Criteria
The app is exposed through Traefik over HTTPS while PostgreSQL remains internal-only.

## Deliverables
Traefik deployment assumptions and required environment variables.

## Required variables

```text
RESET90_HOST=reset90.example.com
TRAEFIK_NETWORK=traefik_proxy
TRAEFIK_ENTRYPOINT=websecure
TRAEFIK_CERT_RESOLVER=letsencrypt
```

## Rules

- Attach the app service to the external Traefik network.
- Do not expose PostgreSQL ports publicly.
- Do not add Caddy or Nginx unless a future ADR supersedes ADR-0012.
- Keep health checks enabled.
