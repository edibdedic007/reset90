# ADR 0005: Use an Observability Ladder

## Status
Accepted

## Context
Reset90 needs operational visibility, but full Prometheus/Grafana/OpenTelemetry from day one may overcomplicate MVP.

## Decision
Start with health endpoints, Docker health checks, and structured logs. Add Uptime Kuma and Dozzle for practical self-hosted monitoring. Add Prometheus/Grafana/OpenTelemetry later only if the app becomes operationally important enough.

## Consequences
MVP stays simple while still having a path to mature observability.

## Alternatives considered
No monitoring, or full observability stack immediately. Rejected because both extremes are wrong for a personal MVP.
