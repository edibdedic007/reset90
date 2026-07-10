#!/usr/bin/env bash
set -euo pipefail

./scripts/codex-context.sh >/dev/null

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
echo "Read only:"
echo "1. AGENTS.md"
echo "2. .codex/generated/session_context.md"
echo
echo "Current task:"
awk '
  /^## Current phase$/ {show=1}
  /^## Historical detail$/ {show=0}
  show {print}
' docs/state/TASK_STATE.md 2>/dev/null || true
echo
echo "Generated context: .codex/generated/session_context.md"
wc -lc .codex/generated/session_context.md 2>/dev/null || true
echo
echo "For phase work: make phase PHASE=<number>"
