# 09 - Engineering Best Practices

    ## Purpose
    Define software engineering practices Codex should follow while building and maintaining Reset90.

    ## Scope
    - Coding standards, testing, CI/CD, security, observability, documentation, code review, release management, incident response.
- Sized for a solo/self-hosted project but written like professional software.
- Applies to both human and Codex changes.

    ## Assumptions
    - The app contains sensitive personal data, so privacy/security matter even though it is single-user.
- Small disciplined practices are better than heavy enterprise process.
- The repository will be Git-managed and possibly pushed to GitHub.
- Production must be recoverable from backup.

    ## Success Criteria
    - Code remains readable, tested, secure, and deployable.
- Changes can be reviewed and rolled back.
- Sensitive data is protected.
- Incidents have a clear response path.

    ## Deliverables
    - Engineering standards.
- Testing strategy.
- CI/CD rules.
- Security/privacy checklist.
- Observability guidance.
- Documentation and review rules.
- Release and incident response process.

    ## Coding standards

- Use TypeScript strict mode.
- Prefer explicit domain types over loose `any`.
- Validate external inputs at boundaries.
- Keep business logic in testable functions, not buried in UI components.
- Keep components small and named by intent.
- Avoid premature abstractions.
- Use consistent formatting with Prettier or equivalent.
- Use ESLint or equivalent to catch unsafe patterns.
- Keep environment access centralized.

## Testing

Prioritize tests for logic that can corrupt or misrepresent user data:

- GPT payload validation;
- import idempotency;
- day number calculation;
- phase calculation;
- day status calculation;
- recovery credit logic;
- export generation;
- context pack generation;
- auth guards.

Test layers:

- unit tests for pure logic;
- integration tests for API + database;
- lightweight UI tests for critical flows;
- manual smoke test after deploy.

## CI/CD

CI should run the same checks as local `make check`.

Production deployment should:

1. verify clean tree;
2. pull `main`;
3. create backup;
4. build;
5. migrate;
6. start/restart;
7. healthcheck;
8. print logs if failure.

## Security

- No secrets in Git.
- Use HTTPS in production.
- Use Authentik OIDC for UI.
- Use separate GPT ingest token.
- Rate-limit ingest endpoint.
- Set max request body size.
- Validate all payloads.
- Avoid logging full reflections by default.
- Backups are sensitive.
- Exports are sensitive.
- Dependency scanning should be enabled if available.

## Observability

MVP observability:

- structured logs;
- request IDs;
- `/api/health` endpoint;
- startup logs with version/commit but no secrets;
- import success/failure counters;
- deploy healthcheck script.

Later:

- OpenTelemetry instrumentation;
- Prometheus metrics;
- uptime checks;
- error tracking.

## Documentation

Keep docs-as-code in the repo.

Update docs when changing:

- API contracts;
- database schema;
- deployment flow;
- branch workflow;
- GPT payload schema;
- context memory behavior;
- recovery/day status rules.

## Code review

Even as a solo developer, self-review every branch before merge:

```bash
git diff local...HEAD
make check
```

Review checklist:

- Is the scope small?
- Are secrets absent?
- Are migrations safe?
- Are payloads validated?
- Are sensitive logs avoided?
- Are docs updated?
- Can this be rolled back?

## Release management

Release from `main` only.

Suggested release flow:

```bash
git switch local
make check
git switch main
git merge --no-ff local
git tag v0.1.0
git push origin main --tags
make deploy-production
```

Use semantic versioning lightly:

- `v0.1.0` first MVP foundation;
- `v0.2.0` GPT import MVP;
- `v0.3.0` recovery/analytics MVP;
- patch tags for fixes.

## Incident response

For production issue:

1. Stop making changes.
2. Identify impact: app down, data issue, auth issue, import issue, deploy issue.
3. Preserve logs.
4. If data risk exists, create immediate backup.
5. Roll back app if needed.
6. Restore DB only if necessary.
7. Write an incident note in `docs/incidents/` or context log.
8. Add prevention task.

Incident note template:

```text
Date/time:
Impact:
Cause:
Detection:
Resolution:
Data affected:
Rollback/restore used:
Prevention:
```
