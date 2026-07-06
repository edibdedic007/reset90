# 01 - Product Requirements

    ## Purpose
    Define what Reset90 is, who it is for, what it must do, and what it must not become.

    ## Scope
    - Product requirements for MVP and near-term iterations.
- Single-user private app only.
- Feature boundaries for daily planning, recovery, tracking, analytics, and GPT integration.

    ## Assumptions
    - App purpose: private 90-day reset command center.
- Target user: one technical user in a self-hosted environment.
- Core features: daily dashboard, minimum/standard/ideal tasks, recovery mode, check-ins, GPT imports, analytics, export/backup.
- Tech constraints: webapp for PC/phone, self-hosted, no offline requirement, Authentik production auth.
- Emotional constraint: app must support honest accountability without shame-based language.

    ## Success Criteria
    - MVP helps the user see today, execute small actions, recover from bad days, and preserve history.
- Custom GPT can import daily plans, reflections, weekly reviews, and context summaries.
- The app can export all user data.
- The UI works on phone and desktop.

    ## Deliverables
    - Product definition.
- MVP feature list.
- Non-goals.
- Acceptance criteria.

    ## Product definition

Reset90 is a private self-hosted 90-day reset dashboard that receives plans and reflections from a Custom GPT, tracks daily execution across body, mood, digital detox, learning, and work, uses minimum/standard/ideal task modes, protects recovery days, visualizes progress without harsh streaks, and helps the user finish 90 days with more clarity and less self-judgment.

## Product pillars

1. Fixed 90-day skeleton.
2. Adaptive daily execution.
3. Low-friction logging.
4. Recovery-aware progress.
5. GPT-assisted planning and reflection.
6. Privacy-first self-hosting.
7. Exportable personal data.

## 90-day structure

| Days | Phase | Purpose |
|---:|---|---|
| 1-30 | Clear the Fog | Stabilize, reduce drift, create daily anchors, lower shame, collect baseline data. |
| 31-60 | Rebuild Momentum | Increase consistency, body activation, learning tolerance, work improvement, digital control. |
| 61-90 | Prove Continuation | Strengthen self-trust, continue after misses, prepare final report and next cycle. |

## MVP features

- Cycle setup with start date and active phase.
- Today Command Center.
- Energy selector: burned out, low, normal, high, restless/chaotic.
- Daily plan import from Custom GPT.
- Task tiers: non-negotiable, minimum, standard, ideal.
- Task completion and notes.
- Check-ins for mood, fog, loneliness, self-criticism, digital control, body relationship, learning resistance, work confidence.
- Recovery mode and recovery credits.
- Day statuses: green, yellow, blue, red, gold.
- Weekly review import/display.
- 90-day grid and basic analytics.
- Context library: conversation summaries, task summaries, decision logs, context snapshots.
- Full JSON export and database backup path.

## Day status definitions

| Status | Meaning |
|---|---|
| Green | Standard or ideal day completed. |
| Yellow | Minimum day completed; still counts. |
| Blue | Intentional recovery day with minimum reset actions. |
| Red | Abandoned/no useful reset data; not a moral label. |
| Gold | Comeback day after red/blue or major resistance. |

## Non-goals

- Generic habit tracker clone.
- Full workout planner.
- Full study planner.
- Full journaling app.
- Public user accounts.
- Payments/subscriptions.
- Social accountability.
- Leaderboards.
- Shame-based streaks.
- Complex gamification.

## User-facing language rules

Allowed:

- “Minimum still counts.”
- “Downshift, don’t abandon.”
- “A miss is data.”
- “Today does not need to repay yesterday.”
- “Come back with one action.”

Avoid:

- “You failed.”
- “You wasted the day.”
- “You ruined your streak.”
- “Start over.”
- “You are behind.”
