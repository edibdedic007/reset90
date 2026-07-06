# 11 - Implementation Plan

    ## Purpose
    Provide Codex with an ordered, incremental build plan that avoids giant unfocused changes.

    ## Scope
    - MVP phases from repository foundation to analytics/export.
- Acceptance criteria for each phase.
- Suggested branch names and relevant docs.

    ## Assumptions
    - The repository may start empty.
- Codex can create code, scripts, and docs.
- The app should become useful before advanced analytics or embeddings.
- Production deployment should wait until foundation, backup, and auth basics are safe.

    ## Success Criteria
    - Each phase produces a working increment.
- Codex can stop after any phase with a stable repo.
- No phase requires reading the entire pack.
- Tests/checks exist before complex features.

    ## Deliverables
    - Phased roadmap.
- Branch suggestions.
- Acceptance checks.
- Prompt pointers.

    ## Phase 0 - Repository foundation

Branch:

```text
feature/repo-foundation
```

Read:

- `02_SYSTEM_ARCHITECTURE.md`
- `07_ENVIRONMENTS_DEPLOYMENT.md`
- `08_AUTOMATION_AND_SCRIPTS.md`
- `10_GIT_WORKFLOW.md`
- `15_ADR_PROCESS_AND_REASONING.md`
- `adr/README.md`

Build:

- Next.js + TypeScript;
- Tailwind;
- strict TypeScript;
- ESLint/Prettier;
- testing framework;
- PostgreSQL local Docker Compose;
- ORM setup;
- `.env.local.example` and `.env.production.example`;
- Makefile;
- health endpoint;
- CI workflow;
- copy ADR directory into repo docs if not already present.

Acceptance:

- `make dev` works;
- `make check` works or is stubbed with real available commands;
- CI file exists;
- app renders basic shell.

## Phase 1 - Data model and migrations

Branch:

```text
feature/core-data-model
```

Build:

- users;
- reset cycles/phases;
- day logs;
- daily plans;
- tasks;
- check-ins;
- reflections;
- weekly reviews;
- recovery events;
- imported payloads;
- context items.

Acceptance:

- migration runs locally;
- seed creates active 90-day cycle;
- unit tests cover day/phase calculations.

## Phase 2 - Today dashboard

Branch:

```text
feature/today-dashboard
```

Build:

- responsive layout;
- Day X/90;
- phase display;
- energy selector;
- task cards;
- empty-state if no GPT plan imported.

Acceptance:

- dashboard works with seed data;
- mobile width is usable;
- no shame-based language.

## Phase 3 - GPT import MVP

Branch:

```text
feature/gpt-import
```

Build:

- `/api/gpt/import`;
- bearer auth;
- body size limit;
- Zod schemas;
- raw payload storage;
- daily plan normalization;
- idempotency handling;
- payload example validation command.

Acceptance:

- daily plan example imports;
- duplicate import does not duplicate tasks;
- invalid payload rejected;
- tests cover import logic.

## Phase 4 - Tasks, check-ins, recovery

Branch:

```text
feature/daily-execution
```

Build:

- task completion;
- skip/note;
- check-in creation;
- recovery mode;
- recovery credits;
- day status calculation.

Acceptance:

- user can run a minimum day;
- recovery mode can mark day blue;
- comeback status supported;
- tests cover status/recovery logic.

## Phase 5 - Reflections and weekly reviews

Branch:

```text
feature/reviews
```

Build:

- daily reflection import;
- weekly review import;
- review pages;
- context items from payloads.

Acceptance:

- example reflection imports;
- example weekly review imports;
- context items are created and searchable.

## Phase 6 - Analytics and 90-day grid

Branch:

```text
feature/analytics-grid
```

Build:

- 90-day grid;
- day status counts;
- weekly comparison;
- score trends;
- recovery usage.

Acceptance:

- grid reflects seeded/imported data;
- charts/cards do not require perfect data;
- analytics handles missing days.

## Phase 7 - Export, backup, production deployment

Branch:

```text
feature/export-production-ops
```

Build:

- full JSON export;
- backup scripts integrated;
- production compose;
- deploy script;
- healthcheck script;
- Authentik OIDC production mode.

Acceptance:

- export downloads valid JSON;
- backup/restore scripts documented;
- production env examples exist;
- deploy script performs backup before migration.

## Phase 8 - Optional enhancements

Do later only after MVP works:

- embeddings-based context retrieval;
- Markdown final Day 90 report;
- Apple Shortcuts integration;
- calendar integration;
- Home Assistant/Discord/Telegram notification integration;
- richer charts.


## ADR check for every phase

Before each phase, Codex must check whether the phase touches an accepted ADR.

Minimum checks:

| Phase area | ADRs to read |
|---|---|
| Branching/release | ADR-0001 |
| Auth | ADR-0002 |
| Database/migrations | ADR-0003 |
| GPT integration | ADR-0004, ADR-0009 |
| Context/memory | ADR-0005 |
| Daily task model | ADR-0006 |
| Recovery/reset flows | ADR-0007 |
| Environments/deploy | ADR-0008 |
| Docs/project memory | ADR-0010 |

If a phase requires a new durable decision, add a new ADR before finalizing the phase.
