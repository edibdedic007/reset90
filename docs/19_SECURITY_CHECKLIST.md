# Phase 20 Security Checklist

Status: implemented on `fix/security-hardening`.

## Browser boundary

- Custom browser mutations require an Auth.js browser identity that resolves to
  an existing Reset90 user. Application reads and mutations do not create or
  upsert users.
- User, owner, active cycle, current UTC day, and mutation timestamps are
  derived server-side. Existing owned-query and singular-active-cycle
  constraints remain authoritative.
- Every custom browser `POST`, `PUT`, `PATCH`, and `DELETE` requires an `Origin`
  exactly matching canonical `APP_URL`. Missing, foreign, or `null` origins and
  `Sec-Fetch-Site: cross-site` are rejected. `Host` and forwarded-host headers
  never define accepted origin.
- Browser mutations accept only `application/json`, reject compressed bodies,
  stream-cap request bodies at 16 KiB, and validate before writes.
- Application-domain `GET` and `HEAD` handlers are read-only. Current status is
  derived in memory for reads; persistence happens only in explicit mutation or
  import transactions.
- Central method policy returns `405 Method Not Allowed` with `Allow` for
  unsupported application-domain methods. Auth.js protocol routes are excluded.

## Custom GPT machine boundary

- `/api/gpt/import` accepts credentials only as `Authorization: Bearer <token>`.
  Browser sessions, cookies, query values, bodies, and alternate headers do not
  authorize imports. Token comparison hashes both values before constant-time
  comparison, so differing lengths are safe.
- Authentication finishes before content checks or body reads. Authenticated
  requests require `application/json`, identity content encoding, and a streamed
  128 KiB maximum. Canonical validation happens before raw persistence.
- Every import kind uses `GPT_INGEST_OWNER_SUBJECT` to resolve one existing
  trusted user and one singular owned active cycle under lock. Daily-plan targets
  are selected only inside that cycle; matching fields in another cycle are not
  fallback targets.
- Valid raw imports remain immutable. Existing idempotency, replacement,
  normalization, and transaction behavior remains in force inside the trusted
  owner boundary.
- Process-local rolling limits are 120 requests per 60 seconds endpoint-wide and
  30 per 60 seconds for the authenticated machine principal. Principal keys are
  non-reversible token fingerprints. Rejections return `429` and `Retry-After`.
- Rate counters reset on process restart and are not shared across replicas.
  They are not durable quotas or audit logs. Distributed, proxy, and IP-based
  limits remain deferred.

## Logging and errors

- Application security events use an explicit allowlist: event, operation, safe
  code, HTTP status, generated correlation ID, duration, safe record ID, and
  aggregate count.
- Tokens, authorization/cookie/session headers, database URLs, environment
  dumps, request bodies, raw imports, reflections, check-in notes, private
  context, Prisma objects/errors, and caught exception objects are never logged.
- Known errors use bounded codes. Unknown route failures return generic bounded
  responses and emit only an allowlisted event. Stack traces are not returned.

## Headers and cookies

- All normal responses receive `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, restrictive
  `Permissions-Policy`, and a centrally managed CSP.
- CSP defaults to same-origin resources, denies objects, base URIs, and framing,
  restricts forms to self, has no wildcard sources or `unsafe-eval`, and permits
  only current compatible inline script/style behavior.
- Production session cookies are `Secure`, `HttpOnly`, and `SameSite=Lax`.
  Local HTTP development uses the same protections except `Secure` where HTTP
  requires it.
- HSTS, subdomain/preload policy, nonce CSP, and trusted reverse-proxy behavior
  remain deferred until Phase 21 verifies the final HTTPS path.

## Repository hygiene

- Git and Docker ignore rules exclude real environment files, dumps, backups,
  generated exports/archives, logs, coverage, Codex transcripts, private journal
  or reflection dumps, and generated runtime data. Approved placeholder example
  environment files remain trackable.
- `make check-sensitive` uses `git ls-files` and fails closed if a forbidden path
  is tracked. `make check` runs it against the real repository. Automated tests
  also prove a synthetic tracked secret path fails.
- Phase 20 does not scan Git history, rewrite history, install an external secret
  scanner, add a durable audit log, or change encryption/storage architecture.

## Phase 21 deployment assumptions

Phase 21 must provide verified HTTPS termination, trusted proxy behavior, final
container topology, HSTS decision, and any reverse-proxy or distributed rate
limiting. Phase 20 implements no production Dockerfile, production Compose
stack, Traefik configuration, deployment script, or cutover.
