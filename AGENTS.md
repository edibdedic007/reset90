# AGENTS.md

    ## Purpose
    Give Codex CLI stable project instructions that remain short enough to read before every implementation task.

    ## Scope
    - Applies to all Codex-driven work on Reset90.
- Defines product boundaries, engineering rules, context rules, and safety rules.
- Does not replace detailed docs; it points Codex to them.

    ## Assumptions
    - Codex can read files in the repo and edit code when run with appropriate sandbox permissions.
- The user wants a persistent `local` branch even though many teams avoid long-lived dev branches.
- The app remains single-user/private unless the user explicitly changes scope.

    ## Success Criteria
    - Codex does not overbuild SaaS features.
- Codex keeps changes small, testable, and documented.
- Codex preserves the main/local branch model and Conventional Commits.
- Codex stores context summaries and decision logs, not raw internal reasoning.

    ## Deliverables
    - Short standing instructions for Codex.
- Task reading order.
- Non-negotiable product and engineering constraints.

    ## Before every task

1. Read `PROJECT_CONTEXT_SHORT.md` first.
2. Read only task-relevant docs from `docs/`.
3. Inspect the current Git branch and working tree.
4. Read relevant ADRs before changing architecture, auth, database/storage, deployment, AI/GPT integration, context memory, Git workflow, or core product behavior.
5. Make a short plan before editing files.
6. Keep changes small enough to review.
7. Run available checks before declaring completion.
8. Update `PROJECT_CONTEXT_SHORT.md` when a meaningful decision or implementation status changes.
9. Create or update ADRs for durable architecture/product/process decisions.

## Product rules

- Build Reset90 as a private self-hosted single-user app.
- Do not add SaaS, payments, public signup, teams, leaderboards, marketing pages, or public sharing.
- Fixed 90-day skeleton, adaptive daily execution.
- Every day supports minimum, standard, and ideal task tiers.
- Recovery days are tracked and limited, but never treated as moral failure.
- User-facing copy must avoid: “you failed,” “you wasted the day,” “start over,” or similar shame language.
- Custom GPT is the coach/planner/interpreter/analyst.
- Webapp is the dashboard/storage/tracker/export layer.

## Engineering rules

- `main` is production.
- `local` is persistent developer-only integration/WIP branch unless the user says otherwise.
- Short-lived branches use: `feature/<slug>`, `cleanup/<slug>`, `fix/<slug>`, `refactor/<slug>`, `chore/<slug>`, `docs/<slug>`.
- Use Conventional Commits.
- No secrets in Git.
- Validate all API inputs with schemas.
- Store raw GPT import payloads before normalized processing.
- Add tests for meaningful logic.
- Use migrations for schema changes.
- Keep production deployable and backup-aware.

## Context memory rules

Store concrete application context, not hidden model reasoning:

- conversation history imported or written by the user;
- task summaries;
- decision logs;
- daily/weekly summaries;
- context snapshots;
- optional embeddings for retrieval.

Never require raw internal chain-of-thought logs. If the app includes a field called `reasoning_summary`, it must mean a user-visible explanation or summarized rationale, not hidden chain-of-thought.


## ADR rules

- Accepted ADRs in `docs/adr/` are implementation constraints.
- Do not contradict an accepted ADR without asking the user first.
- If a new durable decision is made, create a new ADR from `docs/adr/TEMPLATE.md`.
- ADR reasoning must be a concise user-visible rationale, not hidden chain-of-thought.
- Link significant implementation work back to relevant ADR numbers in commit bodies or PR notes when practical.


## Implementation Order
Use `docs/16_BEST_IMPLEMENTATION_ORDER.md` as the primary phase-by-phase build order for Codex CLI. It supersedes generic implementation-order notes.
