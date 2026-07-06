# ADR-0006: Use minimum/standard/ideal task tiers

## Purpose
Record the core task model so daily plans remain adaptive and non-all-or-nothing.

## Scope
Covers task tiering, daily plans, UI expectations, analytics, and import payload shape.

## Assumptions
The user explicitly wants every task to support minimum, standard, and ideal versions.

## Success Criteria
Daily plans and task records support tiered execution and allow partial success without treating the day as failed.

## Deliverables
Accepted task-tier model and reasoning.

## Status
Accepted

## Date
2026-07-06

## Context

Reset90 should handle low, normal, and high energy days. The user needs adaptive execution without all-or-nothing failure.

## Decision

Use minimum/standard/ideal tiers for tasks and daily plans.

Each relevant task should support:

- `minimum`: smallest useful action;
- `standard`: normal intended version;
- `ideal`: expanded version for high-capacity days.

## ADR Reasoning

The tier model makes success scalable to energy level. It protects consistency on bad days while still allowing stronger days to count more.

## Consequences

Benefits:

- less abandonment after bad days;
- better GPT planning payloads;
- easier dashboard downshifting;
- richer analytics than binary complete/incomplete.

Tradeoffs:

- data model is more complex;
- UI must make tiers clear without clutter;
- analytics must distinguish minimum days from standard/ideal days.

## Alternatives Considered

- Binary habit completion: rejected as too harsh and generic.
- Fully scheduled calendar blocks: rejected as too rigid for the user.

## Implementation Notes

- Task schema should include tier definitions and achieved tier.
- UI should allow marking minimum/standard/ideal completion.
- Daily score should not shame minimum days.

## Review Trigger

Review if the tier model becomes too complicated in actual daily use.
