# 13 - Inspirations

    ## Purpose
    List exactly 10 inspirations Codex can use while developing Reset90, grouped into UI references, architecture/design patterns, and relevant repositories/tools.

    ## Scope
    - Exactly 10 inspirations total.
- Each inspiration has one-line reason.
- Inspirations are patterns, not cloning instructions.

    ## Assumptions
    - The user asked for inspiration research to guide Codex.
- Codex should borrow useful patterns but implement Reset90-specific behavior.
- No inspiration overrides the product requirements or privacy constraints.

    ## Success Criteria
    - Codex has concrete references for UI, architecture, and implementation patterns.
- The list remains compact and token-efficient.
- The app avoids copying any product wholesale.

    ## Deliverables
    - Exactly 10 grouped inspirations.
- One-line reason for each.
- Reset90 translation rules.

    ## UI references

1. **Daylio** — Fast mood/activity logging pattern for low-friction daily check-ins.
2. **Todoist** — Clean task organization pattern for today-focused lists without visual clutter.
3. **Linear** — Crisp issue/detail layout pattern for fast scanning, statuses, and keyboard-friendly interaction.
4. **GitHub Projects** — Board/table/status pattern for simple progress visibility across many items.

## Architecture/design patterns

5. **Command Center pattern** — One primary dashboard shows the current day, next actions, status, and recovery entry point.
6. **Event/Audit Log pattern** — Store raw imports, user actions, and decision logs so history can be reconstructed.
7. **Retrieval-Augmented Context pattern** — Store summaries and optional embeddings so future GPT/Codex sessions can reference prior context without full chat dumps.

## Relevant repositories/tools

8. **Memos** — Self-hosted private notes pattern for lightweight personal history and searchable memory.
9. **Actual Budget** — Self-hosted personal-data app pattern for local ownership, import/export, and private operations.
10. **Plausible Analytics** — Simple privacy-focused analytics pattern for useful dashboards without surveillance-style complexity.

## Reset90 translation rule

Use these inspirations as references only:

```text
Daylio speed + Todoist clarity + Linear/GitHub status visibility + self-hosted personal-data ownership + recovery-aware 90-day logic.
```

Do not copy branding, layouts, or features wholesale. The app’s purpose is still a private 90-day reset command center integrated with Custom GPT.
