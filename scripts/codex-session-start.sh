#!/usr/bin/env bash
set -euo pipefail

echo "== Reset90 Codex session start =="
echo

echo "Branch: $(git branch --show-current 2>/dev/null || echo 'not-a-git-repo')"
echo

echo "Git status:"
git status --short 2>/dev/null || true
echo

echo "Recent commits:"
git log --oneline -5 2>/dev/null || true
echo

echo "Minimal reading order:"
echo "1. AGENTS.md"
echo "2. CODEX_START_HERE.md"
echo "3. PROJECT_CONTEXT_SHORT.md"
echo "4. docs/state/TASK_STATE.md"
echo "5. .codex/generated/session_context.md after running ./scripts/codex-context.sh"
echo "6. Only task-relevant docs and ADRs"
echo

echo "Active task excerpt:"
sed -n '1,140p' docs/state/TASK_STATE.md 2>/dev/null || true
echo

echo "Next recommended command: ./scripts/codex-context.sh"
