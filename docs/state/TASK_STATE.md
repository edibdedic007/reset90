# Task State

Last updated: 2026-07-26

## Current phase

Phase 21 production Docker Compose and reverse-proxy deployment artefacts are
implemented on `chore/production-deployment`. This phase prepares and validates
deployment locally; it does not connect to or change live infrastructure,
production data, DNS, Traefik, Authentik, certificates, or secrets.

Phase 21 adds no product feature, Prisma schema change, application migration,
seed change, backfill, dependency version, browser-auth change, GPT contract
change, ownership change, or HSTS policy.

## Active task

The production image uses four stages, the committed frozen pnpm lockfile, a
production Next.js build, pruned runtime dependencies, and a non-root UID/GID
1001 runtime. It contains the production Next and Prisma CLIs, checked-in Prisma
schema/migrations, readiness curl utility, and writable export/backup mount
points. It does not copy environment files, Git metadata, tests, docs, source
bind mounts, backups, exports, logs, or development servers into the final
stage.

Production Compose defines exactly one app and one PostgreSQL service. The app
joins the private Reset90 network and existing external Traefik network;
PostgreSQL joins only the private network. Neither service publishes a host
port. Traefik labels exist only on the app and route the canonical HTTPS host to
internal port 3000. PostgreSQL data, generated exports, and database backups use
named volumes. Both containers use `restart: unless-stopped`.

The ignored `.env.production` is selected explicitly for Compose interpolation.
The committed example contains placeholders only. Preflight requires production
OIDC, canonical HTTPS `APP_URL`, matching `RESET90_HOST`, database hostname
`db`, distinct browser/OIDC/GPT secrets, fixed runtime paths, full lowercase Git
SHA, and required Traefik values. Ambient values cannot override the selected
file, and the obsolete configurable 1 MiB GPT limit is absent.

Deployment now checks commands/files, env values, clean revision, Compose
interpolation, and the external Traefik network before Docker mutation. It
records the attempted SHA, starts and waits for PostgreSQL, creates and verifies
a timestamped revision-stamped pre-migration backup, builds the immutable SHA
image, runs one explicit `prisma migrate deploy`, promotes without rebuilding or
deleting volumes, waits for database/application health, verifies the canonical
public HTTPS readiness URL, prints bounded status/allowlisted logs, and records
successful/previous known-good revisions. Failed application/public health
stops the failed app and does not record success.

## Next phase

Phase 22 has not started. Live server access, host package changes, production
directories/network/routes, DNS, certificates, Authentik clients, real secrets,
first live backup/migration/start, complete live OIDC/GPT verification, HSTS
selection, and rollback/restore drills remain explicitly deferred.

## Next actions

1. Review the commit-ready Phase 21 diff.
2. Commit with the suggested Conventional Commit message, push, open the pull
   request, and require the external `quality` job before merge.
3. Do not begin Phase 22 without separate explicit approval.

## Verification evidence

- Focused production deployment coverage passes 1 file with 22 tests. It parses
  fully rendered Compose JSON; checks image/runtime policy, private networks,
  Traefik labels, named volumes, missing interpolation, and env constraints; and
  exercises quoted-path deploy success plus missing env, placeholder, dirty
  tree, revision mismatch, Compose, network, backup, build, migration, internal
  health, and public health failures with command stubs.
- Bash syntax passes for all new/changed production scripts. Non-secret Compose
  validation with `.env.production.example` passes without rendering values.
- Targeted TypeScript checking passes after typing partial fake environment
  overrides without weakening production environment types.
- Actual Docker build enforces the frozen lockfile, compiles Next.js in
  production, prunes all dev dependencies, creates the non-root final image, and
  confirms the health utility, Prisma CLI/schema/migrations, internal port 3000,
  production start command, and forbidden-file exclusions.
- Disposable stack smoke created a pre-migration backup, applied all 9 existing
  migrations once, reported no pending migrations on repeat, reached healthy
  PostgreSQL and app readiness, and exposed no host-published database port.
- The first smoke migration command exposed pnpm attempting a non-root
  dependency repair. Runtime start/migration now invoke the checked-in Next and
  Prisma CLIs directly, and the second migration attempt passed.
- The second stack smoke reached healthy application readiness, then exposed a
  root-owned fresh export volume. The image now seeds export/backup mount points
  as UID/GID 1001. Per the two-attempt smoke cap, the full stack was not started
  a third time; a focused fresh named-volume test proved non-root export writes
  and persistence across container recreation.
- Forced PostgreSQL recreation retained all 9 migration records and the
  verified revision-stamped backup. All disposable containers, networks,
  volumes, temp environment data, and the potentially misleading uncommitted
  SHA image tag were removed afterward.
- The single final `make check` passed with frozen dependency install,
  formatting, lint, TypeScript, 26 unit/component files with 472 tests, payload
  and generated-schema drift validation, Prisma validation, all 9 migrations,
  2 PostgreSQL files with 12 tests, production Next.js build, shell syntax, and
  Git diff whitespace checks.

## Migration, deployment, and rollback

- No `prisma/schema.prisma` or migration file changed. Smoke used only existing
  migrations against an isolated disposable PostgreSQL volume.
- No live deployment or production data operation occurred.
- Repeated migration on the isolated current database was a no-op. Deployment
  never seeds, runs `migrate dev`, uses `db push`, resets schema, selects
  `latest`, executes `down -v`, rotates secrets, or deletes named volumes.
- Before migration failure, the existing application remains untouched. After
  migration, compatibility with the prior app must be decided from checked-in
  contracts. Compatible rollback uses the previous known-good immutable image;
  incompatible rollback requires stopped writes and an explicit operator restore
  from the verified backup. No destructive restore is automatic.

## Latest handoff

- 2026-07-26T18:03:42Z — `chore/production-deployment` — Phase 21 artefacts,
  focused deployment tests, production image build, bounded disposable
  persistence smoke, and the single final `make check` passed; no live
  deployment, schema/migration/seed, product/auth/ownership, HSTS, or Phase 22
  change; next step: review and commit, then push/open the PR and require its
  external `quality` job
