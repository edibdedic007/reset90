# ADR 0006: Store Context Summaries, Not Hidden Chain-of-Thought

## Status
Accepted

## Context
The user wants the app to remember conversation and thinking context. Hidden model chain-of-thought is not available and should not be stored or requested.

## Decision
Store user-visible summaries: reasoning summaries, cleaned reflections, decisions, context snapshots, tags, and source import references. Do not store hidden chain-of-thought.

## Consequences
The app gets useful memory without depending on inaccessible private reasoning. GPT context packets remain compact and safe.

## Alternatives considered
Trying to store raw hidden reasoning. Rejected because it is not available, not appropriate, and unnecessary.
