# ADR 0009: Custom GPT Is the Coach, Webapp Is the Dashboard and Storage Layer

## Status
Accepted

## Context
Reset90 depends on a Custom GPT for daily planning, reflection cleanup, pattern analysis, and weekly review generation. The webapp should not accidentally become a full chatbot, LLM orchestration platform, or journaling AI product.

## Decision
Keep Custom GPT responsible for coaching, planning, interpretation, reflection cleanup, motivation, and pattern synthesis. Keep the webapp responsible for authenticated storage, dashboards, task/check-in execution, analytics, imports, exports, backups, and context packet generation.

## Consequences
The webapp remains simpler, private, and self-hostable. GPT behavior can evolve without requiring the app to host an LLM. The app must expose stable import/export contracts and store durable summaries so future GPT sessions can regain context.

## Alternatives considered
Embedding a full chat interface in the app, calling OpenAI directly from the app for every coaching function, or using only ChatGPT history as the app memory. Rejected because they increase scope, cost, privacy risk, and implementation complexity.
