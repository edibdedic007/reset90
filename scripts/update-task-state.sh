#!/usr/bin/env bash
set -euo pipefail

MSG="${1:-}"
if [[ -z "$MSG" ]]; then
  echo "Usage: ./scripts/update-task-state.sh \"session note\""
  exit 1
fi

TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
BRANCH="$(git branch --show-current 2>/dev/null || echo unknown)"
mkdir -p docs/state
{
  echo
  echo "- $TS — $BRANCH — $MSG"
} >> docs/state/TASK_STATE.md
{
  echo
  echo "- $TS — $BRANCH — $MSG"
} >> docs/state/SESSION_LOG.md

echo "Updated docs/state/TASK_STATE.md and docs/state/SESSION_LOG.md"
