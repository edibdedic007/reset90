# ADR 0004: Separate Browser Auth and GPT Ingest Auth

## Status
Accepted

## Context
The browser UI and GPT action endpoint have different trust boundaries.

## Decision
Use Authentik OIDC for browser/UI authentication. Use a separate machine-authenticated ingest channel for Custom GPT actions.

## Consequences
The app can secure browser sessions and machine imports independently. GPT cannot accidentally rely on browser cookies.

## Alternatives considered
Only Authentik forward-auth for everything, or only a shared app password. Rejected because ingest endpoints need API-specific controls and idempotency.
