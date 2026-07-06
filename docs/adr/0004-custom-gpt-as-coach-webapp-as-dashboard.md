# ADR-0004: Use Custom GPT as coach/brain and webapp as dashboard/storage

## Purpose
Keep product boundaries clear so Codex does not turn Reset90 into a full chatbot or generic AI app.

## Scope
Covers division of responsibilities between Custom GPT and the webapp.

## Assumptions
The user wants to dump thoughts into a Custom GPT and have the app receive structured outputs for tracking and analytics.

## Success Criteria
Custom GPT performs planning, interpretation, coaching, and pattern analysis; the webapp stores, displays, validates, tracks, and exports structured data.

## Deliverables
Accepted AI/product boundary and reasoning.

## Status
Accepted

## Date
2026-07-06

## Context

Reset90 is not intended to be a chatbot product. The user already wants to use a Custom GPT for voice/messy text, planning, daily reflections, recovery plans, and weekly pattern analysis.

## Decision

Custom GPT is the coach/brain.

The webapp is the dashboard/storage/tracker/export layer.

The webapp should not try to replace the Custom GPT in MVP. It should expose import endpoints and UI surfaces that make GPT-generated plans and reflections useful.

## ADR Reasoning

This avoids building a large AI chat system and keeps MVP focused. It also fits how the user naturally wants to interact: talk to GPT, then let the app preserve structure and progress.

## Consequences

Benefits:

- faster MVP;
- clear product responsibility;
- less AI complexity in the app;
- easier privacy boundaries;
- app remains useful even if GPT is manually copied/imported first.

Tradeoffs:

- app depends on quality of external GPT outputs;
- import validation must be strict;
- later automation requires secure action/API configuration.

## Alternatives Considered

- Build full chat inside Reset90: rejected for MVP complexity and scope creep.
- Make the app purely manual with no GPT integration: rejected because GPT integration is central to user workflow.

## Implementation Notes

- Build payload import endpoints first.
- Store raw payloads and normalized records.
- Provide copy/paste JSON import fallback before advanced GPT action automation.
- Keep AI-generated explanations user-visible and concise.

## Review Trigger

Review if the app later needs built-in model/API calls, local LLM support, or fully automated coaching.
