# ADR 0011: Use Recovery Days Instead of Harsh Streak Failure

## Status
Accepted

## Context
Reset90 should help the user recover quickly after bad days. Harsh streak mechanics can turn one missed day into a longer collapse.

## Decision
Use recovery-aware day statuses instead of classic streak failure. Supported statuses are `GREEN`, `YELLOW`, `BLUE`, `RED`, `GOLD`, and `UNSET`. `BLUE` means intentional recovery. `GOLD` means comeback. Recovery credits may be limited and tracked, but the app must not say the user failed, wasted the day, or must restart from day one.

## Consequences
The app becomes behaviorally aligned with the reset goal. Recovery and comeback logic must be part of the data model, UI, analytics, and copy rules. The app can still show honesty through recovery usage and red days without shame language.

## Alternatives considered
Classic streak counters, hard resets, failure badges, and daily percentage-only scoring. Rejected because they create the wrong psychological pressure for this app.
