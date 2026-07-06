# 17 - Codex Execution Runbook

## Purpose
Define the repeatable Codex CLI execution loop for building Reset90 from the documentation pack without scope creep.

## Scope
Covers how to start a task, choose a branch, feed Codex context, review changes, run checks, commit, merge, update docs, and stop when scope drifts.

## Assumptions
The repository contains this handoff pack, the user will work locally with Git, and `docs/16_BEST_IMPLEMENTATION_ORDER.md` is the source of truth for build order.

## Success Criteria
Each Codex session produces one small, reviewable increment; accepted ADRs remain respected; `PROJECT_CONTEXT_SHORT.md` stays current; `main` remains production-ready.

## Deliverables
Task loop, branch loop, prompt pattern, review checklist, commit checklist, and troubleshooting prompts.

# Codex execution loop

## 1. Start from the right branch

Normal work starts from `local`:

```bash
git switch local
git pull origin local
git switch -c feature/<slug>
```

Use `cleanup/<slug>`, `fix/<slug>`, `refactor/<slug>`, `chore/<slug>`, or `docs/<slug>` when that better matches the work.

Emergency production fixes may branch from `main`, then merge back into both `main` and `local`.

## 2. Give Codex minimal context

Use this pattern:

```text
Read first:
- AGENTS.md
- PROJECT_CONTEXT_SHORT.md
- CODEX_START_HERE.md

Then read only the relevant phase in:
- docs/16_BEST_IMPLEMENTATION_ORDER.md

Also read relevant ADRs from docs/adr/ before editing.

Current task:
[paste one phase or one subtask]

Rules:
- Keep changes small.
- Do not build unrelated features.
- Follow accepted ADRs.
- Run checks.
- Update PROJECT_CONTEXT_SHORT.md.
```

Do not feed `ALL_FILES_READY_TO_SAVE.md` to Codex during implementation.

## 3. Require a plan before edits

Ask Codex to summarize:

- files it expects to touch;
- checks it will run;
- assumptions;
- which ADRs apply;
- what it will not do.

## 4. Review changes before commit

Run:

```bash
git status
git diff --stat
git diff
```

Reject or revert unrelated changes. Stop Codex if it adds SaaS, public signup, teams, payments, Kubernetes, microservices, Caddy/Nginx, or raw hidden reasoning storage.

## 5. Run checks

Preferred:

```bash
make check
```

If `make check` does not exist yet, run the closest available commands and ask Codex to add the Makefile target in the appropriate phase.

## 6. Commit meaningfully

Use Conventional Commits:

```bash
git add .
git commit -m "feat(imports): validate GPT daily plan payloads"
```

Commit size guidance:

- one concept per commit;
- docs updates can be included with related code;
- avoid giant mixed commits;
- do not commit secrets, backups, exports, or logs.

## 7. Merge into local

After checks pass:

```bash
git switch local
git merge --no-ff feature/<slug>
```

Delete short-lived branches after merge when no longer needed.

## 8. Release to production main

Only after production readiness:

```bash
git switch local
make check
git switch main
git pull origin main
git merge --no-ff local
git push origin main
```

`main` is production. Do not merge experimental work into `main`.

# Re-alignment prompt

Use this when Codex drifts:

```text
Stop and re-align.

Read:
- AGENTS.md
- PROJECT_CONTEXT_SHORT.md
- docs/16_BEST_IMPLEMENTATION_ORDER.md
- docs/adr/README.md

Current task:
[paste task]

Rules:
- Do not change architecture.
- Follow accepted ADRs.
- Keep Reset90 single-user/private.
- Use Prisma, PostgreSQL, Docker Compose, Traefik, Authentik OIDC, and GPT machine ingest auth.
- Store raw GPT imports before normalization.
- Validate imports with JSON Schema/Zod.
- Do not store hidden chain-of-thought.
- Update PROJECT_CONTEXT_SHORT.md.

Summarize the correct scope before editing files.
```
