#!/usr/bin/env bash
set -euo pipefail

OUT=".codex/generated/session_context.md"
TMP="${OUT}.tmp"
mkdir -p .codex/generated

{
  echo "# Reset90 compact Codex context"
  echo
  echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  echo "## Working tree"
  echo
  echo '```text'
  echo "branch=$(git branch --show-current 2>/dev/null || echo unknown)"
  git status --short 2>/dev/null || true
  echo '```'
  echo
  echo "## Project context"
  echo
  cat PROJECT_CONTEXT_SHORT.md
  echo
  echo "## Current task"
  echo
  cat docs/state/TASK_STATE.md
  echo
  echo "## Recent handoffs"
  echo
  grep -E '^- [0-9]{4}-[0-9]{2}-[0-9]{2}T' docs/state/SESSION_LOG.md 2>/dev/null | tail -n 3 || true
  echo
  echo "## Retrieval rules"
  echo
  echo "- Standing instructions: read AGENTS.md once; it is not duplicated here."
  echo "- Exact phase: run make phase PHASE=<number>; never read the whole roadmap."
  echo "- Document selection: consult docs/00_PACK_INDEX.md only when needed."
  echo "- ADRs: use docs/state/DECISIONS_INDEX.md, then read only relevant ADRs."
  echo "- Do not read generated exports, transcripts, archives, lockfiles, or examples unless directly required."
} > "$TMP"

mv "$TMP" "$OUT"
echo "Wrote $OUT ($(wc -l < "$OUT") lines, $(wc -c < "$OUT") bytes)"
