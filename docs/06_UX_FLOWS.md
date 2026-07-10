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

Phase 9 implementation baseline:

- Today Command Center is the first screen after browser auth.
- The header shows Day X/90, phase, status, recovery credits, energy, and task progress.
- Imported daily plan sections show mission, supportive message, downshift rule, context, warnings, non-negotiables, minimum, standard, and ideal tasks.
- Task completion is a checkbox toggle; minimum completion remains valid progress.
- Energy is a segmented control using the supported `EnergyLevel` values.
- If no plan is imported for the current day, the page keeps the active day visible and still allows energy updates.
- Recovery workflow entry and full check-in history remain later phases.

## Day-state check-in flow

Phase 10 adds a quick morning, midday, evening, or manual snapshot to Today.
Each check-in requires energy plus eight 1-10 values: mood, fog, loneliness,
self-criticism, digital control, learning resistance, body relationship, and
work confidence. A 500-character note is optional; the flow is not a journal.

Scale endpoints make direction explicit:

- higher is better for mood, digital control, body relationship, and work
  confidence;
- higher is worse for fog, loneliness, self-criticism, and learning
  resistance.

The form starts at neutral values, works at phone width, and shows the latest
saved check-in above it. Saving a check-in also refreshes the Today energy
display. Repeated entries are allowed. Recovery actions and day-status
calculation remain Phase 11 work.

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

- `Reset me now` opens one resumable current-day recovery event;
- user selects at least three of five fixed actions, including one physical/basic
  reset and one forward-facing action;
- a credited qualifying recovery becomes blue; qualifying recovery without an
  available credit is still recorded as yellow;
- a normal completion after red or blue can become gold; recovery alone does
  not create gold;
- copy stays calm: “Downshift, don’t abandon” and “Today still has room for one
  next action.”

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
