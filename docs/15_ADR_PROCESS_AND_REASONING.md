# 15 - ADR Process and Reasoning

## Purpose
Define how Architecture Decision Records are used in Reset90 so Codex preserves important decisions instead of re-litigating them.

## Scope
Covers ADR purpose, when to create one, ADR lifecycle, how Codex should read them, and how ADRs relate to decision logs and context memory.

## Assumptions
Reset90 is a solo private app but still benefits from lightweight architectural memory because Codex sessions may be resumed, forked, or started fresh. ADRs should be concise and practical, not enterprise-heavy.

## Success Criteria
Codex checks ADRs before changing architecture, auth, data model, deployment, branch policy, AI integration, or core behavioral rules. New important decisions are recorded as ADRs before or with implementation.

## Deliverables
ADR operating rules, decision categories, lifecycle rules, and Codex instructions for using ADRs.

## Why ADRs exist in this project

Reset90 will be built over many small Codex sessions. Without durable decision records, Codex may repeatedly question settled decisions or accidentally replace them with generic defaults.

ADRs are the repo's architectural memory. They record what was decided, why it was decided, what tradeoffs were accepted, and when the decision should be reviewed.

## ADRs vs decision logs vs context memory

| Item | Purpose | Stored where | Example |
|---|---|---|---|
| ADR | Durable architecture/product/process decision | `docs/adr/` | Use Authentik OIDC instead of app-managed passwords |
| Decision log | Smaller day-to-day implementation note | database or `PROJECT_CONTEXT_SHORT.md` | Chose Radix dialog for confirmation modal |
| Context memory | Searchable app/user/project context | app tables | Weekly review summary, task summary, imported GPT payload |
| Raw internal reasoning | Not required and not stored | nowhere | Hidden model chain-of-thought |

Do not confuse `reasoning_summary` or ADR reasoning with hidden chain-of-thought. ADR reasoning means a concise, user-visible explanation of decision factors.

## When Codex must check ADRs

Codex must read relevant ADRs before changing:

- branch model or release flow;
- authentication or authorization;
- database/storage choice;
- AI/GPT integration boundaries;
- context/memory design;
- product behavior rules such as recovery days and task tiers;
- local/production deployment model;
- API contract strategy;
- docs-as-code or Codex handoff rules.

## When Codex must create a new ADR

Create an ADR when a change is:

- hard to reverse;
- likely to affect multiple files or phases;
- architectural rather than cosmetic;
- a product rule that changes how Reset90 behaves;
- a security, privacy, deployment, or data-retention decision;
- a deviation from an accepted ADR.

Do not create ADRs for small UI copy changes, local refactors with no behavior change, routine dependency bumps, or implementation details already covered by an existing ADR.

## ADR lifecycle

Statuses:

- `Proposed` - written but not yet accepted.
- `Accepted` - current rule for implementation.
- `Superseded` - replaced by a newer ADR.
- `Deprecated` - no longer recommended but not yet replaced.
- `Rejected` - considered and intentionally not used.

Rules:

- Never edit the meaning of an accepted ADR silently.
- If a decision changes, create a new ADR and mark the old ADR as superseded.
- Keep ADRs short enough for Codex to read during implementation.
- Link implementation PRs/commits to ADR numbers in commit bodies when relevant.

## ADR naming

Use:

```text
NNNN-short-slug.md
```

Examples:

```text
0001-modular-monolith.md
0002-postgresql-source-of-truth.md
```

## Codex instruction

Before implementing a phase, Codex should run this mental checklist:

```text
Does this task touch an accepted ADR?
If yes, read it and follow it.
Does this task introduce a new architectural/product/process decision?
If yes, create or update an ADR before finalizing.
Does this task contradict an accepted ADR?
If yes, stop and ask the user before changing direction.
```

## Current ADR baseline

The current accepted ADR baseline is:

```text
docs/adr/0001-modular-monolith.md
docs/adr/0002-postgresql-source-of-truth.md
docs/adr/0003-json-schema-import-contracts.md
docs/adr/0004-separate-auth-boundaries.md
docs/adr/0005-observability-ladder.md
docs/adr/0006-context-summaries-not-chain-of-thought.md
docs/adr/0007-prisma-orm.md
docs/adr/0008-main-production-local-dev-branch.md
docs/adr/0009-custom-gpt-as-coach-webapp-as-dashboard.md
docs/adr/0010-minimum-standard-ideal-task-model.md
docs/adr/0011-recovery-days-instead-of-harsh-streaks.md
docs/adr/0012-docker-compose-and-traefik-deployment.md
docs/adr/0013-docs-as-code-codex-memory.md
```
