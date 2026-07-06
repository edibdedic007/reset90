# ADR-0002: Use Authentik OIDC for authentication

## Purpose
Record the authentication decision so Codex does not implement unnecessary app-managed password auth.

## Scope
Covers authentication provider choice, app responsibilities, local development fallback, and production requirements.

## Assumptions
The user has Authentik available and wants private self-hosted production auth.

## Success Criteria
Production authentication uses Authentik OIDC; the app does not build public signup, password reset, or social login flows.

## Deliverables
Accepted authentication architecture and reasoning.

## Status
Accepted

## Date
2026-07-06

## Context

Reset90 is private and self-hosted. It does not need public registration, SaaS accounts, team invites, subscription logic, or app-owned password management.

## Decision

Use Authentik as the production identity provider through OIDC.

The webapp should:

- trust Authentik/OIDC for identity;
- map the authenticated identity to the single app user;
- enforce authenticated access for all private app routes;
- avoid app-owned username/password auth unless the user explicitly requests it later.

Local development may use a documented dev-only auth bypass or mock user, but production must use Authentik/OIDC.

## ADR Reasoning

Authentik fits the user's self-hosted environment and avoids building risky auth features that are not part of the product. This keeps Reset90 focused on dashboard, tracking, import, and reflection storage instead of account management.

## Consequences

Benefits:

- less security-sensitive custom code;
- consistent with self-hosted stack;
- production access can be controlled centrally;
- avoids public signup scope creep.

Tradeoffs:

- local development needs a safe mock strategy;
- production setup requires OIDC configuration;
- app availability depends on Authentik availability.

## Alternatives Considered

- App-managed email/password auth: rejected as unnecessary and riskier.
- Public OAuth providers only: rejected because this is a private self-hosted app.
- No auth: rejected for production because the app stores sensitive personal data.

## Implementation Notes

- Keep `.env.production.example` OIDC variables.
- Protect all private routes.
- Add `AUTH_MODE=dev` only for local use.
- Never enable dev auth mode in production.

## Review Trigger

Review if the user deploys somewhere without Authentik or wants multi-user access.
