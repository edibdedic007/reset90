# ADR 0002: PostgreSQL Is the Source of Truth

## Status
Accepted

## Context
The app needs durable storage for daily plans, reflections, status, imports, context snapshots, decisions, and exports.

## Decision
Use PostgreSQL as the primary source of truth. Custom GPT conversations can generate and analyze data, but they are not the database.

## Consequences
The app remains independent from ChatGPT conversation history. Backups, exports, analytics, and recovery become reliable.

## Alternatives considered
Local files only, ChatGPT project history only, vector database as primary storage. Rejected because they are weaker for transactional product state.
