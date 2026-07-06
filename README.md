# Reset90 Codex CLI Pack v5 Final

    ## Purpose
    Provide a compact, implementation-ready documentation pack for Codex CLI to build the Reset90 webapp without repeatedly re-reading long chats.

    ## Scope
    - Defines product, architecture, data model, API contracts, context memory, environments, automation, Git workflow, engineering practices, implementation plan, prompts, inspirations, and user runbook.
- Optimized for Codex CLI by separating short context files from deep reference documents.
- This pack is documentation and scaffolding guidance, not the final application source code.

    ## Assumptions
    - App purpose assumption: Reset90 is a private self-hosted 90-day reset command center.
- Target user assumption: one technical private user using PC and phone, with Authentik available for production auth.
- Core feature assumption: Custom GPT creates structured plans/reflections and sends them to the app via authenticated payloads.
- Tech stack assumption: Next.js + TypeScript + PostgreSQL + Prisma + Zod/JSON Schema + Tailwind + Docker Compose + Traefik.
- Constraint assumption: no SaaS, payments, teams, public signup, leaderboard, or social product scope.

    ## Success Criteria
    - Codex can start from CODEX_START_HERE.md and avoid loading every file on every task.
- Every Markdown document begins with Purpose, Scope, Assumptions, Success Criteria, and Deliverables.
- Branch model, automation rules, environment definitions, context storage, and software engineering practices are explicit.
- A best implementation order and Codex execution runbook explain how to build the app phase by phase.

    ## Deliverables
    - Codex-ready documentation pack.
- Examples for environment files, payloads, Docker Compose, scripts, CI, Makefile, and PR template.
- All-in-one ready-to-save Markdown bundle.
- Best implementation order and Codex execution runbook.
- ADR process guide and accepted architecture decision records.

    ## Directory tree

```text
reset90_codex_cli_pack_v5_final/
├── README.md
├── AGENTS.md
├── CODEX_START_HERE.md
├── PROJECT_CONTEXT_SHORT.md
├── ALL_FILES_READY_TO_SAVE.md
├── docs/
│   ├── 00_PACK_INDEX.md
│   ├── 01_PRODUCT_REQUIREMENTS.md
│   ├── 02_SYSTEM_ARCHITECTURE.md
│   ├── 03_SYSTEM_DESIGN_DATA_MODEL.md
│   ├── 04_API_AND_AI_PAYLOAD_CONTRACTS.md
│   ├── 05_CONTEXT_MEMORY_DESIGN.md
│   ├── 06_UX_FLOWS.md
│   ├── 07_ENVIRONMENTS_DEPLOYMENT.md
│   ├── 08_AUTOMATION_AND_SCRIPTS.md
│   ├── 09_ENGINEERING_BEST_PRACTICES.md
│   ├── 10_GIT_WORKFLOW.md
│   ├── 11_IMPLEMENTATION_PLAN.md
│   ├── 12_CODEX_PROMPTS.md
│   ├── 13_INSPIRATIONS.md
│   ├── 14_SOURCE_RESEARCH_NOTES.md
│   ├── 15_ADR_PROCESS_AND_REASONING.md
│   └── adr/
│       ├── README.md
│       ├── TEMPLATE.md
│       ├── 0001-modular-monolith.md
│       ├── 0002-postgresql-source-of-truth.md
│       ├── 0003-json-schema-import-contracts.md
│       ├── 0004-separate-auth-boundaries.md
│       ├── 0005-observability-ladder.md
│       ├── 0006-context-summaries-not-chain-of-thought.md
│       ├── 0007-prisma-orm.md
│       ├── 0008-main-production-local-dev-branch.md
│       ├── 0009-custom-gpt-as-coach-webapp-as-dashboard.md
│       ├── 0010-minimum-standard-ideal-task-model.md
│       ├── 0011-recovery-days-instead-of-harsh-streaks.md
│       ├── 0012-docker-compose-and-traefik-deployment.md
│       └── 0013-docs-as-code-codex-memory.md
└── examples/
    ├── .env.local.example
    ├── .env.production.example
    ├── docker-compose.local.yml
    ├── docker-compose.production.yml
    ├── Makefile
    ├── daily_plan_payload.json
    ├── daily_reflection_payload.json
    ├── weekly_review_payload.json
    ├── .github/
    │   ├── PULL_REQUEST_TEMPLATE.md
    │   └── workflows/ci.yml
    └── scripts/
        ├── setup-local.sh
        ├── create-branch.sh
        ├── precommit-check.sh
        ├── backup-db.sh
        ├── restore-db.sh
        ├── export-data.sh
        ├── deploy-production.sh
        ├── healthcheck.sh
        └── generate-docs-bundle.sh
```

## How Codex should use this pack

1. Read `AGENTS.md` and `PROJECT_CONTEXT_SHORT.md` first.
2. Read only the specific docs needed for the current task.
3. Use `docs/16_BEST_IMPLEMENTATION_ORDER.md` for build order.
4. Use `docs/15_ADR_PROCESS_AND_REASONING.md` and `docs/adr/README.md` before changing architecture, auth, data, deployment, AI integration, Git workflow, or core product rules.
5. Use `docs/12_CODEX_PROMPTS.md` for copyable prompts and `docs/17_CODEX_EXECUTION_RUNBOOK.md` for the repeatable Codex work loop.
6. Update `PROJECT_CONTEXT_SHORT.md` after meaningful implementation changes.
7. Update or add ADRs when meaningful architectural/product/process decisions change.
8. Do not feed Codex `ALL_FILES_READY_TO_SAVE.md` during normal work. It exists for human backup/export, not token-efficient execution.

## Non-goals

- No generic habit tracker clone.
- No public SaaS.
- No team management.
- No payment/subscription system.
- No social accountability or leaderboards.
- No raw hidden chain-of-thought storage.


## Implementation Order
Use `docs/16_BEST_IMPLEMENTATION_ORDER.md` as the primary phase-by-phase build order for Codex CLI. It supersedes generic implementation-order notes.

## Additional generated examples

- `examples/schemas/` contains starter JSON Schema contracts for GPT imports.
- `examples/traefik/README.md` documents the expected production Traefik assumptions.
- `docs/17_CODEX_EXECUTION_RUNBOOK.md` is the repeatable non-beginner Codex work loop.
