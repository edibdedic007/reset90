# 06 - UX Flows

    ## Purpose
    Define the main screens and user flows so Codex can build the webapp without inventing UX from scratch.

    ## Scope
    - Today dashboard, daily check-in, task completion, recovery mode, weekly review, analytics, context library, settings/export.
- Responsive phone/PC design.
- Calm mentor copy rules.

    ## Assumptions
    - The user wants low friction, not a dense productivity cockpit.
- Phone usage matters for quick check-ins and task completion.
- Desktop usage matters for review, analytics, and admin/export.
- The app should make the next useful action obvious.

    ## Success Criteria
    - User can understand today within 10 seconds.
- User can mark a minimum day without shame.
- User can start recovery mode quickly.
- User can review weekly/final progress visually and textually.

    ## Deliverables
    - Screen list.
- User flows.
- Status/copy guidance.
- Responsive layout principles.

    ## Primary navigation

- Today
- 90 Days
- Reviews
- Context
- Analytics
- Settings

## Today Command Center

Top section:

- Day X/90
- Phase name
- Current status
- One supportive message
- Energy selector

Cards:

1. Mission.
2. Non-negotiables.
3. Minimum plan.
4. Standard plan.
5. Ideal plan.
6. Reset me now.
7. Evening reflection status.

## Energy check-in flow

Question:

```text
What is your energy right now?
```

Options:

- burned out;
- low;
- normal;
- high;
- restless/chaotic.

After selection:

- update day log;
- highlight matching task tier;
- show downshift rule if energy is low/burned out.

## Task completion flow

User can:

- mark complete;
- skip with reason;
- add note;
- downshift task to lower tier;
- see why task exists.

Task card should show:

- title;
- domain;
- tier;
- estimated minutes;
- trigger;
- why.

## Recovery mode flow

Entry points:

- `Reset me now` button;
- low/burned out energy;
- user manually selects recovery;
- after red day when next day begins.

Recovery screen:

```text
Downshift, don't abandon.
```

Recovery checklist:

- drink water or basic physical reset;
- 5-10 minute walk/stretch/shower/cleanup;
- one tiny focus action;
- one GPT reflection or note;
- prepare one thing for tomorrow.

Recovery result:

- day can become blue if intentional recovery actions are completed;
- comeback day can become gold after returning from a bad day.

## 90-day grid

Display 90 cells:

- Green = standard/ideal;
- Yellow = minimum;
- Blue = recovery;
- Red = abandoned/no useful reset;
- Gold = comeback;
- Gray = future/unset.

Clicking a cell opens day details.

## Weekly review

Show:

- week number;
- summary;
- wins;
- blockers;
- patterns;
- recommended changes;
- next week commitments;
- metrics summary;
- linked context snapshot.

## Context library

Allow:

- list context items;
- search;
- filter by kind/tag/date;
- view source payload;
- edit/delete user-created context items;
- generate context pack.

## Analytics

MVP charts/cards:

- day status count;
- recovery credits used/remaining;
- weekly comparison;
- mood/fog trend;
- digital control trend;
- learning resistance trend;
- body relationship trend;
- work confidence trend;
- self-trust score.

## Copy rules

Use calm, direct language. Avoid dramatic motivation.

Good examples:

- “Minimum still counts.”
- “Choose the smallest useful version.”
- “You are still in the run.”
- “This is data for tomorrow.”

Bad examples:

- “No excuses.”
- “You failed.”
- “You ruined your streak.”
- “Start from zero.”
