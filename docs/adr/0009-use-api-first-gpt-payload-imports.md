# ADR-0009: Use API-first GPT payload imports

## Purpose
Record the integration approach between Custom GPT and Reset90.

## Scope
Covers authenticated import endpoints, raw payload storage, validation, normalization, and fallback manual imports.

## Assumptions
The Custom GPT will generate daily plans, reflections, and weekly reviews that the app should store and display.

## Success Criteria
Reset90 exposes validated import endpoints and stores raw payloads before normalizing them into app records.

## Deliverables
Accepted GPT integration architecture and reasoning.

## Status
Accepted

## Date
2026-07-06

## Context

The user wants Custom GPT to ask questions, clean up messy voice/text, generate plans, and send structured results to the app.

## Decision

Use API-first import contracts for GPT payloads.

Initial payload types:

- daily plan;
- daily reflection;
- weekly review.

Each import must be validated, stored raw, normalized, and surfaced in the UI.

## ADR Reasoning

API-first payloads keep the Custom GPT/app boundary clean. They allow manual copy-paste imports first, then authenticated GPT actions later without redesigning the data model.

## Consequences

Benefits:

- clear contracts for Codex;
- safer validation;
- debuggable raw payload history;
- supports future GPT Actions/API automation.

Tradeoffs:

- requires schema design upfront;
- invalid payload UX must be handled;
- auth token/signature strategy is needed for production imports.

## Alternatives Considered

- Direct database writes from GPT: rejected as unsafe.
- Free-form text import only: rejected because analytics need structure.
- Build internal AI chat first: rejected for MVP scope.

## Implementation Notes

- Define Zod schemas for payloads.
- Keep `/api/import/daily-plan`, `/api/import/daily-reflection`, and `/api/import/weekly-review` or equivalent route handlers.
- Store raw payloads in `imported_payloads` before normalized writes.
- Return validation errors clearly.

## Review Trigger

Review when Custom GPT Actions are configured or if built-in model calls are added.
