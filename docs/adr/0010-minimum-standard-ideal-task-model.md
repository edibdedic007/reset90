# ADR 0010: Use Minimum, Standard, and Ideal Task Tiers

## Status
Accepted

## Context
The user wants Reset90 to work on low-energy days without creating all-or-nothing failure loops. A normal habit checklist would be too rigid and may reinforce shame after missed tasks.

## Decision
Every daily plan should support minimum, standard, and ideal task tiers. The Today Command Center should make the minimum version valid, visible, and easy to choose. Completion, analytics, and day status logic must treat minimum completion as real progress, not failure.

## Consequences
The app supports adaptive daily execution while preserving the fixed 90-day skeleton. Data modeling and UI must represent task tiers explicitly. Analytics should distinguish minimum days from abandoned days.

## Alternatives considered
Single fixed task list, points-only scoring, and strict streak-based completion. Rejected because they are less forgiving and do not match the reset design.
