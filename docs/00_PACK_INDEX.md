# 00 - Pack Index

## Purpose

Select the smallest source set for a task. Normal sessions begin with compact
generated context, not the full documentation pack.

## Session and phase commands

| Need | Use |
|---|---|
| Start a Codex session | `make session`, then read `AGENTS.md` and `.codex/generated/session_context.md` |
| Read one implementation phase | `make phase PHASE=<number>` |
| Refresh compact context only | `make context` |
| Current task | `docs/state/TASK_STATE.md` (already embedded in generated context) |
| Historical handoffs | `docs/state/SESSION_LOG.md` |
| Detailed completed history | `docs/state/COMPLETED_PHASES.md` (archive; do not load normally) |
| Find an accepted decision | `docs/state/DECISIONS_INDEX.md`, then one relevant ADR |

## Task-to-document lookup

| Task | Smallest useful docs |
|---|---|
| Product clarification | `01_PRODUCT_REQUIREMENTS.md`, `06_UX_FLOWS.md` |
| Architecture | `02_SYSTEM_ARCHITECTURE.md`, relevant ADR |
| Database/schema | `03_SYSTEM_DESIGN_DATA_MODEL.md`, relevant ADR |
| GPT imports/actions | `04_API_AND_AI_PAYLOAD_CONTRACTS.md`, relevant schema source |
| Context/memory | `05_CONTEXT_MEMORY_DESIGN.md`, ADR 0006 |
| UX/dashboard | `06_UX_FLOWS.md` |
| Local/production deployment | `07_ENVIRONMENTS_DEPLOYMENT.md`, `08_AUTOMATION_AND_SCRIPTS.md` |
| Testing/security/observability | `09_ENGINEERING_BEST_PRACTICES.md`, `19_SECURITY_CHECKLIST.md` |
| Git workflow | `10_GIT_WORKFLOW.md`, ADR 0008 |
| ADR process | `15_ADR_PROCESS_AND_REASONING.md`, `adr/README.md` |
| Codex work loop | `17_CODEX_EXECUTION_RUNBOOK.md` |
| Context helper behavior | `18_OPERATIONAL_OVERLAY.md` |

## Exclusions

Do not load the following during normal implementation:

- `ALL_FILES_READY_TO_SAVE.md` (generated on demand and ignored by Git);
- the full `docs/16_BEST_IMPLEMENTATION_ORDER.md`;
- `docs/state/COMPLETED_PHASES.md`;
- `examples/`, lockfiles, generated schemas, exports, backups, logs, or Codex
  transcripts unless directly required.
