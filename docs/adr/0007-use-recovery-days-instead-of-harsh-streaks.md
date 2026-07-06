# ADR-0007: Use recovery days instead of harsh streak failure

## Purpose
Record the behavioral design decision that missed or low-capacity days should produce recovery flow, not shame-based failure.

## Scope
Covers recovery credits, day status, copy tone, analytics, and reset actions.

## Assumptions
The user wants supportive honesty, limited recovery days, rewards for not needing recovery, and no language like “you failed.”

## Success Criteria
Reset90 tracks recovery days intentionally and distinguishes recovery from abandonment.

## Deliverables
Accepted recovery model and reasoning.

## Status
Accepted

## Date
2026-07-06

## Context

The user specifically wants to avoid harsh streaks and shame spirals. A missed or bad day should not cause total abandonment.

## Decision

Use recovery days and comeback tracking instead of harsh streak failure.

Day statuses may include:

- green: standard/ideal day;
- yellow: minimum day;
- blue: intentional recovery day;
- red: abandoned/no useful reset;
- gold: comeback day.

Recovery days are limited and tracked, but they are not moral failures.

## ADR Reasoning

This is core to the app's purpose: rebuilding self-trust without turning progress into another guilt machine. Recovery tracking gives honesty without shame.

## Consequences

Benefits:

- better resilience after bad days;
- more realistic 90-day completion;
- analytics can show comeback strength;
- product tone remains aligned with user needs.

Tradeoffs:

- scoring is more nuanced;
- app must avoid accidentally rewarding avoidance;
- recovery limits must be visible but not punitive.

## Alternatives Considered

- Classic streak reset: rejected because it can trigger abandonment.
- Unlimited recovery with no tracking: rejected because user wants limits and honesty.

## Implementation Notes

- Add recovery event records and remaining credits.
- Add “Reset Me Now” and “Minimum Day” flows.
- Prohibit shame language in UI copy.

## Review Trigger

Review after real use if recovery credits feel too strict or too loose.
