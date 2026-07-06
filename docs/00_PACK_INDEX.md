# 00 - Pack Index

    ## Purpose
    Help Codex and the user choose the smallest relevant document for each task.

    ## Scope
    - Indexes all documents in the pack.
- Explains when to read each document.
- Supports token-efficient Codex CLI operation.

    ## Assumptions
    - Codex CLI performs better when given focused context instead of the whole pack.
- The all-in-one file is for human saving/export only.
- Docs may be copied into the eventual repository under `docs/`.

    ## Success Criteria
    - A developer can find the right document quickly.
- Codex can avoid redundant context loading.
- The pack remains maintainable as the app grows.

    ## Deliverables
    - Document map.
- Task-to-document lookup table.
- Codex reading strategy.

    ## Read this first for document selection

| Task | Read these files |
|---|---|
| Start a Codex session | `AGENTS.md`, `PROJECT_CONTEXT_SHORT.md`, `CODEX_START_HERE.md` |
| Product clarification | `01_PRODUCT_REQUIREMENTS.md`, `06_UX_FLOWS.md` |
| Architecture | `02_SYSTEM_ARCHITECTURE.md`, `07_ENVIRONMENTS_DEPLOYMENT.md` |
| Database/schema | `03_SYSTEM_DESIGN_DATA_MODEL.md`, `05_CONTEXT_MEMORY_DESIGN.md` |
| GPT action/imports | `04_API_AND_AI_PAYLOAD_CONTRACTS.md`, examples JSON files |
| Context/memory | `05_CONTEXT_MEMORY_DESIGN.md` |
| UX/dashboard | `06_UX_FLOWS.md`, `13_INSPIRATIONS.md` |
| Local/prod deployment | `07_ENVIRONMENTS_DEPLOYMENT.md`, `08_AUTOMATION_AND_SCRIPTS.md` |
| Scripts/CI | `08_AUTOMATION_AND_SCRIPTS.md`, `examples/Makefile`, `examples/scripts/` |
| Testing/security/observability | `09_ENGINEERING_BEST_PRACTICES.md` |
| Git/branches/commits | `10_GIT_WORKFLOW.md` |
| Build order | `11_IMPLEMENTATION_PLAN.md` |
| Prompting Codex | `12_CODEX_PROMPTS.md` |
| Inspirations | `13_INSPIRATIONS.md` |
| Research-derived product notes | `14_SOURCE_RESEARCH_NOTES.md` |
| ADR process and reasoning | `15_ADR_PROCESS_AND_REASONING.md`, `adr/README.md`, relevant ADR file |
| Architecture decision change | `15_ADR_PROCESS_AND_REASONING.md`, `adr/TEMPLATE.md`, relevant existing ADRs |
| Codex execution runbook | `17_CODEX_EXECUTION_RUNBOOK.md` |

## Token-saving rule

For each Codex task, include:

```text
Read AGENTS.md, PROJECT_CONTEXT_SHORT.md, and only [specific docs]. Do not load the full docs pack.
```

## All-in-one file warning

`ALL_FILES_READY_TO_SAVE.md` intentionally contains everything. It is useful for saving, backup, and upload to a project source. It is not token-efficient for normal Codex development.


## Best implementation order

- `docs/16_BEST_IMPLEMENTATION_ORDER.md` — primary Codex CLI build order from documentation baseline to production.

- `17_CODEX_EXECUTION_RUNBOOK.md` - repeatable Codex execution loop for branch/task/review/commit workflow.

## Operational overlay files

| Task | Prefer these files/commands |
|---|---|
| Start any Codex session | `make session`, `make context`, `.codex/generated/session_context.md` |
| Create branch | `make new-work TYPE=feature SLUG=<slug>` |
| Track current task state | `docs/state/TASK_STATE.md`, `docs/state/SESSION_LOG.md` |
| Find accepted decisions quickly | `docs/state/DECISIONS_INDEX.md`, then relevant `docs/adr/*` |
| Run quality gates | `make check` / `scripts/quality-check.sh` |
| Validate env | `make env-check`, `make prod-check` |
| Backup/restore DB | `make db-backup`, `make db-restore FILE=<file>` |
| Understand overlay | `docs/18_OPERATIONAL_OVERLAY.md` |

Root operational files are meant for execution. `examples/` remains reference material.
