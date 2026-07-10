#!/usr/bin/env bash
set -euo pipefail

MSG="${1:-}"
if [[ -z "$MSG" ]]; then
  echo "Usage: ./scripts/update-task-state.sh \"session note\""
  exit 1
fi

TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
BRANCH="$(git branch --show-current 2>/dev/null || echo unknown)"
ENTRY="- $TS — $BRANCH — $MSG"
TASK_FILE="docs/state/TASK_STATE.md"
TMP="${TASK_FILE}.tmp"

mkdir -p docs/state

awk -v entry="$ENTRY" -v day="${TS%%T*}" '
  BEGIN { in_latest = 0; replaced = 0 }
  /^Last updated:/ { print "Last updated: " day; next }
  /^## Latest handoff$/ {
    print
    print ""
    print entry
    in_latest = 1
    replaced = 1
    next
  }
  in_latest && /^## / {
    in_latest = 0
    print ""
    print
    next
  }
  in_latest { next }
  { print }
  END {
    if (!replaced) {
      print ""
      print "## Latest handoff"
      print ""
      print entry
    }
  }
' "$TASK_FILE" > "$TMP"
mv "$TMP" "$TASK_FILE"

printf '\n%s\n' "$ENTRY" >> docs/state/SESSION_LOG.md

echo "Updated latest handoff in $TASK_FILE and appended docs/state/SESSION_LOG.md"
