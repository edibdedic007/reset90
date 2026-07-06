# AGENTS.md

## Purpose

Standing instructions for all Codex CLI work on Reset90. Read this file at the start of every session.

## Minimal session flow

1. Run `make session` if available.
2. Run `make context` to refresh `.codex/generated/session_context.md`.
3. Read `CODEX_START_HERE.md`, `PROJECT_CONTEXT_SHORT.md`, `docs/state/TASK_STATE.md`, and the generated context.
4. Read only task-relevant docs and ADRs.
5. Make a short plan before editing.
6. Keep changes small, tested, documented, and commit-ready.

Never read `ALL_FILES_READY_TO_SAVE.md` during normal implementation. It is for human backup/export only.

## Product non-negotiables

- Build Reset90 as a private, self-hosted, single-user 90-day reset command center.
- Do not add SaaS, payments, public signup, teams, leaderboards, public sharing, or marketing pages.
- Fixed 90-day skeleton with adaptive daily execution.
- Every day supports minimum, standard, and ideal task tiers.
- Recovery days are tracked and limited, but never treated as moral failure.
- User-facing copy must avoid shame language such as “you failed,” “you wasted the day,” “start over,” or similar.
- Custom GPT is the coach, planner, interpreter, and analyst.
- Webapp is the dashboard, storage, tracker, analytics, validation, and export layer.
- Eye/health features may track exercises, appointments, and symptoms only; do not make medical claims.

## Engineering defaults

- Recommended stack: Next.js App Router, TypeScript, PostgreSQL, Prisma, Zod/JSON Schema, Tailwind CSS, Docker Compose, Authentik OIDC in production.
- Validate all API inputs and GPT payload imports before writing normalized data.
- Store raw GPT import payloads before normalized processing.
- Keep business logic outside React components where practical.
- Use migrations for schema changes.
- Add tests for meaningful logic.
- Keep docs live: behavior changes require relevant doc updates in the same branch.
- No secrets, real tokens, production database exports, or private journal dumps in Git.

## Git rules

- `main` is production.
- `local` is persistent developer-only integration/WIP branch.
- Normal work branches come from `local`.
- Release and hotfix branches may come from `main`.
- Branch names: `feature/<slug>`, `fix/<slug>`, `cleanup/<slug>`, `refactor/<slug>`, `chore/<slug>`, `docs/<slug>`, `test/<slug>`, `security/<slug>`, `release/<version>`, `hotfix/<slug>`, `experiment/<slug>`.
- Use Conventional Commits.
- Keep commits small and meaningful.
- Run `make check` or the closest available checks before declaring completion.
- Update `docs/state/TASK_STATE.md` and `docs/state/SESSION_LOG.md` after meaningful work.

## ADR rules

- Accepted ADRs in `docs/adr/` are implementation constraints.
- Do not contradict an accepted ADR without asking the user first.
- If a new durable decision is made, create a new ADR from `docs/adr/TEMPLATE.md`.
- ADR reasoning must be concise user-visible rationale, not hidden chain-of-thought.
- Link significant implementation work back to relevant ADR numbers in commit bodies or PR notes when practical.

## Context memory rules

Store concrete application context, not hidden model reasoning:

- task summaries;
- decision logs and ADRs;
- daily/weekly summaries;
- user-visible rationale summaries;
- context snapshots;
- optional embeddings for retrieval.

Never require raw internal chain-of-thought logs. A field named `reasoning_summary` must mean a user-visible explanation or summarized rationale.

## Session-end checklist

Before ending a Codex session, provide or commit:

- changed files summary;
- checks run and results;
- skipped checks and why;
- updated `docs/state/TASK_STATE.md` and session notes;
- docs/ADR updates if behavior changed;
- clear next step.
