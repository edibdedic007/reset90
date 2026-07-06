# 10 - Git Workflow

    ## Purpose
    Define branch naming, branch lifecycle, merge targets, and commit rules for Reset90.

    ## Scope
    - `main` production branch.
- `local` persistent developer-only branch.
- Short-lived feature/cleanup/fix/refactor/chore/docs branches.
- Conventional Commits and commit size guidance.

    ## Assumptions
    - The user explicitly wants `main` and `local` branches.
- The repo may be pushed to GitHub.
- Production deploys should only come from `main`.
- Codex should create task branches, not work directly on `main`.

    ## Success Criteria
    - Branch purpose is clear from name.
- Production remains deployable.
- Local work can accumulate safely before release.
- Commit history is readable and reversible.

    ## Deliverables
    - Branch model.
- Naming conventions.
- Lifecycle and merge target rules.
- Conventional Commit examples.
- Commit size guidance.

    ## Branch roles

### `main`

- Production branch.
- Must always be deployable.
- Production deployments pull from `main`.
- Protected if using GitHub branch protection.
- No direct Codex feature work unless emergency hotfix and user approves.

### `local`

- Persistent developer-only branch.
- Integration branch for local development.
- Not production.
- Short-lived branches usually branch from and merge back into `local`.
- Can be pushed to GitHub for backup, but not deployed as production.

## Short-lived branch names

Use exactly these families:

```text
feature/<slug>
cleanup/<slug>
fix/<slug>
refactor/<slug>
chore/<slug>
docs/<slug>
```

Examples:

```text
feature/daily-plan-import
feature/recovery-mode
cleanup/remove-unused-ui
fix/import-idempotency
refactor/context-service
chore/docker-production-env
docs/update-api-contracts
```

## Branch lifecycle

### Normal feature work

```bash
git switch local
git pull origin local
git switch -c feature/<slug>
# work, commit, check
git switch local
git merge --no-ff feature/<slug>
```

Merge target:

- feature/cleanup/fix/refactor/chore/docs branches merge into `local`.
- `local` merges into `main` only when production-ready.

### Production release

```bash
git switch local
make check
git switch main
git pull origin main
git merge --no-ff local
git push origin main
```

Then deploy production from `main`.

### Hotfix

When production is broken:

```bash
git switch main
git pull origin main
git switch -c fix/<slug>
# fix, test, commit
git switch main
git merge --no-ff fix/<slug>
git push origin main
# then back-merge to local
git switch local
git merge --no-ff main
```

Hotfix branches may target `main` first, then back-merge into `local`.

## Conventional Commits

Format:

```text
<type>(optional-scope): <short imperative summary>
```

Types:

- `feat`
- `fix`
- `refactor`
- `cleanup`
- `chore`
- `docs`
- `test`
- `ci`
- `build`
- `perf`

Examples:

```text
feat(api): add GPT daily plan import endpoint
fix(import): prevent duplicate tasks for repeated idempotency key
refactor(context): extract context pack builder
cleanup(ui): remove unused dashboard card component
chore(env): add production compose example
docs(git): document local branch lifecycle
test(recovery): cover recovery credit calculation
ci: validate payload examples on pull request
```

## Commit size guidance

A good commit:

- has one purpose;
- can be explained in one sentence;
- passes relevant checks;
- does not mix formatting with logic unless unavoidable;
- does not mix unrelated product features;
- is small enough to revert safely.

Avoid:

```text
feat: add everything
fix: stuff
update files
wip
misc
```

## Before commit checklist

```bash
git status
git diff
make check
```

If checks are too expensive during early scaffold, run at least:

```bash
npm run lint
npm run typecheck
npm test
```

## Pushing branches

```bash
git push -u origin feature/<slug>
git push origin local
git push origin main
```

Do not force-push `main`. Avoid force-pushing `local` unless intentionally repairing a bad local-only history and the user approves.
