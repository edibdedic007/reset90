# AGENTS.md

## Purpose

Standing instructions for Codex CLI work on Reset90. Read this file once at the
start of a session.

## Minimal session flow

1. Run `make session`. It refreshes `.codex/generated/session_context.md` and
   prints a short repository summary.
2. Read `AGENTS.md` and `.codex/generated/session_context.md` only.
3. For phase work, run `make phase PHASE=<number>` and read that output instead
   of opening all of `docs/16_BEST_IMPLEMENTATION_ORDER.md`.
4. Read only the one or two task-relevant docs and the specific accepted ADRs
   that constrain the change.
5. Make a short plan with expected files and checks before editing.
6. Stop after the requested scope and required checks are complete.

Read `CODEX_START_HERE.md` only when the workflow itself is unclear. Never read
`ALL_FILES_READY_TO_SAVE.md`; it is a generated export, not implementation
context.

## Context and token controls

- Use targeted `rg`, `sed`, or file-range reads. Do not `cat` large documents.
- If output is truncated, narrow the query; do not reread the whole file in
  chunks unless the entire file is genuinely required.
- Do not reread unchanged files already inspected in the current session.
- Do not scan `examples/`, generated schemas, lockfiles, exports, logs, or
  archives unless the task directly concerns them.
- Subagents are available for clearly independent, bounded work or parallel
  verification. Give each subagent a narrow question and file scope. Do not have
  multiple agents scan the whole repository or duplicate main-thread work. The
  main agent owns integration, conflict resolution, and final validation.
- Do not load `graphify` unless the user explicitly requests a graph/diagram or
  the required deliverable is a visual artifact. Ordinary implementation,
  planning, architecture discussion, and documentation updates do not qualify.
- Do not install optional test tools or start browser automation unless the task
  requires browser behavior or the user explicitly asks for it.
- Run focused checks while developing and `make check` once before completion.
  Do not repeat a passing full gate unless subsequent edits can invalidate it.
- When required work is complete, report optional follow-up validation instead
  of performing an unbounded extra review loop.

## Product non-negotiables

- Private, self-hosted, single-user 90-day reset command center.
- No SaaS, payments, public signup, teams, leaderboards, public sharing, or
  marketing pages.
- Fixed 90-day skeleton with adaptive daily execution.
- Every day supports minimum, standard, and ideal task tiers.
- Recovery days are tracked and limited, but never treated as moral failure.
- User-facing copy must avoid shame language.
- Custom GPT is the coach/planner/analyst; the webapp is the dashboard, storage,
  tracker, validation, analytics, and export layer.
- Health-related features may track exercises, appointments, and symptoms only;
  do not make medical claims.

## Engineering defaults

- Next.js App Router, TypeScript, PostgreSQL, Prisma, Zod/JSON Schema, Tailwind,
  Docker Compose, and Authentik OIDC in production.
- Validate API inputs and GPT imports before normalized writes.
- Store raw GPT import payloads before normalized processing.
- Keep business logic outside React components where practical.
- Use migrations for schema changes and tests for meaningful logic.
- Update only documentation directly affected by the change.
- Never commit secrets, production data, private journal dumps, generated Codex
  transcripts, or all-in-one documentation exports.

## Git and ADR rules

- `main` is production; `local` is the persistent development integration branch.
- Normal work branches come from `local`; use Conventional Commits.
- Accepted ADRs in `docs/adr/` are constraints. Do not contradict one without
  asking the user first.
- Create an ADR only for a new durable architecture/product/process decision.
- ADR reasoning is concise user-visible rationale, never hidden chain-of-thought.

## Session-end checklist

Before ending:

- summarize changed files;
- report focused checks and the single final gate;
- list skipped checks and why;
- update `docs/state/TASK_STATE.md` and append `docs/state/SESSION_LOG.md`;
- update directly relevant docs/ADRs;
- show `git status` and the next step.
