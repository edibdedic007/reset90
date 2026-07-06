#!/usr/bin/env bash
set -euo pipefail

OUT=".codex/generated/session_context.md"
mkdir -p .codex/generated

{
  echo "# Reset90 compact Codex context"
  echo
  echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  echo "## Git"
  echo
  echo '```text'
  echo "branch=$(git branch --show-current 2>/dev/null || echo unknown)"
  git status --short 2>/dev/null || true
  echo '```'
  echo
  echo "## Standing rules"
  sed -n '1,220p' AGENTS.md 2>/dev/null || true
  echo
  echo "## Start-here summary"
  sed -n '1,180p' CODEX_START_HERE.md 2>/dev/null || true
  echo
  echo "## Project context"
  sed -n '1,220p' PROJECT_CONTEXT_SHORT.md 2>/dev/null || true
  echo
  echo "## Operational task state"
  sed -n '1,220p' docs/state/TASK_STATE.md 2>/dev/null || true
  echo
  echo "## Decision index"
  sed -n '1,220p' docs/state/DECISIONS_INDEX.md 2>/dev/null || true
  echo
  echo "## ADR index"
  sed -n '1,200p' docs/adr/README.md 2>/dev/null || true
  echo
  echo "## Implementation phases"
  grep -nE "^## |^### Phase|^Phase [0-9]" docs/16_BEST_IMPLEMENTATION_ORDER.md 2>/dev/null || true
  echo
  echo "## Recent session log"
  tail -n 80 docs/state/SESSION_LOG.md 2>/dev/null || true
  echo
  echo "## Docs map"
  find . -maxdepth 4 -type f \
    ! -path './.git/*' \
    ! -path './node_modules/*' \
    ! -path './ALL_FILES_READY_TO_SAVE.md' \
    ! -path './.codex/generated/session_context.md' \
    | sort | sed 's#^./##'
} > "$OUT"

echo "Wrote $OUT"
