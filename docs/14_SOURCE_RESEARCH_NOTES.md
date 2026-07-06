# 14 - Source Research Notes

    ## Purpose
    Preserve key research-derived principles without forcing Codex to reread long research reports during implementation.

    ## Scope
    - Summarizes useful lessons from 90-day reset/productivity research and prior source-first/Codex workflow docs.
- Serves as practical product memory, not as a full citation report.
- Should be updated if the user runs new research.

    ## Assumptions
    - The user wants a 90-day reset app that avoids shame spirals.
- Codex should prioritize concise docs and source-first project context.
- The app should use recovery mechanisms and weekly reviews instead of harsh restarts.

    ## Success Criteria
    - Codex can implement product behavior based on stable principles.
- Research insights are converted into concrete app rules.
- The pack remains compact and non-redundant.

    ## Deliverables
    - Research principles.
- Failure modes to avoid.
- Implementation translations.
- Codex workflow notes.

    ## Product research principles

People usually complete bounded reset periods when the system has:

- clear start and end date;
- small number of priorities;
- daily anchors;
- weekly review;
- flexible minimum version;
- recovery mechanism;
- visible progress;
- enough forgiveness to continue after imperfect days.

## Reset90 implementation translations

| Principle | App behavior |
|---|---|
| Bounded challenge | Fixed 90-day cycle with day number and phase. |
| Daily anchors | Today Command Center and non-negotiables. |
| Minimum viable day | Minimum task tier and yellow day status. |
| Recovery after misses | Blue recovery day and gold comeback day. |
| Weekly reflection | Weekly review import/display. |
| Avoid overwhelm | Adaptive energy-based execution. |
| Pattern learning | Context summaries and analytics. |
| Privacy | Self-hosting, Authentik, export/backup. |

## Failure modes to avoid

- Too many goals at once.
- Complex schedule builder before basic dashboard works.
- Punishing streak logic.
- Restarting the entire 90 days after one miss.
- Storing sensitive text in logs.
- Building social/SaaS features.
- Adding embeddings before basic context search works.
- Letting GPT imports mutate production data without validation/idempotency.

## Codex workflow principles

- Keep context files short and reusable.
- Use stable prompts and specific docs per task.
- Prefer small feature branches.
- Run checks before completion.
- Store decisions in docs/context instead of relying on chat memory.
- Archive or summarize old Codex sessions when they become noisy.
