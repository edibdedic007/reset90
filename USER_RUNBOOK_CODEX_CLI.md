# User Runbook - Using Codex CLI to Build Reset90

    ## Purpose
    Give a beginner-friendly, step-by-step local-machine workflow for using Codex CLI to create the Reset90 app.

    ## Scope
    - Prerequisites, install/verify steps, prompt usage, file generation workflow, review/edit workflow, Git workflow, troubleshooting.
- Written for the user operating Codex CLI locally.
- Does not assume the user already has a finished app.

    ## Assumptions
    - User is comfortable with terminal basics but wants a clear beginner process.
- User has or can install Git, Node.js, Docker, and Codex CLI.
- User wants `main` as production and `local` as persistent developer-only branch.
- Actual Codex install command may vary by the user’s current OpenAI/Codex setup; verify with official docs if needed.

    ## Success Criteria
    - User can start a repo, run Codex, create branches, generate files, review changes, commit meaningfully, and troubleshoot common issues.
- User knows which docs to feed Codex for each phase.
- User does not accidentally deploy or overwrite production data.

    ## Deliverables
    - Beginner runbook.
- Step-by-step commands.
- Copyable Codex prompts.
- Review/edit workflow.
- Troubleshooting table.

    ## 1. Prerequisites

Install or verify:

```bash
git --version
node --version
npm --version
docker --version
docker compose version
codex --version
```

Recommended:

- Node.js 22 LTS or current project-supported version.
- Docker with Compose plugin.
- GitHub account if pushing remote repo.
- A private GitHub repository named `reset90` or similar.
- Authentik available later for production auth.

## 2. Create project folder

```bash
mkdir -p ~/projects
cd ~/projects
mkdir reset90
cd reset90
git init
```

Copy this pack into the repo root or into `docs/handoff/`.

Suggested:

```bash
mkdir -p docs/handoff
# copy reset90_codex_cli_pack_v2 contents into docs/handoff or repo root
```

If using the pack as the initial repo content, commit it first:

```bash
git add .
git commit -m "docs: add reset90 codex handoff pack"
```

## 3. Create branch model

```bash
git branch -M main
git switch -c local
```

Optional remote setup:

```bash
git remote add origin git@github.com:<your-user>/reset90.git
git push -u origin main
git push -u origin local
```

If `main` has no commit yet, create the initial commit before pushing.

## 4. Login and verify Codex

```bash
codex login
codex doctor
```

If Codex fails, run:

```bash
codex --help
```

Then fix authentication or configuration based on the output.

## 5. Start Codex safely

From repo root:

```bash
codex
```

Paste:

```text
Read AGENTS.md, PROJECT_CONTEXT_SHORT.md, CODEX_START_HERE.md, and docs/00_PACK_INDEX.md only. Summarize the current project rules in 10 bullets, inspect the repo, tell me the current branch/status, and recommend the next smallest implementation task. Do not edit files yet.
```

Review Codex’s answer. If it wants to read everything, stop it and say:

```text
Do not load the full pack. Read only the relevant files for the next task.
```

## 6. First file-generation workflow

Ask Codex to create the repo foundation:

```text
Read AGENTS.md, PROJECT_CONTEXT_SHORT.md, docs/02_SYSTEM_ARCHITECTURE.md, docs/07_ENVIRONMENTS_DEPLOYMENT.md, docs/08_AUTOMATION_AND_SCRIPTS.md, docs/10_GIT_WORKFLOW.md, and docs/11_IMPLEMENTATION_PLAN.md.

Create or update branch feature/repo-foundation from local. Implement Phase 0 only: Next.js + TypeScript + Tailwind skeleton, PostgreSQL local Docker Compose, ORM setup, .env examples, Makefile, health endpoint, and CI workflow. Keep changes small. Do not implement product features yet. Run available checks and report commands/results.
```

Let Codex edit files. When it finishes, inspect changes:

```bash
git status
git diff --stat
git diff
```

Run checks:

```bash
make check
```

If `make check` does not exist yet, ask Codex to add it or run the commands it created.

## 7. Review/edit workflow

After Codex changes files:

1. Read the changed files quickly.
2. Run the app if possible.
3. Run tests/checks.
4. Ask Codex to fix only specific failures.
5. Commit when clean.

Useful review prompt:

```text
Review the current branch against AGENTS.md and docs/10_GIT_WORKFLOW.md. Check for scope creep, secrets, unsafe migrations, missing tests, missing docs updates, and noncompliant branch/commit naming. Do not edit files unless I ask.
```

## 8. Commit workflow

Use Conventional Commits:

```bash
git add .
git commit -m "feat: add repository foundation"
```

Good examples:

```bash
git commit -m "feat(api): add GPT daily plan import"
git commit -m "fix(import): prevent duplicate idempotency keys"
git commit -m "docs: document production deployment flow"
git commit -m "chore(env): add local docker compose"
```

Avoid:

```bash
git commit -m "stuff"
git commit -m "updates"
git commit -m "wip"
```

## 9. Merge feature into local

```bash
git switch local
git merge --no-ff feature/repo-foundation
git push origin local
```

Do not merge to `main` yet unless it is production-ready.

## 10. Continue phase by phase

Recommended order:

1. `feature/repo-foundation`
2. `feature/core-data-model`
3. `feature/today-dashboard`
4. `feature/gpt-import`
5. `feature/daily-execution`
6. `feature/reviews`
7. `feature/analytics-grid`
8. `feature/export-production-ops`

For each phase:

```bash
git switch local
git pull origin local
git switch -c feature/<slug>
```

Then paste the relevant prompt from `docs/12_CODEX_PROMPTS.md`.

## 11. Production release workflow

Only when ready:

```bash
git switch local
make check
git switch main
git pull origin main
git merge --no-ff local
git push origin main
```

Then deploy from production server using the deployment script after you have backups configured.

## 12. Troubleshooting

| Problem | Fix |
|---|---|
| Codex edits too many files | Tell it: “Stop. Revert unrelated changes. Implement only the requested phase.” |
| Codex loads too much context | Tell it to read only AGENTS, PROJECT_CONTEXT_SHORT, and one task doc. |
| Branch confusion | Run `git branch --show-current` and `git status`; switch back to `local` before new work. |
| Tests fail | Paste the failing output and ask Codex for the smallest fix. |
| Docker DB not starting | Run `docker compose ps`, `docker compose logs db`, and check port 5432 conflict. |
| Migration broke local DB | Use local reset command, not production restore. |
| Production deploy failed | Stop, create/preserve backup, inspect logs, roll back app first; restore DB only if needed. |
| Secret committed | Rotate secret immediately, remove from Git history if necessary, add to `.gitignore`. |

## 13. Best habit while using Codex

Do not ask Codex to “build the whole app.” Ask it to build the next small phase, then review, test, and commit.


## Using ADRs while working with Codex

ADRs are the project's stable decision records. Use them when Codex is about to change something important.

Before asking Codex to change authentication, database schema, deployment, branch workflow, GPT imports, context memory, or core Reset90 behavior, add this sentence to your prompt:

```text
Read docs/15_ADR_PROCESS_AND_REASONING.md and docs/adr/README.md first, then follow the relevant accepted ADRs.
```

When Codex suggests a different architecture, ask:

```text
Does this contradict any accepted ADR? If yes, stop and explain the conflict before changing files.
```

When a new durable decision is needed, ask:

```text
Create an ADR for this decision first using docs/adr/TEMPLATE.md. Do not implement until the ADR is clear.
```

Do not ask Codex to store raw private reasoning. ADR reasoning means a short explanation of the decision that you can read later.
