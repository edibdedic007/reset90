Implement only Phase <N>.

1. Run `make session`.
2. Read `AGENTS.md` and `.codex/generated/session_context.md` only.
3. Run `make phase PHASE=<N>` and read that exact phase instead of the full
   roadmap.
4. Read at most the task-relevant docs and specific accepted ADRs.

Before editing, list the exact files expected to change, focused checks, final
quality gate, assumptions, and explicit non-goals.

Subagents are allowed for clearly independent, bounded work or parallel
verification. Give each subagent a narrow question and file scope; avoid duplicate
repo-wide scans. Do not load graphify, install optional tools, run browser
automation, or add extra review loops unless Phase <N> requires them or the user
explicitly asks. Use targeted file reads and do not reread unchanged files.

After implementation, run focused checks and `make check` once. Update compact
state and directly relevant docs, show `git status`, suggest a Conventional
Commit message, and stop. Do not begin Phase <N+1>.
