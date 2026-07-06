# 12 - Codex Prompts

    ## Purpose
    Provide copyable prompts for Codex CLI that are scoped, reusable, and token-efficient.

    ## Scope
    - Prompts for setup, planning, implementation, review, debugging, docs, and deployment.
- Designed for Codex CLI interactive and exec-style use.
- Prompts reference specific docs instead of the full pack.

    ## Assumptions
    - Codex has access to the repository files.
- User can paste prompts into Codex CLI.
- Codex should inspect the repo before editing.
- The best output comes from small tasks.

    ## Success Criteria
    - Prompts reduce repeated context.
- Codex makes small, reviewable changes.
- Codex follows branch and commit rules.
- Codex asks less often for missing requirements already documented.

    ## Deliverables
    - Startup prompt.
- Planning prompt.
- Implementation prompts by phase.
- Review/debug prompts.
- Docs and release prompts.

    ## Session startup prompt

```text
Read AGENTS.md, PROJECT_CONTEXT_SHORT.md, CODEX_START_HERE.md, and docs/00_PACK_INDEX.md only. Summarize the current project rules in 10 bullets, inspect the repo, tell me the current branch/status, and recommend the next smallest implementation task. Do not edit files yet.
```

## Repo foundation prompt

```text
Read AGENTS.md, PROJECT_CONTEXT_SHORT.md, docs/02_SYSTEM_ARCHITECTURE.md, docs/07_ENVIRONMENTS_DEPLOYMENT.md, docs/08_AUTOMATION_AND_SCRIPTS.md, docs/10_GIT_WORKFLOW.md, and docs/11_IMPLEMENTATION_PLAN.md.

Create or update branch feature/repo-foundation from local. Implement Phase 0 only: Next.js + TypeScript + Tailwind skeleton, PostgreSQL local Docker Compose, ORM setup, .env examples, Makefile, health endpoint, and CI workflow. Keep changes small. Do not implement product features yet. Run available checks and report commands/results.
```

## Data model prompt

```text
Read AGENTS.md, PROJECT_CONTEXT_SHORT.md, docs/03_SYSTEM_DESIGN_DATA_MODEL.md, docs/05_CONTEXT_MEMORY_DESIGN.md, and docs/11_IMPLEMENTATION_PLAN.md.

Create branch feature/core-data-model from local. Implement Phase 1 database schema and migrations for Reset90. Include seed data for one active 90-day cycle and default phases. Add tests for day number and phase calculation. Do not build UI features in this task.
```

## GPT import prompt

```text
Read AGENTS.md, PROJECT_CONTEXT_SHORT.md, docs/04_API_AND_AI_PAYLOAD_CONTRACTS.md, docs/03_SYSTEM_DESIGN_DATA_MODEL.md, and the example JSON payloads.

Create branch feature/gpt-import from local. Implement /api/gpt/import with bearer-token auth, body size limit, Zod validation, raw payload storage, idempotency, and daily_plan normalization. Add tests and a validate-payloads script. Do not implement reflection or weekly review imports unless the daily plan import is complete and tested first.
```

## UX/dashboard prompt

```text
Read AGENTS.md, PROJECT_CONTEXT_SHORT.md, docs/01_PRODUCT_REQUIREMENTS.md, docs/06_UX_FLOWS.md, docs/13_INSPIRATIONS.md, and docs/11_IMPLEMENTATION_PLAN.md.

Create branch feature/today-dashboard from local. Build the Today Command Center UI for phone and desktop. Use seed/imported data. Include Day X/90, phase, energy selector, mission, non-negotiables, minimum/standard/ideal tasks, and Reset Me Now entry point. Avoid shame-based copy.
```

## Review current changes prompt

```text
Review the current branch against AGENTS.md and docs/10_GIT_WORKFLOW.md. Check for scope creep, secrets, unsafe migrations, missing tests, missing docs updates, and noncompliant branch/commit naming. Do not edit files unless I ask.
```

## Debug prompt

```text
Read only the failing output, AGENTS.md, PROJECT_CONTEXT_SHORT.md, and the most relevant doc. Diagnose the failure. Make the smallest fix. Run the failing command again. Do not refactor unrelated code.
```

## Documentation update prompt

```text
Update only the docs affected by the current implementation change. Keep Purpose, Scope, Assumptions, Success Criteria, and Deliverables at the top of every Markdown document. Do not rewrite unrelated docs.
```

## Release prompt

```text
Read docs/07_ENVIRONMENTS_DEPLOYMENT.md, docs/08_AUTOMATION_AND_SCRIPTS.md, docs/09_ENGINEERING_BEST_PRACTICES.md, and docs/10_GIT_WORKFLOW.md. Prepare a production release from local to main. Run checks, summarize changes, list migration/deployment risks, and do not deploy until I explicitly confirm.
```


## ADR-aware prompt add-on

Add this to prompts that may affect architecture, product behavior, deployment, auth, data model, Git workflow, or AI integration:

```text
Before editing, read docs/15_ADR_PROCESS_AND_REASONING.md, docs/adr/README.md, and any relevant accepted ADRs.
Do not contradict an accepted ADR without stopping and asking me.
If this task introduces a durable architecture/product/process decision, create a new ADR using docs/adr/TEMPLATE.md.
Keep ADR reasoning user-visible and concise; do not store raw internal reasoning.
```

## Create a new ADR prompt

```text
Create a new lightweight ADR for the following decision: [decision].
Use docs/adr/TEMPLATE.md.
Check existing ADRs first so you do not duplicate or contradict them.
Set status to Proposed unless the decision was already explicitly accepted.
Include context, decision, ADR reasoning, consequences, alternatives, implementation notes, and review trigger.
Do not modify code yet.
```
